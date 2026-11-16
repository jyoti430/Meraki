# Live crate sensor checkpoint

This optional layer follows the exporter/FPO business and procurement walkthrough. It adds handling visibility from a removable crate logger, consistent with the earlier mango crate concept. It does not actuate fans, certify safety or automatically release shipments. Device-to-lot/shipment association remains an integration task.

## Start on the laptop

Install the existing Python environment and requirements as described in PART3_OPERATIONS.md, then run:

```sh
npm run dev:sensors
```

This starts the sensor API on loopback port 8001 and a loopback-only website on port 5173. Open `http://127.0.0.1:5173/sensors` on the laptop. BLE scanning is enabled by `SENSOR_BLE_ENABLED=1`; it does not use the retired serial/COM flag. The gateway scans for `AgriTrust-Nexus` and subscribes to Nordic UART TX characteristic `6E400003-B5A3-F393-E0A9-E50E24DCCA9E`. Turn on the laptop Bluetooth adapter and use Connect / Scan or Disconnect in the local page. `SENSOR_BLE_NAME` changes the target advertisement name; `SENSOR_BLE_ENABLED=0` starts with scanning disabled.

The launcher checks the selected Python and its imports before starting. Set `SENSOR_PYTHON` to an existing configured executable when `.venv` is elsewhere; the older `TRADE_PYTHON` override remains supported. Keep the terminal running. A private HTTP upload key is printed only in that local terminal. Set `SENSOR_PUSH_TOKEN` beforehand for a stable key, otherwise each launch generates a fresh key. Never commit or publish it. Browser readings poll every two seconds; Bluetooth status is separate from a fresh valid reading.

For a separate ESP that uses HTTP push instead of BLE, explicitly enable LAN access before starting:

```powershell
$env:SENSOR_LAN = '1'
npm run dev:sensors
```

On a POSIX shell use `SENSOR_LAN=1 npm run dev:sensors`. Only this opt-in binds Vite to `0.0.0.0` and prints candidate LAN addresses. Choose the laptop Wi-Fi IPv4 address reachable by the ESP. Open `http://<laptop-wifi-ip>:5173/sensors`; the ESP sends to `http://<laptop-wifi-ip>:5173/api/sensors` with the printed key. The API itself remains bound to loopback. Do not use localhost on a separate ESP. Disable LAN mode by removing `SENSOR_LAN` or setting it to `0` before relaunching.

If trade features also need to run, start their API/worker separately using PART3_OPERATIONS.md; avoid starting a second Vite instance on port 5173. The sensor launcher does not start the trade API or worker.

## Contract

BLE notifications use the same reading JSON prefixed with `@SENSOR`. This is a transport format, not device-to-lot verification or crop-specific safety validation. GET `/api/sensors/bluetooth` reports gateway scan/connection status; POST with `{"enabled": true}` or `false` controls the local receiver. These are local-gateway controls; Render cannot control the laptop adapter.

POST `/api/sensors`, Content-Type `application/json`, header `X-Sensor-Key: <launcher key>`:

```json
{"device_id":"crate-01","temperature":26.4,"humidity":72,"warnings":["Inspect crate airflow"]}
```

Temperature is Celsius; humidity is percent RH. All three sensor parameters are required. `device_id` defaults to crate-01, but unique IDs are recommended. Warnings are an array of at most 20 strings of at most 200 characters; send `[]` to clear warnings. Finite temperature -50..100 and humidity 0..100 are accepted transport bounds, not crop handling thresholds. Bad values return 422, wrong/missing keys 401, and an unconfigured gateway 503. Server receipt time is authoritative; firmware should send current readings, not queued historical uploads.

GET `/api/sensors` returns server time, a 30-second stale interval, and the latest reading per device. Upload every five seconds. Lost uploads should be retried with bounded backoff. Latest received upload wins. SQLite stores the latest 120 uploads per device and survives restarts; the website shows latest values only. Server data lives in ignored `server/sensors.sqlite3`. Browser demo reset does not delete it.

`examples/esp32-sensor-push.ino` is an ESP32 integration helper, not complete sensor firmware. Wire its arguments to the team's actual sensor driver and warnings. It has not been compiled or flashed on hardware.

## LAN troubleshooting and deployment

Both devices must use the same reachable network, with client isolation disabled by the network owner. If Windows prompts for Node network access, permit only the intended private network. Do not broadly disable the firewall. Check the Wi-Fi address, upload key, port, gateway logs and ESP HTTP status. The API binds to loopback; Vite proxies the endpoint through the same website origin.

The default BLE setup stays on laptop loopback. Opt-in LAN mode uses HTTP and exposes telemetry to that trusted network; do not port-forward it or use sensitive production data. The hosted Vercel/Render application reports local Bluetooth/USB capabilities as unavailable. Cloud sensor ingestion remains disabled pending an authenticated durable gateway adapter; installing Bleak on Render does not connect the laptop hardware.

Bleak 1.1.1 supports Python 3.12 and ships a universal wheel. On Linux it uses `dbus-fast` to communicate with BlueZ over D-Bus; a usable Bluetooth adapter, BlueZ and D-Bus service are runtime requirements on the gateway machine. Render hosting does not provide access to the laptop adapter. See the [pinned package metadata](https://pypi.org/project/bleak/1.1.1/) and [Bleak Linux backend documentation](https://bleak.readthedocs.io/en/stable/backends/linux.html).

## Verification

Historical pre-BLE verification: 25 frontend tests and the TypeScript/Vite build passed; 71 SQLite API/acceptance tests passed, including sensor authentication, numeric/schema bounds, multiple devices, clearing warnings, stale state and persistence after restart. Browser verification observed an explicit TEST upload updating temperature, humidity and warning text without reload; that test upload was removed. These checks do not establish BLE hardware acceptance. Current integration checks belong to WORK_LOG.md. Physical BLE/ESP connectivity, firmware compilation, notification framing/MTU behavior and target-network permissions remain unverified until exercised on the actual device.

## Automatic FPO SMS alerts (local gateway)

The gateway now sends SMS when an HTTP **or Bluetooth (BLE)** reading contains the device warnings already shown in the app (`warnings` is non-empty). Custom server-side temperature/humidity limits can also be enabled, but are not required. An FPO alert profile stores a phone number in international E.164 format. Each crate is assigned to exactly one profile; multiple crates and FPOs are supported. These are local gateway notification profiles, separate from shared auction/login accounts. An authenticated account-to-gateway identity bridge is not implemented. Phone numbers are never returned by the public telemetry endpoint.

### Credentials and start

Only **Twilio Programmable Messaging** is required as an external API. Use an SMS-capable sender or Messaging Service. Configure these in the ignored `.env` (never in `VITE_` variables or committed files):

```dotenv
TWILIO_ACCOUNT_SID=AC_REPLACE_WITH_YOUR_ACCOUNT_SID
TWILIO_AUTH_TOKEN=REPLACE_LOCALLY
TWILIO_FROM_NUMBER=REPLACE_WITH_SMS_CAPABLE_SENDER
# Alternative to TWILIO_FROM_NUMBER:
# TWILIO_MESSAGING_SERVICE_SID=MG_REPLACE_WITH_SERVICE_SID
```

The launcher loads `.env` on Node 20.12+; exported environment variables take precedence. Restart `npm run dev:sensors` after changing credentials. The launcher prints separate upload and admin keys; use the **admin key** in `/sensors` → Automatic SMS alerts → Open alert settings. Give only the upload key to firmware. Set `SENSOR_PUSH_TOKEN` / `SENSOR_ADMIN_TOKEN` in `.env` for stable keys. Direct Uvicorn invocation requires exporting/loading the environment separately.

1. Save the FPO ID, name and phone (including country code). SMS can be paused per FPO.
2. Save the exact sensor `device_id` and responsible FPO. Device warnings are enabled by default; no temperature/humidity limits need to be entered. Optionally enable custom handling limits using reviewed crop values. Values exactly on a custom limit are within range. Location is optional text, not automatic GPS.
3. Keep the gateway running with internet access. New incoming readings create alerts even when no browser is open. Refresh status to view recent activity.

Example SMS from an existing warning: `Meraki alert: Crate crate-01. Temperature outside selected crop range. Location: Collection centre.` Location is omitted if blank. Warning text is bounded; messages may use multiple billed SMS segments. This sends a caution, not a safety certification or shipment release.

Twilio accepts `To`, `Body`, and `From` or `MessagingServiceSid` through [its Message API](https://www.twilio.com/docs/messaging/api/message-resource). [Trial accounts](https://www.twilio.com/docs/usage/tutorials/how-to-use-your-free-trial-account) generally require a verified recipient and suitable destination permissions; configure the recipient country in the provider account. India domestic sending has additional sender/template registration requirements; consult [Twilio's destination guidelines](https://www.twilio.com/en-us/guidelines/in/sms) for the chosen route. No geocoding, maps, email, WhatsApp, Redis or additional paid API is required for this slice.

### Reliability and status

The reading and SMS outbox entry commit atomically to the same ignored SQLite database. A worker checks every two seconds. The default minimum gap is 30 minutes **per crate**, configurable from 1 minute to 24 hours. A continuing problem generates a reminder on the next fresh reading after that gap; recovery/re-entry respects the same gap to limit flapping. Duplicate/concurrent uploads cannot create parallel pending messages for the same crate. If different sensors fail during a gap, the next eligible alert reflects the current reading.

- `queued`: waiting for the provider/worker; unconfigured credentials never pretend success.
- `sending`: a worker has claimed the alert.
- `accepted`: Twilio returned a valid Message SID. **This does not mean handset delivery.** Check delivery status/errors in the Twilio console; delivery callbacks are not implemented.
- `retry`: explicit HTTP 429 or 5xx rejection; backoff 60/120/240/480 seconds, maximum five attempts.
- `failed`: terminal rejection or exhausted attempts; the error is visible. A later fresh reading after the cooldown may create a new reminder.
- `uncertain`: timeout/invalid receipt or a restart during sending. That entry is never automatically retried, since the provider may already have accepted it. Reconcile its outcome in Twilio. Later scheduled reminders remain possible after the cooldown.
- `cancelled`: recovery, profile change/pause or crate reassignment removed a pending alert. In-flight or accepted messages cannot be recalled.
- `expired`: at dispatch, no reading for the crate has arrived in 30 seconds. Wait for fresh data; this permits a new current alert immediately. A stalled device is not itself an out-of-range reading.

Queued/retry entries survive a restart. Edits apply to **new readings**, not a replay of historical readings. The latest 50 outbox entries are visible to the admin; underlying history is retained. The gateway is a single-process local service; do not run multiple Uvicorn processes against the same database. It stops sending when the laptop sleeps or the process stops. Hosted `/api/sensors` remains unavailable; no cloud deployment or GitHub publication is part of this change.

### Protected settings API

All these routes require `X-Sensor-Admin-Key`. The firmware upload key cannot read or change phone numbers.

- `GET /api/sensors/alerts`: provider configuration status, profiles, crate rules and recent alert states.
- `POST /api/sensors/alerts/profiles`: `{ "id": "fpo-01", "name": "Example FPO", "phone": "+15005550006", "sms_enabled": true }`; upserts by ID.
- `POST /api/sensors/alerts/crates`: minimum warning-trigger configuration is `{ "device_id": "crate-01", "profile_id": "fpo-01" }`. Optional custom limits: `{ "device_id": "crate-01", "profile_id": "fpo-01", "temperature_min": 10, "temperature_max": 30, "humidity_min": 40, "humidity_max": 90, "location": "", "alert_on_warnings": true, "cooldown_seconds": 1800 }`; upserts by device ID. Limits here are examples, not crop recommendations.

Unauthenticated access returns 401; no configured admin key returns 503. Unknown FPO, malformed phone, unpaired/reversed/nonfinite custom limits or invalid cooldown returns 422. Admin keys stay in memory in the browser and clear on reload/lock. This is operator-managed local configuration, not a multi-tenant FPO portal. The launcher defaults to loopback; opt into `SENSOR_LAN=1` only for the existing trusted-LAN scope; production authentication/HTTPS, account linkage and durable hosted ingestion remain separate work.
