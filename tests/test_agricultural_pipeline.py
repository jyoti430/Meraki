import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

from build_agricultural_data import (  # noqa: E402
    hectares_to_acres,
    metric_tonnes_to_kg,
    normalize_agronomy_rows,
    normalize_crop_name,
    normalize_rows,
    parse_number,
    thousand_hectares_to_hectares,
    thousand_metric_tonnes_to_kg,
)


def test_manifest(years=None):
    return {
        "datasetId": "test-dataset",
        "coverage": {
            "years": years or ["2015-16", "2016-17", "2017-18"],
            "crops": [
                {
                    "cropId": "okra",
                    "name": "Okra",
                    "table": "7.3.27",
                    "printedPage": 195,
                }
            ],
        },
        "agronomicReference": {
            "datasetId": "test-ecocrop",
            "title": "Test agronomic reference",
            "publisher": "Test publisher",
            "accessedOn": "2026-11-15",
            "limitations": ["Global species envelope; not locally validated."],
            "cropCoverage": [
                {
                    "cropId": "okra",
                    "scientificName": "Abelmoschus esculentus",
                    "ecocropCode": 289,
                    "sourceUrl": "https://example.org/okra",
                }
            ],
        },
    }


def test_row(year, area, production, crop="Okra"):
    return {
        "crop_label": crop,
        "year": year,
        "area_thousand_hectares": area,
        "production_thousand_metric_tonnes": production,
        "season": "",
        "source_table": "7.3.27",
        "source_page": "195",
    }


def test_agronomy_row(
    source_crop_name="Okra",
    temperature_min="20",
    irrigation="",
):
    return {
        "source_crop_name": source_crop_name,
        "scientific_name": "Abelmoschus esculentus",
        "scientific_synonyms": "Abelmoschus esculentus (L.) Moench",
        "ecocrop_code": "289",
        "optimal_temp_min_c": temperature_min,
        "optimal_temp_max_c": "30",
        "absolute_temp_min_c": "12",
        "absolute_temp_max_c": "35",
        "optimal_rainfall_min_mm": "600",
        "optimal_rainfall_max_mm": "1200",
        "absolute_rainfall_min_mm": "300",
        "absolute_rainfall_max_mm": "2500",
        "optimal_ph_min": "5.5",
        "optimal_ph_max": "7.0",
        "absolute_ph_min": "4.5",
        "absolute_ph_max": "8.7",
        "optimal_soil_texture": "heavy, medium, light, organic",
        "absolute_soil_texture": "heavy, medium, light",
        "soil_drainage": "well (dry spells)",
        "soil_depth": "shallow (20-50 cm)",
        "crop_cycle_min_days": "50",
        "crop_cycle_max_days": "180",
        "irrigation_requirement": irrigation,
    }


class AgriculturalPipelineTests(unittest.TestCase):
    def test_unit_conversions(self):
        self.assertEqual(thousand_hectares_to_hectares(2.5), 2500)
        self.assertAlmostEqual(hectares_to_acres(1), 2.4710538147)
        self.assertEqual(metric_tonnes_to_kg(1), 1000)
        self.assertEqual(thousand_metric_tonnes_to_kg(1), 1_000_000)

    def test_crop_aliases_map_to_stable_ids(self):
        self.assertEqual(normalize_crop_name("Chillies (Green)"), "green-chilli")
        self.assertEqual(normalize_crop_name("Green chilli"), "green-chilli")
        self.assertEqual(normalize_crop_name("Capsicum annuum"), "green-chilli")
        self.assertEqual(normalize_crop_name("Okra/Ladyfinger"), "okra")
        self.assertEqual(normalize_crop_name("Lady's finger"), "okra")
        self.assertEqual(normalize_crop_name("Tomatoes"), "tomato")

    def test_formatted_and_missing_numbers(self):
        self.assertEqual(parse_number("12,345.6"), 12345.6)
        self.assertIsNone(parse_number(""))
        self.assertIsNone(parse_number("—"))
        self.assertIsNone(parse_number(" n/a "))
        with self.assertRaisesRegex(ValueError, "non-negative"):
            parse_number("-1")

    def test_missing_yield_records_are_not_filled(self):
        observations, baselines, warnings = normalize_rows(
            [
                test_row("2015-16", "1", "10"),
                test_row("2016-17", "1", ""),
                test_row("2017-18", "1", "30"),
            ],
            test_manifest(),
        )
        self.assertIsNone(observations[1]["productionKg"])
        self.assertIsNone(observations[1]["yieldKgPerAcre"])
        self.assertEqual(baselines[0]["sampleCount"], 2)
        self.assertEqual(baselines[0]["missingYears"], ["2016-17"])
        self.assertEqual(len(warnings), 1)

    def test_baseline_uses_observed_minimum_and_median(self):
        observations, baselines, warnings = normalize_rows(
            [
                test_row("2015-16", "1", "10"),
                test_row("2016-17", "1", "30"),
                test_row("2017-18", "1", "20"),
            ],
            test_manifest(),
        )
        baseline = baselines[0]
        self.assertEqual(len(observations), 3)
        self.assertEqual(warnings, [])
        self.assertAlmostEqual(
            baseline["planningScenarios"]["conservativeKgPerAcre"], 4046.86, places=2
        )
        self.assertAlmostEqual(
            baseline["planningScenarios"]["expectedKgPerAcre"], 8093.71, places=2
        )
        self.assertAlmostEqual(
            baseline["planningScenarios"]["highestHistoricalKgPerAcre"],
            12140.57,
            places=2,
        )
        self.assertEqual(
            baseline["summary"]["yearToYearChangesPct"],
            [
                {"fromYear": "2015-16", "toYear": "2016-17", "percent": 200.0},
                {"fromYear": "2016-17", "toYear": "2017-18", "percent": -33.33},
            ],
        )

    def test_global_suitability_data_keeps_irrigation_unknown(self):
        references = normalize_agronomy_rows([test_agronomy_row()], test_manifest())
        reference = references[0]
        self.assertEqual(reference["scope"], "global_species_reference")
        self.assertEqual(reference["environment"]["temperatureC"]["optimal"], [20.0, 30.0])
        self.assertEqual(reference["environment"]["soilPh"]["absolute"], [4.5, 8.7])
        self.assertIsNone(reference["environment"]["irrigationRequirement"])
        self.assertIn("irrigationRequirement", reference["missingFields"])
        self.assertIn("Global species envelope; not locally validated.", reference["limitations"])

    def test_missing_suitability_fields_are_not_filled(self):
        reference = normalize_agronomy_rows(
            [test_agronomy_row(temperature_min="")], test_manifest()
        )[0]
        self.assertIsNone(reference["environment"]["temperatureC"]["optimal"])
        self.assertIn("temperatureC", reference["missingFields"])

    def test_duplicate_crop_year_records_are_rejected(self):
        with self.assertRaisesRegex(ValueError, "duplicate crop/year"):
            normalize_rows(
                [test_row("2015-16", "1", "10"), test_row("2015-16", "2", "20")],
                test_manifest(),
            )

    def test_duplicate_agronomy_records_are_rejected(self):
        with self.assertRaisesRegex(ValueError, "duplicate crop reference"):
            normalize_agronomy_rows(
                [test_agronomy_row(), test_agronomy_row()], test_manifest()
            )

    def test_unmapped_names_are_rejected(self):
        with self.assertRaisesRegex(ValueError, "unmapped crop"):
            normalize_rows(
                [test_row("2015-16", "1", "10", crop="Unknown vegetable")],
                test_manifest(),
            )


if __name__ == "__main__":
    unittest.main()
