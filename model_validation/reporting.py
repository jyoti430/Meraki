"""Reproducible evidence inventory and a deliberately fail-closed registry."""
import csv
import hashlib
import io
import json
from dataclasses import asdict
from datetime import datetime, timezone
from pathlib import Path

from . import __version__
from .contracts import CONTRACT_VERSION, DEFAULT_AS_OF, HEADER, timestamp, validate_csv
from .evaluation import EvaluationPolicy, evaluate

GRAINS = {
    "nhb-maharashtra-2018.csv": ("Maharashtra crop/year", "historical state area/production; derived yield is not a farm label"),
    "national-horticulture.csv": ("India crop/year/source/estimate round", "national context; distinct estimate rounds and production-only observations"),
    "maharashtra-horticulture.csv": ("Maharashtra crop or vegetables-total/year/source/estimate round", "mixed aggregate scope; area-only rows cannot produce yield"),
    "msamb-market-prices-arrivals.csv": ("market/commodity/reporting day/variety/unit", "wholesale price/arrival context; eight reporting days, no farm yield or buyer demand"),
    "nasa-power-daily-2020-2025.csv": ("gridded city reference point/day", "historical gridded weather; three points, not farm stations or forecasts"),
    "nasa-power-locations.csv": ("project-selected reference location", "location metadata, not independent outcomes"),
    "fao-ecocrop-requirements.csv": ("global species reference", "broad screening ranges; not locally validated outcome labels"),
    "agmarknet-prices-arrivals.csv": ("market/commodity/reporting day", "header-only import template; no retrieved observations"),
}


def sha256(path):
    # Git may check text out as CRLF on Windows and LF on Linux. Identify the
    # same text snapshot on both systems; preserve all other source bytes.
    return hashlib.sha256(path.read_bytes().replace(b"\r\n", b"\n")).hexdigest()


def inventory(root):
    source = root / "data/agriculture/source"
    datasets = []
    for path in sorted(source.glob("*.csv")):
        with path.open(encoding="utf-8-sig", newline="") as stream:
            reader = csv.DictReader(stream)
            rows = list(reader)
            columns = reader.fieldnames or []
        grain, limitation = GRAINS.get(path.name, ("unreviewed", "Unknown source schema is context-only until reviewed"))
        estimate_statuses = sorted({row.get("estimate_status", "") for row in rows if row.get("estimate_status")})
        datasets.append({"path": path.relative_to(root).as_posix(), "sha256": sha256(path), "data_rows": len(rows),
            "hash_format": "sha256-text-with-CRLF-normalized-to-LF",
            "columns": columns, "grain": grain, "purpose": "public-context-only", "limitation": limitation,
            "estimate_statuses": estimate_statuses,
            "available_at_rows": sum(bool(row.get("available_at") or row.get("published_at")) for row in rows),
            "publication_as_of_status": "not_established_for_historical_decisions",
            "usable_as_farm_yield_labels": False})
    manifest_path = root / "data/agriculture/source-manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8-sig")) if manifest_path.exists() else {}
    entries = ([manifest] if manifest else []) + manifest.get("additionalDatasets", [])
    if manifest.get("agronomicReference"):
        entries.append(manifest["agronomicReference"])
    permission_audit = [{"dataset_id": entry.get("datasetId", "unknown"), "accessed_on": entry.get("accessedOn"),
        "source_url_recorded": bool(entry.get("sourceUrl")),
        "reuse_terms_recorded": bool(entry.get("licenseAndReuse")),
        "model_training_rights": "not_independently_verified", "publication_available_at": None} for entry in entries]
    artifact_path = root / "src/data/agriculturalBaselines.json"
    artifact = json.loads(artifact_path.read_text(encoding="utf-8-sig")) if artifact_path.exists() else {}
    source_versions = {"manifest_sha256": sha256(manifest_path) if manifest_path.exists() else None,
        "artifact_sha256": sha256(artifact_path) if artifact_path.exists() else None,
        "hash_format": "sha256-text-with-CRLF-normalized-to-LF",
        "artifact_schema_version": artifact.get("schemaVersion")}
    baseline_coverage = [{"crop_id": item["cropId"], "source": "NHB historical Maharashtra",
        "annual_observations": item["sampleCount"], "years": item["observedYears"],
        "grain": "state/crop/year", "farm_prediction": False} for item in artifact.get("baselines", [])]
    recent_coverage = [{"crop_id": item["cropId"], "source": item["datasetId"],
        "annual_observations": item["sampleCount"], "years": item["observedYears"],
        "estimate_statuses": item.get("estimateStatuses", []), "grain": "state/crop/year/source/estimate round",
        "farm_prediction": False} for item in artifact.get("regionalYieldSeriesBySource", [])]
    return {"datasets": datasets, "total_data_rows": sum(item["data_rows"] for item in datasets),
        "usable_as_farm_yield_labels": False, "source_versions": source_versions, "permission_audit": permission_audit,
        "yield_reference_coverage": baseline_coverage + recent_coverage,
        "coverage_limits": ["NHB crop-specific state yields cover only 2015-16 to 2017-18 for okra, green chilli and tomato.",
            "Recent Maharashtra crop-specific yields are two tomato observations (2023-24 final; 2024-25 first advance). No recent state okra/green-chilli yield series was established.",
            "National observations remain national; no farm, district or season labels are inferred.",
            "NASA daily weather spans 2020-2025 at three city reference points; MSAMB spans eight reporting days for tomato/chilli and no okra."],
        "interpretation": "Counts include reference/location and repeated source-estimate rows; they are not independent farms or training examples.",
        "as_of_evaluation": "not_run: observation years/access dates do not establish when a historical decision maker could obtain each version"}


def source_digest():
    digest = hashlib.sha256()
    for path in sorted(Path(__file__).parent.glob("*.py")):
        digest.update(path.name.encode())
        digest.update(path.read_bytes().replace(b"\r\n", b"\n"))
    return digest.hexdigest()


def build_report(root: Path, *, outcomes_path: Path | None = None, as_of=DEFAULT_AS_OF, policy=EvaluationPolicy()):
    if timestamp(as_of) > datetime.now(timezone.utc):
        raise ValueError("Evaluation snapshot cutoff cannot be in the future")
    root = Path(root)
    if outcomes_path is None:
        result = validate_csv(io.StringIO(",".join(HEADER) + "\n"), as_of=as_of)
        snapshot_hash = None
    else:
        result = validate_csv(Path(outcomes_path), as_of=as_of)
        snapshot_hash = sha256(Path(outcomes_path))
    evidence = inventory(root)
    evaluation = evaluate(result.outcomes, policy)
    if result.issues:
        evaluation.update(status="not_run", metrics=None, fitted_summary=None,
            reasons=["Resolve every input validation issue before scoring; silently selecting valid rows can bias evaluation."])
        evaluation.pop("slice_metrics", None)
    count = len(result.outcomes)
    summary = (f"No eligible farm outcomes: {evidence['total_data_rows']:,} public context/reference rows do not establish farm-yield model validity. "
        "Model promotion is blocked; no model error scores were computed.") if not count else (
        f"{count} contract-valid farm outcomes inspected; {evaluation['status'].replace('_', ' ')}. "
        "Model promotion remains blocked pending independent permissions, protocol and prospective review.")
    gates = [
        {"id": "farm_outcome_contract", "status": "fail" if result.issues else ("pass" if count else "blocked"),
            "reason": "Input validation failed." if result.issues else ("CSV syntax and declared evidence fields pass; attestations are not verified rights." if count else "No eligible farm outcomes were supplied; only a header-only template exists.")},
        {"id": "aggregate_separation", "status": "pass", "reason": "Regional yield, market, weather and global species references are never copied into farm-outcome labels."},
        {"id": "source_permissions", "status": "blocked", "reason": "Public access/reuse descriptions do not establish verified pooled model-training rights; farmer training consent and source rights need independent review."},
        {"id": "publication_as_of", "status": "blocked", "reason": "Public aggregate snapshots lack verified per-version publication availability for old decision dates; no as-of backtest was run."},
        {"id": "independent_temporal_farm_evaluation", "status": "pass" if evaluation["status"] == "evaluated_offline_only" else "not_evaluated",
            "reason": "Combined future-season/new-farm holdout executed; this is offline evidence only." if evaluation["status"] == "evaluated_offline_only" else "No score is issued without sufficient contract-valid, independent earlier-label training and future/new-farm holdout rows."},
        {"id": "prospective_and_agronomic_review", "status": "blocked", "reason": "Local agronomic review, preregistered error budget, interval calibration, prospective shadow outcomes and operating ownership are absent."},
        {"id": "production_promotion", "status": "blocked", "reason": "This tool has no automatic promotion path; retain explainable rules/scenarios and human review."},
    ]
    configuration = {"as_of": as_of, "contract_version": CONTRACT_VERSION, "evaluation_policy": asdict(policy)}
    return {"schema_version": 1, "status": "blocked", "promotion_allowed": False, "summary": summary,
        "snapshot_as_of": as_of, "data_inventory": evidence,
        "farm_outcomes": {"contract_version": CONTRACT_VERSION, "submitted_rows": result.submitted_rows,
            "accepted_rows": count, "eligible_rows": count, "rejected_rows": result.submitted_rows - count,
            "issues": [asdict(issue) for issue in result.issues], "snapshot_sha256": snapshot_hash,
            "hash_format": "sha256-text-with-CRLF-normalized-to-LF",
            "template": "model_validation/farm_outcomes.template.csv", "contains_real_example_rows": False},
        "evaluation": evaluation, "gates": gates,
        "registry": {"registry_schema_version": 1, "model_id": "meraki-pre-sowing-gross-yield",
            "validation_version": __version__, "status": "untrained" if not count else "offline_only",
            "target": "measured plot-season gross harvest kg/ha", "trained_artifact": None,
            "promoted_model": None, "artifact_format": "json-metadata-only; no executable model deserialization",
            "code_sha256": source_digest(), "configuration_sha256": hashlib.sha256(json.dumps(configuration, sort_keys=True).encode()).hexdigest(),
            "configuration": configuration, "fallback": "versioned explainable rules/scenarios, unknowns explicit, qualified human review",
            "rollback": "No production model installed; retain the rules/scenario fallback and disable any later candidate on stale or invalid inputs."},
        "next_steps": [
            "Select the crop/region/decision owner and preregister target, error budget and holdout protocol with a qualified local adviser.",
            "Collect real plot-season harvest weights and areas, deidentify them, verify training consent/rights and freeze source versions.",
            "Capture actual feature availability at the pre-sowing decision and outcome availability after measured harvest; preserve zero-yield failures.",
            "Use the strict CSV validator, reserve future-season/new-farm holdouts, compare training-only baselines and review error slices and uncertainty.",
            "Run a prospectively monitored shadow evaluation before considering any production promotion; software tests alone cannot establish agronomic or income benefit."]}


def render_markdown(report):
    lines = ["# Model validation readiness", "", report["summary"], "", "**Promotion allowed: false.** No deployable crop-yield model is registered.", "",
        f"Snapshot cutoff: `{report['snapshot_as_of']}`. This fixed cutoff is explicit, not a live data claim.", "",
        "## Available evidence", "", "| Source CSV | Rows | Grain |", "|---|---:|---|"]
    lines += [f"| {item['path']} | {item['data_rows']} | {item['grain']} |" for item in report["data_inventory"]["datasets"]]
    lines += ["", report["data_inventory"]["interpretation"], "", "Public context has no measured consented plot-season labels. No aggregate error score, as-of forecast result or model accuracy is inferred.", "",
        "## Gates", "", "| Gate | Status | Reason |", "|---|---|---|"]
    lines += [f"| {gate['id']} | {gate['status']} | {gate['reason']} |" for gate in report["gates"]]
    lines += ["", "## Farm evaluation", "", f"Submitted: {report['farm_outcomes']['submitted_rows']}; accepted: {report['farm_outcomes']['accepted_rows']}; rejected: {report['farm_outcomes']['rejected_rows']}.",
        f"Evaluation status: `{report['evaluation']['status']}`. Metrics: " + ("not computed." if report["evaluation"]["metrics"] is None else "see the machine-readable offline comparison."),
        "", "Train/test execution floors are operational checks, not a sample-size justification or a promotion threshold. The holdout combines a later season with farms absent from training, and purges training labels unavailable by the first held-out decision.", "",
        "## Next steps", ""]
    lines += [f"{index}. {step}" for index, step in enumerate(report["next_steps"], start=1)]
    lines += ["", "Registry contains versioned JSON metadata only. No pickle, trained weights, production prediction endpoint or real farm example is distributed.", ""]
    return "\n".join(lines)
