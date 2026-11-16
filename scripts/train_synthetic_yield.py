"""Isolated, reproducible synthetic POC. Never supplies real model_validation labels."""
import argparse
import csv
import hashlib
import io
import json
import math
import random
from pathlib import Path
from statistics import mean, median

ROOT = Path(__file__).resolve().parents[1]
VERSION = "synthetic-okra-ridge-v1"
SEED = 4727
INPUTS = [
    ("soil_ph", "Soil pH", "pH", 5.0, 8.0, 6.5),
    ("organic_carbon_pct", "Organic carbon", "%", 0.3, 2.5, 1.2),
    ("available_n_mg_kg", "Available nitrogen", "mg/kg", 40.0, 280.0, 180.0),
    ("planned_irrigation_pct", "Planned irrigation coverage", "%", 30.0, 100.0, 80.0),
    ("historical_rain_mm", "Prior climate reference rainfall", "mm / growing window", 250.0, 1000.0, 650.0),
    ("historical_temp_c", "Prior climate reference temperature", "°C", 22.0, 33.0, 27.0),
]
FEATURES = ["pH deviation squared", "Organic carbon", "Available nitrogen", "Planned irrigation", "Prior rainfall", "Temperature deviation squared"]


def features(row):
    return [(row["soil_ph"] - 6.5) ** 2, row["organic_carbon_pct"], row["available_n_mg_kg"],
            row["planned_irrigation_pct"], row["historical_rain_mm"], (row["historical_temp_c"] - 27) ** 2]


def generate_rows(seed=SEED):
    rng = random.Random(seed)
    rows = []
    for farm in range(240):
        farm_effect = rng.uniform(-450, 450)
        for year in range(2021, 2026):
            row = {"record_id": f"SYN-{farm:03d}-{year}", "farm_id": f"SYN-FARM-{farm:03d}",
                   "season": year, "crop": "okra", "region": "fictional demonstration region",
                   "synthetic": True, "source": VERSION,
                   "decision_at": f"{year}-05-01", "feature_available_at": f"{year}-04-30",
                   "label_available_at": f"{year}-10-01"}
            for key, _, _, low, high, _ in INPUTS:
                row[key] = round(rng.uniform(low, high), 3)
            # Invented teaching relationship, NOT a sourced agronomic equation.
            yield_value = (5500 - 700 * (row["soil_ph"] - 6.5) ** 2
                           + 1000 * row["organic_carbon_pct"] + 8 * row["available_n_mg_kg"]
                           + 18 * row["planned_irrigation_pct"] + 1.2 * row["historical_rain_mm"]
                           - 90 * (row["historical_temp_c"] - 27) ** 2 + farm_effect + rng.gauss(0, 450))
            # Unobserved simulated crop failures deliberately remain in all splits.
            row["yield_kg_ha"] = 0.0 if rng.random() < 0.015 else round(max(0, yield_value), 3)
            row["split"] = ("train" if farm < 160 and year <= 2023 else
                            "validation" if 160 <= farm < 200 and year == 2024 else
                            "test" if farm >= 200 and year == 2025 else "excluded")
            rows.append(row)
    return rows


def solve(matrix, target):
    """Small pivoted Gaussian solve for a six-feature ridge regression."""
    augmented = [list(row) + [value] for row, value in zip(matrix, target)]
    size = len(target)
    for col in range(size):
        pivot = max(range(col, size), key=lambda i: abs(augmented[i][col]))
        augmented[col], augmented[pivot] = augmented[pivot], augmented[col]
        divisor = augmented[col][col]
        if abs(divisor) < 1e-12:
            raise ValueError("Singular model fit")
        augmented[col] = [value / divisor for value in augmented[col]]
        for i in range(size):
            if i != col:
                factor = augmented[i][col]
                augmented[i] = [a - factor * b for a, b in zip(augmented[i], augmented[col])]
    return [row[-1] for row in augmented]


def fit(rows, regularization):
    xs = [features(row) for row in rows]
    means = [mean(values) for values in zip(*xs)]
    scales = [math.sqrt(mean((row[i] - means[i]) ** 2 for row in xs)) or 1 for i in range(6)]
    design = [[1] + [(value - center) / scale for value, center, scale in zip(x, means, scales)] for x in xs]
    gram = [[sum(x[i] * x[j] for x in design) + (regularization if i == j and i else 0)
             for j in range(7)] for i in range(7)]
    target = [sum(x[i] * row["yield_kg_ha"] for x, row in zip(design, rows)) for i in range(7)]
    return {"means": means, "scales": scales, "coefficients": solve(gram, target), "lambda": regularization}


def predict(model, row):
    scaled = [(value - center) / scale for value, center, scale in zip(features(row), model["means"], model["scales"])]
    return max(0, model["coefficients"][0] + sum(w * x for w, x in zip(model["coefficients"][1:], scaled)))


def metrics(rows, predictions):
    actual = [row["yield_kg_ha"] for row in rows]
    errors = [p - a for p, a in zip(predictions, actual)]
    total = sum((a - mean(actual)) ** 2 for a in actual)
    return {"mae_kg_ha": round(mean(abs(e) for e in errors), 3),
            "rmse_kg_ha": round(math.sqrt(mean(e * e for e in errors)), 3),
            "bias_kg_ha": round(mean(errors), 3),
            "r2": round(1 - sum(e * e for e in errors) / total, 4) if total else None}


def train(rows):
    groups = {name: [row for row in rows if row["split"] == name] for name in ("train", "validation", "test", "excluded")}
    training, validation, testing = (groups[name] for name in ("train", "validation", "test"))
    candidates = []
    for penalty in (0.1, 1.0, 10.0, 100.0):
        model = fit(training, penalty)
        score = metrics(validation, [predict(model, row) for row in validation])["mae_kg_ha"]
        candidates.append((score, penalty, model))
    _, _, selected = min(candidates, key=lambda item: (item[0], item[1]))
    # Freeze fitted weights before touching test outcomes; never refit on holdouts.
    selected = {key: [round(v, 10) for v in value] if isinstance(value, list) else value for key, value in selected.items()}
    predictions = [predict(selected, row) for row in testing]
    baseline = median(row["yield_kg_ha"] for row in training)
    residuals = sorted(abs(predict(selected, row) - row["yield_kg_ha"]) for row in validation)
    band = residuals[min(len(residuals) - 1, math.ceil(0.9 * len(residuals)) - 1)]
    return {"version": VERSION, "synthetic": True, "production_allowed": False, "seed": SEED,
            "crop": "Okra", "region": "Fictional demonstration region", "target": "Gross harvest kg/ha before sowing",
            "algorithm": "Standardized ridge regression with engineered pH and temperature terms",
            "features": FEATURES, "inputs": [{"key": key, "label": label, "unit": unit, "min": low, "max": high, "default": default}
                                             for key, label, unit, low, high, default in INPUTS],
            "model": selected, "baseline_kg_ha": baseline,
            "split": {name: {"rows": len(group), "farms": len({r["farm_id"] for r in group}),
                             "seasons": sorted({r["season"] for r in group}),
                             "zero_harvests": sum(r["yield_kg_ha"] == 0 for r in group)} for name, group in groups.items()},
            "validation_candidates": [{"lambda": penalty, "mae_kg_ha": score} for score, penalty, _ in candidates],
            "test_metrics": metrics(testing, predictions),
            "baseline_test_metrics": metrics(testing, [baseline] * len(testing)),
            "validation_residual_band_kg_ha": round(band, 3),
            "test_results": [{"record_id": row["record_id"], "actual": row["yield_kg_ha"], "predicted": round(value, 3)}
                             for row, value in zip(testing, predictions)],
            "parity_cases": [{"input": {key: row[key] for key, *_ in INPUTS}, "prediction": round(predict(selected, row), 6)}
                             for row in testing[:4]],
            "sample_rows": training[:5],
            "limitations": ["Every farm, feature and harvest is invented. No real or public farm dataset was used.",
                            "Scores measure recovery of the invented generator, not agricultural accuracy.",
                            "The residual band is a synthetic validation-error illustration, not calibrated farm uncertainty.",
                            "Historical climate inputs are fictional prior reference values, not future observed weather.",
                            "Training/test farms are disjoint; later seasons are held out and unused rows are excluded.",
                            "No production promotion, consent, capacity reservation or planting action is enabled."]}


def build_outputs():
    rows = generate_rows()
    stream = io.StringIO(newline="")
    writer = csv.DictWriter(stream, fieldnames=list(rows[0]), lineterminator="\n")
    writer.writeheader()
    writer.writerows(rows)
    dataset = stream.getvalue()
    artifact = train(rows)
    artifact["dataset_sha256"] = hashlib.sha256(dataset.encode()).hexdigest()
    artifact["dataset_rows"] = len(rows)
    content = json.dumps(artifact, indent=2, allow_nan=False) + "\n"
    return {ROOT / "public/poc/synthetic-farm-seasons.csv": dataset,
            ROOT / "public/poc/synthetic-model-card.json": content,
            ROOT / "src/data/syntheticYieldModel.json": content}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="Verify committed synthetic data and trained artifact without rewriting")
    args = parser.parse_args()
    for path, content in build_outputs().items():
        if args.check:
            if not path.exists() or path.read_text(encoding="utf-8") != content:
                raise SystemExit(f"Stale synthetic artifact: {path.relative_to(ROOT)}")
        else:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(content, encoding="utf-8", newline="\n")
    print("Synthetic POC artifacts verified" if args.check else "Generated dummy seasons, fitted ridge model and wrote synthetic POC artifacts")


if __name__ == "__main__":
    main()
