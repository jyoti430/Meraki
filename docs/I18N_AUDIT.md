# Internationalisation and localisation audit

## Repository audit

The 25 November 2026 audit covered the application route tree, shared shells, form and status components, farmer communication templates, tests, and translation utilities. Reachable workflows include entry and sign-in; the FPO overview, demand, planting plan, farmers, messages, crop outlook and sensors; Exporter overview, requirements, marketplace and illustrative orders; Shared Auctions; Trade requirements, auctions, contracts, lots, review, logistics, arrivals and settlements; plus farmer, plot, crop-cycle, supply-plan and post-harvest routes. `/farm-intelligence`, `/live-data` and `/later` redirect to `/fpo`.

Before this pass, the UI had a 191-key dictionary for English, Hindi, Tamil and Malayalam plus Chinese and Malay, while most page copy and dynamic feedback remained hardcoded. Runtime Google Translate could send rendered authenticated content to an external service. The document language was fixed to English. Farmer drafts supported only English, Hindi and Marathi, and Urdu was silently treated as Hindi.

The current static scan (`npm run i18n:audit`) reports **1,010 literal candidates in 41 source files**. This is a review queue, not a count of untranslated strings: it also flags proper nouns, unit strings, configuration labels, copied display data and references already resolved by translation keys. The CI core gate scans 18 components covering sign-in/demo entry, FPO overview, buyer demand and planting plans, shared navigation, farmer messaging/details, Exporter overview/requirements/marketplace, Shared Auctions, and Trade auctions, requirements, proposals, contracts and shared form/status components. It fails on new unallowlisted literal UI copy in those files; exact exceptions are limited to shared units, product/acronym values and a few explicit data strings. A negative probe confirmed a new literal in FPO Overview fails the gate. The broader scan remains a manual review queue.

## Supported UI languages

| Code | Name shown | Reason |
|---|---|---|
| `en` | English | Default and safe fallback |
| `hi` | हिन्दी | Indian-language support |
| `mr` | मराठी | Demo farms and regional context are in Maharashtra |
| `ta` | தமிழ் | Supported audience |
| `ml` | മലയാളം | Supported audience |

Chinese (`zh`) and Malay (`ms`) were removed from active UI dictionaries and selectors. A previously saved unsupported UI locale falls back to English. This migration does not alter farmer-entered communication preferences or other stored records. Language names appear in their native scripts.

## Architecture and terminology

- `src/i18n/index.tsx` owns the typed locale union, dictionary lookup, interpolation, safe saved-locale migration, `document.documentElement.lang`, locale-aware date/number/INR formatting and dictionary coverage calculation.
- `src/i18n/locales/{en,hi,mr,ta,ml}.ts` contain bundled static dictionaries. No external translation is needed at runtime.
- `src/i18n/LanguageSelector.tsx` is used by entry/sign-in and FPO, Exporter, Auctions and Trade shells. On mobile, FPO users reach it from the More sheet.
- The Google Translate widget and rendered-page auto-translator were removed. User-entered names, notes, villages, phone numbers, identifiers and API values are not sent to translation providers or rewritten.
- UI language and a farmer's communication preference remain separate. `src/planning/messages.ts` provides English, Hindi, Marathi, Tamil and Malayalam farmer instruction and simulated-reply templates, with native-script language names and crop display names. English is the explicit fallback for unsupported preferences such as Urdu; the coordinator sees which language the draft actually uses and must confirm before sending. Existing preferences and message records are not rewritten. Delivery remains simulated.
- Displayed formatted digits use ASCII `0–9` in the shared locale formatters and farmer-message drafts. Numeric values, units, stored crop names and calculations are unchanged.

| Concept | English | Hindi | Marathi | Tamil | Malayalam |
|---|---|---|---|---|---|
| Farmer Producer Organisation | FPO (expand on first use) | FPO | FPO | FPO | FPO |
| Indicative buyer interest | Indicative demand | संकेतात्मक मांग | सूचक मागणी | குறிப்பான தேவை | സൂചനാപരമായ ആവശ്യം |
| Buyer commitment | Buyer-committed | खरीदार से प्रतिबद्ध | खरेदीदाराने निश्चित केलेले | வாங்குநர் உறுதியளித்தது | വാങ്ങുന്നവർ ഉറപ്പുനൽകിയത് |
| Collective crop planning | Collective planting plan | सामूहिक बुवाई योजना | सामूहिक लागवड योजना | கூட்டுத் நடவு திட்டம் | കൂട്ടായ നടീൽ പദ്ധതി |
| Farmer approval | Farmer consent | किसान की सहमति | शेतकऱ्यांची संमती | விவசாயியின் ஒப்புதல் | കർഷക സമ്മതം |
| Simulated communication | Simulated message | संदेश का अनुकरण | संदेशाचे अनुकरण | செய்தி உருவகமாக அனுப்பப்பட்டது | സന്ദേശം അനുകരിച്ചു |

Terminology remains prototype copy and has not received professional or native-speaker review. Factual distinctions are preserved in the strings: indicative interest is not a commitment, projected supply is not stock, a draft is not farmer consent, and a provisional award is not a completed transaction.

## Dictionary coverage

Run `npm run i18n:coverage` to reproduce this table. It compares static dictionary values against English and reports inherited English values; it does **not** measure page usage or hardcoded route copy. `npm run i18n:audit` lists literal candidates for manual review.

| UI locale | Translated dictionary keys | Inherited English keys |
|---|---:|---:|
| Hindi | 2,111 / 2,111 (100%) | 0 |
| Marathi | 2,031 / 2,111 (96.2%) | 80, primarily experimental public-data and model-reference pages |
| Tamil | 2,111 / 2,111 (100%) | 0 |
| Malayalam | 2,111 / 2,111 (100%) | 0 |

Key parity and interpolation placeholder parity are tested. These figures must not be presented as route-completion percentages.

## Route coverage and remaining gaps

| Route group | Implemented coverage | Remaining gaps |
|---|---|---|
| Entry, sign-in, session and workspace navigation | Demo entry, role selection, common authentication/session notices, language selectors and shell navigation use bundled translations. Saved UI language persists; the document `lang` follows it. | Provider-backed authentication failure states were not exercised against a signed-in server account. |
| FPO overview | Headings, progress, summary labels, crop table labels/actions, watchouts, chart copy, crop/soil labels and common dynamic text are translated. | Some rule-generated explanations and legacy detail/creation routes still contain English. |
| Buyer Demand and Planting Plans | Core page chrome, common statuses, scenario controls, planning reasons, alerts, forms and key feedback have dictionary-backed strings. | Long-tail table content, stored change-history descriptions and some generated explanations can still appear in English. |
| Farmers, plots and crop cycles | Farmer Details safety and participation panels, shared navigation, selected forms and common statuses are localized; canonical values and user-entered farmer/plot content are preserved. | Farmer, plot and crop-cycle detail routes and portions of older local planning forms remain English. |
| Farmer Messages | Workspace labels and common feedback are localized. Draft language selection and draft/reply templates support all five languages. The UI locale, manual preview language, farmer preference, actual draft language and simulated reply language are labelled separately. Batch drafts use each farmer's preferred supported language; an unsupported preference requires coordinator confirmation for English. | Native-speaker review is pending. Historical message text is intentionally not retroactively translated. Real SMS/WhatsApp delivery is not implemented. |
| Exporter workspace | Overview, requirements list, marketplace, forms, requirement details and supply examples use the shared locale system. Crop display names, dates, filters, statuses and navigation labels are localized; buyer-specific varieties and synthetic organisation labels remain data values. | Some seeded sample-data titles and secondary lifecycle detail may remain English. |
| Shared Auctions | Core board, publish/bid forms, award statuses, service notices and shell use translations without changing auction rules. | Some unit labels and data-provided values are shared/technical. The local service required sign-in and reported mutations disabled, so listing, bid and award states could not be exercised. |
| Trade requirements, proposals and contracts | Requirement and proposal list/detail/forms, comparison and proposal actions, status feedback, contract confirmation, common fields, validation and Trade auctions use bundled translations in all five locales. Backend payloads, status codes, validation and permissions are unchanged. | This pass exercised synthetic development records only; production identity, legal execution and physical fulfilment are outside this browser validation. |
| Other Trade and secondary routes | Shared shell is localized; Farmer Details safety/consent content and selected Supply Plan preview warnings have translated labels. | Lots, QC/lab review, logistics, arrivals, settlements, most supply-plan creation/detail flows, sensors/SMS alerts, older farmer/plot routes and post-harvest pages retain significant English copy. Experimental public-data/model dictionaries have the Marathi gaps listed above. |

The table distinguishes implemented work from route gaps; the application is **not yet fully localized**. It should not be described as five complete translations.

## Automated and browser validation

Automated checks cover supported locale codes and native labels, fallback/migration of unsupported saved UI values, dictionary key and placeholder parity, Latin digit formatting, dynamic message interpolation, farmer communication-language aliases/fallback, message draft semantics and simulated-reply templates. This pass also ran `npm test`, `npm run i18n:audit`, `npm run i18n:audit:core`, `npm run i18n:coverage`, `npm run build` and `.venv/bin/python -m pytest server/tests tests -q`. The static literal scan and dictionary coverage report are reproducible with the two `i18n:*` npm scripts.

Chromium on macOS was used for representative FPO, Messages, Exporter, Shared Auctions and Trade route checks on the current local build. FPO planning was opened in Marathi; a batch was recorded for four synthetic farmers and a Marathi-preference farmer reply was simulated, with the interface explicitly showing that messages were not delivered. The Marathi Exporter requirements form produced a browser-local draft only. Shared Auctions showed its sign-in gate and the local backend's mutations-disabled state; listing, bid and award workflows remain unverified. In a separate isolated SQLite-backed synthetic Trade development service, the Marathi UI created and published a forward requirement, submitted two FPO proposals, compared them, rejected one, partially awarded the other, and recorded both parties' contract confirmations. These are synthetic workflow records, not real procurement, legal signatures, payment or physical production. No production identity or external service was used.

Committed rendered-browser captures are [FPO overview in English](screenshots/i18n/fpo-en.jpg), [Hindi](screenshots/i18n/fpo-hi.jpg), [Marathi](screenshots/i18n/fpo-mr.jpg), [Tamil](screenshots/i18n/fpo-ta.jpg), and [Malayalam](screenshots/i18n/fpo-ml.jpg); [Tamil mobile FPO](screenshots/i18n/fpo-ta-mobile.jpg); [Tamil interface with Malayalam farmer-message preview](screenshots/i18n/messages-ta-ui-ml-preview.jpg) and [mobile message screen](screenshots/i18n/messages-ta-ml-mobile.jpg); and [Malayalam Exporter Requirements](screenshots/i18n/exporter-requirements-ml.jpg). These document representative visual output, not every route or locale/workspace combination.

Devanagari, Tamil and Malayalam were visually reviewed in macOS Chrome at desktop and mobile CSS widths; displayed numbers retained ASCII digits. The current CSS font stack lists Noto Sans Devanagari, Tamil and Malayalam before system UI fallbacks; the external Google Fonts request loads Inter and Manrope only. An Android emulator/device and Android Chrome were unavailable, so Android glyph fallback, line height and control sizing remain unverified. No script-specific font asset was added without Android reproduction. This is representative visual validation, not exhaustive route-by-route, cross-browser or device acceptance.

## Limitations and next work

- UI translations and farmer communication templates have not been reviewed by native speakers or agricultural communication specialists.
- Marathi inherits English on 80 experimental public-data/model-reference dictionary entries; route copy can also remain English in every locale.
- The broad static audit reports 1,010 literal candidates in 41 source files; its core-route gate passes, but secondary-route copy needs manual review. Prioritise farmer/plot/cycle details, supply planning, sensor alerts and post-harvest review before claiming full application coverage.
- Browser validation covered representative screens and synthetic local FPO/Exporter/Trade workflows, not every route, Android Chrome, production identity or external provider. Shared Auction listing, bid and award states remain unverified because the local service required sign-in and had mutations disabled. No farmer message reached a phone; no production transaction, legal signature or physical fulfilment occurred.
- Keep future forecasting, indicative buyer interest, confirmed demand, synthetic demo records and farmer consent as separate concepts while translating future workflows.
