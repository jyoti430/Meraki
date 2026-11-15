# Agricultural data foundation

This PR expands the evidence pipeline behind Meraki's existing crop-planning demo. It keeps source observations, derived statistics, agronomic references, demo inputs, and unknown values distinct. The Planning Engine and frontend screens are not connected to this data yet.

## Verified coverage

| Dataset | Geography | Period and coverage | Use and limits |
|---|---|---|---|
| NHB *Horticultural Statistics at a Glance 2018* | Maharashtra state | Crop years 2015-16 to 2017-18; Okra, green chilli, tomato | Three crop-specific area/production observations per crop; yields are derived. The report does not identify estimate round or season. This remains Meraki's only multi-year state yield baseline for okra and green chilli. |
| DES *Agricultural Statistics at a Glance 2024*, Table 2.47 | India | 2018-19 to 2024-25; all three target crops | Seven annual area/production observations per crop. The table marks 2024-25 as first advance; earlier estimate rounds are not individually identified. National values do not enter Maharashtra yield baselines. |
| DES *Agricultural Statistics at a Glance 2024*, Table 2.51(b) | Maharashtra state | 2023-24 final and 2024-25 first advance; tomato | Two area/production rows with yields derived from each row. DES prints a rounded yield of 24.1 t/ha; the pipeline preserves the higher precision implied by the reported area and production. These are state averages, not farm predictions. |
| DES *Agricultural Statistics at a Glance 2024*, Table 2.48 | Maharashtra state | 2024-25 first advance; vegetables aggregate | State area and production, not crop-specific. |
| DES *Agricultural Statistics at a Glance 2023*, Table 2.48 | Maharashtra state | 2022-23 second advance; vegetables aggregate | One state area/production observation, not crop-specific. |
| Maharashtra Economic Survey 2025-26, Table 7.5 | Maharashtra state | 2023-24 final and 2024-25 third advance; vegetables aggregate | Category area/production kept separate from DES estimate rounds. |
| Maharashtra Economic Survey 2025-26, section 7.8 | Maharashtra state | 2024-25; tomato and green chilli | Rounded area-only crop values. Its phrase “final advance estimates” is preserved as written; no production or yield is inferred. |
| DA&FW releases via PIB | India | Tomato, 2024-25 final and 2025-26 first/second advance | Production-only estimate rounds, kept as separate records. No area or yield is inferred. |
| MSAMB APMC public price and arrival page | Maharashtra reporting APMC markets | 2026-11-08 to 2026-11-15; 235 tomato rows from 47 markets and 204 green chilli rows from 46 markets | Dated min/max/modal wholesale prices and arrivals. 437 rows report quintals; two report item counts, which remain unconverted to INR/kg or tonnes. District is not in the response; okra was not offered in the queried crop list. The eight-day window is too short for seasonal price patterns or long-run volatility. |
| NASA POWER Daily API | Three project-selected city reference points: Nashik, Pune, Satara | 2020-01-01 to 2025-12-31 | Daily gridded maximum/minimum temperature and corrected precipitation, plus June-September summaries. These are historical gridded estimates, not farm, station, or complete district observations. |
| FAO ECOCROP data sheets | Global species references | Accessed 2026-11-15; all three crops | Broad environmental ranges for screening only; no Maharashtra variety or farm-level validation. |

### Remaining gaps in state production

The dataset now has a usable recent national series, but that must not be described as recent Maharashtra yield evidence. Maharashtra tomato has two crop-specific DES yield observations for 2023-24 and 2024-25. The state survey also reports a separate rounded 2024-25 tomato area-only figure. Green chilli has a separate 2024-25 state area-only figure but no matching crop production. No recent state crop-specific okra area, production, or yield was found in the sources integrated here. For okra and green chilli, the last crop-specific state yields remain the NHB 2015-16 to 2017-18 baseline.

The DES APY reporting page was checked, but its crop selector does not include tomato, okra, or green chilli; it cannot supply those missing horticulture series. The 2021 NHB report copy found during research was available through third-party document mirrors, while a verifiable official download and dataset reuse terms were not available in the access checks. It was not used to avoid turning a mirror into unverified source provenance. The [Dataful series](https://dataful.in/datasets/606/) was behind a sign-in/subscription gate with unclear reuse terms. The NHB online module's latest listed year was 2011-12, so it did not extend the state crop series.

## Sources and provenance

- Directorate of Economics and Statistics, DA&FW, *Agricultural Statistics at a Glance 2024*, Tables 2.47, 2.48 and 2.51(b). [Official publication PDF](https://desagri.gov.in/wp-content/uploads/2025/11/Agricultural-Statistics-at-a-Glance-2024_%E0%A4%95%E0%A5%83%E0%A4%B7%E0%A4%BF-%E0%A4%B8%E0%A4%BE%E0%A4%82%E0%A4%96%E0%A5%8D%E0%A4%AF%E0%A4%BF%E0%A4%95%E0%A5%80-%E0%A4%8F%E0%A4%95-%E0%A4%9D%E0%A4%B2%E0%A4%95-2024.pdf). Its 2024-25 entries are first advance estimates.
- Directorate of Economics and Statistics, DA&FW, *Agricultural Statistics at a Glance 2023*, Table 2.48. [Official publication PDF](https://desagri.gov.in/wp-content/uploads/2025/01/%E0%A4%95%E0%A5%83%E0%A4%B7%E0%A4%BF-%E0%A4%B8%E0%A4%BE%E0%A4%82%E0%A4%96%E0%A5%8D%E0%A4%AF%E0%A4%BF%E0%A4%95%E0%A5%80-%E0%A4%8F%E0%A4%95-%E0%A4%9D%E0%A4%B2%E0%A4%95-2023_Agricultural-Statistics-at-a-Glance-2023-1.pdf).
- National Horticulture Board, *Horticultural Statistics at a Glance 2018*, Maharashtra crop tables 7.3.25 (green chilli), 7.3.27 (okra), 7.3.34 (tomato). [Official publication PDF](https://nhb.gov.in/statistics/Publication/Horticulture%20Statistics%20at%20a%20Glance-2018.pdf). The report credits the Horticulture Statistics Division, DA&FW. No separate open-data license was identified.
- National Horticulture Board, [interactive area and production query](https://nhb.gov.in/onlineclient/rptproduction.aspx). Its current year selector did not list a year newer than 2011-12.
- Finance Department, Government of Maharashtra, *Economic Survey of Maharashtra 2025-26*, section 7.8 and Table 7.5. [Official survey page](https://finance.maharashtra.gov.in/en/publication/economic-survey-of-maharashtra-2025-26/). Table 7.5 credits HAPIS, Government of India. Its estimate labels are retained as printed.
- DA&FW releases via PIB: [2024-25 final and 2025-26 first advance](https://www.pib.gov.in/PressReleasePage.aspx?PRID=2241379&lang=1&reg=3) and [2025-26 second advance](https://www.pib.gov.in/PressReleasePage.aspx?PRID=2271770&lang=1&reg=3). These report India tomato production; 2025-26 advance values are not forecasts of buyer demand.
- Maharashtra State Agricultural Marketing Board, [APMC price information](https://www.msamb.com/ApmcDetail/APMCPriceInformation). The snapshot is taken from the public dated table and APMC catalog; market and crop codes plus original Marathi labels are retained. No dataset-specific open reuse license was located; confirm terms before commercial or broad redistribution.
- NASA POWER [Daily API documentation](https://power.larc.nasa.gov/docs/services/api/temporal/daily/). Variables are `T2M_MAX`, `T2M_MIN` (°C) and `PRECTOTCORR` (mm/day), Local Solar Time. The committed metadata records the requested dates, API units, fill value, product sources and access date.
- FAO [ECOCROP](https://www.fao.org/geospatial/data-and-tools/data-portals/ecocrop/en) species references. Crop codes and sheet links are in the manifest; their global scope remains explicit.
- AGMARKNET's [data.gov.in catalog](https://www.data.gov.in/catalog/current-daily-price-various-commodities-various-markets-mandi) is documented as an alternative market source, but its API requires a key and its date-wise portal requested CAPTCHA credentials during access checks. No AGMARKNET observations are included; the CSV is an empty import template.

Full publisher, original URLs, access dates, reported units, estimate labels, transformations, license notes, and limitations are recorded in `data/agriculture/source-manifest.json`. Raw extracts preserve the reporting years, market observation dates, and original units. Missing values are not imputed.

## Reproduce and validate

Normal builds are offline and read the committed source snapshots. Python processing uses the standard library; `curl` is used only by explicit refresh commands.

```sh
npm run data:build
npm run data:check
npm run data:refresh-weather
npm run data:refresh-market
npm run test:agricultural
npm test
npm run build
```

`data:refresh-weather` downloads the configured 2020-2025 daily period for the three reference points and stores response metadata. `data:refresh-market` reads the current MSAMB page and APMC catalog and writes the date window and row counts alongside the CSV. The endpoint's reporting window changes over time; a refresh replaces the snapshot, so keep a copy if a longer local history is needed. Refresh commands need network access. Regular generation and validation do not.

### Inputs and output

- `data/agriculture/source/nhb-maharashtra-2018.csv`: three years of Maharashtra crop area and production for each target crop.
- `national-horticulture.csv`: the seven-year DES national series and separate PIB tomato estimate rounds.
- `maharashtra-horticulture.csv`: state tomato rows, area-only crop values and state vegetables aggregates, each with source and estimate status.
- `msamb-market-prices-arrivals.csv` and its metadata: the committed dated tomato and green chilli market snapshot.
- `nasa-power-daily-2020-2025.csv`, `nasa-power-locations.csv` and download metadata: the gridded daily snapshot.
- `fao-ecocrop-requirements.csv`: global crop reference values; missing fields stay missing.
- `agmarknet-prices-arrivals.csv`: an empty schema/template, not sample data.

The AGMARKNET import template accepts one observation per market/date/crop/variety/grade and uses this header:

```text
arrival_date,state,district,market,commodity,variety,grade,min_price_rs_per_quintal,max_price_rs_per_quintal,modal_price_rs_per_quintal,arrivals_value,arrivals_unit,source_id
```

Set `source_id` to `agmarknet-offline-market-import` (or leave it blank to use that default). Market prices are INR/quintal; an unrecognized arrivals unit is preserved and left unconverted. The MSAMB refresh writes its own source-unit field because its displayed rates are INR per reported unit, which varies across rows.

`src/data/agriculturalBaselines.json` is the generated schema version 3 artifact. It contains the historical NHB yield baseline, source-separated state yield series, state and national observations, weather records and summaries, market records and indicators, crop references, coverage and provenance. Area is standardized to hectares/acres, production to tonnes/kilograms, and yields to kg/ha or kg/acre. Same-row yield is derived only when compatible area and production are both present.

The artifact exposes these derived indicators:

- Source-specific annual yield min/median/max/mean; coefficient of variation is left null below three observations. State yield series are not pooled across estimate sources.
- June-September precipitation sum only when all 122 days are observed, otherwise a separate observed-day sum and missing-day count; mean/maximum temperature; 35°C heat-day count; longest observed `<1 mm/day` dry spell. Thresholds are analyst descriptors, not crop stress limits. Missing rainfall breaks dry-spell runs.
- Market modal price min/median/max, coefficient of variation when at least two prices exist, and mean/min/max arrivals plus first-to-last observed reporting-day change when at least two dates exist. Prices and arrivals are converted to INR/kg and tonnes only for recognized mass units, with source units and values preserved; item-count units remain unconverted. Market arrivals are not complete regional supply, and short-sample changes are not oversupply or future-price predictions.

The current market snapshot reports wholesale observations, not farmgate prices. It does not contain costs, buyer commitments, market-grade requirements, or demand forecasts. No market seasonality can be estimated from eight reporting days.

## Evidence status

| Factor | Current evidence |
|---|---|
| Yield | Historical state-derived yields for all three crops, only 2015-16 to 2017-18; two recent DES state tomato yields for 2023-24 and 2024-25. Seven-year national production/area history is provided for each crop but kept out of Maharashtra yield estimates. |
| Production and supply | Maharashtra tomato crop-specific area/production for two years; green chilli area only for 2024-25; state aggregate vegetables statistics for selected years and estimate rounds. No crop-specific recent Maharashtra production for okra or green chilli. National production is not state supply. |
| Prices and market arrivals | Eight dated observations groups for MSAMB tomato and green chilli; min/max/modal price and market-reported arrival quantities. Okra unavailable. The window does not support annual/seasonal volatility or a regional oversupply measure. |
| Weather | NASA POWER historical gridded estimates at three selected city points through 2025. No crop-specific risk score, farm station, or future forecast. Forecast field is explicitly unavailable. |
| Soil and water | No actual farm soil, soil pH, irrigation, water reliability, or sensor records imported. The optional typed farm-condition profile accepts dated sourced measurements or an explicit `unknown`. Regional soil estimates and sensor integration are absent. |
| Crop suitability | FAO ECOCROP global species ranges for screening. Maharashtra planting calendars, local variety requirements and validated soil/water thresholds remain unavailable. Soil suitability does not mean economic optimality. |
| Buyer demand | Existing frontend buyer orders and farmer/plot/sensor demo values remain synthetic. Market history and production statistics are never represented as orders. |

No yield or price forecast model was trained. The state yield series are too short, with inconsistent estimate status and no farm-level features, for an independently evaluated forecast. Weather and state crop production do not yet align into enough consistent observations. The simple scenario ranges derived from the old NHB sample are historical references and are not validated predictions.

## Planning Engine integration

`src/data/agriculturalEvidence.ts` provides `getAgriculturalPlanningEvidence(cropId, farmConditions?)`. It returns separate status-bearing fields for the old regional yield baseline and its recent source-separated yield series, recent state horticulture, national production, global suitability references, historical weather, market context, optional farm measurements, weather forecast availability, and synthetic buyer demand. Each real observation includes its source metadata. The Planning Engine does not import this adapter yet.

Recommended next integration steps:

1. Surface the Maharashtra 2023-24/2024-25 tomato yield series separately from the stale NHB baseline. Keep Okra and green chilli marked stale/unknown at state crop level; do not substitute national averages.
2. Obtain a reusable official state horticulture time series for all three crops, with consistent estimate definitions, before changing demo yield assumptions.
3. Resolve each farmer's district/location and soil/water records, then join only compatible geographies and preserve unknowns. Keep historical weather filtered to dates at or before each planning cutoff; connect a forecast interface only when an evaluated forecast provider is chosen.
4. Load a longer authorized market archive for relevant APMCs and preserve variety, grade, unit, and date. Before using a price for net returns, subtract handling, transport, sorting, and payment costs; keep wholesale-to-farmgate adjustment assumptions visible.
5. Continue using only confirmed buyer procurement orders as demand. Treat market signals as context and keep yield estimates, price outlook, and committed demand as separate inputs.
