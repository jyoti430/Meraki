import json
import sys
import unittest
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

from build_agricultural_data import (  # noqa: E402
    DEFAULT_OUTPUT,
    build_artifact,
    hectares_to_acres,
    metric_tonnes_to_kg,
    normalize_agronomy_rows,
    normalize_crop_name,
    normalize_rows,
    parse_number,
    thousand_hectares_to_hectares,
    thousand_metric_tonnes_to_kg,
)
from evidence_sources import (  # noqa: E402
    normalize_horticulture_rows,
    normalize_market_rows,
    normalize_national_rows,
    normalize_weather_rows,
)
from refresh_msamb_market_snapshot import COMMODITIES, _parse_report  # noqa: E402


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
        "additionalDatasets": [
            {
                "datasetId": "maharashtra-survey",
                "publisher": "Maharashtra Government",
                "title": "State horticulture extract",
                "sourceUrl": "https://example.org/state",
                "accessedOn": "2026-11-15",
                "licenseAndReuse": "Test license",
            },
            {
                "datasetId": "des-horticulture",
                "publisher": "Government of India",
                "title": "National horticulture extract",
                "sourceUrl": "https://example.org/national",
                "accessedOn": "2026-11-15",
                "licenseAndReuse": "Test license",
            },
            {
                "datasetId": "agmarknet-offline-market-import",
                "publisher": "Government of India",
                "title": "Market data",
                "sourceUrl": "https://example.org/market",
                "accessedOn": "2026-11-15",
                "licenseAndReuse": "Test license",
            },
            {
                "datasetId": "msamb-market-latest-eight-reporting-days",
                "publisher": "Maharashtra State Agricultural Marketing Board",
                "title": "Recent market snapshot",
                "sourceUrl": "https://example.org/msamb",
                "sourceUrls": ["https://example.org/msamb"],
                "accessedOn": "2026-11-15",
                "licenseAndReuse": "Test license",
            },
            {
                "datasetId": "nasa-power-test",
                "publisher": "NASA",
                "title": "NASA POWER daily test",
                "sourceUrl": "https://example.org/weather",
                "documentationUrl": "https://example.org/weather/docs",
                "accessedOn": "2026-11-15",
                "coverage": {"years": ["2020"]},
                "timeStandard": "Local Solar Time (LST)",
                "limitations": ["A point is not a district observation."],
                "licenseAndReuse": "Public data",
            },
        ],
        "weatherSeasonDefinition": {
            "id": "monsoon-june-september",
            "months": [6, 7, 8, 9],
            "heatThresholdC": 35,
            "dryDayThresholdMm": 1,
        },
        "farmConditionSchema": {},
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

    def test_recent_state_area_does_not_become_a_crop_yield(self):
        rows = [
            {
                "crop_label": "Tomato",
                "year": "2024-25",
                "area_value": "0.55",
                "area_unit": "lakh hectares",
                "production_value": "",
                "production_unit": "",
                "estimate_status": "final_advance_as_reported_in_section_7_8",
                "dataset_id": "maharashtra-survey",
                "source_section": "Section 7.8",
            }
        ]
        observations, warnings = normalize_horticulture_rows(rows, test_manifest())
        observation = observations[0]
        self.assertEqual(observation["areaHectares"], 55_000)
        self.assertIsNone(observation["productionTonnes"])
        self.assertIsNone(observation["yieldKgPerHectare"])
        self.assertIn("final_advance", observation["estimateStatus"])
        self.assertEqual(len(warnings), 1)

    def test_state_category_yield_is_derived_only_from_matching_area_and_production(self):
        rows = [
            {
                "crop_label": "Vegetables",
                "year": "2024-25",
                "area_value": "1255.60",
                "area_unit": "thousand hectares",
                "production_value": "14981.52",
                "production_unit": "thousand metric tonnes",
                "estimate_status": "third_advance",
                "dataset_id": "maharashtra-survey",
                "source_section": "Table 7.5",
            }
        ]
        observations, warnings = normalize_horticulture_rows(rows, test_manifest())
        observation = observations[0]
        self.assertEqual(observation["cropId"], "vegetables-total")
        self.assertEqual(observation["productionTonnes"], 14_981_520)
        self.assertAlmostEqual(observation["yieldKgPerHectare"], 11_931.76, places=1)
        self.assertEqual(observation["estimateStatus"], "third_advance")
        self.assertEqual(warnings, [])

    def test_national_estimate_rounds_remain_separate_and_units_are_normalized(self):
        rows = [
            {
                "crop_label": "Tomato",
                "year": "2025-26",
                "area_value": "",
                "area_unit": "",
                "production_value": "227.02",
                "production_unit": "lakh tonnes",
                "estimate_status": "first_advance",
                "dataset_id": "des-horticulture",
                "source_reference": "https://example.org/first",
            },
            {
                "crop_label": "Tomato",
                "year": "2025-26",
                "area_value": "",
                "area_unit": "",
                "production_value": "214.61",
                "production_unit": "lakh tonnes",
                "estimate_status": "second_advance",
                "dataset_id": "des-horticulture",
                "source_reference": "https://example.org/second",
            },
        ]
        observations, warnings = normalize_national_rows(rows, test_manifest())
        self.assertEqual([item["estimateStatus"] for item in observations], ["first_advance", "second_advance"])
        self.assertEqual(observations[0]["productionTonnes"], 22_702_000)
        self.assertEqual(observations[0]["source"]["sourceUrl"], "https://example.org/first")
        self.assertEqual(len(warnings), 2)

    def test_weather_season_summaries_use_explicit_coverage_and_thresholds(self):
        rows = []
        for month in range(6, 10):
            days_in_month = (date(2020, month + 1, 1) - date(2020, month, 1)).days
            for day in range(1, days_in_month + 1):
                rain = "1.5" if month == 6 and day == 2 else "0"
                if month == 6 and day == 3:
                    rain = "-999"
                rows.append(
                    {
                        "date": f"2020-{month:02d}-{day:02d}",
                        "location_id": "nashik",
                        "t2m_max_c": "35" if month == 6 and day == 1 else "30",
                        "t2m_min_c": "20",
                        "precipitation_mm_day": rain,
                    }
                )
        location_rows = [
            {
                "location_id": "nashik",
                "location_name": "Nashik",
                "district": "Nashik",
                "state": "Maharashtra",
                "latitude": "19.99",
                "longitude": "73.78",
            }
        ]
        source = {
            "datasetId": "nasa-power-test",
            "coverage": {"years": ["2020"]},
            "timeStandard": "Local Solar Time (LST)",
            "weatherSeasonDefinition": {"heatThresholdC": 35, "dryDayThresholdMm": 1},
        }
        metadata = {
            "startYear": 2020,
            "endYear": 2020,
            "locations": [
                {"locationId": "nashik", "start": "20200101", "end": "20201231", "timeStandard": "LST"}
            ],
            "timeStandard": "LST",
            "sources": ["MERRA2", "POWER"],
        }
        daily, summaries = normalize_weather_rows(rows, location_rows, source, metadata)
        summary = summaries[0]
        self.assertEqual(len(daily), 122)
        self.assertEqual(summary["expectedDays"], 122)
        self.assertEqual(summary["rainfallObservedDays"], 121)
        self.assertFalse(summary["rainfallComplete"])
        self.assertIsNone(summary["totalPrecipitationMm"])
        self.assertEqual(summary["daysAtOrAboveHeatThreshold"], 1)
        self.assertEqual(summary["longestObservedDrySpellDays"], 119)

    def test_market_import_preserves_raw_prices_and_converts_quintals(self):
        rows = [
            {
                "arrival_date": "18/10/2025",
                "state": "Maharashtra",
                "district": "Nashik",
                "market": "Pimpalgaon",
                "commodity": "Tomato",
                "variety": "Local",
                "grade": "FAQ",
                "min_price_rs_per_quintal": "2000",
                "max_price_rs_per_quintal": "4000",
                "modal_price_rs_per_quintal": "3000",
                "arrivals_value": "125",
                "arrivals_unit": "Quintals",
                "source_id": "agmarknet-offline-market-import",
            }
        ]
        observations, indicators, warnings = normalize_market_rows(rows, test_manifest())
        record = observations[0]
        self.assertEqual(record["date"], "2025-10-18")
        self.assertEqual(record["sourcePricesInrPerUnit"]["modal"], 3000)
        self.assertEqual(record["sourcePriceUnit"], "quintal")
        self.assertEqual(record["priceInrPerKg"]["modal"], 30)
        self.assertEqual(record["arrivals"]["tonnes"], 12.5)
        self.assertEqual(indicators[0]["medianModalPriceInrPerKg"], 30)
        self.assertEqual(indicators[0]["arrivalSignalStatus"], "observations_available_not_regional_supply")
        self.assertEqual(warnings, [])

    def test_msamb_market_import_keeps_code_language_and_missing_district(self):
        rows = [
            {
                "arrival_date": "2026-11-15",
                "state": "Maharashtra",
                "district": "",
                "market": "अकलुज",
                "market_id": "001",
                "commodity": "Green chilli",
                "source_commodity_label": "मिरची (हिरवी)",
                "variety": "---",
                "min_price_rs_per_unit": "2500",
                "max_price_rs_per_unit": "4000",
                "modal_price_rs_per_unit": "3500",
                "arrivals_value": "10",
                "arrivals_unit": "क्विंटल",
                "source_id": "msamb-market-latest-eight-reporting-days",
            }
        ]
        observations, indicators, warnings = normalize_market_rows(
            rows,
            test_manifest(),
            {"retrievedOn": "2026-11-15"},
        )
        record = observations[0]
        self.assertEqual(record["marketId"], "msamb-market:001")
        self.assertEqual(record["sourceMarketCode"], "001")
        self.assertIsNone(record["district"])
        self.assertEqual(record["sourceCommodityLabel"], "मिरची (हिरवी)")
        self.assertIsNone(record["variety"])
        self.assertEqual(record["sourcePricesInrPerUnit"]["modal"], 3500)
        self.assertEqual(record["sourcePriceUnit"], "क्विंटल")
        self.assertEqual(record["priceInrPerKg"]["modal"], 35)
        self.assertEqual(record["arrivals"]["sourceUnit"], "क्विंटल")
        self.assertEqual(record["arrivals"]["tonnes"], 1)
        self.assertEqual(record["source"]["accessedOn"], "2026-11-15")
        self.assertIsNone(indicators[0]["priceCoefficientOfVariationPct"])
        self.assertIsNone(indicators[0]["arrivalChangePctBetweenFirstAndLastObservedDay"])
        self.assertEqual(warnings, [])

    def test_non_mass_market_unit_keeps_source_prices_without_kg_conversion(self):
        row = {
            "arrival_date": "2026-11-13",
            "state": "Maharashtra",
            "district": "",
            "market": "वडगाव पेठ",
            "market_id": "097",
            "commodity": "Tomato",
            "prices_unit": "नग",
            "min_price_rs_per_unit": "800",
            "max_price_rs_per_unit": "1200",
            "modal_price_rs_per_unit": "900",
            "arrivals_value": "90",
            "arrivals_unit": "नग",
            "source_id": "msamb-market-latest-eight-reporting-days",
        }
        observations, indicators, warnings = normalize_market_rows([row], test_manifest())
        record = observations[0]
        self.assertEqual(record["sourcePriceUnit"], "नग")
        self.assertEqual(record["sourcePricesInrPerUnit"]["modal"], 900)
        self.assertEqual(record["priceInrPerKg"], {"minimum": None, "maximum": None, "modal": None})
        self.assertIsNone(record["arrivals"]["tonnes"])
        self.assertEqual(indicators[0]["priceObservationCount"], 0)
        self.assertIsNone(indicators[0]["meanDailyArrivalsTonnes"])
        self.assertEqual(len(warnings), 2)
        self.assertIn("INR/kg is unavailable", warnings[0]["reason"])
        self.assertIn("cannot be converted to tonnes", warnings[1]["reason"])

    def test_msamb_report_parser_preserves_reporting_date_and_market_code(self):
        html = """
        <table>
          <tr><td>15/11/2026</td></tr>
          <tr><td>अकलुज</td><td>लोकल</td><td>क्विंटल</td><td>10</td>
              <td>2500</td><td>4000</td><td>3500</td></tr>
        </table>
        """
        records = _parse_report(
            html,
            COMMODITIES[1],
            {"अकलुज": "001"},
        )
        self.assertEqual(records[0]["arrival_date"], "2026-11-15")
        self.assertEqual(records[0]["market_id"], "001")
        self.assertEqual(records[0]["commodity"], "Green chilli")
        self.assertEqual(records[0]["prices_unit"], "क्विंटल")
        self.assertEqual(records[0]["modal_price_rs_per_unit"], "3500")

    def test_market_price_order_is_validated(self):
        row = {
            "arrival_date": "2025-10-18",
            "state": "Maharashtra",
            "district": "Nashik",
            "market": "Pimpalgaon",
            "commodity": "Tomato",
            "min_price_rs_per_quintal": "4000",
            "max_price_rs_per_quintal": "2000",
            "modal_price_rs_per_quintal": "3000",
            "source_id": "agmarknet-offline-market-import",
        }
        with self.assertRaisesRegex(ValueError, "minimum price exceeds maximum"):
            normalize_market_rows([row], test_manifest())

    def test_bundled_sources_report_latest_dates_and_unknown_regional_yields(self):
        artifact = json.loads(DEFAULT_OUTPUT.read_text(encoding="utf-8"))
        self.assertEqual(artifact["schemaVersion"], 3)
        coverage = {item["cropId"]: item for item in artifact["regionalCropCoverage"]}
        self.assertEqual(coverage["tomato"]["latestStateYearWithArea"], "2024-25")
        self.assertEqual(coverage["tomato"]["latestStateYearWithProduction"], "2024-25")
        self.assertEqual(coverage["tomato"]["stateYieldYears"], ["2023-24", "2024-25"])
        self.assertEqual(coverage["green-chilli"]["stateAreaYears"], ["2024-25"])
        self.assertEqual(coverage["green-chilli"]["stateProductionYears"], [])
        self.assertEqual(coverage["okra"]["stateYieldYears"], [])

        tomato_series = [
            item for item in artifact["regionalYieldSeriesBySource"]
            if item["cropId"] == "tomato"
        ]
        self.assertEqual(len(tomato_series), 1)
        self.assertEqual(tomato_series[0]["datasetId"], "des-agricultural-statistics-2024-horticulture")
        self.assertEqual(tomato_series[0]["geography"]["administrativeLevel"], "state")
        self.assertEqual(tomato_series[0]["observedYears"], ["2023-24", "2024-25"])
        self.assertIsNone(tomato_series[0]["summaryKgPerHectare"]["coefficientOfVariationPct"])

        national = artifact["nationalProductionContext"]
        for crop_id in ("okra", "green-chilli", "tomato"):
            des_series = [
                item for item in national
                if item["cropId"] == crop_id
                and item["source"]["datasetId"] == "des-agricultural-statistics-2024-horticulture"
            ]
            self.assertEqual([item["year"] for item in des_series], [
                "2018-19", "2019-20", "2020-21", "2021-22", "2022-23", "2023-24", "2024-25"
            ])
            self.assertEqual(des_series[-1]["estimateStatus"], "first_advance")
        tomato_rounds = [
            item for item in national
            if item["cropId"] == "tomato" and item["year"] == "2025-26"
        ]
        self.assertEqual({item["estimateStatus"] for item in tomato_rounds}, {"first_advance", "second_advance"})

        weather = artifact["weather"]
        self.assertEqual(weather["dailyObservations"][-1]["date"], "2025-12-31")
        self.assertEqual(len(weather["dailyObservations"]), 6_576)
        self.assertEqual(len(weather["seasonalIndicators"]), 18)
        market = artifact["historicalMarket"]
        self.assertEqual(market["status"], "available")
        self.assertEqual(market["snapshot"]["priceAndArrivalUnitCounts"], {"क्विंटल": 437, "नग": 2})
        market_coverage = {item["cropId"]: item for item in market["coverageByCrop"]}
        self.assertEqual(market_coverage["tomato"]["observationCount"], 235)
        self.assertEqual(market_coverage["tomato"]["marketCount"], 47)
        self.assertEqual(market_coverage["tomato"]["latestDate"], "2026-11-15")
        self.assertEqual(market_coverage["green-chilli"]["observationCount"], 204)
        self.assertEqual(market_coverage["green-chilli"]["marketCount"], 46)
        self.assertEqual(market_coverage["okra"]["status"], "unavailable")
        unconverted_price_rows = [
            item for item in market["observations"]
            if item["sourcePriceUnit"] == "नग"
        ]
        self.assertEqual(len(unconverted_price_rows), 2)
        self.assertTrue(all(item["priceInrPerKg"]["modal"] is None for item in unconverted_price_rows))


if __name__ == "__main__":
    unittest.main()
