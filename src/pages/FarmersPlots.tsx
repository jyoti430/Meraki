import { Fragment, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, CalendarClock, CalendarDays, Check, CheckCircle2, ChevronDown, Clock3, Cpu, Droplets, Layers, MapPinned, Plus, Search, Sprout, UserRoundPlus, UsersRound } from 'lucide-react'
import { useFarmers } from '../context/FarmersContext'
import { usePlan } from '../context/PlanContext'
import { soilTypes } from '../data/crops'
import { addDays, fmtAcres, fmtDay } from '../planning/format'
import { farmerEligibility, plotAcres, plotBusyUntil, replyStateFor } from '../planning/engine'
import type { Farmer, Plot } from '../types'
import { InfoTip, StatCard, initials } from '../components/ui'
import PageHeader from '../components/layout/PageHeader'

type Filter = 'all' | 'in-plan' | 'needs-details' | 'not-participating'
const needsDetails = (p: Plot) => p.waterAvailability === 'Unknown' || !p.soilType.trim()
const waterLevel: Record<Plot['waterAvailability'], 'high' | 'medium' | 'low'> = { Available: 'high', Limited: 'medium', None: 'low', Unknown: 'medium' }

function PlotsTable({ farmer, inPlan }: { farmer: Farmer; inPlan: (plotId: string) => string[] }) {
  const { data, editPlot } = useFarmers()
  const plots = data.plots.filter((p) => p.farmerId === farmer.id)
  const update = (plot: Plot, patch: Partial<Plot>) => {
    const { id: _id, createdAt: _c, updatedAt: _u, ...input } = { ...plot, ...patch }
    editPlot(plot.id, input)
  }
  if (!plots.length) return <div className="m-row" style={{ justifyContent: 'space-between' }}><span className="m-small">No plots recorded for {farmer.name}.</span><Link className="m-link" to={`/plots/new?farmerId=${farmer.id}`}><Plus size={15} />Add plot</Link></div>
  return <div className="m-dt-scroll"><table className="m-dt" style={{ fontSize: 14.5 }}>
    <thead><tr><th>Plot</th><th>Area</th><th>Water <InfoTip text="No water rules a plot out; limited water rules out thirsty crops" /></th><th>Soil type <InfoTip text="Guides suitability but never excludes a plot on its own" /></th><th>Measured soil</th><th>Availability</th><th>In plan</th></tr></thead>
    <tbody>{plots.map((plot) => {
      const busy = plotBusyUntil(data, plot.id)
      const m = plot.soilMeasurement
      const tags = inPlan(plot.id)
      return <tr key={plot.id}>
        <td><Link to={`/plots/${plot.id}`} className="m-link">{plot.name}</Link><small>{plot.irrigationType ? `${plot.irrigationType} irrigation` : 'No irrigation recorded'}</small></td>
        <td style={{ whiteSpace: 'nowrap' }}><strong>{fmtAcres(plotAcres(plot))}</strong></td>
        <td><span className={`m-feas ${waterLevel[plot.waterAvailability]}`} style={{ paddingRight: 4 }}>
          <select className="m-feas-select" value={plot.waterAvailability} onChange={(e) => update(plot, { waterAvailability: e.target.value as Plot['waterAvailability'] })} aria-label={`Water availability for ${plot.name}`}><option>Available</option><option>Limited</option><option>None</option><option>Unknown</option></select>
        </span></td>
        <td><span className="m-chipdate" style={{ paddingRight: 4 }}>
          <select className="m-feas-select" value={soilTypes.includes(plot.soilType) ? plot.soilType : plot.soilType ? '__other' : ''} onChange={(e) => e.target.value !== '__other' && update(plot, { soilType: e.target.value })} aria-label={`Soil type for ${plot.name}`}>
            <option value="">Not sure</option>{soilTypes.map((s) => <option key={s}>{s}</option>)}{plot.soilType && !soilTypes.includes(plot.soilType) && <option value="__other">{plot.soilType}</option>}
          </select>
        </span></td>
        <td>{m ? <span className="m-status wait" title={`Measured ${fmtDay(m.measuredAt)}`}><Cpu size={15} />{m.ph != null ? `pH ${m.ph}` : ''}{m.moisturePct != null ? ` · ${m.moisturePct}%` : ''}<span className="m-small" style={{ fontSize: 12 }}>({m.source.toLowerCase()})</span></span> : <span className="m-small">Optional</span>}</td>
        <td>{busy ? <span className="m-chipdate plain"><CalendarClock size={16} />{busy.cycle.crop} until {fmtDay(busy.until)}<small style={{ display: 'inline', marginLeft: 4 }}>· free {fmtDay(addDays(busy.until, 7))}</small></span> : <span className="m-chipdate"><CalendarDays size={16} />Free now</span>}</td>
        <td>{tags.length ? tags.map((t) => <span key={t} className="m-status" style={{ marginRight: 4 }}><Sprout size={15} />{t}</span>) : <span className="m-small">—</span>}</td>
      </tr>
    })}</tbody>
  </table></div>
}

function ParticipationCell({ farmer, reason }: { farmer: Farmer; reason: string | null }) {
  const { addParticipation } = useFarmers()
  const record = (status: 'opted-in' | 'opted-out') => addParticipation({ farmerId: farmer.id, scope: 'supply-programme', scopeId: null, status, reason: status === 'opted-in' ? 'Farmer agreed to join this season’s plan' : 'Farmer chose not to participate', notes: 'Recorded from Farmers & Farms' })
  if (farmer.membershipStatus === 'Active' && farmer.consent.status === 'not-recorded') return <div className="m-row" style={{ gap: 6, flexWrap: 'nowrap' }} onClick={(e) => e.stopPropagation()}>
    <button type="button" className="m-action-btn" style={{ minWidth: 0 }} onClick={() => record('opted-in')}><Check size={15} />Joins</button>
    <button type="button" className="m-action-btn warn" style={{ minWidth: 0 }} onClick={() => record('opted-out')}>Not joining</button>
  </div>
  return reason ? <span className="m-dotstatus ind" style={{ background: '#f2f4ef' }}>{reason}</span> : <span className="m-dotstatus">Participating</span>
}

export default function FarmersPlots() {
  const { data } = useFarmers()
  const { result, responses } = usePlan()
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
    'needs-details': (f) => detailFarmers.has(f.id),
    'not-participating': (f) => !eligibleIds.has(f.id),
  }
  const visible = useMemo(() => data.farmers.filter((f) => groups[filter](f) && (!query.trim() || `${f.name} ${f.village} ${f.district}`.toLowerCase().includes(query.trim().toLowerCase())))
    .sort((a, b) => Number(!result.farmersInvolved.includes(a.id)) - Number(!result.farmersInvolved.includes(b.id)) || a.name.localeCompare(b.name)), [data.farmers, filter, query, result.farmersInvolved]) // eslint-disable-line react-hooks/exhaustive-deps

  const replyStatus = (id: string) => {
    if (!result.farmersInvolved.includes(id)) return <span className="m-small">—</span>
    const s = replyStateFor(id, responses, result.allocations)
    if (s === 'confirmed') return <span className="m-status"><CheckCircle2 size={15} />Confirmed</span>
    if (s === 'sent') return <span className="m-status wait"><Clock3 size={15} />Awaiting reply</span>
    if (s === 'constraint' || s === 'needs-update') return <span className="m-status review"><AlertTriangle size={15} />Needs review</span>
    return <span className="m-status"><Check size={15} />Planned</span>
  }

  return <div className="m-page">
    <PageHeader title="Farmers & farms" subtitle="Who can grow what – land, water and soil across your member farmers." actions={<div className="m-row" style={{ gap: 8 }}>
      <Link to="/plots/new" className="m-btn m-btn-tertiary m-btn-sm" style={{ borderColor: 'var(--line-strong)', borderRadius: 10 }}><Plus size={16} />Add plot</Link>
      <Link to="/farmers-plots/new" className="m-btn m-btn-primary m-btn-sm" style={{ borderRadius: 10 }}><UserRoundPlus size={16} />Add farmer</Link>
    </div>} />

    <section className="m-stats" aria-label="Farm summary">
      <StatCard icon={<UsersRound size={24} />} label="Participating farmers" tip="Active members who opted in to this season's plan" value={`${eligible.length} of ${data.farmers.length}`} sub={<>{result.farmersInvolved.length} assigned in the plan</>} />
      <StatCard icon={<MapPinned size={24} />} label="Land free now" tip="Participating plots with no crop currently growing" value={`${freeAcres.toFixed(1)} ac`} sub={<>of {totalAcres.toFixed(1)} ac participating</>} />
      <StatCard icon={<AlertTriangle size={24} />} tone="warn" label="Plots missing details" tip="Unknown water or soil keeps a plot out of the strongest matches" value={detailPlots.length} sub={<>water or soil not recorded</>} />
      <StatCard icon={<Cpu size={24} />} label="Soil measurements" tip="Optional readings from a field kit, lab or future soil sensor" value={measured} sub={<>plots · optional</>} />
    </section>

    <section className="m-panel" aria-labelledby="dir-title">
        <div className="m-panel-head">
          <div><h2 className="m-panel-title" id="dir-title">Farmer directory</h2><p className="m-panel-sub">Open a farmer to see and edit their plots. Changes update the plan immediately.</p></div>
          <label className="m-select-pill" style={{ padding: '8px 14px' }}><Search size={17} color="var(--mute)" /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search farmer or village" aria-label="Search farmers" style={{ border: 0, outline: 0, font: 'inherit', fontWeight: 400, width: 190, background: 'transparent' }} /></label>
        </div>
        <div className="m-seg2" role="group" aria-label="Filter farmers" style={{ marginBottom: 12, flexWrap: 'wrap' }}>
          {([['all', 'All'], ['in-plan', 'In plan'], ['needs-details', 'Needs details'], ['not-participating', 'Not participating']] as [Filter, string][]).map(([id, label]) => <button key={id} type="button" aria-pressed={filter === id} onClick={() => setFilter(id)}>{label} <span className="m-small">{data.farmers.filter(groups[id]).length}</span></button>)}
        </div>
        <div className="m-dt-scroll"><table className="m-dt">
          <thead><tr><th>Farmer</th><th>Land</th><th>Participation</th><th>Planned crops</th><th>Reply</th><th><span className="sr-only">Expand</span></th></tr></thead>
          <tbody>{visible.map((f) => {
            const plots = data.plots.filter((p) => p.farmerId === f.id)
            const allocs = result.allocations.filter((a) => a.farmerId === f.id)
            const isOpen = open === f.id
            const missing = plots.filter(needsDetails).length
            return <Fragment key={f.id}>
              <tr className={`click ${isOpen ? 'sel' : ''}`} onClick={() => setOpen(isOpen ? null : f.id)} aria-expanded={isOpen}>
                <td><span className="m-row" style={{ flexWrap: 'nowrap', gap: 12 }}><span className="m-avatar" style={{ background: '#e5f1de', color: 'var(--forest)' }}>{initials(f.name)}</span><span><Link to={`/farmers-plots/${f.id}`} onClick={(e) => e.stopPropagation()} style={{ fontWeight: 600, textDecoration: 'none' }}>{f.name}</Link><small>{f.village}, {f.district} · {f.preferredLanguage}</small></span></span></td>
                <td style={{ whiteSpace: 'nowrap' }}><strong>{fmtAcres(plots.reduce((s, p) => s + plotAcres(p), 0))}</strong><small>{plots.length} plot{plots.length === 1 ? '' : 's'}{missing ? ` · ${missing} missing details` : ''}</small></td>
                <td><ParticipationCell farmer={f} reason={farmerEligibility(f, responses[f.id])} /></td>
                <td>{allocs.length ? <span className="m-row" style={{ gap: 4 }}>{[...new Set(allocs.map((a) => a.crop))].map((c) => <span key={c} className="m-mkt">{c}</span>)}</span> : <span className="m-small">—</span>}</td>
                <td>{replyStatus(f.id)}</td>
                <td><ChevronDown size={18} style={{ transform: isOpen ? 'rotate(180deg)' : undefined, transition: 'transform .2s', color: 'var(--mute)' }} /></td>
              </tr>
              {isOpen && <tr><td colSpan={6} style={{ background: '#fafcf8', padding: '12px 14px' }}>
                <PlotsTable farmer={f} inPlan={(plotId) => allocs.filter((a) => a.plotId === plotId).map((a) => `${a.crop} ${fmtAcres(a.acres)}`)} />
                <div className="m-row" style={{ marginTop: 10, gap: 16 }}><Link className="m-link" to={`/farmers-plots/${f.id}`}>Full farmer profile</Link><Link className="m-link" to={`/plots/new?farmerId=${f.id}`}><Plus size={15} />Add plot</Link></div>
              </td></tr>}
            </Fragment>
          })}
          {!visible.length && <tr><td colSpan={6}><span className="m-small">No farmers match this filter.</span></td></tr>}</tbody>
        </table></div>
        <p className="m-footnote" style={{ marginTop: 12 }}>All people, phone numbers, locations and soil readings are synthetic demo records.</p>
    </section>

    <div className="m-cols-even">
        <section className="m-panel" aria-labelledby="attn-title">
          <h2 className="m-panel-title sm" id="attn-title"><AlertTriangle size={24} />Needs attention</h2>
          <p className="m-panel-sub" style={{ marginBottom: 8 }}>Details that would let more land into the plan.</p>
          <ul className="m-why2">
            {notRecorded.map((f) => <li key={f.id}><span className="m-roundico warn"><UsersRound size={19} /></span><div><strong>Ask {f.name} about joining</strong><span>Participation not recorded, so their land isn’t used.</span><div style={{ marginTop: 8 }}><ParticipationCell farmer={f} reason={null} /></div></div></li>)}
            {detailPlots.map((p) => { const f = data.farmers.find((x) => x.id === p.farmerId); return <li key={p.id}><span className="m-roundico warn"><Droplets size={19} /></span><div><strong>{f?.name} – {p.name}</strong><span>{[p.waterAvailability === 'Unknown' ? 'water' : '', !p.soilType.trim() ? 'soil type' : ''].filter(Boolean).join(' and ')} not recorded.</span><div style={{ marginTop: 6 }}><button type="button" className="m-link" style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer', font: 'inherit', fontSize: 14 }} onClick={() => { setFilter('all'); setOpen(p.farmerId) }}>Update details</button></div></div></li> })}
            {!notRecorded.length && !detailPlots.length && <li><span className="m-roundico"><Check size={19} /></span><div><strong>All set</strong><span>Every participating plot has water and soil recorded.</span></div></li>}
          </ul>
        </section>
        <section className="m-panel" aria-labelledby="how-title">
          <h2 className="m-panel-title sm" id="how-title"><Layers size={24} />How conditions shape the plan</h2>
          <ul className="m-why2" style={{ marginTop: 8 }}>
            <li><span className="m-roundico"><CalendarClock size={19} /></span><div><strong>Timing</strong><span>A plot still growing another crop past the sow-by date is skipped. 7 days are allowed to prepare land.</span></div></li>
            <li><span className="m-roundico"><Droplets size={19} /></span><div><strong>Water</strong><span>No water rules a plot out. Limited water rules out thirsty crops; drip makes medium-water crops workable.</span></div></li>
            <li><span className="m-roundico"><Layers size={19} /></span><div><strong>Soil</strong><span>Less-suited or unknown soil adds caution but never excludes a plot on its own.</span></div></li>
            <li><span className="m-roundico"><Cpu size={19} /></span><div><strong>Measurements</strong><span>Optional pH or moisture from a field kit, lab or future soil sensor sharpens advice. Never required.</span></div></li>
          </ul>
        </section>
    </div>
  </div>
}
