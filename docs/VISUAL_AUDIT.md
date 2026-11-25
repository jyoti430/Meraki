# Workspace visual audit

PR #15, second pass · 25 November 2026. The previous UX pass at `827f52c` is the comparison baseline. Screenshots show the same local workflows in Chromium at 1440, 768 and 390 CSS pixels. Auction screenshots use explicitly synthetic accounts and records on a disposable local PostgreSQL database.

| Finding | Change | Before | After |
| --- | --- | --- | --- |
| Shared Auctions used a separate palette, flat list rows and an undifferentiated terms and actions column. | Shared cards, page headings, action styles, status badges, and a distinct selected record. Terms can be expanded next to the bid form. | [Desktop board](screenshots/visual-audit/before-1440-auction-board.webp) | [Desktop board](screenshots/visual-audit/after-1440-auction-board.webp) |
| The publish form presented all fields at the same level. | Three labelled groups and role-specific capacity fields. Tablet and mobile stack board and details, with focus moving to the selected detail and a return to the list. | [FPO form at 390px](screenshots/visual-audit/before-390-auction-create-fpo.webp) | [FPO form at 390px](screenshots/visual-audit/after-390-auction-create-fpo.webp), [Exporter form at 768px](screenshots/visual-audit/after-768-auction-create-exporter.webp) |
| Buyer Demand squeezed a six-column table and a complex impact card side by side. | Two full-width panels and a jump link from requests to impact. Narrow screens scroll the requests table inside its card. | [Planting impact](screenshots/visual-audit/before-1440-demand-impact.webp) | [Planting impact](screenshots/visual-audit/after-1440-demand-impact.webp) |
| The crop, variety and FPO metadata crowded each other in Expected Supply Examples. | Separate title and metadata lines, with quantity and projected status aligned in a second column. | [Expected supply](screenshots/visual-audit/before-1440-expected-supply.webp) | [Expected supply](screenshots/visual-audit/after-1440-expected-supply.webp) |
| The session bar, branding and planning notice pushed the mobile plan title down. | Compact session and branding rows. At 390px the plan title begins 50px higher, with the storage and simulation disclosures visible. | [Mobile plan](screenshots/visual-audit/before-390-mobile-plan.webp) | [Mobile plan](screenshots/visual-audit/after-390-mobile-plan.webp) |

Additional captures: [mobile bid](screenshots/visual-audit/after-390-auction-bid.webp), [mobile provisional award](screenshots/visual-audit/after-390-auction-award.webp), [More with keyboard focus](screenshots/visual-audit/after-390-more.webp), [tablet Trade requirement form](screenshots/visual-audit/after-768-trade-form.webp), [mobile requirements table](screenshots/visual-audit/after-390-exporter-exporter-requirements.webp).

## Shared rules

Use the Meraki Manrope and Inter hierarchy, a 28–34px workspace title, 22px section headings, 14–15px body text, and 12–13px metadata. Feature styles share the existing green, canvas, surface and status colors, a 1320px content cap, 24px desktop and 16px narrow page gaps, and 44px standard form and action controls. Dense tables scroll within the panel. Feature CSS handles layout and preserves the styles of historical routes outside the active navigation.

The Marketplace selector shows a **Requirement reference** and explains that it does not change results or evaluate eligibility. Example reservations are explanatory text. The illustrative Orders route describes how it relates to the separate development Trade workspace.

## Browser coverage

| Workspace | Rendered routes and representative states |
| --- | --- |
| Entry and FPO | Entry, Overview, Buyer Demand and Impact, Planting Plans, Crop Outlook, Farmers, Messages, Sensors. Also opened buyer request and farmer details, plot detail, buyer request/farmer/plot/cycle forms, local supply list/create/preview, intake and release-review entry points. |
| Exporter | Overview and Expected Supply Examples, Requirements list/form/sample detail, Marketplace and requirement reference, illustrative Orders. |
| Shared Auctions | Preview and signed-in FPO/exporter shells, actual record list and selection, open bid form, publish forms, provisional award. The browser exercised a below-reserve error, an accepted bid receipt and both confirmation actions against the disposable database. |
| Trade | Read-only board and procurement, contract, lots/QC, review, shipments, arrivals and settlements entry points. Connected as a synthetic exporter, opened the new requirement form, and followed lots navigation at all three widths. |
| Mobile keyboard | Open More with Enter, check initial focus and Tab containment, close with Escape and check focus returns to More. Verify the explicit Close button, backdrop click, navigation dismissal and body scroll restoration. At narrow widths verify auction selection focuses its details and Back to auction list restores focus. |

The final Chrome sweep measured document width on 120 workspace route and viewport combinations. No document overflow was found. The narrow requirements and demand tables intentionally scroll inside the card. Vitest and the lab review regressions ran with `npm test`, and `npm run build` built the production bundle.

Coverage is representative for record-specific and lifecycle views. The Trade acceptance pass opened forms without publishing a new Trade requirement, and used no hardware or external data provider. Shared auction writes used synthetic stock and accounts in a disposable database. Live accounts, production trading, and cross-browser checks remain outside this audit.
