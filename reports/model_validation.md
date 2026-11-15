# Model validation readiness

No eligible farm outcomes: 7,062 public context/reference rows do not establish farm-yield model validity. Model promotion is blocked; no model error scores were computed.

**Promotion allowed: false.** No deployable crop-yield model is registered.

Snapshot cutoff: `2026-11-15T18:20:00Z`. This fixed cutoff is explicit, not a live data claim.

## Available evidence

| Source CSV | Rows | Grain |
|---|---:|---|
| data/agriculture/source/agmarknet-prices-arrivals.csv | 0 | market/commodity/reporting day |
| data/agriculture/source/fao-ecocrop-requirements.csv | 3 | global species reference |
| data/agriculture/source/maharashtra-horticulture.csv | 8 | Maharashtra crop or vegetables-total/year/source/estimate round |
| data/agriculture/source/msamb-market-prices-arrivals.csv | 439 | market/commodity/reporting day/variety/unit |
| data/agriculture/source/nasa-power-daily-2020-2025.csv | 6576 | gridded city reference point/day |
| data/agriculture/source/nasa-power-locations.csv | 3 | project-selected reference location |
| data/agriculture/source/national-horticulture.csv | 24 | India crop/year/source/estimate round |
| data/agriculture/source/nhb-maharashtra-2018.csv | 9 | Maharashtra crop/year |

Counts include reference/location and repeated source-estimate rows; they are not independent farms or training examples.

Public context has no measured consented plot-season labels. No aggregate error score, as-of forecast result or model accuracy is inferred.

## Gates

| Gate | Status | Reason |
|---|---|---|
| farm_outcome_contract | blocked | No eligible farm outcomes were supplied; only a header-only template exists. |
| aggregate_separation | pass | Regional yield, market, weather and global species references are never copied into farm-outcome labels. |
| source_permissions | blocked | Public access/reuse descriptions do not establish verified pooled model-training rights; farmer training consent and source rights need independent review. |
| publication_as_of | blocked | Public aggregate snapshots lack verified per-version publication availability for old decision dates; no as-of backtest was run. |
| independent_temporal_farm_evaluation | not_evaluated | No score is issued without sufficient contract-valid, independent earlier-label training and future/new-farm holdout rows. |
| prospective_and_agronomic_review | blocked | Local agronomic review, preregistered error budget, interval calibration, prospective shadow outcomes and operating ownership are absent. |
| production_promotion | blocked | This tool has no automatic promotion path; retain explainable rules/scenarios and human review. |

## Farm evaluation

Submitted: 0; accepted: 0; rejected: 0.
Evaluation status: `not_run`. Metrics: not computed.

Train/test execution floors are operational checks, not a sample-size justification or a promotion threshold. The holdout combines a later season with farms absent from training, and purges training labels unavailable by the first held-out decision.

## Next steps

1. Select the crop/region/decision owner and preregister target, error budget and holdout protocol with a qualified local adviser.
2. Collect real plot-season harvest weights and areas, deidentify them, verify training consent/rights and freeze source versions.
3. Capture actual feature availability at the pre-sowing decision and outcome availability after measured harvest; preserve zero-yield failures.
4. Use the strict CSV validator, reserve future-season/new-farm holdouts, compare training-only baselines and review error slices and uncertainty.
5. Run a prospectively monitored shadow evaluation before considering any production promotion; software tests alone cannot establish agronomic or income benefit.

Registry contains versioned JSON metadata only. No pickle, trained weights, production prediction endpoint or real farm example is distributed.
