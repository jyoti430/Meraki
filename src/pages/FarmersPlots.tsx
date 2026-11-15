import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { CalendarClock, Cpu, Droplets, Layers, Plus, Search, UserRoundPlus } from 'lucide-react'
import { useFarmers } from '../context/FarmersContext'
import { usePlan } from '../context/PlanContext'
import { soilTypes } from '../data/crops'
import { addDays } from '../planning/format'
import { farmerEligibility, plotAcres, plotBusyUntil, replyStateFor } from '../planning/engine'
import { fmtAcres, fmtDay } from '../planning/format'
import type { Farmer, Plot } from '../types'
import { ReplyBadge, initials } from '../components/ui'

type Filter = 'all' | 'in-plan' | 'needs-details' | 'not-participating'
const waterTone: Record<Plot['waterAvailability'], string> = { Available: 'var(--good)', Limited: 'var(--warn)', None: 'var(--bad)', Unknown: 'var(--faint)' }
const needsDetails = (p: Plot) => p.waterAvailability === 'Unknown' || !p.soilType.trim()

function PlotRow({ plot, inPlan }: { plot: Plot; inPlan: string[] }) {
  const { data, editPlot } = useFarmers()
  const busy = plotBusyUntil(data, plot.id)
  const update = (patch: Partial<Plot>) => {
    const { id: _id, createdAt: _c, updatedAt: _u, ...input } = { ...plot, ...patch }
    editPlot(plot.id, input)
  }
  const m = plot.soilMeasurement
  return <div className="m-plot-row">
    <div><Link to={`/plots/${plot.id}`} className="m-link">{plot.name}</Link><div className="m-small">{plot.irrigationType ? `${plot.irrigationType} irrigation` : 'No irrigation recorded'}</div></div>
    <div className="m-num"><strong>{fmtAcres(plotAcres(plot))}</strong></div>
    <label><span className="m-plot-label">Water</span>
      <select className="m-select m-select-sm" value={plot.waterAvailability} onChange={(e) => update({ waterAvailability: e.target.value as Plot['waterAvailability'] })} style={{ borderColor: waterTone[plot.waterAvailability] }} aria-label={`Water availability for ${plot.name}`}>
        <option>Available</option><option>Limited</option><option>None</option><option>Unknown</option>
      </select>
    </label>
    <label><span className="m-plot-label">Soil</span>
      <select className="m-select m-select-sm" value={soilTypes.includes(plot.soilType) ? plot.soilType : plot.soilType ? '__other' : ''} onChange={(e) => e.target.value !== '__other' && update({ soilType: e.target.value })} aria-label={`Soil type for ${plot.name}`}>
        <option value="">Not sure</option>{soilTypes.map((s) => <option key={s}>{s}</option>)}{plot.soilType && !soilTypes.includes(plot.soilType) && <option value="__other">{plot.soilType}</option>}
      </select>
    </label>
    <div>{m ? <span className="m-tag m-tag-neutral" title={`Measured ${fmtDay(m.measuredAt)}`}>{m.source === 'Soil sensor' && <Cpu size={13} />}{m.ph != null ? `pH ${m.ph}` : ''}{m.moisturePct != null ? ` · ${m.moisturePct}% moisture` : ''} <span className="m-small" style={{ fontSize: 11.5 }}>({m.source.toLowerCase()})</span></span> : <span className="m-small">No measurements (optional)</span>}</div>
    <div>{busy ? <span className="m-small"><CalendarClock size={13} style={{ verticalAlign: '-2px' }} /> {busy.cycle.crop} until {fmtDay(busy.until)}<br />free from {fmtDay(addDays(busy.until, 7))}</span> : <span className="m-small">Free now</span>}{inPlan.length > 0 && <div style={{ marginTop: 4 }}>{inPlan.map((t) => <span key={t} className="m-tag m-tag-plan" style={{ marginRight: 4 }}>{t}</span>)}</div>}</div>
  </div>
}

function FarmerCard({ farmer }: { farmer: Farmer }) {
  const { data, addParticipation } = useFarmers()
  const { result, responses } = usePlan()
  const plots = data.plots.filter((p) => p.farmerId === farmer.id)
  const allocs = result.allocations.filter((a) => a.farmerId === farmer.id)
  const reason = farmerEligibility(farmer, responses[farmer.id])
  const record = (status: 'opted-in' | 'opted-out') => addParticipation({ farmerId: farmer.id, scope: 'supply-programme', scopeId: null, status, reason: status === 'opted-in' ? 'Farmer agreed to join this season’s plan' : 'Farmer chose not to participate', notes: 'Recorded from Farmers & farms' })
  return <article className="m-card m-farmer-card">
    <div className="m-farmer-head">
      <span className="m-avatar">{initials(farmer.name)}</span>
      <div>
        <strong style={{ fontSize: 16 }}><Link to={`/farmers-plots/${farmer.id}`}>{farmer.name}</Link></strong>
        <div className="m-small">{farmer.village}, {farmer.district} · {farmer.preferredLanguage} · {plots.length} plot{plots.length === 1 ? '' : 's'}, {fmtAcres(plots.reduce((s, p) => s + plotAcres(p), 0))}</div>
      </div>
      <div className="m-row" style={{ gap: 6 }}>
        {reason ? <span className="m-tag m-tag-neutral">{reason}</span> : allocs.length ? <span className="m-tag m-tag-plan">In plan · {allocs.map((a) => a.crop).filter((c, i, arr) => arr.indexOf(c) === i).join(', ')}</span> : <span className="m-tag m-tag-neutral">Participating · not needed yet</span>}
        {allocs.length > 0 && <ReplyBadge state={replyStateFor(farmer.id, responses, result.allocations)} />}
        {farmer.membershipStatus === 'Active' && farmer.consent.status === 'not-recorded' && <>
          <button type="button" className="m-btn m-btn-primary m-btn-xs" onClick={() => record('opted-in')}>Joins this season</button>
          <button type="button" className="m-btn m-btn-secondary m-btn-xs" onClick={() => record('opted-out')}>Not joining</button>
        </>}
      </div>
    </div>
    {plots.length > 0 && <div className="m-plot-row m-plot-head"><span>Plot</span><span>Area</span><span>Water</span><span>Soil type</span><span>Measured soil</span><span>Availability & plan</span></div>}
    {plots.map((p) => <PlotRow key={p.id} plot={p} inPlan={allocs.filter((a) => a.plotId === p.id).map((a) => `${a.crop} ${fmtAcres(a.acres)}`)} />)}
    {!plots.length && <div className="m-plot-row"><span className="m-small">No plots recorded.</span><Link className="m-link" to={`/plots/new?farmerId=${farmer.id}`}><Plus size={14} /> Add plot</Link></div>}
  </article>
}

export default function FarmersPlots() {
  const { data } = useFarmers()
  const { result, responses } = usePlan()
  const [filter, setFilter] = useState<Filter>('all')
  const [query, setQuery] = useState('')
  const eligible = data.farmers.filter((f) => !farmerEligibility(f, responses[f.id]))
  const eligibleIds = new Set(eligible.map((f) => f.id))
  const participatingPlots = data.plots.filter((p) => eligibleIds.has(p.farmerId))
  const freeAcres = participatingPlots.filter((p) => !plotBusyUntil(data, p.id)).reduce((s, p) => s + plotAcres(p), 0)
  const detailFarmers = new Set(participatingPlots.filter(needsDetails).map((p) => p.farmerId))
  const measured = data.plots.filter((p) => p.soilMeasurement).length

  const groups: Record<Filter, (f: Farmer) => boolean> = {
    all: () => true,
    'in-plan': (f) => result.farmersInvolved.includes(f.id),
    'needs-details': (f) => detailFarmers.has(f.id),
    'not-participating': (f) => !eligibleIds.has(f.id),
  }
  const visible = useMemo(() => data.farmers.filter((f) => groups[filter](f) && (!query.trim() || `${f.name} ${f.village} ${f.district}`.toLowerCase().includes(query.trim().toLowerCase())))
    .sort((a, b) => Number(!result.farmersInvolved.includes(a.id)) - Number(!result.farmersInvolved.includes(b.id)) || a.name.localeCompare(b.name)), [data.farmers, filter, query, result.farmersInvolved]) // eslint-disable-line react-hooks/exhaustive-deps

  return <div className="m-page">
    <header className="m-pagehead">
      <div><div className="m-eyebrow">Step 3 · Farmer feasibility</div><h1 className="m-h1">Farmers & farm conditions</h1><p className="m-lead">What your members can realistically grow depends on land that is free in time, water and soil. Change a detail here and the plan updates immediately.</p></div>
      <div className="m-pagehead-actions"><Link to="/plots/new" className="m-btn m-btn-secondary"><Plus size={17} /> Add plot</Link><Link to="/farmers-plots/new" className="m-btn m-btn-primary"><UserRoundPlus size={17} /> Add farmer</Link></div>
    </header>

    <div className="m-kpis">
      <div className="m-kpi"><small>Participating farmers</small><strong>{eligible.length} of {data.farmers.length}</strong><span>{result.farmersInvolved.length} assigned in the plan</span></div>
      <div className="m-kpi"><small>Participating land free now</small><strong>{freeAcres.toFixed(1)} ac</strong><span>of {participatingPlots.reduce((s, p) => s + plotAcres(p), 0).toFixed(1)} ac in total</span></div>
      <div className="m-kpi"><small>Plots missing water or soil</small><strong>{participatingPlots.filter(needsDetails).length}</strong><span>Kept out of the strongest matches</span></div>
      <div className="m-kpi"><small>Plots with soil measurements</small><strong>{measured}</strong><span>Sensor, lab or field kit – optional</span></div>
    </div>

    <section className="m-card m-card-sage" aria-labelledby="explain-title">
      <h2 className="m-h3" id="explain-title" style={{ marginBottom: 14 }}>How farm conditions shape recommendations</h2>
      <div className="m-explain">
        <div><strong><CalendarClock size={17} /> Timing</strong>A plot still growing another crop past the sow-by date is skipped for that crop. Meraki allows 7 days to prepare land after harvest.</div>
        <div><strong><Droplets size={17} /> Water</strong>No water rules a plot out. Limited water rules out thirsty crops like baby corn; drip irrigation makes medium-water crops workable.</div>
        <div><strong><Layers size={17} /> Soil</strong>A less-suited or unknown soil type adds caution but never excludes a plot on its own. Farmers’ experience matters too.</div>
        <div><strong><Cpu size={17} /> Measurements</strong>Optional pH or moisture readings from a field kit, lab or future soil sensor sharpen the advice. They are never required.</div>
      </div>
    </section>

    <div className="m-row" style={{ justifyContent: 'space-between' }}>
      <div className="m-chips" role="group" aria-label="Filter farmers">
        {([['all', 'All'], ['in-plan', 'In plan'], ['needs-details', 'Needs details'], ['not-participating', 'Not participating']] as [Filter, string][]).map(([id, label]) => <button key={id} type="button" className="m-chip" aria-pressed={filter === id} onClick={() => setFilter(id)}>{label}<span className="m-count">{data.farmers.filter(groups[id]).length}</span></button>)}
      </div>
      <label className="m-row" style={{ flexWrap: 'nowrap', gap: 0, position: 'relative' }}><Search size={16} style={{ position: 'absolute', left: 14, color: 'var(--mute)' }} /><input className="m-input" style={{ paddingLeft: 38, minHeight: 40, width: 260, borderRadius: 999 }} placeholder="Search farmer or village" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search farmers" /></label>
    </div>

    <div className="m-stack">{visible.map((f) => <FarmerCard key={f.id} farmer={f} />)}{!visible.length && <p className="m-small">No farmers match this filter.</p>}</div>
    <p className="m-footnote">All people, phone numbers, locations and soil readings are synthetic demo records.</p>
  </div>
}
