# Final 3.0

> **Historical development material.** This is the broader plan the team worked from during the hackathon. It is kept as a record and is not a current product commitment. Its business model (an exporter-paid success fee with free FPO access) was superseded by the final positioning in the [project README](../README.md): an FPO-paid subscription, partner exporter access, and a secondary success fee on optional marketplace transactions.

Meraki crop planning and produce supply chain execution

Rewritten 15 November 2026 for the SIH team. Meraki combines plot-level crop suggestions, collective FPO production planning, open supply and demand discovery, two auction modes, and delivery-to-payment execution. This version combines the crop-planning feasibility assessment with the marketplace business model. Crop planning is a core module, not a later add-on. Product recommendations and targets below remain proposals unless explicitly identified as observations.

## 1 The full idea

Meraki helps an FPO answer what each participating farmer could feasibly grow, when harvest would arrive, how much marketable produce may be available each week, and which real buyer requirements that supply could meet. It combines authorised soil tests and farm records with weather, water context, seed/management records, production costs and buyer specifications. Exporters publish requirements and procure suitable supply; FPOs coordinate willing farmers, track crop progress, sell harvest lots and reconcile payments.

The objective is reliable, economically worthwhile marketable supply under land, water, labour, cash and farmer-choice constraints. Maximising gross yield alone is insufficient: more tonnes can mean more unsold produce, higher input costs or a missed delivery window. Farmer net return, buyer fulfilment and water feasibility are explicit decision criteria.

End-to-end flow: register plot and farmer consent → import soil and environmental context → screen crops and varieties → estimate weekly harvest scenarios → match demand and propose a collective plan → obtain farmer acceptance and commercial commitments → record seeds and cultivation → update supply risks → harvest and reuse QC → bid or fulfil an existing award → deliver and record accepted quantity → settle and learn from outcomes.

Position: B2B2FPO planning and procurement orchestration. FPO staff and approved partners handle data onboarding so farmers need not type laboratory values or manage a complex application. Exporters or procurement organisations are potential paying customers; basic FPO participation can be free initially. Meraki does not automatically become the produce owner, exporter of record, laboratory or lender. Those roles and liabilities must be separately agreed.

## 2 Existing prototype and changes required

Observed at https://meraki-tau-opal.vercel.app/ on 15 November 2026: navigation includes Overview, Planting Plans, Buyer Demand, Farmers and Farms, and Messages. The visible overview and demand screens distinguish committed, indicative and forecast signals. They show seasonal quantities, crop opportunities, sowing/harvest windows and farmer participation gaps. The site labels its orders, farms, forecasts and replies synthetic, and says messages are not sent. Its scenario date is 16 November; this is not a live-data timestamp.

The Later modules screen explicitly marks Lots and inspection, Lab and release review, Crates and shipments, Arrival and claims, and Farmer settlements as outside the current workflow. These are planned modules, not completed capabilities. This review covered visible overview, demand and later-module screens; no backend, authentication, actual auction, payment or messaging implementation was verified.

Retain the existing demand-state distinctions and farmer-confirmation warnings. Improve the summary: do not let aggregate tonnes across crops or wide seasonal windows imply one crop can offset another. A combined forecast supply of 52.6 tonnes against 48.2 tonnes of total demand does not establish that individual crop, grade and weekly obligations are covered. Show crop–variety–grade–location–delivery-window gaps separately.

Add a complete crop-planning workspace: soil report provenance; environmental and water context; crop/variety comparisons; planned versus actual inputs; explained suitability; uncertainty; weekly marketable quantities; farmer approval; and scenario comparison. Replace one unexplained High feasibility label with separate soil, timing, water, labour, commercial and evidence assessments. Show proposed coverage sufficient—confirm farmers when allocations have not been accepted.

Provide a no-orders mode: show feasible capacity and exploratory market signals without pretending there is a buyer. Historical mandi prices, export totals and enquiries are signals, not purchase commitments. Farmer-facing messages begin with a proposal until acceptance. Retain the synthetic-data banner for all demo fixtures and never present the scenario date as a live observation date.

## 3 Input variables and how to obtain them

Capture the variables that can affect crop establishment, growth, harvest quality and realised income. A variable can be scientifically relevant without being publicly available or supported by our training labels. The MVP collects a practical minimum and marks the rest unknown; it does not require every farmer to complete every field.

### Plot and production history

Record stable plot ID, consented boundary or coordinates, measured/reported area, usable area, land availability dates, existing crops, previous crops/rotation, drainage, slope, flooding history and protected versus open cultivation. Add planting/transplant dates, spacing, stand count and observed germination. FPO verification and field observations are primary sources; public terrain or land maps provide context, not proof of actual plot availability.

### Soil chemistry and physical condition

From a dated plot-linked SHC or laboratory report, retain pH, electrical conductivity, organic carbon, available N/P/K/S and micronutrients Zn/Fe/Cu/Mn/B when reported [S1]. Add texture, rooting depth, compaction, drainage and water-holding information from suitable tests or field assessment; these are not all measured by a standard SHC. Record sampling depth, laboratory, method and report age. Different plots or management zones should not silently inherit one sample.

Preserve raw units and methods alongside normalised values. Available nitrogen is not total nitrogen; phosphorus may be P or P2O5, potassium K or K2O. Percent organic carbon is not the same as an unconverted g/kg value. pH medium and EC extraction method matter; do not apply saturated-paste salinity thresholds blindly to another assay. Unknown method/units trigger review, not a guessed conversion. SoilGrids estimates remain separate from laboratory observations.

### Weather and environmental conditions

Use past and observed minimum/maximum temperature, rainfall amount and distribution, humidity, solar radiation, wind and derived evapotranspiration or heat/dry-spell indicators when method and inputs are available. Preserve forecast issue time and horizon. Use stage-specific stress flags and local growing seasons rather than annual averages alone. A week’s forecast cannot establish the weather over an entire crop cycle. Terrain and flood exposure can supplement, but do not replace, field evidence [S3–S4].

### Groundwater and irrigation

Record regional observation-well depth/trends and assessment context where available, plus the actual farm’s water source, access rights, seasonal reliability, pump capacity, available pumping hours, power, storage, shared-well allocation, irrigation method and measured/reported water quality. Groundwater depth below ground level is not well depth, pump discharge or a guarantee of irrigation. Link observations by date and hydrogeological relevance; nearest distance alone may be misleading [S5].

A farm water budget compares crop-stage demand with feasible supply after application losses and shared constraints. Use locally reviewed crop coefficients/reference ET and effective rainfall assumptions only where supported; label assumptions. Require local measurements or adviser review before treating a precise irrigation schedule as operational advice. A shallow water table may create waterlogging or salinity risk rather than simply being beneficial.

### Seed and nursery records

Capture species, variety/hybrid, supplier, batch/lot, purchase date, seed or seedling quantity, germination label/test if available, treatment, nursery/transplant age and actual establishment. Farmer/FPO records, seed packaging and authorised supplier exports are the practical sources. A public variety catalogue describes characteristics; it does not establish which seed a farmer actually planted. Record intended seed separately from purchased and planted seed.

### Fertiliser and amendments

Log product, nutrient analysis, quantity, treated area, application date, method and stage, plus manure/compost and other amendments. Derive nutrient applications only when product composition is known; distinguish product kg from nutrient kg. Sources are FPO purchase/application logs, receipts, adviser plans and farmer confirmations. Purchase is not proof of application. Future planned doses are assumptions; actual application becomes an in-season input.

### Pests disease and pesticide use

Record field scouting, symptoms, pest pressure, affected area, diagnosis confidence and adviser review. Log commercial product, active ingredient, formulation, application date/time, rate/unit, area, purpose and applicable label/reference. Include biological controls and weed pressure. Actual use comes from authorised farm records, not a universal open API. A self-declared spray log supports traceability but does not prove residue compliance; relevant laboratory testing remains separate.

Pesticide and fertiliser records are inputs to assessment, not permission for an AI to invent treatment doses. Recommendations require current crop/product/location rules, label instructions and qualified review. Missing logs or unresolved harvest-interval evidence create a review flag; the system must not declare export safety from a checklist or sensor.

### Farm resources and commercial constraints

Capture labour availability, skill, equipment, input availability, working capital, prior costs, farmer preferences, risk tolerance and acceptable crop choices. Record buyer variety/grade, weekly quantity, delivery date, payment terms, target price basis, packhouse and transport capacity. These variables often determine whether an agronomically possible plan is executable. Farmers may decline a profitable-looking proposal for legitimate practical reasons.

### Harvest and post harvest outcomes

Measure actual harvested kg by plot/date, sample grade results, accepted/rejected/downgraded weights and reasons, storage/handling conditions, dispatch and arrival weights, alternative-sale recovery, sale receipts and farmer disbursal dates. These are the labels needed to learn marketable supply and net returns. Link seed, cultivation and soil records to the same plot-season and harvest tranches without treating correlation as a causal effect.

## 4 Source and API access plan

Use open data, documented APIs and authorised partner imports according to their actual terms. Publicly viewable, free, open-licensed, API-accessible and approved for pooled model training are separate properties. No government connection or commercial reuse permission has been obtained by writing this plan.

### Soil Health Card and laboratory records

The official SHC API guideline location is https://soilhealth.dac.gov.in/files/SHC_API_Integration_Guidelines.pdf . Earlier indexed documentation describes consumer registration and token-based access; the full PDF was not retrievable in the research. We have not verified eligibility, permitted farmer-record scopes or a successful soil-card retrieval. The published support terms restrict automated copying and commercial reuse without permission [S2]. Therefore this is an access-request dependency, not an unrestricted public endpoint.

Integration path: confirm eligible consumer, identifiers, consent, sandbox/token process, fields, rate limits, retention and separate model-training rights with the SHC programme. Until approved, import member-authorised laboratory CSV/PDF exports or let FPO staff scan existing cards, review OCR and link them to the correct plot. This removes farmer typing without inventing government access. Missing cards lead to limited preliminary screening or a testing request; no substitute lab values are fabricated.

### Weather APIs and historical weather

IMD publishes current weather, forecasts, rainfall, warnings and agromet API documentation at https://api.imd.gov.in/public/api_reference.html . The documented sample cityforecast request with id=42182 returned HTTP 401 in this review. Register and verify access/current commercial terms before relying on it; documentation is not a working integration. Cache permitted responses, show issue/valid times and mark failures or stale data [S3].

NASA POWER provides documented historical daily weather access at https://power.larc.nasa.gov/api/temporal/daily/point . The prior local audit downloaded a representative Salem 2024 sample with T2M_MIN, T2M_MAX, PRECTOTCORR, RH2M and ALLSKY_SFC_SW_DWN, using community=AG. It is coarse gridded historical/reanalysis context, not a plot station or a coming-season forecast. Cache by grid/time, preserve fill values, units and source time convention, and retain NASA attribution [S4]. Use legally permitted archived forecast/scenario data for future conditions.

### Groundwater and surface water

CGWB’s Ground Water Level Monitoring page provides downloadable observation series and points to India-WRIS; WIMS is described as authorised-user access. Use the documented downloads first and retain well/location/date metadata. An unrestricted production API contract for our application was not verified; do not hard-code a viewer’s internal network endpoint as a supported open API [S5]. Historical periodic observations must not be labelled live farm groundwater. Obtain actual irrigation reliability through FPO interviews, measured pumping records or authorised water-user records.

### Mapped soil and remote sensing

ISRIC SoilGrids offers modelled 250 m soil context and uncertainty under CC BY 4.0. The official site currently says its REST service is paused and points to raster alternatives. Use a cached permitted regional raster workflow rather than a live REST dependency. Total nitrogen, texture and mapped pH are regional estimates; they do not provide SHC-equivalent available N/P/K or authenticate a plot’s soil condition [S6].

Optional satellite canopy/vegetation features can support in-season monitoring after checking image availability, clouds, pixel size, plot boundaries and licence. They cannot reveal exact seed brand, actual fertiliser application, pesticide residues or unobserved future yield. Very small/intercropped plots may not support clean pixel attribution. Keep remote sensing outside the first integration gate unless a demonstrable information gap justifies it.

### Crop requirements and yield references

Use locally reviewed ICAR/state agricultural university guidance for cultivar, season and management applicability; TNAU provides relevant horticultural references [S7]. Broad FAO EcoCrop constraints can support screening, but annual precipitation ranges are not weekly rainfall thresholds. Guidance pages are agronomic references, not plot-level yield-training observations or automatic permission to reproduce their contents commercially [S8].

DES crop area/production/yield reports are regional statistics. The earlier audit inspected an India Data Portal distribution with district, agricultural year, crop, season, area/production/yield and unit columns. For Salem, each selected tomato/brinjal/bhindi series had only two records, from 2002–03 and 2003–04; this cannot support a current local vegetable-yield model. The broader catalogue’s years do not establish each crop’s coverage. The distributor’s licence metadata had inconsistent openness flags requiring clarification [S9].

The same audit downloaded NASA weather for 2024 and inspected historical vegetable labels; those files were not a matching training pair. No appropriate open plot-linked soil–management–weather–vegetable-yield dataset was verified for this pilot. Do not attach district average yields to individual soil samples and present them as measured farm labels. Onion baseline results from a separate historical exercise do not validate tomato, brinjal or okra prediction.

### Demand prices and actual farm inputs

Use published mandi/export statistics as dated price and market context only. APEDA Farmer Connect provides enquiries and sell offers [S10]; it does not give us a guaranteed buyer order. Actual seed, fertiliser, pesticide, irrigation and harvest records require consented FPO/farmer/supplier data. Public registries or regional fertiliser consumption totals cannot replace those farm events. Commercial availability through another platform is not equivalent to an open reusable dataset.

For every adapter, record source owner/URL, geographic and temporal resolution, actual fields/units, licence and intended use, credentials/access status, retrieval test date, permitted refresh interval, latency, completeness and fallback. Promote an adapter to live only after an authorised sample download passes schema and provenance checks. Keep public context, partner-authorised records, simulations and unknowns visibly separate.

## 5 Crop suggestions and farmer decisions

Separate two questions: could this crop/variety be grown under the plot’s constraints, and should this farmer allocate land to it for this market? First screen agronomic feasibility, then compare feasible alternatives on conservative net return, water demand, labour/cash and credible market access. Crop suitability is not a promise of highest yield or profit.

Step 1: create a decision-date snapshot of soil evidence, plot availability, previous crop, locally applicable season, available water, intended seed/management and resources. Step 2: use versioned agronomic rules to identify feasible, conditional and unsuitable options with explicit reasons. A low nutrient value may trigger a fertility-management review rather than declaring a crop impossible. Missing evidence permits only claims supported by the remaining information.

Step 3: show three to five alternatives where feasible, each with variety, planting/harvest window, yield reference or scenario range, expected marketable share, water/resource needs, production cost, break-even price, demand status and unresolved checks. Step 4: an FPO coordinator/agronomist reviews the proposal; the farmer accepts, modifies or declines. Step 5: only accepted plots enter the confirmed production plan. Keep an audit trail of the recommendation version and consent.

Example, entirely hypothetical: Plot A has a dated suitable soil report, reliable reviewed irrigation and a buyer-compatible okra window; it is a candidate for a small allocation. Plot B has unknown water reliability; show a provisional option and request verification rather than the same High rating. Plot C already carries a standing crop; exclude overlapping acreage. If no buyer exists, show these as feasible capacity and market exploration, not sellable contracted supply.

Generate management reminders from reviewed crop protocols and actual stage, with named adviser/source and expiration. Record farmer/FPO confirmation separately from verified completion. Do not automatically switch crops, reserve land or send instructions merely because a model score changes.

## 6 Yield and weekly marketable supply

Use separate outputs: gross biological harvest, grade-specific marketable harvest, FPO-committed share, and accepted delivery. A suitable crop may still produce less because of pests, water failure or management; a large harvest may still fail the buyer’s grade or timing. At first, use locally reviewed low/base/high scenarios and label them scenarios rather than calibrated confidence intervals.

Per plot and week: gross kg = area in hectares × gross yield in tonnes per hectare × 1000 × weekly harvest share. Marketable FPO kg = gross kg × buyer-grade fraction × share committed to the FPO × post-harvest retention. Apply collection/packing/transport capacity, travel time, existing reservations and quality holds to obtain allocatable delivery. Harvest shares over the full season sum to one. Do not apply grade loss twice if the starting yield is already marketable yield.

Illustrative arithmetic: 1 ha × 10 t/ha × 1000 × 0.20 weekly share = 2,000 gross kg that week. At 0.80 eligible grade × 0.75 FPO commitment × 0.95 retention, 1,140 kg remains before logistics/reservations. These numbers demonstrate the formula only. Each factor needs local evidence; independent worst-case factors should not be misrepresented as a statistically calibrated probability.

Use crop-specific picking curves and observed progress. Do not spread a season’s harvest uniformly across weeks unless explicitly a temporary assumption. Staggered planting and repeated picking require individual tranches. Preserve harvest-date uncertainty, correlated weather/groundwater shocks and common transport failure. Diversifying nearby farms does not eliminate a shared drought.

Pre-sowing predictions use only data available by the decision time: planned management is distinct from eventual application; future observed rainfall and post-planting imagery are unavailable then. In-season updates can legitimately use new observations, but are evaluated at their own forecast horizons. Preserve issued_at, observed_at, published_at, valid_for and ingested_at to avoid future-data leakage.

## 7 Collective planning and production monitoring

The FPO planner proposes crop–plot–area–sowing-date allocations to cover grade-specific weekly buyer requirements while respecting farmer choice, water budgets, cash/labour, seed availability, rotations, land calendars and collection capacity. Commercially committed demand receives first attention. Indicative demand produces exploratory scenarios; it does not justify automatic sowing.

Start with transparent rules and manual scenario comparison, then use constrained optimisation when the inputs are reliable. A reasonable objective balances expected farmer contribution, accepted on-time delivery, shortfall penalties and water/resource limits. Do not compare crop alternatives solely by tonnes or manufacture precise profit from uncertain prices. Expose trade-offs and infeasibility rather than silently relaxing a hard constraint.

The main planning view is week × crop × variety × grade × handover location: buyer requirement, proposed supply, farmer-accepted supply, planted supply, conservative marketable estimate, reserved quantity and shortfall. A later surplus cannot fill an earlier deadline; one crop cannot offset another. Under a common shock, recompute scenarios and flag affected contracts without changing them unilaterally.

After consent, record seed/nursery sourcing, planting, germination/stand, crop-stage observations, irrigation and input events. Trigger tasks for missing evidence, approaching milestones, observed stress and projected supply gaps. Escalate agronomic concerns to qualified review; let the coordinator arrange an agreed backup or revised window with the buyer. The feedback loop connects crop planning to actual delivery rather than stopping at a recommendation screen.

## 8 Open market information and commitment states

Demand states: forecast → indicative enquiry → verified procurement request → awarded allocation → signed commitment → partially fulfilled → fulfilled or cancelled/disputed. A buyer document can support verification but is not automatically a purchase guarantee. An exporter records its own procurement obligation; private overseas customer identity, resale price and margin remain restricted.

Supply states: available land → proposed planting → farmer-consented plan → planted crop → growing forecast → inspected harvest-ready quantity → harvested lot → reserved → dispatched → accepted or disputed → settled. Land area is not an inventory lot. An FPO’s stated 10-tonne harvest is a declaration until supported; growing output remains uncertain even after checks.

Every record carries owner, evidence state, event date, last update, expiry, units, location granularity and source. Confidence is initially expressed as declared, evidence-supported or inspected, with a quantity range and reasons. Do not display a numerical probability before calibration. Mark stale forecasts and show gross harvest, expected eligible grade and unallocated quantity separately.

Publish an open board to verified marketplace participants with crop, variety, grade, coarse location, delivery window, quantity, evidence status and auction timing. Provide aggregate public trends with coverage and freshness labels. Exact plots, farmer contacts, bank details, buyer contracts and bidder identities are permissioned. Publish price/volume information under a disclosed policy; individual reserve prices may remain private. Transparency concerns opportunities and rules, not unrestricted disclosure of every commercial record.

Prevent duplicate demand: one overseas order may be quoted by several exporters before any wins it. Give requests forecast/enquiry/confirmed status and record exclusive versus competing sourcing. Use consented reference hashes or manual review for suspected duplicates; do not expose underlying customer documents. Report demand that cannot be deduplicated as uncertain. Do not total every enquiry as guaranteed consumption.

## 9 Two auction modes and contract rules

### Harvested lots exporters bid to buy

Proposed MVP rule: a scheduled ascending auction, open for an announced two-hour window. FPO posts one homogeneous inspected lot with available weight, grade evidence, harvest date, pickup deadline, delivery basis, minimum acceptable price and minimum increment. Eligible exporters bid INR per kg on identical terms. Highest eligible price wins, subject to the disclosed reserve and confirmation requirements. The winning buyer pays its own winning price; this is not a second-price auction.

Start with whole-lot awards. Example: a 10-tonne lot receives valid bids of INR 20, 21 and 22 per kg. If the reserve is met, the INR 22 bidder is provisionally awarded the lot. Reserve the lot in the authoritative database so it cannot simultaneously satisfy another auction. If unsold, return it to available inventory with a recorded outcome; do not silently sell below reserve.

Before opening, publish timezone, opening and closing timestamps, eligibility, fees, increment, reserve policy and cancellation rules. Equal valid prices are resolved by earliest server-accepted bid. First come, first served is only this tie-break; arriving first does not beat a higher bid. Use server time, atomic bid acceptance and a receipt containing bid ID and timestamp. An unsent offline draft is not a valid bid.

Proposed anti-sniping rule: a valid improving bid during the last two minutes extends closure by two minutes, capped at ten additional minutes. Announce this before bidding. Prohibit seller self-bids, linked-account manipulation and hidden administrator bids. Show anonymised leading price and an immutable bid history to authorised reviewers. Winner default triggers a disclosed offer to the next eligible bidder or a rerun; do not auto-charge or bind another bidder without agreement.

### Future production FPOs bid to supply

An exporter seeking future produce is buying supply. The default proposal is therefore a reverse auction: qualified FPOs quote the price at which they will supply. The lowest eligible comparable price wins, rather than the highest price. If the team prefers a scored tender, disclose weights and evidence requirements beforehand and call the winner the highest-scoring eligible offer. This distinction resolves the original highest-bidder ambiguity.

Recommended initial rule: prequalify crop, harvest window, consented capacity, quality protocol, handover location and payment acceptance; then rank by lowest delivered price. Set an exporter maximum price and FPO minimum viable quote controls, with farmer net-return estimates visible to the coordinator. Do not incentivise loss-making production or silently change ranking using an opaque AI score.

Example: exporter needs 20 tonnes over four weekly deliveries. Eligible FPO A offers 12 tonnes at INR 25/kg and B offers 8 tonnes at INR 26/kg. If split awards are enabled and feasible, award A and B for INR 5.08 lakh total, equivalent to INR 25.40/kg before separately stated charges. A lower quote that cannot meet the crop/window/quality requirements is ineligible. If split awards are not enabled, no bidder covering only part of the request can win the whole order.

Publish quantity, unit, delivery schedule, production requirements, price inclusions, bid decrement, funding/deposit conditions, partial-award policy, evidence deadlines and award validity. Qualification occurs before the timed price round. The initial pilot can use sealed commercial quotations reviewed at close when an open descending auction would encourage underbidding; this is a documented alternative mode, not mixed silently with ascending bids.

Award is provisional until both parties approve terms and required payment evidence is confirmed. Contract fields include quantity tolerance, objective acceptance protocol, price or formula, member consent, input responsibilities, milestones, weather/force-majeure treatment, cancellation, replacement, appeals and payment deadlines. Treat these as physical-delivery procurement agreements; obtain jurisdiction-specific review before live trading rather than presenting a speculative tradable futures product.

The crop planner is the feasibility gate for future-production bids. Available land is a plot calendar, not a harvested lot. Require farmer-consented area, feasible planting and picking windows, conservative marketable quantities, budget/input availability and a production plan before a binding supply quote. Keep unconfirmed future capacity out of immediately available lot auctions. Prequalification does not guarantee harvest or safety.

## 10 Fulfilment QC and settlement

Use one capacity ledger across indicative plans, bids, awards and deliveries. Active binding offers reserve defined capacity until expiry; nonbinding expressions of interest do not. Lock quantity atomically on bid acceptance or allocation according to the chosen auction mode. Award, release and expiry are idempotent. Prevent double use of member plots and harvest tranches across multiple FPOs where consented identifiers allow detection.

Feasibility checks operate by crop, variety, grade, date, location and packhouse capacity. Handle staggered harvest and repeated picking as dated tranches. Keep an uncertainty buffer separate from sellable inventory; its size is a disclosed assumption until validated. A 10-tonne central forecast is not permission to promise 10 tonnes with certainty. Show gross quantity minus existing reservations, expected exclusions and uncertainty allowances.

Assign a coordinator for each order. Record collection appointment, packing responsibility, transport quotation, dispatch weight, custody handover, receiver weight and acceptance deadline. Escalate shortfall early and show eligible backup offers requiring consent. Distinguish cosmetic downgrade from safety hold. Unsafe produce does not automatically become processing stock.

Reuse FPO grading, packhouse inspections, exporter acceptance records and relevant laboratory reports. Meraki standardises the evidence schema and identifies missing checks. It does not repeat every inspection or certify exports. Additional checks are commissioned only when buyer requirements or evidence gaps justify them, with payer and price agreed.

Agree a crop-specific protocol with the exporter and packhouse: lot definition, sample selection, sample count, size/maturity measures, defect definitions, instrument checks, reference photos, grade thresholds, rejection rules and reinspection procedure. Store protocol version and inspector identity. Preserve sample result versus whole-lot inference. Safety reports require matching lot/product, scope, dates and applicable acceptance criteria; a photograph cannot establish residue compliance.

Higher acceptance is a hypothesis, not a built-in platform property. Measure accepted kg per purchased kg under comparable specifications, plus rejected-produce recovery and all upstream costs. Pre-sorting may move losses to the FPO without improving total value. Preserve raw inspection records and amendments. Give farmers reasons for downgrades and track both FPO receipts and actual member payment separately.

Link crop management and quality records without confusing them. Soil chemistry supports fertility planning, pesticide logs support traceability, and laboratory residue evidence supports its scoped safety assessment. None proves the others. Dispatch/arrival inspections and member settlement records close the loop from suggested crop to realised farmer income.

## 11 Role specific frontends

### Exporter frontend

Organisation onboarding and procurement permissions; private buyer-order intake; demand form with forecast/confirmed status; crop/window-specific market board; matched FPO offers with evidence and all-in cost comparison; lot auction room; forward request and supplier qualification; bids and reserved quantities; award/contract confirmation; pickup and delivery tracker; acceptance/claim review; payment and cost-per-accepted-kg dashboard. Show buyer demand separately from the exporter’s purchase budget.

### FPO frontend

Extend existing Meraki with supply declarations, farmer-consented plot capacity, dated harvest tranches, evidence freshness and uncertainty. Add harvested-lot creation, quality attachments, auction scheduling, bid room, award acceptance, member allocation, production milestones, delivery records, payment status and member settlements. Existing planting and messaging remain useful, with messages requiring explicit send actions and delivery status. No guaranteed planting instruction from a forecast.

### Operations and shared screens

Add verification queue, protocol management, duplicate-order review, auction controls, suspicious-bid flags, dispute case management, evidence access, fee invoicing and auditable overrides. Admins may pause an auction under a published incident rule; they cannot secretly change a closed winner. Provide multilingual labels, assisted onboarding, low-bandwidth tables and accessible keyboard operation. Offline forms save drafts; bidding and authoritative reservations require an online acknowledgement.

FPO additions: plot data completeness, source/date/units, soil report import with human verification, water feasibility, seed/input event capture, proposed versus actual cultivation, crop alternatives, conservative weekly supply and multi-plot shock scenarios. Exporter additions: acceptability of forecast evidence, crop/grade/week procurement gap, committed versus indicative buyer demand, future-production qualification, budget and handover costs. Agronomist/reviewer role approves protocol applicability without gaining unrestricted financial access.

Shared UX rules: distinguish missing, measured, reported and estimated; show why a suggestion appears, what would change it and what needs review. Export only necessary plot details. Farm records stay private to authorised parties while the market board shows coarse supply opportunities. Messages remain drafts until an explicit authorised send action; no messages are sent by preparing this plan.

## 12 Architecture and data contracts

Proposed stack: React and TypeScript PWA extending Meraki; FastAPI modular backend; PostgreSQL as the authoritative ledger; object storage for reports/images; background worker for expiry, auction close and notifications. Use server-sent events or WebSockets for auction updates, with reconnect reconciliation. Hosting and libraries require current environment checks before implementation. Begin as a modular monolith, not many microservices.

Core entities: organisation, membership/role, farmer and consent, plot/season, buyer-reference fingerprint, demand and revision, supply forecast, harvest tranche, physical lot, QC protocol, inspection/report, auction and rule version, bid, capacity reservation, award, contract, shipment/handover, acceptance/claim, invoice/payment evidence, fee and member settlement. Store event time, received time, actor, source and correction trail.

API groups: organisations and memberships; demands; supply forecasts and lots; matching; auctions/open/bids/close; reservations; awards and confirmation; inspections and documents; shipments/arrival; claims; settlements. All mutations require authentication, organisation scope and idempotency keys. Use integer money in minor units and explicit weight precision; normalise tonnes to kg, maintain timezone-aware UTC timestamps with local display, and prevent mismatched price bases.

Auction closure is a database transaction with row locking or equivalent concurrency control, not a browser timer. Check request deadlines, eligibility, bid increment, funds/credit policy and remaining capacity server-side. Persist bid events before acknowledgement; use an outbox for reliable notifications. Reconnect clients fetch authoritative state and last event cursor. Read replicas/cache never decide winners. Failed jobs retry without duplicate awards.

Security and operating controls: organisation isolation, least privilege, reviewer access logging, expiring report links, malware checks for uploads, rate limits, encrypted transport/storage, tested backups and a restore runbook. Payment status comes from reconciled provider evidence or reviewed bank records; an uploaded screenshot alone is unverified. A payment provider handles live collection; Meraki does not assume permission to hold customer funds.

Extend the data model with soil sample/report/result, analyte/unit/method, plot geometry and consent, environmental cell/station/well reference, issued forecast and valid period, crop/variety protocol, water-source capability and budget, seed lot, planned-management scenario, actual input event, crop observation, harvest curve, suitability assessment, yield/supply scenario and farmer approval. Link every output to input snapshot, algorithm/model version and reviewer.

Add API groups for /soil-reports/import and review; /plots/{id}/environment; /crop-options; /planning-scenarios; /plans/{id}/farmer-decisions; /crop-cycles/{id}/events; /harvest-tranches and /supply-projections. Data adapters write to a staging area before quality checks and do not overwrite verified farm measurements. Separate raw evidence, normalised observations, derived features and model outputs. Keep credentials server-side and restrict pooled training to consented/permitted records.

## 13 Models training and evaluation

Treat data readiness as the first deliverable. The prior FarmSmart review found a 2,200-row crop-label experiment with seven inputs and no appropriate plot/year/yield/management labels. It cannot establish maximum-yield crop selection, and it cannot be reliably joined to district weather just by matching numeric NPK values. Reuse code only after current repository and licence checks; do not present old training accuracy as farm validation.

### Suitability and crop ranking

MVP: locally reviewed rule-based eligibility and explained scenario ranking. Training a supervised optimal-crop model would require credible outcomes for comparable crop alternatives and management conditions; observed historical crop choices are not optimality labels. Use the classifier only as a clearly isolated research baseline if feature units/provenance and independent evaluation can be established. The production suggestion must continue to respect water, timing, resources, farmer preferences and market status.

### Yield and harvest timing

Later candidates: crop-specific tabular regression/quantile models, or a suitably calibrated crop simulator, using plot-season soil, variety, planting, available-at-cutoff weather and management plus measured harvested weights. AquaCrop is a reference for the categories of crop, water, soil and management inputs; using a simulator still requires crop/local calibration [S11]. Compare with local historical/extension yield ranges and seasonal-naive timing before adopting complexity.

Do not train a farm model from the two old Salem vegetable observations. If a sufficiently covered district series is verified, a district-level experiment can use matching district/year/season weather with that interpretation retained. It is not plot-level validation. For a pilot, build the linked plot-season dataset prospectively and retain actual weekly picking, weather availability, grade and delivery outcomes.

### Grade share and delivery confidence

Start with observed/manual grade fractions and evidence checklists. Later model grade-specific accepted kg and the probability of meeting an agreed weekly accepted quantity from dated crop progress, eligible capacity and actual delivery history. Do not use final rejection results to predict an earlier decision. New FPOs show insufficient history rather than an invented high-confidence number. Report Brier score/reliability curves for probabilities and bias/interval coverage for quantities.

### Demand price and commercial matching

Actual buyer requirements are records, not model predictions. Demand/price models are optional contextual forecasts using correctly dated actual outcomes, cancellations and comparable prices; benchmark against simple seasonal models. Matching and auction winner selection remain deterministic. An allocation solver enforces constraints and reports shortages; it is optimisation rather than a trained model.

### Document vision and advisory assistance

Existing OCR can extract soil/seed/input/report fields with document references and human confirmation; low-confidence values cannot silently reach an agronomic decision. Optional vision models assist only visible crop-stage or quality observations with expert labels and field testing. A language model may explain approved recommendations or translate messages; it must not invent lab values, chemical prescriptions, buyer commitments or certification. Custom foundation-model training is unnecessary.

### Training pipeline and release gates

Build a data dictionary and permission register → validate units/identifiers and missingness → form plot-season/time-indexed observations → freeze prediction dates → reserve temporal and farm/region holdouts → fit simple baselines → tune only on training/validation data → evaluate independent outcomes → run in shadow mode → deploy with versioning, monitoring and rollback. Random row splits can leak the same farm/season or fruit across train/test. Record publication delay and revised historical data in backtests.

Metrics: yield MAE/bias by crop/region, weekly marketable kg error, harvest-date error, interval coverage/width, shortfall detection, calibration, and operational cost. Grade-image models require class precision/recall and cross-farm/device evaluation. Compare recommendation usefulness against the coordinator’s existing plan using the same information date; prediction accuracy alone does not show higher income. Dataset sufficiency depends on independent seasons/farms and learning curves, not one arbitrary row target.

Optional hardware: use an existing suitable soil laboratory, scale and phone first. Soil-moisture, water-flow or temperature logging may fill a verified gap after calibration and maintenance costing. Cheap multiparameter probes are not automatically laboratory-equivalent NPK measurements; crate temperature/RH cannot establish soil fertility or residues. No sensor purchase is required to demonstrate the initial planning and market workflow.

## 14 Business model and financial test

Launch hypothesis: exporter pays a disclosed success fee on accepted, reconciled volume; basic FPO discovery and participation are free initially. Optional managed field coordination is separately priced and scoped. Later, recurring procurement users may pay a subscription for workflow, team access and analytics. Do not charge both parties hidden commissions or monetise private transaction records without consent. Avoid fees on bids and farmer planting decisions during validation.

Illustrative fee test: 20,000 accepted kg at INR 0.50/kg yields INR 10,000 revenue. If field/coordination costs are INR 6,000, payment/support INR 1,000 and a justified claims allowance INR 1,000, contribution is INR 2,000 before customer acquisition, engineering and fixed overhead. At INR 12,000 variable cost, the same order loses INR 2,000. These are planning assumptions, not quotes or current margins; test whether the fee covers real service effort.

Exporter value must exceed fee: comparable sourcing cost avoided plus incremental contribution from orders enabled plus measured losses avoided, less new costs and the fee. Earlier conversation figures of INR 30,000 sourcing overhead and INR 1.2 lakh shipment profit were illustrative scenarios. They are not verified industry averages and must not be used as established market evidence or expected revenue. Collect actual staff time, travel, agent fees, grading loss, transport, credit days and claims from consented pilot orders.

Farmer outcome: compare member net receipts per harvested and accepted kg, input/handling costs, rejection recovery and days to payment. Improved exporter margins alone do not establish farmer benefit. If a grading improvement merely transfers disposal costs upstream, report it. Marketplace liquidity and repeated useful transactions matter more than registered user counts.

Planning revenue hypothesis: a procurement organisation pays a seasonal or annual fee for coordinating its supplier FPOs; price it after measuring onboarding, agronomist review, data access and support effort. Offer a paid assisted pilot before assuming a recurring subscription. A transaction fee may fund auction/fulfilment work; a planning subscription funds ongoing services. Separate scopes and disclose total charges, avoiding duplicate fees for the same work.

Measure complete variable cost: plot onboarding, soil-test/OCR review, permitted API charges, adviser time, input-record follow-up, inspections, logistics coordination, payment/support and claims exposure. Compare planning-only and managed-procurement unit economics separately. No verified customer willingness to pay, agronomic uplift or export profit has been established.

## 15 Differentiation and market entry

APEDA Farmer Connect already supports FPO/exporter profiles, sell offers and matching enquiries [S10]. eNAM already supports quality information and electronic bidding [S12]. Auctions, visibility and a two-sided interface are not standalone novelty claims. The proposed distinction to validate is continuity from evidence-qualified future supply through capacity reservation, agreed bidding rules and measured accepted delivery/member settlement for smaller FPO networks.

Start with exporters facing overflow, new-region sourcing or replacement needs rather than asking established buyers to abandon reliable suppliers. Recruit a proposed five FPOs, three exporters and one packhouse; these are pilot targets, not commitments. Aggregate thin liquidity into scheduled sessions; allow a disclosed request-for-quote fallback when there are too few eligible bidders. Do not force a public auction for every relationship.

Retention should come from reusable QC, capacity records, logistics coordination, acceptance evidence and settlement—not hiding contacts. Record outside-platform fulfilment where consented and avoid claiming complete market coverage. Buyers may still trade elsewhere; shortages and surpluses remain estimates within observed coverage.

The combined differentiation hypothesis is evidence-aware collective planning tied to real procurement and realised outcomes: soil/water/resource feasibility → farmer-approved planting → weekly marketable forecasts → reserved supply → accepted delivery → member net receipts. The value comes from decision quality and practical execution; crop recommendation, auctions and integration are not individually novel. Compare against phone/spreadsheet planning, existing FPO tools and incumbent managed procurement.

Start with an exporter/FPO pair with either a real forward requirement or an observable shortfall. If forward demand is unavailable, use a real completed order to replay the planning decision or begin with capacity discovery and harvested-lot trading. Do not manufacture a buyer to justify acreage expansion. Geography and crop remain to be selected with actual partners; Salem vegetables are a technical illustration, not a commitment.

## 16 Execution roadmap and ownership

Proposed owners, subject to team confirmation: Kireeti handles data/API, permissions, plot-season lineage and integration; Jyoti handles FPO/exporter interfaces, imports, consent and weekly planning views; Yash handles suitability rules, scenarios, allocation, auction engine and model evaluation; Kai Ze handles real demand access, costs, pricing, partner workflow, impact design and pitch; Keerthibalan handles optional measured field/device data and ingestion; Dev handles inspection/handling protocols, practical water/measurement feasibility and physical operating costs. A qualified agronomist/extension partner must review crop rules; no teammate’s title is a substitute.

Days 1–3, evidence and scope: select one cluster/season and a small crop set; obtain sample soil reports, actual farm calendars, water-resource information, management logs and buyer specifications if available. Freeze source/access register, data dictionary, QC protocol and farmer consent process. Exit: available versus missing inputs and no-orders behaviour are explicit. Apply for authorised SHC/IMD access independently; do not block a labelled prototype on approval.

Week 1, data and crop planning: implement staff-assisted soil imports, plot/calendar/consent, environmental adapter staging, reviewed suitability rules and crop alternatives. Build low/base/high weekly marketable scenarios and a water/resource-constrained collective plan. Exit: a missing soil/water field stays unknown; infeasible windows and unaccepted plots cannot be represented as confirmed supply.

Week 2, market and auctions: connect exporter requirements, supply-board states and the shared capacity ledger. Implement spot ascending auctions and prequalified forward procurement. Gate future awards through the crop plan and disclosed rules. Exit: stock and future capacity cannot be double-allocated, winners are reproducible and stale forecasts cannot masquerade as inspected stock.

Week 3, cultivation to settlement: add seed and input events, observations, milestones, revised projections, QC references, harvest tranches, pickup/arrival, claims and member settlement. Exit: one complete labelled scenario traces an accepted crop proposal to a delivery and payment record, including a failed or reduced harvest.

Week 4, operator validation: recreate a past FPO decision using only information available then, compare to the coordinator baseline, test access/security and low-connectivity behaviour, and collect pricing feedback. Run supervised real transactions only after the operational/trading/payment requirements are checked. A full crop-cycle pilot, not a four-week software sprint, establishes planting-to-harvest performance.

Next crop cycle, prospective evidence: collect linked soil/management/weather/weekly harvest/quality/cost outcomes; run candidate models in shadow mode; measure forecast utility and farmer/buyer economics. Expand only when repeated paid usage and variable contribution support the service. A credible causal yield/income claim needs an appropriate comparison, not only a before/after season.

If limited to 36 hours: import one real authorised or clearly synthetic soil record; show missing-data behaviour, three reviewed crop options, a water/land constraint, farmer acceptance and a weekly supply scenario; post demand; run one real server-side lot auction and a forward-award fixture; show one disruption and arrival/settlement reconciliation. Label hypothetical demand, synthetic harvest and accelerated dates. Cut custom ML training, live finance and optional hardware first. Demo completion does not prove agronomic gains.

## 17 Verification and supply chain impact

Meaningful software checks: two bidders competing at closure; equal-price timestamps; extension cap; late/retried bids; reserve not met; bidder/seller identity conflicts; duplicate order; expired capacity; partial award; two auctions sharing stock; kg/tonne and currency errors; role isolation; worker restart; report access; offline reconnect; cancellation; receiver dispute and payment callback replay. Log expected and actual outcomes.

Pilot measures: eligible bidders per auction, no-bid rate, time to usable supply plan, accepted-on-time kg divided by committed kg, cost per accepted kg including all fees, supplier and buyer repeat transactions, contribution per fulfilled order, claims and resolution time, farmer net receipts and payment delay. Track cancelled and failed orders; do not report only successes.

Initial go/no-go proposals: every live award has traceable consent/specification/quantity and handover terms; zero oversold inventory in controlled tests; no unauthorised organisation-data access; completed reconciliations for every pilot delivery; at least two exporters repeat at a disclosed fee and the measured order contribution covers variable service cost. These are proposed gates, not achieved results. Impact comparisons require more independent orders and a crop-cycle design agreed with partners.

Additional planning checks: wrong plot soil attachment; old report; unit/analyte mismatch; unknown water; future forecast used before issue; missing seed batch; planned-versus-actual fertiliser; overlapping crop calendars; repeated picking; incorrect hectare/acre conversion; gross versus marketable yield; grade loss counted twice; harvest outside order window; shared drought; unsupported exact confidence; no buyer; farmer decline and replan. A water or lab API failure must produce a visible fallback state.

Expected mechanisms: feasibility screening can reduce unsuitable planting proposals; collective schedules can improve timing; input/progress records can expose problems earlier; reservations and QC can improve fulfilment coordination. These are hypotheses. More production is not the same as more sales, and a planning screen does not itself prevent pests, drought, unsafe residues or market-wide gluts.

Measure efficiency as coordinator hours and full cost per accepted kg; reliability as accepted on-time kg per agreed weekly requirement and forecast error; quality as grade-specific acceptance and reasons; farmer benefit as net receipts per hectare/cycle and payment time; environmental performance as measured or explicitly estimated irrigation use and water stress exposure. Record new labour, tests and input costs. Report unsuccessful/cancelled orders and upstream disposal costs alongside successes.

Compare against existing FPO planning with the same initial information and decision date. Repeated matched plots/orders or an appropriately designed trial are needed to separate weather, prices and selection effects from platform impact. Short software tests establish arithmetic and control behaviour, not higher yield or income.

## 18 Decisions risks and sources

Decisions still required: actual crop/cluster, buyer/FPO and agronomy partner; seed/input data access; soil test applicability; irrigation reliability and shared-water limits; locally appropriate harvest curves; fee payer; auction format; whole-lot/split awards; price basis and handover location; deposits/credit; quality/appeal protocol; cancellation/default responsibilities; data/training rights and support languages. Before live operation, confirm state/commodity trading, contract, payment, invoicing and destination export requirements with qualified partners.

The complete product includes crop suggestions and cultivation planning now. Use explicit rules and scenarios while data is limited; introduce calibrated trained models only when labels and evaluation support them. Launch in manageable stages without reducing the idea to a marketplace alone.

Evidence status: prior repository and data findings below come from the earlier crop-planning feasibility audit; they are not a new integration or model validation. Soil/groundwater/weather access notes distinguish published documentation, earlier downloaded samples and current endpoint checks. No partner was contacted, no farmer was instructed, no bid was submitted and no commercial integration was created in preparing this rewrite.

[S1] Government Soil Health Card overview and 12 parameters: https://static.pib.gov.in/WriteReadData/specificdocs/documents/2025/feb/doc2025218505001.pdf

[S2] SHC API guideline location and published support terms: https://soilhealth.dac.gov.in/files/SHC_API_Integration_Guidelines.pdf ; https://support.soilhealth.dac.gov.in/privacy-policy/

[S3] IMD API reference and access portal: https://api.imd.gov.in/public/api_reference.html ; https://api.imd.gov.in/public/index.php

[S4] NASA POWER daily API documentation: https://power.larc.nasa.gov/docs/services/api/temporal/daily/

[S5] CGWB groundwater monitoring and downloads: https://cgwb.gov.in/en/ground-water-level-monitoring

[S6] ISRIC SoilGrids properties licence and paused REST notice: https://isric.org/explore/soilgrids/

[S7] TNAU horticulture reference: https://agritech.tnau.ac.in/horticulture/horti_vegetables_bhendi_index.html

[S8] FAO EcoCrop scope and access: https://www.fao.org/geospatial/data-and-tools/data-portals/ecocrop/en

[S9] Owning DES area production yield report route and inspected secondary CSV: https://data.desagri.gov.in/website/crops-apy-report-web ; https://ckandev.indiadataportal.com/dataset/f2bbc28c-6c7c-462b-9064-ea4c4213d466/resource/f980409d-49a2-42ae-9eb0-182365005c04/download/crop-wise-area-production-yield.csv

[S10] APEDA Farmer Connect existing discovery benchmark: https://farmerconnect.apeda.gov.in/

[S11] FAO AquaCrop input categories: https://www.fao.org/aquacrop/overview/input-requirements/

[S12] eNAM quality and bidding benchmark: https://enam.gov.in/commodity/assaying ; https://enam.gov.in/web/assest/download/sul/Application%20Notice-RFQ-Empanelment_of_Service_Providers_for_integration_with_National_Agriculture_Market_eNAM.pdf

[S13] FAO advance production contract reference: https://www.fao.org/in-action/contract-farming/toolkit/contract-analysis/en/

[S14] APEDA existing export traceability and certification roles: https://apeda.gov.in/hortinet-static

[S15] Meraki frontend: https://meraki-tau-opal.vercel.app/
