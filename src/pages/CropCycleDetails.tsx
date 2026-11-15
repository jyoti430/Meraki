import { ArrowLeft, ArrowRight, CalendarRange, Edit3, MapPinned, Sprout, UserRound } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { useFarmers } from '../context/FarmersContext'
import { formatEntityDate, formatEntityDateTime } from '../services/FarmersService'

export default function CropCycleDetails() {
  const { cycleId = '' } = useParams()
  const { data } = useFarmers()
  const cycle = data.cropCycles.find((item) => item.id === cycleId)
  if (!cycle) return <div className="entity-not-found"><h2>Crop cycle not found</h2><p>This crop cycle is not available in the current demo data.</p><Link className="secondary-button" to="/farmers"><ArrowLeft size={14} /> Back to farmers</Link></div>
  const plot = data.plots.find((item) => item.id === cycle.plotId)
  const farmer = data.farmers.find((item) => item.id === plot?.farmerId)

  return <div className="entity-page cycle-detail-page">
    <div className="entity-page-top"><div><Link className="entity-back-link" to={plot ? `/plots/${plot.id}` : '/farmers'}><ArrowLeft size={14} /> {plot ? `Back to ${plot.name}` : 'Farmers & farms'}</Link><div className="plot-profile-title"><span className="farmer-avatar crop-avatar"><Sprout size={19} /></span><div><h2>{cycle.crop} · {cycle.variety}</h2><p>{cycle.id} <span>·</span> Cycle on {plot?.name ?? 'unavailable plot'}</p></div></div></div><div className="entity-top-actions">{farmer && <Link className="secondary-button" to={`/farmers-plots/${farmer.id}`}><UserRound size={14} /> Farmer profile</Link>}{plot && <Link className="secondary-button" to={`/plots/${plot.id}`}><MapPinned size={14} /> Plot details</Link>}<Link className="primary-button" to={`/crop-cycles/${cycle.id}/edit`}><Edit3 size={14} /> Edit cycle</Link></div></div>
    <div className="cycle-status-banner"><span className={`crop-status-marker crop-status-${cycle.status.toLowerCase().replace(/-/g, '')}`} /><div><small>Crop cycle status</small><strong>{cycle.status}</strong></div><div className="cycle-estimate-banner"><span>Estimated production</span><strong>~{cycle.estimatedProductionKg.toLocaleString()} kg</strong></div><p>Estimate only · Not harvested or available stock</p></div>
    <div className="cycle-detail-layout"><main className="cycle-detail-main"><section className="entity-detail-card"><header><span className="entity-card-icon"><Sprout size={16} /></span><div><h3>Crop cycle information</h3><p>Crop, variety and historical context.</p></div></header><div className="entity-detail-values"><DetailValue label="Crop">{cycle.crop}</DetailValue><DetailValue label="Variety">{cycle.variety}</DetailValue><DetailValue label="Previous crop">{cycle.previousCrop}</DetailValue><DetailValue label="Cycle notes">{cycle.notes}</DetailValue></div></section>
      <section className="entity-detail-card"><header><span className="entity-card-icon"><CalendarRange size={16} /></span><div><h3>Crop timeline</h3><p>Recorded planting and expected harvest dates.</p></div></header><div className="crop-timeline"><TimelineStep label="Planting / sowing" date={cycle.plantingDate} /><TimelineStep label="Expected harvest start" date={cycle.expectedHarvestStartDate} /><TimelineStep label="Expected harvest end" date={cycle.expectedHarvestEndDate} /></div></section>
      <section className="entity-detail-card"><header><span className="entity-card-icon"><MapPinned size={16} /></span><div><h3>Supply limitations</h3><p>Farmer-reported constraints associated with this cycle.</p></div></header><div className="entity-detail-values"><DetailValue label="Water constraints">{cycle.waterConstraints}</DetailValue><DetailValue label="Capital / input constraints">{cycle.capitalInputConstraints}</DetailValue><DetailValue label="Other limitations">{cycle.otherLimitations}</DetailValue></div></section>
    </main><aside className="cycle-detail-aside"><h3>Record relationships</h3>{farmer && <Link to={`/farmers-plots/${farmer.id}`}><UserRound size={15} /><span><small>Farmer</small><strong>{farmer.name}</strong><em>{farmer.id}</em></span><ArrowRight size={14} /></Link>}{plot && <Link to={`/plots/${plot.id}`}><MapPinned size={15} /><span><small>Plot</small><strong>{plot.name}</strong><em>{plot.id}</em></span><ArrowRight size={14} /></Link>}<div className="cycle-data-note">Estimated production is kept as an estimate in this record. No inventory or allocation is created.</div><small className="cycle-updated">Last updated {formatEntityDateTime(cycle.updatedAt)}</small></aside></div>
    <div className="entity-form-footer"><Link className="secondary-button" to={plot ? `/plots/${plot.id}` : '/farmers'}><ArrowLeft size={14} /> Back to plot</Link><Link className="primary-button" to={`/crop-cycles/${cycle.id}/edit`}><Edit3 size={14} /> Edit cycle</Link></div>
  </div>
}

function DetailValue({ label, children }: { label: string; children: React.ReactNode }) { return <div><small>{label}</small><span>{children || <i>Not provided</i>}</span></div> }
function TimelineStep({ label, date }: { label: string; date: string }) { return <div><span /><small>{label}</small><strong>{formatEntityDate(date)}</strong></div> }
