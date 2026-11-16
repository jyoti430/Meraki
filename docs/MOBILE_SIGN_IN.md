# Mobile sign-in and demo portals

FPOs and exporters enter through the same sign-in screen. Choose the account type, enter a country-code mobile number and password, then open the matching portal. New registration requires a name and organisation. The number is an unverified account identifier; this flow sends no OTP, SMS or email.

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

1. At `/`, choose FPO or Exporter. Create an account where registration is enabled, sign out, then sign in using the normalized mobile number and the same password. Refresh a protected route to check session restoration.
2. The exporter destination is `/exporter`; its restored sidebar opens Overview, Procurement & demand, FPO marketplace, Shared crop auctions, Orders & fulfilment, and Trade & fulfilment. FPO routes retain their main sidebar, including Sensors.
3. At `/trade`, **Demo examples** is the default. Four hardcoded opportunities support search/type/status filters, details, and local demo offers. Spot bids increase; forward FPO offers decrease. These examples never call trade commands, reserve stock, create contracts or send payments. They reset on navigation/reload.
4. **Connected market** deliberately opens the existing server-backed procurement workflow with its separate explicit identity selection. **Shared crop auctions** uses the mobile account session directly and persists real demo auction records on the shared backend.
5. **Explore demo opportunities** is available from the entry screen while sign-in is unavailable. It opens a labelled preview without an account token. **Back to sign in** exits that preview; refresh returns to entry.

Exporter overview counts and order cards are labelled hardcoded examples. Browser-local requirement drafts remain separate from shared procurement. Mobile layouts retain accessible navigation rather than hiding the portal links.
