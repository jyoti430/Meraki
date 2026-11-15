import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { CloudSun, Database, FlaskConical, RefreshCw } from 'lucide-react'
import { fetchLiveSnapshot } from '../liveData/client'
import type { LiveSnapshot, MarketCrop, MarketRow, ReferenceLocation, SourceEnvelope, WeatherRow } from '../liveData/client'
import validation from '../../reports/model_validation.json'
import './LiveData.css'

const locations = [{ id: 'nashik', name: 'Nashik reference point' }, { id: 'pune', name: 'Pune reference point' }, { id: 'satara', name: 'Satara reference point' }] as const
const value = (number: number | null | undefined) => number == null ? 'Unknown' : number.toLocaleString('en-IN', { maximumFractionDigits: 2 })
const utc = (stamp: string | null) => stamp ? `${new Date(stamp).toLocaleString('en-GB', { timeZone: 'UTC', hour12: false })} UTC` : 'Unknown'
const publicUrl = (url: string) => /^https:\/\//.test(url) ? url : undefined

function SourceDetails<T>({ source }: { source: SourceEnvelope<T> }) {
  return <div className="ld-source-details">
    <dl><div><dt>Retrieved</dt><dd>{utc(source.retrieved_at)}</dd></div><div><dt>Period in response</dt><dd>{source.observation_start ?? 'Unknown'} → {source.observation_end ?? 'Unknown'}</dd></div><div><dt>Source cache</dt><dd>{source.cache.hit ? 'Cached response' : 'Fetched from provider'} · expires {utc(source.cache.expires_at)}</dd></div></dl>
    {source.error && <p role="alert" className="ld-warning">{source.error.message} No synthetic replacement was used.</p>}
    {source.warnings.length > 0 && <ul className="ld-caveats">{source.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul>}
    <p className="ld-attribution"><a href={publicUrl(source.source_url)} target="_blank" rel="noreferrer">{source.attribution}</a> · <a href={publicUrl(source.documentation_url)} target="_blank" rel="noreferrer">Provider documentation</a><br />{source.licence}{source.source_id.startsWith('open-meteo') && <> · <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">CC BY 4.0 licence</a> · <a href="https://open-meteo.com/en/terms" target="_blank" rel="noreferrer">Hosted-service terms</a></>}</p>
  </div>
}

function Status({ value: status }: { value: string }) {
  return <span className={`m-tag ${status === 'ok' || status === 'pass' ? 'm-tag-success' : 'm-tag-neutral'}`}>{status.replace(/_/g, ' ')}</span>
}

function WeatherTable({ rows, forecast, dateBasis }: { rows: WeatherRow[]; forecast?: boolean; dateBasis: string }) {
  if (!rows.length) return <p>No weather rows are available from this source.</p>
  return <div className="ld-table-wrap"><table><caption>{forecast ? 'Daily regional forecasts.' : 'Most recent seven returned days; gridded historical estimates.'} Date basis: {dateBasis}.</caption><thead><tr><th>Date</th><th>Min °C</th><th>Max °C</th><th>Precipitation mm/day</th>{forecast && <th>Reference ET₀ mm/day</th>}</tr></thead><tbody>{(forecast ? rows : rows.slice(-7)).map(row => <tr key={row.date}><th scope="row">{row.date}</th><td>{value(row.t2m_min_c)}</td><td>{value(row.t2m_max_c)}</td><td>{value(row.precipitation_mm_day)}</td>{forecast && <td>{value(row.et0_mm_day)}</td>}</tr>)}</tbody></table></div>
}

function MarketTable({ source }: { source: SourceEnvelope<MarketRow> }) {
  if (!source.data.length) return <p>No matching dated market observations are available.</p>
  return <><p>{source.data.length} observations returned. Showing the first 25 rows. These are statewide reporting markets, independent of the selected weather reference point.</p><div className="ld-table-wrap"><table><caption>Wholesale reports in original units; these are neither farmgate offers nor buyer orders.</caption><thead><tr><th>Date / market</th><th>Commodity / variety</th><th>Min</th><th>Modal</th><th>Max</th><th>Price unit</th><th>Arrivals</th></tr></thead><tbody>{source.data.slice(0, 25).map((row, index) => <tr key={index}><th scope="row">{row.observation_date}<br />{row.market}</th><td>{row.commodity}<br />{row.variety ?? 'Variety unknown'}</td><td>{value(row.price_min_rs_per_unit)}</td><td>{value(row.price_modal_rs_per_unit)}</td><td>{value(row.price_max_rs_per_unit)}</td><td>{row.price_unit}</td><td>{value(row.arrivals_value)} {row.arrivals_unit}</td></tr>)}</tbody></table></div></>
}

export default function LiveData() {
  const [location, setLocation] = useState<ReferenceLocation>('nashik')
  const [crop, setCrop] = useState<MarketCrop>('tomato')
  const [refresh, setRefresh] = useState(0)
  const [snapshot, setSnapshot] = useState<LiveSnapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  useEffect(() => {
    const controller = new AbortController()
    setLoading(true); setError(''); setSnapshot(null)
    fetchLiveSnapshot(location, crop, controller.signal).then(result => {
      if (!controller.signal.aborted) setSnapshot(result)
    }).catch(reason => {
      if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'Public source request failed.')
    }).finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [location, crop, refresh])

  return <div className="m-page ld-page">
    <header className="ld-heading"><div><div className="m-eyebrow">EVIDENCE & EVALUATION</div><h1 className="m-h1">Public data & model checks</h1><p className="m-lead">Check regional weather and market context, its freshness and the evidence needed before trusting yield predictions.</p></div><Link className="m-btn" to="/farm-intelligence">Farm data workspace</Link></header>
    <div className="ld-notice"><Database size={20} /><p>These public reference points describe regional context. They are separate from synthetic farm scenarios, laboratory soil reports, irrigation access and confirmed buyer demand.</p></div>
    <section className="m-card ld-controls" aria-label="Public data selection"><label>Weather reference location<select value={location} onChange={event => setLocation(event.target.value as ReferenceLocation)}>{locations.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>Statewide market commodity<select value={crop} onChange={event => setCrop(event.target.value as MarketCrop)}><option value="tomato">Tomato</option><option value="green_chilli">Green chilli</option></select></label><button className="m-btn" type="button" disabled={loading} onClick={() => setRefresh(current => current + 1)}><RefreshCw size={16} />{loading ? 'Fetching sources…' : 'Refresh sources'}</button><span className="m-small">Source caching limits repeated provider requests.</span></section>
    {loading && <p role="status">Checking each provider independently. A slow or failed source will be shown with its own status.</p>}
    {error && <p role="alert" className="ld-warning">{error} The page has no live values to display.</p>}
    {snapshot && <><p className="m-small">Gateway snapshot: {utc(snapshot.server_time)}. Unknown values stay unknown.</p>
      <section className="m-card ld-section"><div className="ld-section-heading"><h2><CloudSun size={22} /> Seven-day weather forecast</h2><Status value={snapshot.forecast.status} /></div><p>Modelled regional forecast from Open-Meteo. Provider issue time: {snapshot.forecast.provider_issued_at ? utc(snapshot.forecast.provider_issued_at) : 'not supplied by this response'}. Meraki first knew this snapshot at {utc(snapshot.forecast.available_at)}; retrieval time is not model issue time.</p><WeatherTable rows={snapshot.forecast.data} dateBasis={snapshot.forecast.units.date ?? 'not supplied'} forecast /><SourceDetails source={snapshot.forecast} /></section>
      <section className="m-card ld-section"><div className="ld-section-heading"><h2>NASA POWER recent history</h2><Status value={snapshot.history.status} /></div><p>Historical gridded estimates for a public reference point. This source has a reporting delay and does not provide a future forecast or a farm weather-station measurement.</p><WeatherTable rows={snapshot.history.data} dateBasis={snapshot.history.units.date ?? 'not supplied'} /><SourceDetails source={snapshot.history} /></section>
      <section className="m-card ld-section"><div className="ld-section-heading"><h2>MSAMB market reports</h2><Status value={snapshot.market.status} /></div><MarketTable source={snapshot.market} /><SourceDetails source={snapshot.market} /></section>
    </>}
    <section className="m-card ld-section" aria-labelledby="model-validation-title"><div className="ld-section-heading"><h2 id="model-validation-title"><FlaskConical size={22} /> Farm-yield model validation</h2><Status value={validation.status} /></div><p>{validation.summary}</p><div className="ld-model-metrics"><div><small>Accepted farm-outcome rows</small><strong>{validation.farm_outcomes.accepted_rows}</strong></div><div><small>Approved for production prediction</small><strong>{validation.promotion_allowed ? 'Yes' : 'No'}</strong></div><div><small>Evaluation status</small><strong>{validation.evaluation.status.replace(/_/g, ' ')}</strong></div></div><p>The crop-fit screen currently uses explanatory rules. Public state averages and market histories do not establish accuracy for an individual farm.</p><div className="ld-gates">{validation.gates.map(gate => <div key={gate.id}><Status value={gate.status} /><span>{gate.reason}</span></div>)}</div><h3>Next evidence needed</h3><ul>{validation.next_steps.map((step, index) => <li key={index}>{step}</li>)}</ul></section>
    <section className="m-card ld-section"><h2>Soil and groundwater access</h2><p>Use the farm workspace to import authorised soil-test records and record actual irrigation rights and pumping capacity. Public visibility does not establish permission to retrieve a farmer’s private test.</p><p><a href="https://soilhealth.dac.gov.in/" target="_blank" rel="noreferrer">Government Soil Health Card portal</a> · <a href="https://cgwb.gov.in/en/data-download" target="_blank" rel="noreferrer">CGWB regional groundwater data</a></p><p className="m-small">No authenticated SHC or live groundwater feed is connected. Regional groundwater observations cannot prove a farm’s water access. Open-Meteo’s free hosted endpoint is for development and non-commercial use; commercial deployment requires a suitable service agreement or self-hosting.</p></section>
  </div>
}
