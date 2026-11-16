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
