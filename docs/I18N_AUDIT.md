# Internationalisation and localisation audit

## Repository audit

The 25 November 2026 audit covered the application route tree, shared shells, form and status components, farmer communication templates, tests, and translation utilities. Reachable workflows include entry and sign-in; the FPO overview, demand, planting plan, farmers, messages, crop outlook and sensors; Exporter overview, requirements, marketplace and illustrative orders; Shared Auctions; Trade requirements, auctions, contracts, lots, review, logistics, arrivals and settlements; plus farmer, plot, crop-cycle, supply-plan and post-harvest routes. `/farm-intelligence`, `/live-data` and `/later` redirect to `/fpo`.

Before this pass, the UI had a 191-key dictionary for English, Hindi, Tamil and Malayalam plus Chinese and Malay, while most page copy and dynamic feedback remained hardcoded. Runtime Google Translate could send rendered authenticated content to an external service. The document language was fixed to English. Farmer drafts supported only English, Hindi and Marathi, and Urdu was silently treated as Hindi.

The current static scan (`npm run i18n:audit`) reports **1,229 literal candidates in 44 source files**. This is a review queue, not a count of untranslated strings: it also flags proper nouns, unit strings, configuration labels, copied display data and references already resolved by translation keys. It confirms that route-level English remains and needs further work.

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
| Hindi | 1,631 / 1,631 (100%) | 0 |
| Marathi | 1,551 / 1,631 (95.1%) | 80, primarily experimental public-data and model-reference pages |
| Tamil | 1,631 / 1,631 (100%) | 0 |
| Malayalam | 1,631 / 1,631 (100%) | 0 |

Key parity and interpolation placeholder parity are tested. These figures must not be presented as route-completion percentages.

## Route coverage and remaining gaps

| Route group | Implemented coverage | Remaining gaps |
|---|---|---|
| Entry, sign-in, session and workspace navigation | Demo entry, role selection, common authentication/session notices, language selectors and shell navigation use bundled translations. Saved UI language persists; the document `lang` follows it. | Provider-backed authentication failure states were not exercised against a signed-in server account. |
| FPO overview | Headings, progress, summary labels, crop table labels/actions, watchouts, chart copy, crop/soil labels and common dynamic text are translated. | Some rule-generated explanations and legacy detail/creation routes still contain English. |
| Buyer Demand and Planting Plans | Core page chrome, common statuses, scenario controls, planning reasons, alerts, forms and key feedback have dictionary-backed strings. | Long-tail table content, stored change-history descriptions and some generated explanations can still appear in English. |
| Farmers, plots and crop cycles | Shared navigation, forms and common statuses are localized; canonical values and user-entered farmer/plot content are preserved. | Farmer, plot and crop-cycle detail routes and portions of older local planning forms remain English. |
| Farmer Messages | Workspace labels and common feedback are localized. Draft language selection and draft/reply templates support all five languages. Unsupported preferences remain visible and require confirmation for the displayed fallback. | Native-speaker review is pending. Historical message text is intentionally not retroactively translated. Real SMS/WhatsApp delivery is not implemented. |
| Exporter workspace | Overview, requirements, marketplace, forms, details and supply examples use the shared locale system. Crop names and requirement/delivery dates are localized; buyer-specific varieties and synthetic organisation labels remain data values. | Some seeded sample-data titles and secondary lifecycle detail may remain English. |
| Shared Auctions | Core board, publish/bid forms, statuses, service notices and shell use translations without changing auction rules. | Some unit labels and data-provided values are shared/technical. No authenticated transaction was submitted during i18n QA. |
| Trade | Shared shell, read-only demo board and selected auction/form surfaces use the dictionary and language selector. | Requirements, contracts, lots, review, logistics, arrivals, settlements and dynamic service feedback are not fully localized; server-backed transactions were not submitted. |
| Sensors, post-harvest and secondary routes | Shared shell and supported locale helpers are available; selected sensor number/date rendering uses Latin digits. | SMS alert configuration, farmer/plot detail, supply planning, lab review, lots, shipments, claims and settlement screens retain significant English copy. Experimental public-data/model dictionaries have the Marathi gaps listed above. |

The table distinguishes implemented work from route gaps; the application is **not yet fully localized**. It should not be described as five complete translations.

## Automated and browser validation

Automated checks cover supported locale codes and native labels, fallback/migration of unsupported saved UI values, dictionary key and placeholder parity, Latin digit formatting, dynamic message interpolation, farmer communication-language aliases/fallback, message draft semantics and simulated-reply templates. The static literal scan and dictionary coverage report are reproducible with the two `i18n:*` npm scripts.

Chrome was used at 1440, 768 and 390 CSS pixels on the FPO overview for all five UI locales. On a fresh local Vite server, message drafts were switched through English, Hindi, Marathi, Tamil and Malayalam; all retained Latin reply digits and the proposal/consent distinction. A Tamil UI with a Malayalam draft was checked on desktop, and a Tamil draft was checked at 390px. The Tamil Exporter Overview showed translated crop names and localized dates. Switching workspaces preserved Tamil, reloading preserved the UI locale, and the session was returned to English. No message was sent or simulated reply submitted. This is representative visual validation, not exhaustive route-by-route or cross-browser acceptance. Screenshots were captured during the browser review; the existing committed [`docs/screenshots`](screenshots/) images are from the preceding visual audit and are not language-specific evidence.

## Limitations and next work

- UI translations and farmer communication templates have not been reviewed by native speakers or agricultural communication specialists.
- Marathi inherits English on 80 experimental public-data/model-reference dictionary entries; route copy can also remain English in every locale.
- The static audit still reports a large candidate set. Prioritise Trade workflows, farmer/plot/cycle details, supply planning, sensor alerts and post-harvest review before claiming full application coverage.
- Browser validation covered representative screens and message draft switching, not every route, signed-in server state or external provider. No message delivery, auction, bid, award or Trade transaction was performed.
- Keep future forecasting, indicative buyer interest, confirmed demand, synthetic demo records and farmer consent as separate concepts while translating future workflows.
