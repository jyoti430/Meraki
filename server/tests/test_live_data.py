"""Public-source contract tests: all upstream traffic is explicitly mocked."""
import asyncio
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone

import httpx
import pytest
from fastapi.testclient import TestClient

from server.live_data import create_app


NOW = datetime(2026, 11, 16, 12, tzinfo=timezone.utc)


def forecast():
    return dict(latitude=19.9975, longitude=73.7898, timezone='Asia/Kolkata',
        daily_units=dict(time='iso8601', temperature_2m_min='°C', temperature_2m_max='°C',
                         precipitation_sum='mm', et0_fao_evapotranspiration='mm'),
        daily=dict(time=[(NOW.date() + timedelta(days=i)).isoformat() for i in range(7)],
            temperature_2m_min=[15.0] * 7, temperature_2m_max=[28.0] * 7,
            precipitation_sum=[0.0] * 7, et0_fao_evapotranspiration=[3.0] * 7))


def history():
    end = NOW.date() - timedelta(days=7)
    start = end - timedelta(days=29)
    days = [(start + timedelta(days=i)).strftime('%Y%m%d') for i in range(30)]
    return dict(header=dict(start=start.strftime('%Y%m%d'), end=end.strftime('%Y%m%d'),
        fill_value=-999, time_standard='UTC', sources=['MERRA2']),
        geometry=dict(type='Point', coordinates=[73.7898, 19.9975, 0]),
        parameters={key: {'units': unit} for key, unit in [('T2M_MIN', 'C'), ('T2M_MAX', 'C'), ('PRECTOTCORR', 'mm/day')]},
        properties={'parameter': {key: {day: value for day in days}
            for key, value in [('T2M_MIN', 15.0), ('T2M_MAX', 28.0), ('PRECTOTCORR', 1.0)]}})


def market(day='15/11/2026'):
    return f'''<tr><td colspan="7">{day}</td></tr>
      <tr><td>पुणे</td><td>लोकल</td><td>क्विंटल</td><td>100</td><td>500</td><td>1000</td><td>750</td></tr>'''


def handler(request):
    if request.url.host == 'api.open-meteo.com':
        return httpx.Response(200, json=forecast())
    if request.url.host == 'power.larc.nasa.gov':
        return httpx.Response(200, json=history())
    if request.url.host == 'www.msamb.com':
        return httpx.Response(200, text=market(), headers={'content-type': 'text/html; charset=utf-8'})
    raise AssertionError('Unexpected upstream host: ' + str(request.url))


def client_for(callback=handler, clock=lambda: NOW, **kwargs):
    return TestClient(create_app(transport=httpx.MockTransport(callback), clock=clock, **kwargs))


def test_snapshot_is_real_source_typed_and_has_conservative_knowledge_time():
    with client_for() as client:
        value = client.get('/api/live-data/snapshot?location=nashik&crop=tomato').json()
    for key, length in [('forecast', 7), ('history', 30), ('market', 1)]:
        envelope = value[key]
        assert envelope['status'] == 'ok', envelope
        assert envelope['synthetic'] is False
        assert envelope['provider_issued_at'] is None
        assert envelope['available_at'] == envelope['retrieved_at'] == '2026-11-16T12:00:00Z'
        assert len(envelope['data']) == length
        assert envelope['payload_sha256'] and envelope['attribution']
    assert value['history']['observation_end'] == '2026-11-09'
    assert value['forecast']['time_basis'] == 'Asia/Kolkata'
    assert value['history']['time_basis'] == 'UTC'
    assert value['market']['location'] is None
    assert value['market']['data'][0]['price_unit'] == 'क्विंटल'
    assert value['market']['data'][0]['grade'] is None
    assert value['forecast']['data'][0]['precipitation_mm_day'] == 0


@pytest.mark.parametrize('url', ['/forecast?location=https://evil.test', '/forecast?location=other',
                                  '/history?location=../../etc', '/market?crop=okra', '/snapshot?location=pune&url=https://evil.test'])
def test_only_allowlisted_parameters_can_trigger_requests(url):
    def no_network(request):
        raise AssertionError('Invalid input must not trigger any network request')
    with client_for(no_network) as client:
        assert client.get('/api/live-data' + url).status_code == 422


def test_missing_values_remain_null_and_source_units_are_validated():
    def missing(request):
        value = history()
        day = next(iter(value['properties']['parameter']['T2M_MIN']))
        value['properties']['parameter']['T2M_MIN'][day] = -999
        return httpx.Response(200, json=value)
    with client_for(missing) as client:
        value = client.get('/api/live-data/history').json()
    assert value['status'] == 'partial'
    assert value['data'][0]['t2m_min_c'] is None
    assert value['data'][0]['precipitation_mm_day'] == 1
    def bad_units(request):
        value = forecast()
        value['daily_units']['temperature_2m_min'] = 'F'
        return httpx.Response(200, json=value)
    with client_for(bad_units) as client:
        value = client.get('/api/live-data/forecast').json()
    assert value['status'] == 'error' and value['error']['code'] == 'schema_invalid'
    assert value['data'] == []


@pytest.mark.parametrize('invalid', [True, '15', float('nan'), float('inf'), -1000, 1000, 10**1000],
                         ids=['boolean', 'string', 'nan', 'infinity', 'too_cold', 'too_hot', 'oversized_integer'])
def test_nonfinite_untyped_and_out_of_range_weather_is_rejected(invalid):
    def bad(request):
        value = forecast()
        value['daily']['temperature_2m_min'][0] = invalid
        if isinstance(invalid, float) and not (-1e200 < invalid < 1e200):
            import json
            return httpx.Response(200, content=json.dumps(value).encode())
        return httpx.Response(200, json=value)
    with client_for(bad) as client:
        value = client.get('/api/live-data/forecast').json()
    assert value['status'] == 'error' and value['data'] == []


def test_upstream_error_is_explicit_and_does_not_create_synthetic_data():
    def failing(request):
        return httpx.Response(503, text='Sensitive upstream implementation detail')
    with client_for(failing) as client:
        value = client.get('/api/live-data/snapshot').json()
    for key in ('forecast', 'history', 'market'):
        source = value[key]
        assert source['status'] == 'error'
        assert source['error']['code'] == 'upstream_http'
        assert source['data'] == [] and source['available_at'] is None
        assert 'Sensitive' not in source['error']['message']


def test_cache_singleflight_and_expired_refresh_failure_keep_explicit_stale_provenance():
    calls = []
    time = [NOW]
    async def slow(request):
        calls.append(request.url.host)
        await asyncio.sleep(.02)
        return httpx.Response(200, json=forecast()) if len(calls) == 1 else httpx.Response(502)
    with client_for(slow, clock=lambda: time[0]) as client:
        with ThreadPoolExecutor(max_workers=5) as pool:
            results = list(pool.map(lambda _: client.get('/api/live-data/forecast').json(), range(5)))
        assert len(calls) == 1
        assert sum(v['cache']['hit'] for v in results) == 4
        time[0] += timedelta(seconds=901)
        stale = client.get('/api/live-data/forecast').json()
        assert stale['status'] == 'stale' and stale['error']['code'] == 'upstream_http'
        assert stale['available_at'] == '2026-11-16T12:00:00Z'
        assert len(stale['data']) == 7
        client.get('/api/live-data/forecast')
        assert len(calls) == 2, 'Failed refreshes also need a retry cooldown'


def test_response_size_redirects_and_absolute_timeout_are_bounded():
    cases = [
        (lambda _: httpx.Response(200, content=b'x' * 1025), {'max_response_bytes': 1024}, 'response_too_large'),
        (lambda _: httpx.Response(302, headers={'location': 'http://127.0.0.1/private'}), {}, 'upstream_http'),
    ]
    async def hanging(_):
        await asyncio.sleep(.1)
        return httpx.Response(200, json=forecast())
    cases.append((hanging, {'request_timeout_seconds': .01}, 'timeout'))
    for callback, kwargs, expected in cases:
        with client_for(callback, **kwargs) as client:
            value = client.get('/api/live-data/forecast').json()
        assert value['status'] == 'error' and value['error']['code'] == expected


def test_market_latest_date_and_units_are_preserved_and_old_data_flagged():
    def reports(_):
        return httpx.Response(200, text=market('01/11/2026') + market('02/11/2026'))
    with client_for(reports) as client:
        value = client.get('/api/live-data/market?crop=green_chilli').json()
    assert value['status'] == 'stale'
    assert value['observation_start'] == value['observation_end'] == '2026-11-02'
    assert len(value['data']) == 1 and value['data'][0]['commodity'] == 'Green chilli'
    assert value['data'][0]['price_modal_rs_per_unit'] == 750


def test_source_dates_and_arrays_cannot_silently_shift_or_truncate():
    def bad(_):
        value = forecast()
        value['daily']['temperature_2m_min'].pop()
        return httpx.Response(200, json=value)
    with client_for(bad) as client:
        assert client.get('/api/live-data/forecast').json()['status'] == 'error'
    def future_market(_):
        return httpx.Response(200, text=market('17/11/2026'))
    with client_for(future_market) as client:
        assert client.get('/api/live-data/market').json()['status'] == 'error'


def test_changed_market_date_group_cannot_inherit_the_previous_date():
    def changed(_):
        return httpx.Response(200, text=market() + '<tr><td>unrecognised date group</td></tr>' + market().split('</tr>', 1)[1])
    with client_for(changed) as client:
        value = client.get('/api/live-data/market').json()
    assert value['status'] == 'error' and value['data'] == []


def test_excessive_json_nesting_is_isolated_to_one_source():
    def malformed(request):
        if request.url.host == 'api.open-meteo.com':
            return httpx.Response(200, content=b'[' * 20000 + b']' * 20000)
        return handler(request)
    with client_for(malformed) as client:
        response = client.get('/api/live-data/snapshot')
    assert response.status_code == 200
    value = response.json()
    assert value['forecast']['status'] == 'error'
    assert value['forecast']['error']['code'] == 'schema_invalid'
    assert value['history']['status'] == value['market']['status'] == 'ok'
