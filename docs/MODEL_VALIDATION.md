# Model validation and readiness

Meraki's crop planner is a set of explainable rules and scenarios. It is not a trained or validated farm-yield model. The public agricultural data import supplies historical context; it does not supply consented farm-outcome labels. The model-validation report therefore contains **no yield error scores, no model accuracy, and `promotion_allowed: false`**.

This implementation follows the local `mle-workflow` skill. Its scope is the prediction/data contract, leakage checks, reproducible baseline evaluation and fail-closed readiness metadata. It adds no ML library, executable model loader or production prediction endpoint.

## Decision and experiment contract

- Proposed future decision: help a coordinator review a pre-sowing gross-yield scenario for a selected crop/variety and region. This is separate from choosing the best crop, predicting saleable weekly supply, making buyer commitments or claiming higher income.
- Target: measured whole-plot-season gross harvest kilograms divided by measured harvested area in hectares. Marketable share, quality loss, retention and logistics remain separate downstream quantities. Preserve real zero-yield failures.
- Current fallback: versioned explainable scenarios, explicit unknowns, farmer consent and qualified human review. No model changes planting, capacity reservations or trade awards.
- Future offline baseline: training-only median gross yield. The simple comparison candidate is a training-only crop/variety/region median, with a crop/variety median fallback for a region absent from training. It does not use soil/weather features or pretend to learn agronomy.
- Primary future metric: MAE in kg/ha, accompanied by signed bias, maximum absolute error and crop slices. No metric is computed until the declared data/split checks pass. No success/error budget has been agreed with a real decision owner; promotion remains blocked even after a future offline run.

## Run and reproduce

From the repository root, with Python 3.12 or newer (standard library only):

```sh
python -m unittest discover -s tests -p test_model_validation.py -v
python -m model_validation
python -m model_validation --check
```

On Windows the existing interpreter is `.venv\Scripts\python.exe`; on POSIX use `.venv/bin/python` when using the project environment. The first report command writes `reports/model_validation.json` and `.md`; `--check` only compares them with deterministic regenerated content. A blocked readiness result is an expected successful check, not model approval. A stale report returns a nonzero exit code.

The default evaluation cutoff is the explicitly frozen **2026-11-15T18:20:00Z**, observed before this implementation run. It is not the local calendar date or a live-data timestamp. A later authorised snapshot can use `--as-of <timezone-aware-ISO-time>`; future cutoffs are rejected against UTC wall time at the report boundary. A historical observation year, download date or year in a publication title does not establish point-in-time feature availability.

To validate a separately authorised, deidentified outcome file:

```sh
python -m model_validation --outcomes /approved/local/farm-outcomes.csv --as-of 2026-11-15T18:20:00Z
```

No farm-data directory is searched automatically. Do not commit the outcome CSV or permission/consent documents to this public repository. Reports contain counts, error codes, snapshot hashes and aggregate metrics, with no farm IDs, raw rows, consent references, permission references or absolute input paths. Review report disclosure rights before publishing a report derived from private outcomes. Syntactically pseudonymous IDs do not prove that a dataset is actually deidentified.

## Farm-outcome CSV contract

`model_validation/farm_outcomes.template.csv` contains the exact ordered header and **zero example rows**. Test rows exist only inside isolated software tests; they are not research observations or submitted training data. Additional, missing or reordered columns are rejected, including accidental personal-information fields.

| Fields | Requirement |
|---|---|
| `record_id`, `dataset_version` | Stable pseudonymous row ID and one frozen snapshot version for the entire CSV. |
| `farm_id`, `plot_id`, `crop_id`, `variety`, `region_id` | Pseudonymous identifiers. Crop/variety/region are the values known at the decision, not retrospectively changed to the best outcome. No name, address, contact or bank fields. |
| `season_year` | Sowing calendar year; farm/plot/year must be unique. Multiple crops/harvests on the same plot require a separately reviewed finer-grained contract rather than duplicating the annual label. |
| `decision_at`, `sowing_at`, `harvest_at`, `label_available_at` | Explicit timezones; decision ≤ sowing < harvest ≤ actual label availability ≤ snapshot cutoff. The whole harvest outcome becomes available after harvest, not at planting. |
| `feature_observed_at`, `feature_available_at` | Latest observation and actual availability across every feature supplied to the decision. Observation ≤ availability ≤ decision. A retrospective download or later observed rainfall cannot be backdated. These fields are attestations requiring external lineage review. |
| `area_ha`, `harvested_weight_kg` | Finite, nonnegative measurements in the named units; area strictly positive. Derived gross yield must remain finite. Zero harvest is retained. |
| `label_scope`, `label_method` | Exactly `plot-season-gross-harvest` and `measured`; no district/state average copied to soil samples, predicted yield, market arrival or shipment/member allocation as a label. |
| `source_id`, `source_version` | Stable measured-outcome source and frozen version. Known public aggregate/weather/market/species-reference sources are explicitly rejected as farm label sources. |
| `synthetic`, `consent_for_training`, `consent_reference` | Exactly `false`, exactly `true`, and a nonempty reference to verified external training consent. General app participation is not training consent. |
| `training_permission`, `permission_reference`, `privacy_classification` | Exactly `approved`, a nonempty external training-rights reference, and exactly `deidentified`. Public visibility alone does not satisfy these fields. |

Duplicate row IDs and repeated farm/plot/year labels are rejected. Mixed dataset snapshots, invalid dates/units, nonfinite measurements, future feature observations/availability, synthetic data and missing rights/consent are rejected. Any rejected row blocks scoring for the whole input; the tool does not silently select a cleaner subset. Permission references and declarations are not independently verified by software, so rights review remains blocked regardless of CSV syntax.

## Split and fitting protocol

The combined holdout uses the latest sowing year, then selects new test farms by a stable SHA-256 ordering and a fixed fraction. Every earlier row for those farms is removed from training. Training contains only earlier years whose labels were available by the first held-out decision; delayed labels are purged. Latest-year farms outside the holdout and excluded earlier rows are counted as unused, not silently placed in training. Input row order does not change the split.

Default execution floors are 30 training rows, 10 test rows, five training farms, three test farms, two training years and a 25% new-farm holdout fraction. These are declared operational floors for attempting a comparison, **not a scientifically justified sample-size threshold, learning-curve conclusion, confidence interval or deployment gate**. A real protocol must consider independent farms/seasons, crop/region slices, clustering, uncertainty, error costs and prospective outcomes. Test fixtures lower floors only to verify program behavior; no fixture scores are published in the checked report.

All medians are fitted on training labels only. Test labels affect scores, never fitting or split assignment. Unseen crop/variety cohorts block scoring instead of being extrapolated. Future model tuning needs a separate validation set or nested/backtest protocol before reserving an untouched final test set; this package performs no tuning. Neither this simple candidate nor any offline gain may be promoted automatically.

## Public evidence audit and current result

The report inventories the actual eight source CSV files and their content hashes, schemas, grains, estimate statuses and row counts: 7,062 rows in total, including three location records and three species references. Counts are not independent farm examples. Public source metadata and generated artifact schema/version are hashed; observation years and estimate rounds remain separate.

The source-specific state yield baseline has three old annual observations per crop (2015-16 to 2017-18). Recent Maharashtra tomato has two observations (2023-24 final; 2024-25 first advance). Recent state okra/chilli yields remain unavailable. National statistics are not substituted for state/farm labels. NASA data are historical gridded values at three reference points; MSAMB supplies eight reporting days of tomato/chilli wholesale observations and no okra series. AGMARKNET is a header-only import template.

**No aggregate retrospective backtest is scored.** The public snapshots lack verified per-version historical availability, farm features and farm outcomes; using their current revised values to claim pre-sowing performance would answer a different, inadequately specified question. Descriptive source statistics remain available through the agricultural evidence pipeline.

The checked report has zero submitted/accepted farm outcomes, `evaluation.metrics: null`, no trained artifact and no promoted model. Source training rights, independent temporal/farm evaluation, agronomic/error-budget review, calibration, prospective monitoring and commercial/field outcomes remain external gates.

## Registry, promotion and rollback

The report embeds registry schema/version, validation code digest, configuration digest, data hashes, target definition and fallback/rollback metadata. Text hashes explicitly normalize CRLF to LF so Windows and Linux Git checkouts reproduce the same snapshot identity; other bytes remain unchanged. Hashes identify snapshots; they are not a cryptographic claim that the source is truthful or permission is valid. There is no pickle or other executable artifact deserialization and no extra runtime dependency.

Promotion is always false in this package. Future promotion requires a reviewed protocol and separately implemented authorisation, consented independent outcomes, adequate uncertainty/error-slice evidence, prospective shadow results, serving-input validation, monitoring ownership and a rollback route. The present rollback/fallback is to retain explicit rules/scenarios and withhold unsupported predictions. No software test establishes yield uplift, calibrated confidence, farmer-income benefit or buyer demand.

Initial validation evidence: the tests were written before implementation and first failed on missing package imports; the implemented suite then passed. The exact final check count and command outcome are reported with delivery rather than treating this document as proof of a new run.
