import { Fragment, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, CalendarClock, CalendarDays, Check, CheckCircle2, ChevronDown, Clock3, Cpu, Droplets, Layers, MapPinned, Plus, Search, Sprout, UserRoundPlus, UsersRound } from 'lucide-react'
import { useFarmers } from '../context/FarmersContext'
import { usePlan } from '../context/PlanContext'
import { soilTypes } from '../data/crops'
import { addDays } from '../planning/format'
import { farmerEligibility, plotAcres, plotBusyUntil, replyStateFor } from '../planning/engine'
import type { Farmer, Plot } from '../types'
import { InfoTip, StatCard, initials } from '../components/ui'
import { rowActivation } from '../components/rowActivation'
import PageHeader from '../components/layout/PageHeader'
import { cropLabel, formatDate, formatNumber, useI18n, type TKey } from '../i18n'
import { translateEligibilityReason } from '../i18n/planning'

type Filter = 'all' | 'in-plan' | 'needs-details' | 'not-participating'
const needsDetails = (p: Plot) => p.waterAvailability === 'Unknown' || !p.soilType.trim()
const waterLevel: Record<Plot['waterAvailability'], 'high' | 'medium' | 'low'> = { Available: 'high', Limited: 'medium', None: 'low', Unknown: 'medium' }
const waterKeys: Record<Plot['waterAvailability'], TKey> = { Available: 'farm_water_available', Limited: 'farm_water_limited', None: 'farm_water_none', Unknown: 'farm_water_unknown' }
const soilKeys: Record<string, TKey> = { 'Black soil': 'farm_soil_black', Loamy: 'farm_soil_loamy', 'Sandy loam': 'farm_soil_sandy_loam', 'Red soil': 'farm_soil_red', Clay: 'farm_soil_clay', Laterite: 'farm_soil_laterite' }
const measurementKeys: Record<string, TKey> = { 'Lab test': 'farm_measurement_lab', 'Field test kit': 'farm_measurement_field_kit', 'Soil sensor': 'farm_measurement_sensor' }
const irrigationKeys: Record<string, TKey> = { Drip: 'farm_irrigation_drip', Furrow: 'farm_irrigation_furrow', Sprinkler: 'farm_irrigation_sprinkler' }
const areaLabel = (value: number, lang: 'en' | 'hi' | 'mr' | 'ta' | 'ml') => `${formatNumber(value, lang, { maximumFractionDigits: 2 })} ac`
const dayLabel = (value: string, lang: 'en' | 'hi' | 'mr' | 'ta' | 'ml') => formatDate(value, lang, { day: 'numeric', month: 'short' })

function VerifyControls({ plot }: { plot: Plot }) {
  const { t } = useI18n()
  const { verifyPlot } = usePlan()
  return <div className="m-row" style={{ gap: 6, marginTop: 6, flexWrap: 'nowrap' }} onClick={(e) => e.stopPropagation()}>
    <button type="button" className="m-action-btn" style={{ minWidth: 0 }} onClick={() => verifyPlot(plot.id)}><Check size={14} />{t('farm_water_ok')}</button>
    <span className="m-chipdate" style={{ paddingRight: 4 }}>{t('farm_verified_as')}
      <select className="m-feas-select" value="" onChange={(e) => e.target.value && verifyPlot(plot.id, e.target.value as Plot['waterAvailability'])} aria-label={t('farm_verified_water_for', { plot: plot.name })}><option value="">{t('farm_choose')}</option>{(['Available', 'Limited', 'None'] as const).map((value) => <option key={value} value={value}>{t(waterKeys[value])}</option>)}
      </select>
    </span>
  </div>
}

function PlotsTable({ farmer, inPlan }: { farmer: Farmer; inPlan: (plotId: string) => string[] }) {
  const { t, lang } = useI18n()
  const { data, editPlot } = useFarmers()
  const { flaggedPlots } = usePlan()
  const plots = data.plots.filter((p) => p.farmerId === farmer.id)
  const update = (plot: Plot, patch: Partial<Plot>) => {
    const { id: _id, createdAt: _c, updatedAt: _u, ...input } = { ...plot, ...patch }
    editPlot(plot.id, input)
  }
  if (!plots.length) return <div className="m-row" style={{ justifyContent: 'space-between' }}><span className="m-small">{t('farm_no_plots_for', { name: farmer.name })}</span><Link className="m-link" to={`/plots/new?farmerId=${farmer.id}`}><Plus size={15} />{t('farm_add_plot')}</Link></div>
  return <div className="m-dt-scroll"><table className="m-dt" style={{ fontSize: 14.5 }}>
    <thead><tr><th>{t('farm_plot')}</th><th>{t('farm_land')}</th><th>{t('farm_water')} <InfoTip text={t('farm_water_tip')} /></th><th>{t('farm_soil')} <InfoTip text={t('farm_soil_tip')} /></th><th>{t('farm_availability')}</th><th>{t('farm_in_plan')}</th></tr></thead>
    <tbody>{plots.map((plot) => {
      const busy = plotBusyUntil(data, plot.id)
      const m = plot.soilMeasurement
      const tags = inPlan(plot.id)
      return <tr key={plot.id}>
        <td><Link to={`/plots/${plot.id}`} className="m-link">{plot.name}</Link><small>{plot.irrigationType ? `${t(irrigationKeys[plot.irrigationType] ?? 'farm_irrigation_other')} ${t('farm_irrigation_suffix')}` : t('farm_no_irrigation')}</small></td>
        <td style={{ whiteSpace: 'nowrap' }}><strong>{areaLabel(plotAcres(plot), lang)}</strong></td>
        <td>{flaggedPlots[plot.id] && <div style={{ marginBottom: 6 }}><span className="m-status review"><AlertTriangle size={14} />{t('farm_needs_verification')}</span><small style={{ display: 'block', marginTop: 4 }}>{flaggedPlots[plot.id].reason}</small><VerifyControls plot={plot} /></div>}<span className={`m-feas ${waterLevel[plot.waterAvailability]}`} style={{ paddingRight: 4 }}>
          <select className="m-feas-select" value={plot.waterAvailability} onChange={(e) => update(plot, { waterAvailability: e.target.value as Plot['waterAvailability'] })} aria-label={t('farm_water_for_plot', { plot: plot.name })}>{(['Available', 'Limited', 'None', 'Unknown'] as const).map((value) => <option key={value} value={value}>{t(waterKeys[value])}</option>)}</select>
        </span></td>
        <td><span className="m-chipdate" style={{ paddingRight: 4 }}>
          <select className="m-feas-select" value={soilTypes.includes(plot.soilType) ? plot.soilType : plot.soilType ? '__other' : ''} onChange={(e) => e.target.value !== '__other' && update(plot, { soilType: e.target.value })} aria-label={t('farm_soil_for_plot', { plot: plot.name })}>
            <option value="">{t('farm_soil_not_sure')}</option>{soilTypes.map((s) => <option key={s} value={s}>{t(soilKeys[s] ?? 'farm_soil_other')}</option>)}{plot.soilType && !soilTypes.includes(plot.soilType) && <option value="__other">{plot.soilType}</option>}
          </select>
        </span>{m ? <small title={t('farm_measured_date', { date: dayLabel(m.measuredAt, lang) })} style={{ marginTop: 4 }}><Cpu size={12} style={{ verticalAlign: '-2px' }} /> {m.ph != null ? `pH ${formatNumber(m.ph, lang)}` : ''}{m.moisturePct != null ? ` · ${formatNumber(m.moisturePct, lang)}% ${t('farm_moisture')}` : ''} ({t(measurementKeys[m.source] ?? 'farm_measurement_other')})</small> : <small style={{ marginTop: 4 }}>{t('farm_no_measurement')}</small>}</td>

        <td>{busy ? <span className="m-chipdate plain"><CalendarClock size={16} />{cropLabel(busy.cycle.crop, t)} {t('farm_until')} {dayLabel(busy.until, lang)}<small style={{ display: 'inline', marginLeft: 4 }}>· {t('farm_free_on', { date: dayLabel(addDays(busy.until, 7), lang) })}</small></span> : <span className="m-chipdate"><CalendarDays size={16} />{t('farm_free_now')}</span>}</td>
        <td>{tags.length ? tags.map((crop) => <span key={crop} className="m-status" style={{ marginRight: 4 }}><Sprout size={15} />{cropLabel(crop, t)}</span>) : <span className="m-small">—</span>}</td>
      </tr>
    })}</tbody>
  </table></div>
}

function ParticipationCell({ farmer, reason }: { farmer: Farmer; reason: string | null }) {
  const { t } = useI18n()
  const { addParticipation } = useFarmers()
  const record = (status: 'opted-in' | 'opted-out') => addParticipation({ farmerId: farmer.id, scope: 'supply-programme', scopeId: null, status, reason: status === 'opted-in' ? 'Farmer agreed to join this season’s plan' : 'Farmer chose not to participate', notes: 'Recorded from Farmers & Farms' })
  if (farmer.membershipStatus === 'Active' && farmer.consent.status === 'not-recorded') return <div className="m-row" style={{ gap: 6, flexWrap: 'nowrap' }} onClick={(e) => e.stopPropagation()}>
    <button type="button" className="m-action-btn" style={{ minWidth: 0 }} onClick={() => record('opted-in')}><Check size={15} />{t('farm_joins')}</button>
    <button type="button" className="m-action-btn warn" style={{ minWidth: 0 }} onClick={() => record('opted-out')}>{t('farm_not_joining')}</button>
  </div>
  return reason ? <span className="m-dotstatus ind" style={{ background: '#f2f4ef' }}>{translateEligibilityReason(reason, t)}</span> : <span className="m-dotstatus">{t('farm_participating')}</span>
}

export default function FarmersPlots() {
  const { t, lang } = useI18n()
  const { data } = useFarmers()
  const { result, responses, flaggedPlots } = usePlan()
  const [filter, setFilter] = useState<Filter>('all')
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState<string | null>(null)

  const eligible = data.farmers.filter((f) => !farmerEligibility(f, responses[f.id]))
  const eligibleIds = new Set(eligible.map((f) => f.id))
  const participatingPlots = data.plots.filter((p) => eligibleIds.has(p.farmerId))
  const freeAcres = participatingPlots.filter((p) => !plotBusyUntil(data, p.id)).reduce((s, p) => s + plotAcres(p), 0)
  const totalAcres = participatingPlots.reduce((s, p) => s + plotAcres(p), 0)
  const detailPlots = participatingPlots.filter(needsDetails)
  const detailFarmers = new Set(detailPlots.map((p) => p.farmerId))
  const measured = data.plots.filter((p) => p.soilMeasurement).length
  const notRecorded = data.farmers.filter((f) => f.membershipStatus === 'Active' && f.consent.status === 'not-recorded')

  const groups: Record<Filter, (f: Farmer) => boolean> = {
    all: () => true,
    'in-plan': (f) => result.farmersInvolved.includes(f.id),
    'needs-details': (f) => detailFarmers.has(f.id) || data.plots.some((p) => p.farmerId === f.id && flaggedPlots[p.id]),
    'not-participating': (f) => !eligibleIds.has(f.id),
  }
  const visible = useMemo(() => data.farmers.filter((f) => groups[filter](f) && (!query.trim() || `${f.name} ${f.village} ${f.district}`.toLowerCase().includes(query.trim().toLowerCase())))
    .sort((a, b) => Number(!result.farmersInvolved.includes(a.id)) - Number(!result.farmersInvolved.includes(b.id)) || a.name.localeCompare(b.name)), [data.farmers, filter, query, result.farmersInvolved]) // eslint-disable-line react-hooks/exhaustive-deps

  const replyStatus = (id: string) => {
    if (!result.farmersInvolved.includes(id)) return <span className="m-small">—</span>
    const s = replyStateFor(id, responses, result.allocations)
    if (s === 'confirmed') return <span className="m-status"><CheckCircle2 size={15} />{t('reply_confirmed')}</span>
    if (s === 'sent') return <span className="m-status wait"><Clock3 size={15} />{t('reply_sent')}</span>
    if (s === 'constraint' || s === 'needs-update') return <span className="m-status review"><AlertTriangle size={15} />{t('farm_needs_review')}</span>
    return <span className="m-status"><Check size={15} />{t('source_planned')}</span>
  }

  return <div className="m-page">
    <PageHeader title={t('farmers_title')} subtitle={t('farmers_sub')} actions={<div className="m-row" style={{ gap: 8 }}>
      <Link to="/plots/new" className="m-btn m-btn-tertiary m-btn-sm" style={{ borderColor: 'var(--line-strong)', borderRadius: 10 }}><Plus size={16} />{t('farm_add_plot')}</Link>
      <Link to="/farmers-plots/new" className="m-btn m-btn-primary m-btn-sm" style={{ borderRadius: 10 }}><UserRoundPlus size={16} />{t('farm_add_farmer')}</Link>
    </div>} />

    <section className="m-stats" aria-label={t('farm_summary')}>
      <StatCard icon={<UsersRound size={24} />} label={t('farm_participating_farmers')} tip={t('farm_participating_tip')} value={`${formatNumber(eligible.length, lang)} / ${formatNumber(data.farmers.length, lang)}`} sub={<>{t('farm_assigned_in_plan', { count: formatNumber(result.farmersInvolved.length, lang) })}</>} />
      <StatCard icon={<MapPinned size={24} />} label={t('farm_land_free_now')} tip={t('farm_land_free_tip')} value={areaLabel(freeAcres, lang)} sub={<>{t('farm_of_area_participating', { area: areaLabel(totalAcres, lang) })}</>} />
      <StatCard icon={<AlertTriangle size={24} />} tone="warn" label={t('farm_plots_missing_details')} tip={t('farm_plots_missing_tip')} value={formatNumber(detailPlots.length, lang)} sub={<>{t('farm_water_or_soil_unknown')}</>} />
      <StatCard icon={<Cpu size={24} />} label={t('farm_soil_measurements')} tip={t('farm_measurements_tip')} value={formatNumber(measured, lang)} sub={<>{t('farm_plots_optional')}</>} />
    </section>

    <section className="m-panel" aria-labelledby="dir-title">
        <div className="m-panel-head">
          <div><h2 className="m-panel-title" id="dir-title">{t('farm_directory')}</h2><p className="m-panel-sub">{t('farm_directory_help')}</p></div>
          <label className="m-select-pill" style={{ padding: '8px 14px' }}><Search size={17} color="var(--mute)" /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('farm_search_placeholder')} aria-label={t('farm_search_aria')} style={{ border: 0, outline: 0, font: 'inherit', fontWeight: 400, width: 190, background: 'transparent' }} /></label>
        </div>
        <div className="m-seg2" role="group" aria-label={t('farm_filter_aria')} style={{ marginBottom: 12, flexWrap: 'wrap' }}>
          {([['all', 'farm_filter_all'], ['in-plan', 'farm_filter_in_plan'], ['needs-details', 'farm_filter_needs_details'], ['not-participating', 'farm_filter_not_participating']] as [Filter, TKey][]).map(([id, key]) => <button key={id} type="button" aria-pressed={filter === id} onClick={() => setFilter(id)}>{t(key)} <span className="m-small">{formatNumber(data.farmers.filter(groups[id]).length, lang)}</span></button>)}
        </div>
        <div className="m-dt-scroll"><table className="m-dt m-farmers-dir-table">
          <thead><tr><th>{t('farm_farmer')}</th><th>{t('farm_land')}</th><th>{t('farm_participation')}</th><th>{t('farm_planned_crops')}</th><th>{t('farm_reply')}</th><th><span className="sr-only">{t('farm_expand')}</span></th></tr></thead>
          <tbody>{visible.map((f) => {
            const plots = data.plots.filter((p) => p.farmerId === f.id)
            const allocs = result.allocations.filter((a) => a.farmerId === f.id)
            const isOpen = open === f.id
            const missing = plots.filter(needsDetails).length
            const plotCountLabel = plots.length === 1 ? t('farm_plot_count_one') : t('farm_plot_count_many', { count: formatNumber(plots.length, lang) })
            return <Fragment key={f.id}>
              <tr className={`click ${isOpen ? 'sel' : ''}`} {...rowActivation(() => setOpen(isOpen ? null : f.id))} aria-expanded={isOpen} aria-label={t('farm_show_plots_for', { name: f.name })}>
                <td><span className="m-row" style={{ flexWrap: 'nowrap', gap: 12 }}><span className="m-avatar" style={{ background: '#e5f1de', color: 'var(--forest)' }}>{initials(f.name)}</span><span className="m-farmer-identity"><Link className="m-farmer-name" to={`/farmers-plots/${f.id}`} onClick={(e) => e.stopPropagation()} title={f.name}>{f.name}</Link><small className="m-farmer-meta" title={`${f.village}, ${f.district} · ${f.preferredLanguage}`}>{f.village}, {f.district} · {f.preferredLanguage}</small></span></span></td>
                <td style={{ whiteSpace: 'nowrap' }}><strong>{areaLabel(plots.reduce((s, p) => s + plotAcres(p), 0), lang)}</strong><small>{plotCountLabel}{missing ? ` · ${t('farm_missing_detail_count', { count: formatNumber(missing, lang) })}` : ''}</small></td>
                <td><ParticipationCell farmer={f} reason={farmerEligibility(f, responses[f.id])} /></td>
                <td>{allocs.length ? <span className="m-row" style={{ gap: 4 }}>{[...new Set(allocs.map((a) => a.crop))].map((c) => <span key={c} className="m-mkt">{cropLabel(c, t)}</span>)}</span> : <span className="m-small">—</span>}</td>
                <td>{replyStatus(f.id)}</td>
                <td><ChevronDown size={18} style={{ transform: isOpen ? 'rotate(180deg)' : undefined, transition: 'transform .2s', color: 'var(--mute)' }} /></td>
              </tr>
              {isOpen && <tr><td colSpan={6} style={{ background: '#fafcf8', padding: '12px 14px' }}>
                <PlotsTable farmer={f} inPlan={(plotId) => allocs.filter((a) => a.plotId === plotId).map((a) => `${cropLabel(a.crop, t)} ${areaLabel(a.acres, lang)}`)} />
                <div className="m-row" style={{ marginTop: 10, gap: 16 }}><Link className="m-link" to={`/farmers-plots/${f.id}`}>{t('farm_full_profile')}</Link><Link className="m-link" to={`/plots/new?farmerId=${f.id}`}><Plus size={15} />{t('farm_add_plot')}</Link></div>
              </td></tr>}
            </Fragment>
          })}
          {!visible.length && <tr><td colSpan={6}><span className="m-small">{t('farm_no_match')}</span></td></tr>}</tbody>
        </table></div>
        <p className="m-footnote" style={{ marginTop: 12 }}>{t('farm_synthetic_disclosure')}</p>
    </section>

    <div className="m-stack" style={{ gap: 24 }}>
        <section className="m-panel" aria-labelledby="attn-title">
          <h2 className="m-panel-title sm" id="attn-title"><AlertTriangle size={24} />{t('farm_needs_attention')}</h2>
          <p className="m-panel-sub" style={{ marginBottom: 8 }}>{t('farm_attention_help')}</p>
          <ul className="m-why2 m-why-grid">
            {Object.entries(flaggedPlots).map(([plotId, flag]) => { const p = data.plots.find((x) => x.id === plotId); const f = data.farmers.find((x) => x.id === flag.farmerId); return p && <li key={plotId}><span className="m-roundico bad"><Droplets size={19} /></span><div><strong>{t('farm_verify_person', { name: f?.name ?? '', plot: p.name })}</strong><span>{t('farm_verify_reason', { reason: flag.reason, channel: flag.channel })}</span><VerifyControls plot={p} /></div></li> })}
            {notRecorded.map((f) => <li key={f.id}><span className="m-roundico warn"><UsersRound size={19} /></span><div><strong>{t('farm_ask_join', { name: f.name })}</strong><span>{t('farm_participation_not_recorded')}</span><div style={{ marginTop: 8 }}><ParticipationCell farmer={f} reason={null} /></div></div></li>)}
            {detailPlots.map((p) => { const f = data.farmers.find((x) => x.id === p.farmerId); const missing = [p.waterAvailability === 'Unknown' ? t('farm_water').toLowerCase() : '', !p.soilType.trim() ? t('farm_soil_type').toLowerCase() : ''].filter(Boolean).join(` ${t('farm_and')} `); return <li key={p.id}><span className="m-roundico warn"><Droplets size={19} /></span><div><strong>{f?.name} – {p.name}</strong><span>{t('farm_details_missing', { details: missing })}</span><div style={{ marginTop: 6 }}><button type="button" className="m-link" style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer', font: 'inherit', fontSize: 14 }} onClick={() => { setFilter('all'); setOpen(p.farmerId) }}>{t('farm_update_details')}</button></div></div></li> })}
            {!notRecorded.length && !detailPlots.length && !Object.keys(flaggedPlots).length && <li><span className="m-roundico"><Check size={19} /></span><div><strong>{t('farm_all_set')}</strong><span>{t('farm_all_conditions_recorded')}</span></div></li>}
          </ul>
        </section>
        <section className="m-panel" aria-labelledby="how-title">
          <h2 className="m-panel-title sm" id="how-title"><Layers size={24} />{t('farm_conditions_title')}</h2>
          <ul className="m-why2 m-why-grid four" style={{ marginTop: 8 }}>
            <li><span className="m-roundico"><CalendarClock size={19} /></span><div><strong>{t('farm_timing')}</strong><span>{t('farm_timing_help')}</span></div></li>
            <li><span className="m-roundico"><Droplets size={19} /></span><div><strong>{t('farm_water')}</strong><span>{t('farm_water_conditions_help')}</span></div></li>
            <li><span className="m-roundico"><Layers size={19} /></span><div><strong>{t('farm_soil')}</strong><span>{t('farm_soil_conditions_help')}</span></div></li>
            <li><span className="m-roundico"><Cpu size={19} /></span><div><strong>{t('farm_measurements')}</strong><span>{t('farm_measurements_help')}</span></div></li>
          </ul>
        </section>
    </div>
  </div>
}
