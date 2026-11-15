# Live crate sensor checkpoint

This optional layer follows the exporter/FPO business and procurement walkthrough. It adds handling visibility from a removable crate logger, consistent with the earlier mango crate concept. It does not actuate fans, certify safety or automatically release shipments. Device-to-lot/shipment association remains an integration task.

## Start on the laptop

Install the existing Python environment and requirements as described in PART3_OPERATIONS.md, then run:

```sh
npm run dev:sensors
```

This starts the sensor API on loopback port 8001 and the LAN website on port 5173. The launcher prints candidate LAN addresses and a private upload key. Choose the Wi-Fi IPv4 address shared with the ESP. Keep the terminal running. Set SENSOR_PUSH_TOKEN before launching if you want a stable key across launcher restarts; otherwise a fresh key is generated each time. Never commit the key.

Open `http://<laptop-wifi-ip>:5173/sensors`. The ESP sends to `http://<laptop-wifi-ip>:5173/api/sensors`. Do not use localhost on the ESP. The current laptop Wi-Fi address at verification was 10.143.153.93; DHCP may change it. The browser GET is automatic every two seconds.

If trade features also need to run, start their API/worker separately using PART3_OPERATIONS.md; avoid starting a second Vite instance on port 5173. The sensor launcher does not start the trade API or worker.

## Contract

POST `/api/sensors`, Content-Type `application/json`, header `X-Sensor-Key: <launcher key>`:

```json
{"device_id":"crate-01","temperature":26.4,"humidity":72,"warnings":["Inspect crate airflow"]}
```

Temperature is Celsius; humidity is percent RH. All three sensor parameters are required. `device_id` defaults to crate-01, but unique IDs are recommended. Warnings are an array of at most 20 strings of at most 200 characters; send `[]` to clear warnings. Finite temperature -50..100 and humidity 0..100 are accepted transport bounds, not crop handling thresholds. Bad values return 422, wrong/missing keys 401, and an unconfigured gateway 503. Server receipt time is authoritative; firmware should send current readings, not queued historical uploads.

GET `/api/sensors` returns server time, a 30-second stale interval, and the latest reading per device. Upload every five seconds. Lost uploads should be retried with bounded backoff. Latest received upload wins. SQLite stores the latest 120 uploads per device and survives restarts; the website shows latest values only. Server data lives in ignored `server/sensors.sqlite3`. Browser demo reset does not delete it.

`examples/esp32-sensor-push.ino` is an ESP32 integration helper, not complete sensor firmware. Wire its arguments to the team's actual sensor driver and warnings. It has not been compiled or flashed on hardware.

## LAN troubleshooting and deployment

Both devices must use the same reachable network, with client isolation disabled by the network owner. If Windows prompts for Node network access, permit only the intended private network. Do not broadly disable the firewall. Check the Wi-Fi address, upload key, port, gateway logs and ESP HTTP status. The API binds to loopback; Vite proxies the endpoint through the same website origin.

This is a trusted-LAN development setup using HTTP and LAN-readable telemetry. Do not port-forward it or use sensitive production data. A hosted static Vercel frontend alone cannot receive/store these readings: production requires a deployed authenticated API, persistent storage and same-origin routing. No hosted deployment is included in this change.

## Verification

25 frontend tests and the TypeScript/Vite build passed. 71 SQLite API/acceptance tests passed, including sensor authentication, numeric/schema bounds, multiple devices, clearing warnings, stale state and persistence after restart. Browser verification observed the empty state and an explicit TEST upload updating temperature, humidity and warning text without reload. Test upload was removed afterward. Physical ESP connectivity, firmware compilation and target-network firewall/client isolation remain unverified.
