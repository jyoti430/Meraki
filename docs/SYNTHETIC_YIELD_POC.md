# Synthetic trained yield POC

This is an end-to-end demonstration, not a validated agricultural predictor. Every farm, measurement, climate reference and harvest label is invented. No government data, private records or real farm outcomes were used for training. The actual `model_validation/` pipeline and its blocked production registry remain unchanged.

## Open and reproduce

Run from the repository root:

```sh
python scripts/train_synthetic_yield.py
python scripts/train_synthetic_yield.py --check
npm test
npm run build
npm run dev
```

Open `/yield-poc` (FPO navigation: **Yield model POC**). Model inference runs in the browser using the exported fitted weights; it does not need a Python prediction server or live provider. `npm run model:poc:train` and `npm run model:poc:check` are equivalent training/check shortcuts. On Windows the existing project interpreter is `.venv/Scripts/python.exe`.

## Training and evidence

`scripts/train_synthetic_yield.py` uses only Python's standard library. Seed 4727 generates 240 fictional farms across 2021–2025: 1,200 plot-season rows. An explicitly invented equation combines pH, organic carbon, available nitrogen, planned irrigation coverage and prior rainfall/temperature references with farm effects, random noise and occasional zero-harvest failures. The coefficients in that generator are teaching assumptions, not agronomic guidance.

Split by both farm and time:

| Partition | Rows | Farms | Seasons | Use |
|---|---:|---:|---|---|
| Train | 480 | 160 | 2021–2023 | Fit scaling, regression weights and median baseline |
| Validation | 40 | 40 different farms | 2024 | Select regularization; illustrate validation residuals |
| Test | 40 | 40 unseen farms | 2025 | Final synthetic comparison only |
| Excluded | 640 | Overlap across the above groups | Various | Unused farm/year combinations; not fit or scored |

Features are declared available before each simulated sowing decision; training harvest labels precede validation decisions, and validation labels precede test decisions. No test farm appears in fitting or validation. Dates and declarations are fabricated, not proof of real-world lineage. Zero-yield failures remain in training, validation and test.

The fitted estimator is standardized ridge regression with six feature terms: squared pH deviation, organic carbon, available nitrogen, planned irrigation, prior rainfall and squared temperature deviation. Candidate penalties are 0.1, 1, 10 and 100, selected by validation MAE. No held-out labels enter fitting or scaling. Fitted JSON uses coefficients, means and scales, not executable serialization. A separate TypeScript implementation reproduces Python predictions through checked parity cases.

Generated artifacts:

- `public/poc/synthetic-farm-seasons.csv`: all dummy records, explicit synthetic/source fields and split assignments.
- `src/data/syntheticYieldModel.json`: fitted weights, data hash, split counts, tuning scores, test predictions and model limitations; lazily bundled with the page.
- `public/poc/synthetic-model-card.json`: the same downloadable artifact for inspection.

`--check` regenerates all three artifacts and fails on differences. CI runs it without contacting any data provider. The artifact version is `synthetic-okra-ridge-v1`; changing the generator/feature contract should change its version.

## Current synthetic results

Selected ridge penalty: 10. Test MAE: **623.801 kg/ha**, versus **1,539.931 kg/ha** for the training-median baseline; RMSE **1,360.668 kg/ha**, signed bias **−28.735 kg/ha**, R² **0.6037**. These scores measure recovery of the invented data generator. Feature engineering reflects that generator, so they cannot establish model selection, agronomic accuracy or farmer benefit on real data. One of the 40 synthetic test rows has zero harvest, explaining a large error in the scatter plot.

The UI's band is plus/minus the 90th-percentile absolute error on the 40 synthetic validation rows (**1,006.022 kg/ha**), clipped to zero below. This is an illustrative residual band, not a calibrated confidence/prediction interval; no coverage guarantee is asserted.

## From prediction to a dummy supply plan

Users edit six fictional pre-sowing inputs within the declared generator envelope. Missing, nonfinite and out-of-range values fail visibly. Editing inputs clears old results until the user runs again.

The trained model predicts gross kg/ha only. A separate scenario multiplies by entered hectares and an invented ten-week picking curve, then applies grade eligibility once, committed share, handling retention, consent and each week's logistics cap. Without assumed dummy consent, scenario supply is zero. These fractions and weekly shares are assumptions, not learned predictions, grade certificates or real commitments. Display rounding can prevent displayed columns from adding exactly; internal arithmetic remains unrounded.

No route publishes these outputs into the farm ledger, shared capacity, reservations, auctions, exporter requirements or real model registry. The POC does not send farmer information to external services. Existing app language behavior is preserved; the new page's authored copy is English and non-English translation has not been reviewed.

## Checks and real-model next step

Tests assert train/validation/test farm/time separation, lack of test-label influence on fitting, actual learned-weight changes with training labels, reproducible artifacts, Python/browser parity, range validation, supply arithmetic, consent withholding and capacity constraints. Browser checks and exact delivery results are in `WORK_LOG.md`.

For real use, first obtain consented measured plot-season outcomes and verified training rights, review features and target with a local agronomist, establish an independent evaluation/error protocol and run a monitored shadow pilot. The synthetic POC does not complete T12's field/model acceptance gates.
