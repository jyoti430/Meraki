// ESP32 Arduino integration helper. Call pushReading() with real sensor values.
// Wi-Fi must already be connected by your existing firmware.
#include <WiFi.h>
#include <HTTPClient.h>
#include <math.h>

const char* sensorUrl = "http://10.143.153.93:5173/api/sensors";
const char* sensorKey = "COPY_KEY_FROM_LAPTOP_LAUNCHER";

// warningsJson is a JSON array of strings, e.g. [] or ["Check airflow"].
// Use a JSON serializer if generating warning text dynamically.
bool pushReading(float temperature, float humidity, const String& warningsJson) {
  if (WiFi.status() != WL_CONNECTED || !isfinite(temperature) || !isfinite(humidity)) return false;
  HTTPClient http;
  http.setTimeout(5000);
  if (!http.begin(sensorUrl)) return false;
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-Sensor-Key", sensorKey);
  String payload = "{\"device_id\":\"crate-01\",\"temperature\":" + String(temperature, 2)
    + ",\"humidity\":" + String(humidity, 2) + ",\"warnings\":" + warningsJson + "}";
  int code = http.POST(payload);
  http.end();
  return code == 200;
}
// In your existing loop, upload every ~5 seconds using measured values.
// Send [] to clear prior warnings; retry failed uploads with a bounded delay.
