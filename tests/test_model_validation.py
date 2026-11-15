"""Contract, leakage and readiness regression checks; fixture rows are test-only."""
import csv
import io
import json
import tempfile
import unittest
from dataclasses import replace
from datetime import datetime, timedelta, timezone
from pathlib import Path

from model_validation.contracts import HEADER, validate_csv
from model_validation.evaluation import EvaluationPolicy, evaluate, split_outcomes
from model_validation.reporting import build_report, render_markdown


def fixture_row(number=1, farm="farm-a", year=2021, weight="1000"):
    return dict(record_id=f"row-{number}", dataset_version="test-v1", farm_id=farm, plot_id=f"plot-{number}",
        crop_id="okra", variety="test-variety", region_id="test-region", season_year=str(year),
        decision_at=f"{year}-01-01T00:00:00Z", sowing_at=f"{year}-01-02T00:00:00Z",
        harvest_at=f"{year}-06-01T00:00:00Z", label_available_at=f"{year}-06-02T00:00:00Z",
        feature_observed_at=f"{year-1}-12-01T00:00:00Z", feature_available_at=f"{year-1}-12-02T00:00:00Z",
        area_ha="2", harvested_weight_kg=weight, label_scope="plot-season-gross-harvest", label_method="measured",
        source_id="consented-outcomes", source_version="source-v1", synthetic="false", consent_for_training="true",
        consent_reference="test-consent-v1", training_permission="approved", permission_reference="test-permission-v1",
        privacy_classification="deidentified")


def csv_text(rows, headers=HEADER):
    stream = io.StringIO(newline="")
    writer = csv.DictWriter(stream, fieldnames=headers)
    writer.writeheader()
    writer.writerows(rows)
    return stream.getvalue()


def validated(rows):
    return validate_csv(io.StringIO(csv_text(rows)), as_of="2030-01-01T00:00:00Z")


class FarmOutcomeContractTests(unittest.TestCase):
    def test_header_only_template_is_valid_but_not_training_data(self):
        result = validated([])
        self.assertEqual(result.submitted_rows, 0)
        self.assertEqual(result.outcomes, ())
        self.assertEqual(result.issues, ())

    def test_real_zero_harvest_is_retained_not_missing_or_filtered(self):
        result = validated([fixture_row(weight="0")])
        self.assertFalse(result.issues)
        self.assertEqual(result.outcomes[0].yield_kg_ha, 0)

    def test_rejects_unconsented_synthetic_unpermitted_and_sensitive_records(self):
        for field, value, code in (("synthetic", "true", "synthetic_record"),
                ("consent_for_training", "false", "training_consent_missing"),
                ("training_permission", "unknown", "training_permission_missing"),
                ("permission_reference", "", "training_permission_missing"),
                ("privacy_classification", "private-identifiable", "privacy_not_deidentified"),
                ("label_method", "regional-average", "not_measured_farm_outcome")):
            with self.subTest(field=field):
                row = fixture_row(); row[field] = value
                result = validated([row])
                self.assertFalse(result.outcomes)
                self.assertIn(code, {issue.code for issue in result.issues})

    def test_future_available_and_observed_features_are_rejected(self):
        for field in ("feature_observed_at", "feature_available_at"):
            row = fixture_row(); row[field] = "2021-01-03T00:00:00Z"
            result = validated([row])
            self.assertFalse(result.outcomes)
            self.assertIn("feature_leakage", {issue.code for issue in result.issues})

    def test_future_or_unavailable_labels_and_ambiguous_timezones_rejected(self):
        for field, value in (("label_available_at", "2040-01-01T00:00:00Z"),
                ("decision_at", "2021-01-01"), ("harvest_at", "2020-01-01T00:00:00Z")):
            row = fixture_row(); row[field] = value
            self.assertFalse(validated([row]).outcomes)

    def test_duplicate_keys_and_plot_season_outcomes_rejected(self):
        first = fixture_row()
        for second in (dict(first), {**first, "record_id": "different", "crop_id": "tomato"}):
            result = validated([first, second])
            self.assertEqual(len(result.outcomes), 1)
            self.assertIn("duplicate_outcome", {issue.code for issue in result.issues})

    def test_mixed_snapshot_versions_and_nonfinite_or_negative_values_rejected(self):
        for field, value in (("area_ha", "0"), ("area_ha", "NaN"),
                ("harvested_weight_kg", "-1"), ("harvested_weight_kg", "Infinity"), ("season_year", "2022")):
            row = fixture_row(); row[field] = value
            self.assertFalse(validated([row]).outcomes)
        result = validated([fixture_row(), {**fixture_row(2, "farm-b"), "dataset_version": "another-snapshot"}])
        self.assertIn("mixed_dataset_versions", {issue.code for issue in result.issues})

    def test_extra_sensitive_columns_are_rejected_without_echoing_content(self):
        row = {**fixture_row(), "farmer_email": "private@example.invalid"}
        result = validate_csv(io.StringIO(csv_text([row], (*HEADER, "farmer_email"))), as_of="2030-01-01T00:00:00Z")
        self.assertFalse(result.outcomes)
        self.assertIn("invalid_header", {issue.code for issue in result.issues})
        self.assertNotIn("private@example.invalid", str(result.issues))

    def test_public_aggregate_source_cannot_be_relabelled_measured_farm_data(self):
        for source in ("nhb-maharashtra-horticulture-2018", "des-agricultural-statistics-2024-horticulture", "nasa-power-daily-maharashtra-2020-2025"):
            row = fixture_row(); row["source_id"] = source
            result = validated([row])
            self.assertFalse(result.outcomes)
            self.assertIn("aggregate_source_not_farm_label", {issue.code for issue in result.issues})


class EvaluationTests(unittest.TestCase):
    def outcomes(self):
        rows = []
        index = 0
        for year in (2021, 2022, 2023):
            for farm in ("farm-a", "farm-b", "farm-c", "farm-d", "farm-e", "farm-f"):
                index += 1
                rows.append(fixture_row(index, farm, year, str(1000 + index * 10)))
        result = validated(rows)
        self.assertFalse(result.issues)
        return result.outcomes

    def policy(self):
        return EvaluationPolicy(min_train_rows=4, min_test_rows=1, min_train_farms=2, min_test_farms=1, min_train_seasons=2)

    def test_combined_split_has_no_future_labels_or_shared_farms(self):
        split = split_outcomes(self.outcomes(), self.policy())
        train_farms = {row.farm_id for row in split.train}
        test_farms = {row.farm_id for row in split.test}
        self.assertTrue(split.train and split.test)
        self.assertFalse(train_farms & test_farms)
        self.assertLess(max(row.season_year for row in split.train), min(row.season_year for row in split.test))
        self.assertLessEqual(max(row.label_available_at for row in split.train), min(row.decision_at for row in split.test))
        self.assertEqual(split, split_outcomes(tuple(reversed(self.outcomes())), self.policy()))

    def test_unavailable_training_labels_are_purged_not_moved_into_train(self):
        rows = list(self.outcomes())
        original = split_outcomes(rows, self.policy()).train[0]
        index = rows.index(original)
        rows[index] = replace(original, label_available_at=rows[-1].decision_at.replace(year=2024))
        split = split_outcomes(rows, self.policy())
        self.assertNotIn(rows[index], split.train)

    def test_invalid_execution_policy_is_rejected(self):
        for arguments in ({"min_train_rows": 0}, {"min_test_farms": -1}, {"holdout_farm_fraction": 0}, {"holdout_farm_fraction": 1}):
            with self.subTest(arguments=arguments), self.assertRaises(ValueError):
                EvaluationPolicy(**arguments)

    def test_no_data_or_insufficient_independent_data_has_no_scores(self):
        for rows in ([], self.outcomes()[:3]):
            result = evaluate(rows, self.policy())
            self.assertEqual(result["status"], "not_run")
            self.assertIsNone(result["metrics"])
            self.assertFalse(result["promotion_allowed"])

    def test_training_predictions_do_not_change_when_test_labels_change(self):
        rows = self.outcomes()
        first = evaluate(rows, self.policy())
        self.assertEqual(first["status"], "evaluated_offline_only")
        split = split_outcomes(rows, self.policy())
        ids = {row.record_id for row in split.test}
        changed = [replace(row, yield_kg_ha=row.yield_kg_ha + 10000) if row.record_id in ids else row for row in rows]
        second = evaluate(changed, self.policy())
        self.assertEqual(first["fitted_summary"], second["fitted_summary"])
        self.assertNotEqual(first["metrics"], second["metrics"])
        self.assertFalse(first["promotion_allowed"])

    def test_metrics_are_independently_reconciled_and_no_accuracy_claim(self):
        result = evaluate(self.outcomes(), self.policy())
        for metrics in result["metrics"].values():
            self.assertEqual(metrics["n"], len(split_outcomes(self.outcomes(), self.policy()).test))
            self.assertGreaterEqual(metrics["mae_kg_ha"], abs(metrics["bias_kg_ha"]))
        self.assertNotIn("accuracy", json.dumps(result))

    def test_large_finite_nonnegative_labels_do_not_overflow_median(self):
        rows = [replace(row, yield_kg_ha=1e308) for row in self.outcomes()]
        result = evaluate(rows, self.policy())
        self.assertEqual(result["status"], "evaluated_offline_only")
        self.assertEqual(result["metrics"]["training_median"]["mae_kg_ha"], 0)
        json.dumps(result, allow_nan=False)


class ReportTests(unittest.TestCase):
    def test_future_live_report_cutoff_is_rejected(self):
        future = (datetime.now(timezone.utc) + timedelta(days=1)).isoformat()
        with tempfile.TemporaryDirectory() as directory, self.assertRaises(ValueError):
            build_report(Path(directory), as_of=future)

    def test_empty_repository_is_blocked_and_reports_no_metrics(self):
        with tempfile.TemporaryDirectory() as directory:
            report = build_report(Path(directory))
        self.assertFalse(report["promotion_allowed"])
        self.assertEqual(report["farm_outcomes"]["eligible_rows"], 0)
        self.assertIsNone(report["evaluation"]["metrics"])
        self.assertIsNone(report["registry"]["trained_artifact"])
        self.assertIn("No eligible farm outcomes", render_markdown(report))

    def test_reports_are_deterministic_and_public_aggregate_never_becomes_farm_label(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "data/agriculture/source"
            source.mkdir(parents=True)
            (source / "national-horticulture.csv").write_text("crop_label,year,production_value\nOkra,2024-25,1\n", encoding="utf-8")
            first = build_report(root)
            self.assertEqual(first, build_report(root))
            self.assertEqual(first["data_inventory"]["total_data_rows"], 1)
            self.assertEqual(first["farm_outcomes"]["eligible_rows"], 0)
            self.assertFalse(first["data_inventory"]["usable_as_farm_yield_labels"])

    def test_text_snapshot_hashes_are_stable_across_git_line_endings(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "data/agriculture/source"
            source.mkdir(parents=True)
            path = source / "national-horticulture.csv"
            content = b"crop_label,year,production_value\nOkra,2024-25,1\n"
            path.write_bytes(content)
            unix = build_report(root)
            path.write_bytes(content.replace(b"\n", b"\r\n"))
            windows = build_report(root)
            self.assertEqual(unix, windows)

    def test_any_invalid_row_blocks_scoring_and_report_never_contains_farm_ids(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            csv_path = root / "private-input.csv"
            csv_path.write_text(csv_text([fixture_row(), {**fixture_row(2, "farm-b"), "synthetic": "true"}]), encoding="utf-8")
            report = build_report(root, outcomes_path=csv_path)
        self.assertEqual(report["evaluation"]["status"], "not_run")
        self.assertIsNone(report["evaluation"]["metrics"])
        text = json.dumps(report)
        self.assertNotIn("farm-a", text)
        self.assertNotIn("private-input.csv", text)


if __name__ == "__main__":
    unittest.main()
