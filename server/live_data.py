"""Read-only public reference data; never authoritative farm or trade records.

Run: python -m uvicorn server.live_data:app --host 127.0.0.1 --port 8002
Only fixed provider URLs and allowlisted public reference points are accepted.
"""
from __future__ import annotations

import asyncio
import copy
import hashlib
import json
import math
from contextlib import asynccontextmanager
from datetime import date, datetime, timedelta, timezone
from html.parser import HTMLParser
from typing import Literal
from zoneinfo import ZoneInfo

import httpx
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse


LOCATIONS = {
    'nashik': dict(id='nashik', name='Nashik reference centre', latitude=19.9975, longitude=73.7898, scope='public_reference'),
    'pune': dict(id='pune', name='Pune reference centre', latitude=18.5204, longitude=73.8567, scope='public_reference'),
    'satara': dict(id='satara', name='Satara reference centre', latitude=17.6805, longitude=74.0183, scope='public_reference'),
}
CROPS = {'tomato': dict(id='tomato', name='Tomato', code='08071'),
         'green_chilli': dict(id='green_chilli', name='Green chilli', code='10013')}
WEATHER_FIELDS = {'temperature_2m_min': ('t2m_min_c', '°C', -90, 65),
                  'temperature_2m_max': ('t2m_max_c', '°C', -90, 65),
                  'precipitation_sum': ('precipitation_mm_day', 'mm', 0, 2000),
                  'et0_fao_evapotranspiration': ('et0_mm_day', 'mm', 0, 100)}
POWER_FIELDS = {'T2M_MIN': ('t2m_min_c', 'C', -90, 65),
                'T2M_MAX': ('t2m_max_c', 'C', -90, 65),
                'PRECTOTCORR': ('precipitation_mm_day', 'mm/day', 0, 2000)}
SOURCES = {
    'forecast': dict(source_id='open-meteo-forecast', source_name='Open-Meteo',
        source_url='https://api.open-meteo.com/v1/forecast', documentation_url='https://open-meteo.com/en/docs',
        attribution='Weather data by Open-Meteo.com; fields selected and normalised by Meraki.',
        licence='CC BY 4.0 data; free hosted API is restricted to non-commercial use.', data_kind='forecast',
        ttl=900, stale_limit=21600,
        warnings=['Public reference-point model forecast; not a farm sensor or guaranteed outcome.',
                  'Provider issue time is not supplied by this endpoint; retrieval is conservative knowledge time.',
                  'Open-Meteo free hosted API: non-commercial development only; commercial use requires suitable access terms.']),
    'history': dict(source_id='nasa-power-daily', source_name='NASA POWER',
        source_url='https://power.larc.nasa.gov/api/temporal/daily/point',
        documentation_url='https://power.larc.nasa.gov/docs/services/api/temporal/daily/',
        attribution='NASA Langley Research Center POWER Project; selected daily fields normalised by Meraki.',
        licence='NASA POWER publicly accessible data; acknowledge the POWER Project.', data_kind='gridded_historical_estimate',
        ttl=21600, stale_limit=604800,
        warnings=['Historical gridded model/assimilation estimates; not an individual farm observation or a forecast.',
                  'Meteorology is approximately 0.5 x 0.625 degrees; a city reference point does not establish farm conditions.',
                  'Thirty requested days end seven days before today as a conservative latency buffer; later revisions remain possible.',
                  'Historical observations retrieved today were not necessarily available at their observation date.']),
    'market': dict(source_id='msamb-latest-report', source_name='MSAMB public APMC report',
        source_url='https://www.msamb.com/ApmcDetail/DataGridBind',
        documentation_url='https://www.msamb.com/ApmcDetail/APMCPriceInformation',
        attribution='Maharashtra State Agricultural Marketing Board public dated arrival and price report.',
        licence='Public reference display; broader reuse, redistribution and training permissions have not been established.',
        data_kind='market_observation', ttl=1800, stale_limit=259200,
        warnings=['Statewide market observations are not buyer orders, farmgate offers or a forecast.',
                  'Source market/variety/unit labels are retained; no kg, grade or city matching is inferred.',
                  'Public visibility does not establish unrestricted commercial reuse or model-training permission.']),
}


class SourceError(Exception):
    def __init__(self, code, message):
        self.code = code
        self.message = message
        super().__init__(message)


def check(condition, message):
    if not condition:
        raise SourceError('schema_invalid', message)


def iso(value):
    return value.astimezone(timezone.utc).isoformat().replace('+00:00', 'Z')


def numeric(value, minimum, maximum, *, fill_value=None):
    if value is None or (fill_value is not None and type(value) in (int, float) and value == fill_value):
        return None
    check(type(value) in (int, float), 'Provider returned a nonnumeric measurement.')
    check(minimum <= value <= maximum, 'Provider measurement is outside the accepted physical/schema bounds.')
    check(math.isfinite(value), 'Provider returned a nonfinite measurement.')
    return float(value)


def dates_between(start, end):
    return [(start + timedelta(days=i)).isoformat() for i in range((end - start).days + 1)]


def valid_temperatures(rows):
    for row in rows:
        if row['t2m_min_c'] is not None and row['t2m_max_c'] is not None:
            check(row['t2m_min_c'] <= row['t2m_max_c'], 'Provider temperature minimum exceeds maximum.')


class ReportParser(HTMLParser):
    """Parse fixed public MSAMB seven-cell rows, without evaluating page code."""
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.rows = []
        self.cells = []
        self.parts = []
        self.in_cell = False

    def handle_starttag(self, tag, attrs):
        if tag == 'tr':
            self.cells = []
        elif tag in ('td', 'th'):
            self.parts = []
            self.in_cell = True

    def handle_data(self, data):
        if self.in_cell:
            self.parts.append(data)

    def handle_endtag(self, tag):
        if tag in ('td', 'th') and self.in_cell:
            self.cells.append(' '.join(''.join(self.parts).split()))
            self.in_cell = False
        elif tag == 'tr' and self.cells:
            check(len(self.rows) < 5000, 'MSAMB returned too many table rows.')
            self.rows.append(self.cells)


def market_number(value):
    if value.strip() in ('', '-', '--', '---', '—', 'NA', 'N/A'):
        return None
    try:
        number = float(value.replace(',', ''))
    except (ValueError, AttributeError):
        raise SourceError('schema_invalid', 'MSAMB returned an unrecognised numeric cell.')
    return numeric(number, 0, 1e10)


class PublicDataGateway:
    def __init__(self, client, clock, request_timeout_seconds=15, max_response_bytes=600000):
        self.client = client
        self.clock = clock
        self.timeout = request_timeout_seconds
        self.max_bytes = max_response_bytes
        self.cache = {}
        self.locks = {}

    def now(self):
        now = self.clock()
        if not isinstance(now, datetime) or now.tzinfo is None:
            raise RuntimeError('The gateway server clock must include a timezone.')
        return now.astimezone(timezone.utc)

    def period(self, kind):
        if kind == 'forecast':
            start = self.now().astimezone(ZoneInfo('Asia/Kolkata')).date()
            return start, start + timedelta(days=6)
        if kind == 'history':
            end = self.now().date() - timedelta(days=7)
            return end - timedelta(days=29), end
        return None, None

    def envelope(self, kind, location):
        source = SOURCES[kind]
        return {**{key: source[key] for key in ('source_id', 'source_name', 'source_url', 'documentation_url',
                 'attribution', 'licence', 'data_kind')},
            'status': 'error', 'synthetic': False, 'location': copy.deepcopy(location),
            'time_basis': 'UTC' if kind == 'history' else 'Asia/Kolkata',
            'retrieved_at': None, 'available_at': None, 'provider_issued_at': None,
            'attempted_at': iso(self.now()), 'observation_start': None, 'observation_end': None,
            'cache': dict(hit=False, ttl_seconds=source['ttl'], expires_at=None),
            'warnings': copy.deepcopy(source['warnings']), 'error': None, 'units': {}, 'data': [], 'payload_sha256': None}

    async def download(self, url, params, *, headers=None):
        try:
            async with asyncio.timeout(self.timeout):
                async with self.client.stream('GET', url, params=params, headers=headers) as response:
                    if response.status_code != 200:
                        raise SourceError('upstream_http', f'Provider returned HTTP {response.status_code}; no replacement observations were invented.')
                    content_length = response.headers.get('content-length')
                    if content_length is not None:
                        try:
                            check(int(content_length) >= 0, 'Provider content length is invalid.')
                            if int(content_length) > self.max_bytes:
                                raise SourceError('response_too_large', 'Provider response exceeded the bounded response size.')
                        except ValueError:
                            raise SourceError('schema_invalid', 'Provider content length is invalid.')
                    chunks = bytearray()
                    async for chunk in response.aiter_bytes():
                        if len(chunks) + len(chunk) > self.max_bytes:
                            raise SourceError('response_too_large', 'Provider response exceeded the bounded response size.')
                        chunks.extend(chunk)
                    return bytes(chunks), str(response.url)
        except (TimeoutError, httpx.TimeoutException):
            raise SourceError('timeout', 'Provider request exceeded the bounded timeout.')
        except httpx.RequestError:
            raise SourceError('network_error', 'Provider could not be reached; no replacement observations were invented.')

    def parse_forecast(self, payload, location, start, end):
        check(isinstance(payload, dict), 'Forecast response must be an object.')
        latitude = numeric(payload.get('latitude'), -90, 90)
        longitude = numeric(payload.get('longitude'), -180, 180)
        check(latitude is not None and longitude is not None and abs(latitude - location['latitude']) <= .5 and abs(longitude - location['longitude']) <= .5,
              'Forecast grid coordinates do not match the requested reference region.')
        check(payload.get('timezone') == 'Asia/Kolkata', 'Forecast timezone does not match the requested daily basis.')
        daily, units = payload.get('daily'), payload.get('daily_units')
        check(isinstance(daily, dict) and isinstance(units, dict), 'Forecast daily values/units are missing.')
        expected = dates_between(start, end)
        check(daily.get('time') == expected, 'Forecast dates are incomplete, duplicated or outside the requested seven days.')
        check(units.get('time') == 'iso8601', 'Forecast time unit changed.')
        rows = [dict(date=day) for day in expected]
        for field, (output, unit, minimum, maximum) in WEATHER_FIELDS.items():
            check(units.get(field) == unit, 'Forecast measurement units changed.')
            values = daily.get(field)
            check(isinstance(values, list) and len(values) == 7, 'Forecast arrays do not align with dates.')
            for row, value in zip(rows, values):
                row[output] = numeric(value, minimum, maximum)
        valid_temperatures(rows)
        return rows, dict(date='Asia/Kolkata calendar date', t2m_min_c='degC', t2m_max_c='degC', precipitation_mm_day='mm/day', et0_mm_day='mm/day')

    def parse_history(self, payload, location, start, end):
        check(isinstance(payload, dict), 'POWER response must be an object.')
        header = payload.get('header')
        check(isinstance(header, dict) and header.get('start') == start.strftime('%Y%m%d') and header.get('end') == end.strftime('%Y%m%d'),
              'POWER response period does not match the requested historical period.')
        check(header.get('time_standard') == 'UTC', 'POWER response is not on the requested UTC daily basis.')
        fill = numeric(header.get('fill_value'), -100000, -100)
        check(fill is not None, 'POWER missing-value sentinel is absent.')
        geometry = payload.get('geometry')
        check(isinstance(geometry, dict) and isinstance(geometry.get('coordinates'), list) and len(geometry['coordinates']) >= 2,
              'POWER point geometry is missing.')
        longitude = numeric(geometry['coordinates'][0], -180, 180)
        latitude = numeric(geometry['coordinates'][1], -90, 90)
        check(longitude is not None and latitude is not None and abs(longitude - location['longitude']) <= 1 and abs(latitude - location['latitude']) <= 1,
              'POWER grid does not cover the requested reference region.')
        descriptions = payload.get('parameters')
        properties = payload.get('properties')
        check(isinstance(descriptions, dict) and isinstance(properties, dict) and isinstance(properties.get('parameter'), dict), 'POWER parameter schema is missing.')
        values = properties['parameter']
        check(set(values) == set(POWER_FIELDS), 'POWER did not return exactly the requested parameters.')
        expected = dates_between(start, end)
        keys = [day.replace('-', '') for day in expected]
        rows = [dict(date=day) for day in expected]
        for field, (output, unit, minimum, maximum) in POWER_FIELDS.items():
            check(isinstance(descriptions.get(field), dict) and descriptions[field].get('units') == unit, 'POWER measurement units changed.')
            check(isinstance(values[field], dict) and set(values[field]) == set(keys), 'POWER dates are incomplete or outside the requested period.')
            for row, day in zip(rows, keys):
                row[output] = numeric(values[field][day], minimum, maximum, fill_value=fill)
        valid_temperatures(rows)
        return rows, dict(date='UTC calendar date', t2m_min_c='degC', t2m_max_c='degC', precipitation_mm_day='mm/day')

    def parse_market(self, raw, crop):
        parser = ReportParser()
        parser.feed(raw.decode('utf-8-sig', errors='strict'))
        day = None
        records = []
        today = self.now().astimezone(ZoneInfo('Asia/Kolkata')).date()
        for cells in parser.rows:
            if len(cells) == 1:
                day = None
                try:
                    day = datetime.strptime(cells[0], '%d/%m/%Y').date()
                except ValueError:
                    continue
                check(day <= today, 'MSAMB reported an observation in the future.')
            elif len(cells) == 7:
                # A changed header cannot quietly become an invented record.
                check(day is not None, 'MSAMB row lacks an explicit observation date.')
                check(0 < len(cells[0]) <= 300 and 0 < len(cells[2]) <= 100, 'MSAMB market/unit label is missing or oversized.')
                low, high, modal = [market_number(value) for value in cells[4:7]]
                if low is not None and high is not None:
                    check(low <= high, 'MSAMB minimum price exceeds maximum.')
                if modal is not None and low is not None and high is not None:
                    check(low <= modal <= high, 'MSAMB modal price is outside the stated range.')
                records.append(dict(observation_date=day.isoformat(), market=cells[0], commodity=CROPS[crop]['name'],
                    variety=None if not cells[1].strip('-— ') else cells[1], grade=None,
                    price_min_rs_per_unit=low, price_max_rs_per_unit=high, price_modal_rs_per_unit=modal,
                    price_unit=cells[2], arrivals_value=market_number(cells[3]), arrivals_unit=cells[2]))
            else:
                raise SourceError('schema_invalid', 'MSAMB table row shape changed.')
        check(records, 'MSAMB returned no parseable dated market observations.')
        latest = max(row['observation_date'] for row in records)
        rows = [row for row in records if row['observation_date'] == latest]
        check(len(rows) <= 500, 'MSAMB latest report exceeds the bounded observation count.')
        return rows, dict(prices='INR per source unit (row.price_unit)', arrivals='source unit (row.arrivals_unit)')

    async def fetch(self, kind, reference, start, end):
        location = LOCATIONS[reference] if kind != 'market' else None
        envelope = self.envelope(kind, location)
        if kind == 'forecast':
            params = dict(latitude=location['latitude'], longitude=location['longitude'],
                daily=','.join(WEATHER_FIELDS), timezone='Asia/Kolkata', forecast_days=7, temperature_unit='celsius', precipitation_unit='mm')
            raw, source_url = await self.download(SOURCES[kind]['source_url'], params)
            rows, units = self.parse_forecast(json.loads(raw), location, start, end)
        elif kind == 'history':
            params = dict(latitude=location['latitude'], longitude=location['longitude'],
                parameters=','.join(POWER_FIELDS), community='AG', start=start.strftime('%Y%m%d'), end=end.strftime('%Y%m%d'),
                format='JSON', **{'time-standard': 'UTC'})
            raw, source_url = await self.download(SOURCES[kind]['source_url'], params)
            rows, units = self.parse_history(json.loads(raw), location, start, end)
        else:
            params = dict(commodityCode=CROPS[reference]['code'], apmcCode='null')
            raw, source_url = await self.download(SOURCES[kind]['source_url'], params, headers={
                'X-Requested-With': 'XMLHttpRequest', 'Referer': SOURCES[kind]['documentation_url']})
            rows, units = self.parse_market(raw, reference)
        retrieved_at = iso(self.now())
        missing = sum(value is None for row in rows for key, value in row.items()
                      if key not in ('grade', 'variety') and (key.endswith('_c') or key.endswith('_day') or key in ('price_min_rs_per_unit', 'price_max_rs_per_unit', 'price_modal_rs_per_unit', 'arrivals_value')))
        if missing:
            envelope['warnings'].append(f'{missing} measurements are missing; null values were preserved without imputation.')
        observation_dates = [row['observation_date'] if kind == 'market' else row['date'] for row in rows]
        envelope.update(status='partial' if missing else 'ok', source_url=source_url, retrieved_at=retrieved_at,
            available_at=retrieved_at, observation_start=min(observation_dates), observation_end=max(observation_dates),
            data=rows, units=units, payload_sha256=hashlib.sha256(raw).hexdigest())
        if kind == 'market':
            age = (self.now().astimezone(ZoneInfo('Asia/Kolkata')).date() - date.fromisoformat(envelope['observation_end'])).days
            if age > 3:
                envelope['status'] = 'stale'
                envelope['warnings'].append(f'Latest market observation is {age} calendar days old; retrieval does not make its price current.')
        return envelope

    async def get(self, kind, reference):
        key = (kind, reference)
        start, end = self.period(kind)
        signature = (start, end)
        lock = self.locks.setdefault(key, asyncio.Lock())
        async with lock:
            previous = self.cache.get(key)
            if previous and previous['period'] == signature and self.now() < previous['expires_at']:
                value = copy.deepcopy(previous['value'])
                value['cache']['hit'] = True
                return value
            source = SOURCES[kind]
            ttl = source['ttl']
            try:
                value = await self.fetch(kind, reference, start, end)
            except (SourceError, ValueError, TypeError, KeyError, UnicodeError, RecursionError) as error:
                failure = error if isinstance(error, SourceError) else SourceError('schema_invalid', 'Provider response did not match the expected bounded schema.')
                now = self.now()
                if previous and previous['period'] == signature and previous['value']['data'] and (
                    now - datetime.fromisoformat(previous['value']['retrieved_at'].replace('Z', '+00:00'))).total_seconds() <= source['stale_limit']:
                    value = copy.deepcopy(previous['value'])
                    value['status'] = 'stale'
                    value['warnings'] = [warning for warning in value['warnings'] if not warning.startswith('Refresh failed:')]
                    value['warnings'].append('Refresh failed: returning explicitly stale previously retrieved public observations.')
                else:
                    value = self.envelope(kind, LOCATIONS[reference] if kind != 'market' else None)
                value['attempted_at'] = iso(now)
                value['error'] = dict(code=failure.code, message=failure.message)
                ttl = 60  # Provider errors cannot be hammered by manual refresh.
            expires = self.now() + timedelta(seconds=ttl)
            value['cache'] = dict(hit=False, ttl_seconds=ttl, expires_at=iso(expires))
            self.cache[key] = dict(period=signature, expires_at=expires, value=copy.deepcopy(value))
            return value


LocationId = Literal['nashik', 'pune', 'satara']
CropId = Literal['tomato', 'green_chilli']


def create_app(*, transport=None, clock=None, request_timeout_seconds=15, max_response_bytes=600000):
    if not .001 <= request_timeout_seconds <= 30 or not 1024 <= max_response_bytes <= 2000000:
        raise ValueError('Gateway request timeout/body bounds are invalid.')
    client = httpx.AsyncClient(transport=transport, follow_redirects=False,
        timeout=httpx.Timeout(request_timeout_seconds, connect=min(5, request_timeout_seconds)),
        limits=httpx.Limits(max_connections=4, max_keepalive_connections=4),
        headers={'User-Agent': 'Meraki-public-reference-development/1.0', 'Accept': 'application/json,text/html'})
    gateway = PublicDataGateway(client, clock or (lambda: datetime.now(timezone.utc)), request_timeout_seconds, max_response_bytes)

    @asynccontextmanager
    async def lifespan(_):
        yield
        await client.aclose()

    app = FastAPI(title='Meraki public reference data gateway', version='1.0.0', lifespan=lifespan)
    app.state.gateway = gateway
    allowed_queries = {'health': set(), 'locations': set(), 'forecast': {'location'}, 'history': {'location'},
                       'market': {'crop'}, 'snapshot': {'location', 'crop'}}

    @app.middleware('http')
    async def reject_arbitrary_parameters(request: Request, call_next):
        endpoint = request.url.path.removeprefix('/api/live-data/')
        if endpoint in allowed_queries and (set(request.query_params) - allowed_queries[endpoint] or
                any(len(request.query_params.getlist(key)) != 1 for key in request.query_params)):
            return JSONResponse(status_code=422, content={'detail': 'Only documented, single-valued allowlisted query parameters are accepted.'})
        return await call_next(request)

    @app.get('/api/live-data/health')
    async def health():
        return dict(status='ok', mode='public_reference_development', synthetic=False,
                    server_time=iso(gateway.now()), upstream_health='not_probed', private_farm_data=False)

    @app.get('/api/live-data/locations')
    async def locations():
        return dict(locations=list(LOCATIONS.values()), crops=[{key: crop[key] for key in ('id', 'name')} for crop in CROPS.values()])

    @app.get('/api/live-data/forecast')
    async def forecast(location: LocationId = 'nashik'):
        return await gateway.get('forecast', location)

    @app.get('/api/live-data/history')
    async def history(location: LocationId = 'nashik'):
        return await gateway.get('history', location)

    @app.get('/api/live-data/market')
    async def market(crop: CropId = 'tomato'):
        return await gateway.get('market', crop)

    @app.get('/api/live-data/snapshot')
    async def snapshot(location: LocationId = 'nashik', crop: CropId = 'tomato'):
        forecast_value, history_value, market_value = await asyncio.gather(
            gateway.get('forecast', location), gateway.get('history', location), gateway.get('market', crop))
        return dict(server_time=iso(gateway.now()), forecast=forecast_value, history=history_value, market=market_value)

    return app


app = create_app()
