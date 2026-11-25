# Mobile sign-in and demo portals

FPOs and exporters enter through the same sign-in screen. Choose an account type, then enter a country-code mobile number and password. New registration also asks for a name and organisation. The number is an unverified account identifier; this flow sends no OTP, SMS or email. Without signing in, **FPO planning demo** opens the FPO season overview and **Exporter demo** opens the Exporter overview. These labelled previews use sample data and do not create an account session.

A restored browser-tab session is checked with `/api/v1/auth/me` before the application opens. Sign-out clears local account and separate procurement identity state, and requests server token revocation. Auction sessions expire after eight hours. A session for shared crop auctions does not authenticate the independent procurement API.

## Backend integration

Apply `python -m alembic -c server/alembic.ini upgrade head` before starting the API. Revision `f350c7b19d02` adds a nullable, unique, normalized mobile identifier. Existing username credentials and sessions are retained; they are not assigned invented phone numbers. The old username API remains compatible for operator/demo accounts.

`POST /api/v1/auth/register` accepts:

```json
{
  "mobile_number": "+12025550100",
  "password": "Throwaway-demo-password!",
  "display_name": "Synthetic user",
  "organisation_name": "Synthetic organisation",
  "role": "fpo"
}
```

Use `exporter` for the other role. The example number is a fictional test identifier. `POST /api/v1/auth/login` takes only `mobile_number` and `password`. Include either a mobile number or a legacy username, never both. Normalization removes spaces, parentheses and hyphens and requires `+` followed by 7–15 digits with a nonzero country-code prefix. Password whitespace is preserved. Authentication allows 10 attempts per normalized account per 15 minutes, with a separate 100-attempt gateway-IP allowance so a shared proxy does not lock out distinct organisations. Registration has a separate 20-attempt IP bound. Forwarded headers are not trusted to bypass these limits. The response remains `access_token`, `organisation_id`, `role`, `expires_in`, and `token_type`.

`GET /api/v1/health` advertises `mobile_auth_enabled`. The entry form pauses sign-in if the deployed backend does not support it. Password authentication and registration remain operator-controlled through the existing `MERAKI_PASSWORD_AUTH` and `MERAKI_ALLOW_REGISTRATION` flags. Registration is disabled by default outside development. This change does not promote the demo into production identity or verified phone ownership.

## Testing the interface

1. At `/`, choose FPO or Exporter. Create an account where registration is enabled, sign out, then sign in using the normalized mobile number and same password. Refresh a protected route to check session restoration. If registration or the password backend is disabled, use the labelled demo preview.
2. The Exporter portal opens at `/exporter`. Its navigation contains Overview, Requirements, Supply examples, Shared auctions, and Trade workflow. Local requirement drafts and supply examples are separate from server-backed auction records and the Trade development service. The illustrative order lifecycle is linked from Overview; it is not an Exporter navigation item. The FPO sidebar groups Overview, Buyer Demand, Planting Plans and Crop Outlook under Plan; Farmers and Messages under Coordinate; Crop Auctions and Trade & fulfilment under Marketplace; and Live sensor data under Experimental. On mobile the five core FPO destinations stay in the bottom tabs, with secondary destinations, language, reset and workspace switching under **More**.
3. Shared auctions use the mobile account session. Exporters can bid on spot harvested lots or publish forward procurement requests. Eligible FPOs can bid on forward requests. FPOs can publish synthetic harvested-lot sales for exporter bids. Auction records are shared through the auction service. This service does not create a Trade procurement contract, shipment or settlement.
4. The Trade workflow at `/trade` has a separate explicit synthetic actor identity. The authenticated auction board is the default Trade board. Four hardcoded listings remain under **Sample listings (read-only)** with search, type and status filters. They cannot accept offers. Server-backed bids go through Shared auctions and are visible to the other auction account.
5. FPO and Exporter demo previews are available from the entry screen. The selected preview is labelled, has no account token and survives refresh within the browser tab. **Sign in** exits the preview.

Exporter requirement counts and supply projections are examples. The linked order lifecycle uses hardcoded sample data. Supply examples are synthetic forecasts, not reservable stock. Local requirement drafts are not sent to buyers or shared with FPOs. Shared auctions and Trade keep separate server records and authority.
