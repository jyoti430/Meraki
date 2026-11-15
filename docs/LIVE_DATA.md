# Public data and model validation

The `/live-data` page retrieves real public regional weather and market context through a read-only gateway. It also displays the reproducible model-validation report. It does not replace a farm's laboratory report, establish irrigation access, invent buyer demand or turn historical statistics into a validated farm-yield model.

## Start locally

After the Python setup in [PART3_OPERATIONS.md](PART3_OPERATIONS.md):

```sh
npm run dev:live
```

Open `http://127.0.0.1:5175/live-data`. The launcher runs the public-data API on loopback port 8002 and Vite on loopback port 5175. These ports avoid the existing sensor demo on 5173/8001. Stop the launcher with Ctrl+C. It starts neither the sensor gateway nor the trade API/worker. Use the documented independent processes if those features are also needed. `TRADE_PYTHON` can select an alternative compatible interpreter.

Alternatively, start `.venv` Python with `-m uvicorn server.live_data:app --host 127.0.0.1 --port 8002`, then use the existing Vite server. Vite proxies `/api/live-data` to port 8002; `LIVE_DATA_PROXY_TARGET` can override that development target. A deployed static frontend needs an independently deployed gateway and same-origin routing. Nothing was deployed by this change.

## Sources connected

| Source | Retrieved information | Decision limit |
|---|---|---|
| Open-Meteo | Seven daily forecast rows for Nashik, Pune or Satara reference points; temperature, precipitation and reference ET₀ | Model forecast, not measured farm conditions. Free hosted service is for non-commercial development; appropriate commercial terms are a separate gate. |
| NASA POWER | Thirty days of gridded historical temperature/precipitation with a conservative seven-day lag | Historical estimates, not future weather or a farm station. A point does not represent an entire district. |
| MSAMB | Current dated statewide reporting-market prices and arrivals for tomato or green chilli | Wholesale observations in original units, not farmgate offers, confirmed demand or a price forecast. Broader commercial/training rights are not established. |

Each source displays its retrieval date, observation/valid period, time basis, cache state, missing values, errors and attribution. Forecast-run publication time is unknown when absent from the response. Retrieval is a conservative knowledge timestamp and is never backdated to an observation. Failed sources remain failed; stale cached observations keep their original timestamps and a stale label. There is no synthetic fallback. Only fixed public locations, crop codes and provider URLs are accepted; private farm coordinates and personal reports are not sent.

See [the API contract and actual retrieval evidence](LIVE_DATA_API.md) for deadlines, cache bounds, exact schema, source terms and hashes. Source availability can change; mocked tests are not evidence that a provider is currently online.

## Historical evidence integrated

The existing agricultural foundation was brought in from source commit `7e0d1343` with its original snapshots and provenance. It provides source-separated crop statistics, historical NASA weather, a dated MSAMB snapshot and FAO crop references. Its 7,062 CSV rows include context, aggregate statistics and reference-point metadata; none are farm-yield labels. The generated artifact is not eagerly bundled into the application. See [coverage and limitations](agricultural-data-foundation.md).

Use an activated virtual environment for the npm Python aliases, or invoke the `.venv` interpreter directly:

```sh
python scripts/build_agricultural_data.py --check
python -m model_validation
python -m model_validation --check
python -m pytest server/tests tests -q
npm test
npm run build
```

`data:refresh-weather` and `data:refresh-market` explicitly update committed source snapshots using their documented source-specific windows; normal builds and CI are offline. A refresh changes evidence and requires reviewing the source diff, rebuilding the artifact and regenerating the validation report. It does not train a model.

## What validation means here

There is no trained farm-yield model in this repository. The current planning engine uses explanatory rules and scenarios. [The validation report](../reports/model_validation.md) audits actual source counts, provenance, label grain, permissions and time availability. With zero eligible real farm outcomes it computes no error metric and blocks promotion.

[The model-validation contract](MODEL_VALIDATION.md) supplies a header-only outcome template, strict data checks and a conditional training-only baseline comparison with future-season/new-farm holdouts. Tests of that machinery use synthetic fixtures; their numbers are not model-performance evidence. Real crop/region outcomes, training rights, independent evaluation, local agronomic review and prospective shadow results are still needed. The tool cannot automatically approve a production model.

Live SHC, IMD and groundwater integrations are not claimed: published documentation does not confer authenticated access to private farm reports. Authorised soil CSV imports and actual irrigation records remain the available farm-data path. Public CGWB observations describe regional context, not a farmer's pumping rights or capacity.
