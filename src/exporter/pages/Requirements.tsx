import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, ClipboardList, Plus, Search } from 'lucide-react'
import DemoNotice from '../components/DemoNotice'
import ExporterPageHeader from '../components/ExporterPageHeader'
import StatusBadge from '../components/StatusBadge'
import useRequirements from '../hooks/useRequirements'
import { cropLabel, formatDate, formatNumber, useI18n } from '../../i18n'

export default function Requirements() {
  const { t, lang } = useI18n()
  const { items, error, refresh } = useRequirements()
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('all')
  const filtered = useMemo(() => items?.filter((item) => {
    const q = query.trim().toLocaleLowerCase()
    const matchesQuery = !q || [item.id, item.crop, item.variety, item.destination].some((value) => value.toLocaleLowerCase().includes(q))
    return matchesQuery && (status === 'all' || item.status === status)
  }) ?? [], [items, query, status])

  return <div className="e-page">
    <ExporterPageHeader eyebrow={t('ex_req_eyebrow')} title={t('ex_req_title')} description={t('ex_req_description')} actions={<Link className="e-button e-button-primary" to="/exporter/requirements/new"><Plus size={17} /> {t('ex_req_action')}</Link>} />
    <DemoNotice>{t('ex_req_notice')} <Link to="/trade/requirements">{t('ex_trade_requirements')}</Link>.</DemoNotice>
    <section className="e-panel e-requirements-panel">
      <div className="e-filter-bar">
        <label className="e-search"><Search size={17} /><span className="sr-only">{t('ex_search_aria')}</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('ex_search_placeholder')} /></label>
        <label className="e-select-label">{t('ex_status')}<select value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">{t('ex_all_statuses')}</option><option value="active">{t('ex_active_examples')}</option><option value="draft">{t('ex_local_drafts')}</option></select></label>
      </div>
      {error ? <div className="e-error" role="alert">{error} <button type="button" className="e-text-button" onClick={() => void refresh()}>{t('ex_retry')}</button></div> : items === null ? <div className="e-loading" role="status">{t('ex_loading')}</div> : filtered.length === 0 ? <div className="e-empty-state"><span className="e-empty-icon"><ClipboardList size={25} /></span><h2>{t('ex_no_matching_requirements')}</h2><p>{t('ex_try_search')}</p><Link to="/exporter/requirements/new" className="e-button e-button-secondary"><Plus size={17} /> {t('ex_create_local_draft')}</Link></div> : <>
        <div className="e-table-wrap"><table className="e-table"><thead><tr><th>{t('ex_requirement_heading')}</th><th>{t('ex_crop_variety')}</th><th>{t('ex_quantity')}</th><th>{t('ex_grade')}</th><th>{t('ex_destination')}</th><th>{t('ex_required_by')}</th><th>{t('ex_status')}</th><th><span className="sr-only">{t('ex_open')}</span></th></tr></thead>
          <tbody>{filtered.map((item) => <tr key={item.id}>
            <td><Link className="e-table-primary" to={`/exporter/requirements/${item.id}`}>{item.id}</Link><small>{t(item.source === 'synthetic-demo' ? 'ex_synthetic_example' : 'ex_local_browser_draft')}</small></td>
            <td>{cropLabel(item.crop, t)}<small>{item.variety}</small></td><td>{formatNumber(item.quantityKg, lang)} kg</td><td>{item.grade}</td><td>{item.destination}</td><td>{formatDate(item.requiredBy, lang, { year: 'numeric', month: 'short', day: 'numeric' })}</td>
            <td><StatusBadge tone={item.status === 'active' ? 'good' : 'neutral'}>{t(item.status === 'active' ? 'ex_active_demo' : 'ex_draft_local')}</StatusBadge></td>
            <td><Link aria-label={`${t('ex_open')} ${item.id}`} className="e-icon-link" to={`/exporter/requirements/${item.id}`}><ArrowRight size={17} /></Link></td>
          </tr>)}</tbody>
        </table></div>
        <p className="e-table-footnote">{t('ex_requirements_shown', { count: filtered.length })}</p>
      </>}
    </section>
  </div>
}
