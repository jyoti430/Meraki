import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { CloudSun, Database, FlaskConical, RefreshCw } from 'lucide-react'
import { fetchLiveSnapshot } from '../liveData/client'
import type { LiveSnapshot, MarketCrop, MarketRow, ReferenceLocation, SourceEnvelope, WeatherRow } from '../liveData/client'
import validation from '../../reports/model_validation.json'
import { useI18n } from '../i18n'
import './LiveData.css'

const publicUrl = (url: string) => /^https?:\/\//.test(url) ? url : undefined

function SourceDetails<T>({ source }: { source: SourceEnvelope<T> }) {
  const { t } = useI18n()
  const utc = (stamp: string | null) => stamp ? `${new Date(stamp).toLocaleString('en-GB', { timeZone: 'UTC', hour12: false })} UTC` : t('unknown')
  return <div className="ld-source-details">
    <dl><div><dt>{t('ld_retrieved')}</dt><dd>{utc(source.retrieved_at)}</dd></div><div><dt>{t('ld_period')}</dt><dd>{source.observation_start ?? t('unknown')} → {source.observation_end ?? t('unknown')}</dd></div><div><dt>{t('ld_source_cache')}</dt><dd>{source.cache.hit ? t('ld_cached_response') : t('ld_fetched_provider')} · {t('ld_expires', { time: utc(source.cache.expires_at) })}</dd></div></dl>
    {source.error && <p role="alert" className="ld-warning">{source.error.message} {t('ld_no_synthetic')}</p>}
    {source.warnings.length > 0 && <ul className="ld-caveats">{source.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul>}
    <p className="ld-attribution"><a href={publicUrl(source.source_url)} target="_blank" rel="noreferrer">{source.attribution}</a> · <a href={publicUrl(source.documentation_url)} target="_blank" rel="noreferrer">{t('ld_provider_doc')}</a><br />{source.licence}{source.source_id.startsWith('open-meteo') && <> · <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">CC BY 4.0</a> · <a href="https://open-meteo.com/en/terms" target="_blank" rel="noreferrer">Open-Meteo terms</a></>}</p>
  </div>
}

function Status({ value: status }: { value: string }) {
  return <span className={`m-tag ${status === 'ok' || status === 'pass' ? 'm-tag-success' : 'm-tag-neutral'}`}>{status.replace(/_/g, ' ')}</span>
}

function WeatherTable({ rows, forecast, dateBasis }: { rows: WeatherRow[]; forecast?: boolean; dateBasis: string }) {
  const { t } = useI18n()
  const value = (n: number | null | undefined) => n == null ? t('unknown') : n.toLocaleString('en-IN', { maximumFractionDigits: 2 })
  if (!rows.length) return <p>{t('ld_no_weather_rows')}</p>
  return <div className="ld-table-wrap"><table><caption>{t(forecast ? 'ld_weather_caption_forecast' : 'ld_weather_caption_history', { basis: dateBasis })}</caption><thead><tr><th>{t('ld_date')}</th><th>{t('ld_min_c')}</th><th>{t('ld_max_c')}</th><th>{t('ld_precip')}</th>{forecast && <th>{t('ld_et0')}</th>}</tr></thead><tbody data-no-translate>{(forecast ? rows : rows.slice(-7)).map(row => <tr key={row.date}><th scope="row">{row.date}</th><td>{value(row.t2m_min_c)}</td><td>{value(row.t2m_max_c)}</td><td>{value(row.precipitation_mm_day)}</td>{forecast && <td>{value(row.et0_mm_day)}</td>}</tr>)}</tbody></table></div>
}

function MarketTable({ source }: { source: SourceEnvelope<MarketRow> }) {
  const { t } = useI18n()
  const value = (n: number | null | undefined) => n == null ? t('unknown') : n.toLocaleString('en-IN', { maximumFractionDigits: 2 })
  if (!source.data.length) return <p>{t('ld_no_market_rows')}</p>
  return <><p>{t('ld_market_rows_info', { count: source.data.length })}</p><div className="ld-table-wrap"><table><caption>{t('ld_market_caption')}</caption><thead><tr><th>{t('ld_date_market')}</th><th>{t('ld_commodity_variety')}</th><th>{t('ld_min')}</th><th>{t('ld_modal')}</th><th>{t('ld_max')}</th><th>{t('ld_price_unit')}</th><th>{t('ld_arrivals')}</th></tr></thead><tbody data-no-translate>{source.data.slice(0, 25).map((row, index) => <tr key={index}><th scope="row">{row.observation_date}<br />{row.market}</th><td>{row.commodity}<br />{row.variety ?? t('ld_variety_unknown')}</td><td>{value(row.price_min_rs_per_unit)}</td><td>{value(row.price_modal_rs_per_unit)}</td><td>{value(row.price_max_rs_per_unit)}</td><td>{row.price_unit}</td><td>{value(row.arrivals_value)} {row.arrivals_unit}</td></tr>)}</tbody></table></div></>
}

export default function LiveData() {
  const { t, lang } = useI18n()
  const locations: { id: ReferenceLocation; name: string }[] = [
    { id: 'nashik', name: t('ld_loc_nashik') }, { id: 'pune', name: t('ld_loc_pune') }, { id: 'satara', name: t('ld_loc_satara') }
  ]
  const [location, setLocation] = useState<ReferenceLocation>('nashik')
  const [crop, setCrop] = useState<MarketCrop>('tomato')
  const [refresh, setRefresh] = useState(0)
  const [snapshot, setSnapshot] = useState<LiveSnapshot | null>(null)
  // Display backend records verbatim; translating a JSON tree can change source IDs, units and enum states.
  const displaySnapshot = snapshot
  const report = validation
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const utc = (stamp: string | null) => stamp ? `${new Date(stamp).toLocaleString('en-GB', { timeZone: 'UTC', hour12: false })} UTC` : t('unknown')
  useEffect(() => {
    const controller = new AbortController()
    setLoading(true); setError(''); setSnapshot(null)
    fetchLiveSnapshot(location, crop, lang, controller.signal).then(result => {
      if (!controller.signal.aborted) setSnapshot(result)
    }).catch(reason => {
      if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : t('ld_public_source_failed'))
    }).finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [location, crop, refresh, lang, t])


  return <div className="m-page ld-page">
    <header className="ld-heading"><div><div className="m-eyebrow">{t('ld_eyebrow')}</div><h1 className="m-h1">{t('public_data_title')}</h1><p className="m-lead">{t('public_data_sub')}</p></div><Link className="m-btn" to="/farm-intelligence">{t('farm_data_workspace')}</Link></header>
    <div className="ld-notice"><Database size={20} /><p>{t('ld_notice')}</p></div>
    <section className="m-card ld-controls" aria-label={t('ld_weather_loc')}><label>{t('ld_weather_loc')}<select value={location} onChange={event => setLocation(event.target.value as ReferenceLocation)}>{locations.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>{t('ld_market_crop')}<select value={crop} onChange={event => setCrop(event.target.value as MarketCrop)}><option value="tomato">{t('ld_crop_tomato')}</option><option value="green_chilli">{t('ld_crop_green_chilli')}</option></select></label><button className="m-btn" type="button" disabled={loading} onClick={() => setRefresh(current => current + 1)}><RefreshCw size={16} />{loading ? t('fetching_sources') : t('refresh_sources')}</button><span className="m-small">{t('ld_cache_note')}</span></section>
    {loading && <p role="status">{t('ld_checking')}</p>}
    {error && <p role="alert" className="ld-warning">{error} {t('ld_no_values')}</p>}
    {displaySnapshot && <><p className="m-small">{t('ld_gateway_snapshot', { time: utc(displaySnapshot.server_time) })}</p>
      <section className="m-card ld-section"><div className="ld-section-heading"><h2><CloudSun size={22} /> {t('ld_forecast_title')}</h2><Status value={displaySnapshot.forecast.status} /></div><p>{t('ld_forecast_desc', { issued: displaySnapshot.forecast.provider_issued_at ? utc(displaySnapshot.forecast.provider_issued_at) : t('ld_not_supplied'), available: utc(displaySnapshot.forecast.available_at) })}</p><WeatherTable rows={displaySnapshot.forecast.data} dateBasis={displaySnapshot.forecast.units.date ?? t('ld_not_supplied')} forecast /><SourceDetails source={displaySnapshot.forecast} /></section>
      <section className="m-card ld-section"><div className="ld-section-heading"><h2>{t('ld_history_title')}</h2><Status value={displaySnapshot.history.status} /></div><p>{t('ld_history_desc')}</p><WeatherTable rows={displaySnapshot.history.data} dateBasis={displaySnapshot.history.units.date ?? t('ld_not_supplied')} /><SourceDetails source={displaySnapshot.history} /></section>
      <section className="m-card ld-section"><div className="ld-section-heading"><h2>{t('ld_market_title')}</h2><Status value={displaySnapshot.market.status} /></div><MarketTable source={displaySnapshot.market} /><SourceDetails source={displaySnapshot.market} /></section>
    </>}
    <section className="m-card ld-section" aria-labelledby="model-validation-title"><div className="ld-section-heading"><h2 id="model-validation-title"><FlaskConical size={22} /> {t('ld_model_title')}</h2><Status value={report.status} /></div><p>{report.summary}</p><div className="ld-model-metrics"><div><small>{t('ld_accepted_rows')}</small><strong>{report.farm_outcomes.accepted_rows}</strong></div><div><small>{t('ld_approved')}</small><strong>{report.promotion_allowed ? t('ld_yes') : t('ld_no')}</strong></div><div><small>{t('ld_eval_status')}</small><strong>{String(report.evaluation.status).replace(/_/g, ' ')}</strong></div></div><p>{t('ld_model_note')}</p><div className="ld-gates">{report.gates.map((gate: any) => <div key={gate.id}><Status value={gate.status} /><span>{gate.reason}</span></div>)}</div><h3>{t('ld_next_evidence')}</h3><ul>{report.next_steps.map((step: string, index: number) => <li key={index}>{step}</li>)}</ul></section>
    <section className="m-card ld-section"><h2>{t('ld_soil_title')}</h2><p>{t('ld_soil_p1')}</p><p><a href="https://soilhealth.dac.gov.in/" target="_blank" rel="noreferrer">{t('ld_shc_portal')}</a> · <a href="https://cgwb.gov.in/en/data-download" target="_blank" rel="noreferrer">{t('ld_cgwb')}</a></p><p className="m-small">{t('ld_soil_p2')}</p></section>
  </div>
}
