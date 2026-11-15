import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, CloudSun, FlaskConical, Layers, RefreshCw, ShieldCheck, Sprout, ThermometerSun } from 'lucide-react'
import { useFarmIntelligence } from '../context/FarmIntelligenceContext'
import { useFarmers } from '../context/FarmersContext'
import { crops } from '../data/crops'
import { DEMO_FARM_DATA_DATE } from '../data/farmIntelligenceDemo'
import { cultivationEvidence } from '../farmdata/evidence'
import { cultivationKindLabel, summariseCultivation, validateCultivationEvent } from '../farmdata/cultivation'
import { evaluateCropFit } from '../farmdata/agronomy'
import { soilImportTemplate, resolveSoilEvidence } from '../farmdata/soil'
import type { CultivationEvent, CultivationEventKind, SoilImportResult, SoilSample } from '../farmdata/types'
import { assessWaterAccess, regionalWaterCaveats } from '../farmdata/water'
import type { ScenarioDraftInput } from '../farmdata/scenario'
import { plotAcres, plotBusyUntil } from '../planning/engine'
import { addDays } from '../planning/format'
import './FarmIntelligence.css'

type Tab = 'soil' | 'weather' | 'cultivation' | 'projections'

const tabs: { id: Tab; label: string }[] = [
  { id: 'soil', label: 'Soil & evidence' },
  { id: 'weather', label: 'Weather & water' },
  { id: 'cultivation', label: 'Inputs & cultivation' },
  { id: 'projections', label: 'Scenarios & projections' },
]

const today = DEMO_FARM_DATA_DATE
const kg = (value: number | null | undefined) => value == null ? 'Unknown' : `${Math.round(value).toLocaleString('en-IN')} kg`
const pct = (value: number | null | undefined) => value == null ? 'Unknown' : `${Math.round(value * 100)}%`
const shortDate = (value: string | null | undefined) => value ? new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${value.slice(0, 10)}T00:00:00Z`)) : 'Not recorded'
const tagClass = (status: string) => status === 'verified' ? 'm-tag-good' : status === 'reported' ? 'm-tag-plan' : status === 'estimated' ? 'm-tag-warn' : status === 'failed' ? 'm-tag-bad' : 'm-tag-neutral'

function Tag({ label, status }: { label?: string; status: string }) {
  return <span className={`m-tag ${tagClass(status)}`}>{label ?? status}</span>
}

function Metric({ label, value, note }: { label: string; value: string; note: string }) {
  return <article className="fi-metric"><small>{label}</small><strong>{value}</strong><span>{note}</span></article>
}

export default function FarmIntelligence() {
  const { state, importSoil, runWeatherAdapter, saveWaterAccess, addCultivationEvent, saveScenario, publishVersion, applyRevision } = useFarmIntelligence()
  const { data } = useFarmers()
  const [tab, setTab] = useState<Tab>('soil')
  const [soilCsv, setSoilCsv] = useState(soilImportTemplate)
  const [soilResult, setSoilResult] = useState<SoilImportResult | null>(null)
  const [soilPlotId, setSoilPlotId] = useState(data.plots[0]?.id ?? '')
  const [weatherMessage, setWeatherMessage] = useState('')
  const [waterPlotId, setWaterPlotId] = useState(data.plots[0]?.id ?? '')
  const [cultivationPlotId, setCultivationPlotId] = useState(data.plots[0]?.id ?? '')
  const [cultivationMessage, setCultivationMessage] = useState('')
  const [scenarioId, setScenarioId] = useState(state.scenarios[0]?.id ?? '')
  const [versionId, setVersionId] = useState('')
  const [projectionMessage, setProjectionMessage] = useState('')

  const soilEvidence = useMemo(() => resolveSoilEvidence(state.soilSamples, soilPlotId, today), [state.soilSamples, soilPlotId])
  const plotSamples = state.soilSamples.filter((sample) => sample.plotId === soilPlotId)
  const latestWeather = state.weatherRuns[0] ?? null

  const waterRows = data.plots.map((plot) => {
    const scenario = state.scenarios.find((s) => s.plotId === plot.id)
    const crop = crops.find((c) => c.name === scenario?.cropName) ?? crops[0]
    const areaAcres = scenario?.areaAcres ?? plotAcres(plot)
    const access = state.waterAccess.find((w) => w.plotId === plot.id) ?? null
    return { plot, crop, areaAcres, access, assessment: assessWaterAccess(access, crop, areaAcres, { decisionDate: today }) }
  })
  const selectedWater = waterRows.find((row) => row.plot.id === waterPlotId) ?? waterRows[0] ?? null

  const cultivationEvents = state.cultivation.filter((event) => event.plotId === cultivationPlotId)
  const cultivationSummary = summariseCultivation(cultivationEvents)
  const selectedScenario = state.scenarios.find((s) => s.id === scenarioId) ?? state.scenarios[0] ?? null
  const scenarioVersions = selectedScenario ? state.projectionVersions.filter((v) => v.scenarioId === selectedScenario.id).sort((a, b) => b.version - a.version) : []
  const activeVersion = scenarioVersions.find((v) => v.id === versionId) ?? scenarioVersions[0] ?? null
  const cropFit = useMemo(() => {
    if (!selectedScenario) return null
    const crop = crops.find((item) => item.name.toLowerCase() === selectedScenario.cropName.toLowerCase())
    const plot = data.plots.find((item) => item.id === selectedScenario.plotId)
    if (!crop || !plot) return null
    const sameCycle = data.cropCycles.some((cycle) => cycle.plotId === plot.id && cycle.crop === selectedScenario.cropName && cycle.plantingDate === selectedScenario.plantingDate)
    const busy = sameCycle ? null : plotBusyUntil(data, plot.id)
    return evaluateCropFit({
      crop, plot, decisionDate: selectedScenario.decisionDate, plantingDate: selectedScenario.plantingDate,
      soilSamples: state.soilSamples, waterAccess: state.waterAccess.find((item) => item.plotId === plot.id) ?? null,
      weatherRecords: state.weatherRuns.flatMap((run) => run.records), cultivation: state.cultivation,
      busyUntil: busy?.until ?? null, existingCycle: busy?.cycle ?? null, consent: selectedScenario.consent, areaAcres: selectedScenario.areaAcres,
    })
  }, [selectedScenario, data, state.soilSamples, state.waterAccess, state.weatherRuns, state.cultivation])

  const handleSoilImport = () => {
    const result = importSoil(soilCsv)
    setSoilResult(result)
  }

  const handleScenarioSaved = (id: string) => {
    setScenarioId(id)
    setVersionId('')
    setProjectionMessage('Scenario saved. Publish a projection version to make its supply visible.')
  }

  const handlePublish = () => {
    if (!selectedScenario) return
    try {
      const version = publishVersion(selectedScenario.id, 'Coordinator republished from current evidence and consent.', 'Workspace coordinator')
      setVersionId(version.id)
      setProjectionMessage(`Published version ${version.version}. Earlier versions remain in history.`)
    } catch (error) {
      setProjectionMessage(error instanceof Error ? error.message : 'Could not publish the projection.')
    }
  }

  return <div className="m-page fi-page">
    <header className="m-pagehead">
      <div>
        <div className="m-eyebrow"><Layers size={14} /> Part 1 · farm data and crop intelligence</div>
        <h1 className="m-h1">Farm intelligence</h1>
        <p className="m-lead">Soil evidence, weather and water context, cultivation records and versioned weekly supply projections. Every value keeps its source, date and evidence state; missing observations stay unknown.</p>
      </div>
      <div className="fi-demo-note"><strong>Development workspace</strong><span>These farm scenarios use synthetic fixtures. Public feeds remain separate regional context.</span><Link to="/live-data">Check public data & model validation</Link></div>
    </header>

    <nav className="fi-tabs" aria-label="Farm intelligence sections">
      {tabs.map((item) => <button key={item.id} type="button" className={tab === item.id ? 'active' : ''} aria-pressed={tab === item.id} onClick={() => setTab(item.id)}>{item.label}</button>)}
    </nav>

    {tab === 'soil' && <section className="fi-stack">
      <div className="fi-grid-4">
        <Metric label="Imported soil samples" value={String(state.soilSamples.length)} note="Rows may group into one sample per plot, date and depth." />
        <Metric label="Recorded plots" value={String(new Set(state.soilSamples.map((s) => s.plotId)).size)} note="Plot linkage is required; unknown plots are rejected." />
        <Metric label="Selected plot evidence" value={soilEvidence.status} note={soilEvidence.measured ? `Measured ${shortDate(soilEvidence.measured.sampledAt)}` : 'No measured result at the decision date.'} />
        <Metric label="Mapped estimates" value={String(soilEvidence.estimates.length)} note="Held separately; never overwrites a laboratory result." />
      </div>

      <div className="m-card">
        <div className="m-card-head"><div><h2>Review a plot’s soil evidence</h2><p className="m-small">Measured laboratory, field-kit and sensor records are resolved first. Mapped estimates are shown alongside, not substituted.</p></div>
          <label className="m-field fi-inline-field"><span>Plot</span><select className="m-select" value={soilPlotId} onChange={(event) => setSoilPlotId(event.target.value)}>{data.plots.map((plot) => <option key={plot.id} value={plot.id}>{plot.name} · {plot.id}</option>)}</select></label>
        </div>
        <div className="fi-evidence-banner">
          <Tag status={soilEvidence.status} />
          <div><strong>{soilEvidence.measured ? `${soilEvidence.measured.kind === 'laboratory' ? 'Laboratory' : 'Field'} result from ${shortDate(soilEvidence.measured.sampledAt)}` : 'No measured soil result'}</strong><p>{soilEvidence.measured ? `${soilEvidence.measured.depthFromCm}–${soilEvidence.measured.depthToCm} cm · ${soilEvidence.measured.lab || 'Source not named'}` : 'Soil condition at the decision date is unknown, not zero.'}</p></div>
        </div>
        <div className="fi-values">
          <div><small>pH</small><strong>{soilEvidence.ph ?? 'Unknown'}</strong></div>
          <div><small>Available N</small><strong>{soilEvidence.availableN == null ? 'Unknown' : `${soilEvidence.availableN} mg/kg`}</strong></div>
          <div><small>Available P</small><strong>{soilEvidence.availableP == null ? 'Unknown' : `${soilEvidence.availableP} mg/kg`}</strong></div>
          <div><small>Available K</small><strong>{soilEvidence.availableK == null ? 'Unknown' : `${soilEvidence.availableK} mg/kg`}</strong></div>
          <div><small>Organic carbon</small><strong>{soilEvidence.organicCarbon == null ? 'Unknown' : `${soilEvidence.organicCarbon} g/kg`}</strong></div>
        </div>
        {soilEvidence.caveats.length > 0 && <ul className="fi-caveats">{soilEvidence.caveats.map((caveat) => <li key={caveat}>{caveat}</li>)}</ul>}
        <div className="fi-sample-list">
          {plotSamples.length === 0 && <p className="m-small">No soil sample is linked to this plot. Unknown is not zero.</p>}
          {plotSamples.map((sample) => <SoilSampleCard key={sample.id} sample={sample} />)}
        </div>
      </div>

      <div className="m-card">
        <div className="m-card-head"><div><h2>Import reviewed soil rows</h2><p className="m-small">The template preserves raw value, unit, method, depth, sample date and plot linkage. Wrong plots, incompatible units and duplicate rows are rejected.</p></div><button type="button" className="m-btn m-btn-secondary m-btn-sm" onClick={() => setSoilCsv(soilImportTemplate)}><RefreshCw size={14} /> Restore template</button></div>
        <label className="m-field"><span>Soil CSV</span><textarea className="m-textarea fi-code" rows={8} value={soilCsv} onChange={(event) => setSoilCsv(event.target.value)} spellCheck={false} /></label>
        <div className="fi-actions"><button type="button" className="m-btn m-btn-primary m-btn-sm" onClick={handleSoilImport}><FlaskConical size={15} /> Validate and import</button><span className="m-small">No value is rewritten to fit a preferred unit.</span></div>
        {soilResult && <div className="fi-import-result">
          <div className="fi-inline-tags"><span className="m-tag m-tag-neutral">{soilResult.rowsRead} rows read</span><span className="m-tag m-tag-good">{soilResult.accepted.length} samples accepted</span><span className={`m-tag ${soilResult.rejected.length ? 'm-tag-bad' : 'm-tag-neutral'}`}>{soilResult.rejected.length} rows rejected</span></div>
          {soilResult.warnings.map((warning) => <p className="fi-warning" key={warning}><AlertTriangle size={14} /> {warning}</p>)}
          {soilResult.rejected.length > 0 && <div className="m-table-wrap"><table className="m-table"><thead><tr><th>Row</th><th>Errors</th><th>Original row</th></tr></thead><tbody>{soilResult.rejected.map((row) => <tr key={`${row.rowNumber}-${row.raw}`}><td>{row.rowNumber}</td><td>{row.errors.join(' ')}</td><td><code>{row.raw}</code></td></tr>)}</tbody></table></div>}
        </div>}
      </div>
    </section>}

    {tab === 'weather' && <section className="fi-stack">
      <div className="m-card">
        <div className="m-card-head"><div><h2>Weather adapter</h2><p className="m-small">Forecasts retain their issue time and horizon. A failed run records a failure, not an empty forecast of zero rainfall.</p></div>
          <div className="fi-actions"><button type="button" className="m-btn m-btn-primary m-btn-sm" onClick={() => { const run = runWeatherAdapter(); setWeatherMessage(`Adapter run ${run.status}: ${run.records.length} forecast records.`) }}><CloudSun size={15} /> Run synthetic adapter</button><button type="button" className="m-btn m-btn-danger m-btn-sm" onClick={() => { const run = runWeatherAdapter({ failReason: 'Injected adapter failure for the development check.' }); setWeatherMessage(`Adapter run ${run.status}: ${run.error}`) }}>Inject failure</button></div>
        </div>
        {weatherMessage && <p className="fi-warning">{weatherMessage}</p>}
        {!latestWeather && <p className="m-small">No weather adapter run yet.</p>}
        {latestWeather && <div className="fi-evidence-banner"><Tag status={latestWeather.status === 'ok' ? 'estimated' : 'failed'} label={latestWeather.status === 'ok' ? 'Synthetic forecast' : latestWeather.status} /><div><strong>{latestWeather.adapterLabel}</strong><p>Issued {latestWeather.issuedAt ? `${shortDate(latestWeather.issuedAt)} · ${latestWeather.horizonDays}-day horizon` : 'not issued'} · {latestWeather.records.length} records · captured {shortDate(latestWeather.startedAt)}</p></div></div>}
        {latestWeather?.error && <p className="fi-warning"><AlertTriangle size={14} /> {latestWeather.error}</p>}
        {latestWeather && latestWeather.records.length > 0 && <WeatherTable records={latestWeather.records} />}
        {latestWeather && latestWeather.caveats.length > 0 && <ul className="fi-caveats">{latestWeather.caveats.map((caveat) => <li key={caveat}>{caveat}</li>)}</ul>}
      </div>

      <div className="m-card">
        <div className="m-card-head"><div><h2>Farm water feasibility</h2><p className="m-small">Feasibility uses the farm’s own pump capacity, rights, reliability and an explicit indicative crop demand. Regional observation wells are not inputs to this calculation.</p></div>
          <label className="m-field fi-inline-field"><span>Assessment detail</span><select className="m-select" value={selectedWater?.plot.id ?? ''} onChange={(event) => setWaterPlotId(event.target.value)}>{waterRows.map((row) => <option key={row.plot.id} value={row.plot.id}>{row.plot.name}</option>)}</select></label>
        </div>
        <div className="m-table-wrap"><table className="m-table"><thead><tr><th>Plot</th><th>Recorded access</th><th>Crop & area</th><th>Seasonal supply</th><th>Indicative demand</th><th>Coverage</th><th>Status</th><th>Evidence</th></tr></thead><tbody>
          {waterRows.map(({ plot, crop, areaAcres, access, assessment }) => <tr key={plot.id}>
            <td><strong>{plot.name}</strong><small>{plot.id} · {plot.villageLocation}</small></td>
            <td>{access ? <><strong>{access.source.replace(/-/g, ' ')}</strong><small>{access.rights} rights · {access.reliability} reliability</small></> : <><strong>Not recorded</strong><small>Unknown, not zero</small></>}</td>
            <td>{crop.name}<small>{areaAcres.toFixed(2)} acres</small></td>
            <td>{assessment.availableSeasonM3 == null ? 'Unknown' : `${Math.round(assessment.availableSeasonM3).toLocaleString('en-IN')} m³`}</td>
            <td>{assessment.demandSeasonM3 == null ? 'Unknown' : `${Math.round(assessment.demandSeasonM3).toLocaleString('en-IN')} m³`}</td>
            <td>{pct(assessment.coveragePct)}</td>
            <td><Tag status={assessment.status === 'sufficient' ? 'verified' : assessment.status === 'unknown' ? 'unknown' : assessment.status === 'none' ? 'failed' : 'estimated'} label={assessment.status} /></td>
            <td><Tag status={assessment.evidence?.status ?? 'unknown'} /></td>
          </tr>)}
        </tbody></table></div>
        {selectedWater && <div className="fi-water-detail">
          <div><h3>Assumptions for {selectedWater.plot.name}</h3><ul className="fi-caveats">{selectedWater.assessment.assumptions.map((assumption) => <li key={assumption}>{assumption}</li>)}</ul></div>
          <div><h3>Limits of this assessment</h3><ul className="fi-caveats">{[...selectedWater.assessment.caveats, 'A regional observation-well depth does not prove this farm’s access, discharge or seasonal reliability.'].map((caveat) => <li key={caveat}>{caveat}</li>)}</ul></div>
        </div>}
        {selectedWater && <WaterAccessEditor access={selectedWater.access} plotId={selectedWater.plot.id} onSave={saveWaterAccess} />}
      </div>

      <div className="m-card">
        <div className="m-card-head"><div><h2>Regional groundwater observations</h2><p className="m-small">Context only. These records are never converted into a farm irrigation supply claim.</p></div></div>
        {state.regionalWater.length === 0 ? <p className="m-small">No regional observation recorded.</p> : <div className="m-table-wrap"><table className="m-table"><thead><tr><th>Block</th><th>Observation well</th><th>Observed</th><th>Depth below ground</th><th>Trend</th><th>Caveats</th></tr></thead><tbody>{state.regionalWater.map((observation) => <tr key={observation.id}><td>{observation.block}</td><td>{observation.observationWellId}</td><td>{shortDate(observation.observationDate)}</td><td>{observation.depthBelowGroundM} m</td><td>{observation.trend}</td><td>{regionalWaterCaveats(observation).join(' ')}</td></tr>)}</tbody></table></div>}
      </div>
    </section>}

    {tab === 'cultivation' && <section className="fi-stack">
      <div className="m-card">
        <div className="m-card-head"><div><h2>Planned versus actual inputs</h2><p className="m-small">Purchasing seed or planning fertiliser is not verified application. If no actual record exists, the application is unknown, not zero.</p></div>
          <label className="m-field fi-inline-field"><span>Plot</span><select className="m-select" value={cultivationPlotId} onChange={(event) => setCultivationPlotId(event.target.value)}>{data.plots.map((plot) => <option key={plot.id} value={plot.id}>{plot.name} · {plot.id}</option>)}</select></label>
        </div>
        <div className="fi-grid-3">
          <Metric label="Planned records" value={String(cultivationSummary.planned.length)} note="Intentions, not evidence of application." />
          <Metric label="Actual records" value={String(cultivationSummary.actual.length)} note={cultivationSummary.latestActualAt ? `Latest actual ${shortDate(cultivationSummary.latestActualAt)}` : 'No actual event recorded.'} />
          <Metric label="Unknown input categories" value={String(cultivationSummary.missing.length)} note={cultivationSummary.missing.map((item) => item.label).join(', ') || 'Seed, fertiliser and irrigation all have an actual record.'} />
        </div>
        <div className="fi-table-split">
          <CultivationTable title="Planned activities" events={cultivationSummary.planned} empty="No planned inputs or activities recorded." />
          <CultivationTable title="Actual records" events={cultivationSummary.actual} empty="No actual activity recorded. Inputs are unknown, not zero." />
        </div>
        {cultivationSummary.reviewFlags.length > 0 && <ul className="fi-caveats">{cultivationSummary.reviewFlags.map((flag) => <li key={flag}>{flag}</li>)}</ul>}
        {cultivationSummary.missing.length > 0 && <ul className="fi-caveats">{cultivationSummary.missing.map((item) => <li key={item.category}>{item.caveat}</li>)}</ul>}
      </div>

      <div className="m-card">
        <h2>Record an observation</h2>
        <p className="m-small">New records are synthetic workspace entries. Supply-impact revisions apply only to weeks on or after the effective date.</p>
        <CultivationForm
          key={cultivationPlotId}
          plotId={cultivationPlotId}
          defaultCrop={state.scenarios.find((s) => s.plotId === cultivationPlotId)?.cropName ?? 'Okra'}
          message={cultivationMessage}
          onSubmit={(event) => {
            const validation = validateCultivationEvent(event, today)
            if (!validation.valid) { setCultivationMessage(validation.errors.join(' ')); return }
            addCultivationEvent(event)
            setCultivationMessage(`Recorded ${event.status} ${cultivationKindLabel[event.kind].toLowerCase()}.${validation.warnings.length ? ` Review: ${validation.warnings.join(' ')}` : ''}`)
          }}
        />
      </div>
    </section>}

    {tab === 'projections' && <section className="fi-stack">
      <div className="m-card">
        <div className="m-card-head"><div><h2>Planting scenarios</h2><p className="m-small">A scenario is a proposal. Farmer consent is snapshotted, evidence is resolved at the decision date, and every published projection is kept as an immutable version.</p></div>
          <label className="m-field fi-inline-field"><span>Scenario</span><select className="m-select" value={selectedScenario?.id ?? ''} onChange={(event) => { setScenarioId(event.target.value); setVersionId(''); }}>{state.scenarios.map((scenario) => <option key={scenario.id} value={scenario.id}>{scenario.name}</option>)}</select></label>
        </div>
        {selectedScenario ? <div className="fi-scenario-summary">
          <div><small>Plot & area</small><strong>{selectedScenario.plotId}</strong><span>{selectedScenario.areaAcres.toFixed(2)} acres · {selectedScenario.name}</span></div>
          <div><small>Crop</small><strong>{selectedScenario.cropName} · {selectedScenario.variety}</strong><span>{selectedScenario.grade} · harvest {shortDate(selectedScenario.harvestStart)} to {shortDate(selectedScenario.harvestEnd)}</span></div>
          <div><small>Consent snapshot</small><strong>{selectedScenario.consent.status}</strong><span>{selectedScenario.consent.recordedAt ? `Recorded ${shortDate(selectedScenario.consent.recordedAt)}` : 'No consent date recorded.'}{selectedScenario.consent.note ? ` ${selectedScenario.consent.note}` : ''}</span></div>
          <div><small>Evidence at decision date</small><strong>{selectedScenario.evidence.status} · {selectedScenario.evidence.confidence} confidence</strong><span>{selectedScenario.evidence.refs.length} supporting records</span></div>
        </div> : <p className="m-small">No scenario exists yet. Create one below.</p>}
        {cropFit && <div className="fi-fit">
          <div className="fi-fit-head"><Tag status={cropFit.fit === 'good' ? 'verified' : cropFit.fit === 'caution' ? 'estimated' : 'failed'} label={`Crop fit: ${cropFit.fit}`} /><span className="m-small">Pre-sowing screen · rule {cropFit.ruleVersion}. Explanatory rules, not a calibrated probability.</span></div>
          <ul className="fi-fit-reasons">{cropFit.reasons.map((reason) => <li key={`${reason.code}-${reason.text}`} className={`tone-${reason.tone}`}><strong>{reason.tone === 'block' ? 'Block' : reason.tone === 'caution' ? 'Review' : 'Pass'}</strong><span>{reason.text}</span></li>)}</ul>
        </div>}
        <ScenarioForm plots={data.plots.map((plot) => ({ id: plot.id, name: plot.name, farmerId: plot.farmerId, location: plot.villageLocation, acres: plotAcres(plot) }))} onSaved={handleScenarioSaved} saveScenario={saveScenario} />
      </div>

      {selectedScenario && <div className="m-card">
        <div className="m-card-head"><div><h2>Versioned weekly supply projection</h2><p className="m-small">Gross, grade loss, marketable, committed share, retention, allocatable, consent-blocked and capacity-constrained quantities are separate columns. Grade loss is applied once.</p></div>
          {scenarioVersions.length > 1 && <label className="m-field fi-inline-field"><span>Version</span><select className="m-select" value={activeVersion?.id ?? ''} onChange={(event) => setVersionId(event.target.value)}>{scenarioVersions.map((version) => <option key={version.id} value={version.id}>v{version.version} · {shortDate(version.createdAt)} · {version.trigger}</option>)}</select></label>}
        </div>
        {activeVersion ? <>
          <div className="fi-version-meta">
            <Tag status={activeVersion.projection.consent.status === 'opted-in' ? 'verified' : 'failed'} label={`Consent: ${activeVersion.projection.consent.status}`} />
            <Tag status={activeVersion.projection.evidence.status} />
            <span className="m-tag m-tag-neutral">Uncertainty: {activeVersion.projection.uncertainty.level}</span>
            <span className="m-small">Published v{activeVersion.version} by {activeVersion.createdBy} on {shortDate(activeVersion.createdAt)}. {activeVersion.reason}</span>
          </div>
          <div className="fi-grid-4">
            <Metric label="Marketable supply" value={kg(activeVersion.projection.totals.marketableKg)} note="Gross minus grade loss, applied once." />
            <Metric label="Allocatable supply" value={kg(activeVersion.projection.totals.allocatableKg)} note={activeVersion.projection.consent.status === 'opted-in' ? 'Consent allows allocation.' : 'Consent withheld; allocatable is zero.'} />
            <Metric label="Consent blocked" value={kg(activeVersion.projection.totals.consentBlockedKg)} note="Retained for review, not allocated." />
            <Metric label="Capacity shortfall" value={kg(activeVersion.projection.totals.capacityShortfallKg)} note={activeVersion.projection.weeks[0]?.capacityKg == null ? 'No logistics capacity set.' : 'Above weekly logistics capacity.'} />
          </div>
          <div className="m-table-wrap"><table className="m-table fi-projection-table"><thead><tr><th>Week</th><th className="num">Gross</th><th className="num">Grade loss</th><th className="num">Marketable</th><th className="num">Committed</th><th className="num">Retained</th><th className="num">Allocatable</th><th className="num">Consent blocked</th><th className="num">Capacity</th><th className="num">Constrained</th><th className="num">Low</th><th className="num">High</th></tr></thead><tbody>
            {activeVersion.projection.weeks.map((week) => <tr key={week.weekStart}><td><strong>{shortDate(week.weekStart)}</strong><small>to {shortDate(week.weekEnd)}</small></td><td className="num">{kg(week.grossKg)}</td><td className="num">{kg(week.gradeLossKg)}</td><td className="num">{kg(week.marketableKg)}</td><td className="num">{kg(week.committedShareKg)}</td><td className="num">{kg(week.retainedKg)}</td><td className="num">{kg(week.allocatableKg)}</td><td className="num">{kg(week.consentBlockedKg)}</td><td className="num">{week.capacityKg == null ? 'Not set' : kg(week.capacityKg)}</td><td className="num">{kg(week.constrainedKg)}</td><td className="num">{kg(week.lowKg)}</td><td className="num">{kg(week.highKg)}</td></tr>)}
          </tbody></table></div>
          <div className="fi-two-col">
            <div><h3>Uncertainty</h3><p>{activeVersion.projection.uncertainty.basis}</p><ul className="fi-caveats">{activeVersion.projection.uncertainty.caveats.map((caveat) => <li key={caveat}>{caveat}</li>)}</ul></div>
            <div><h3>Evidence and assumptions</h3><ul className="fi-evidence-list">{activeVersion.projection.evidence.refs.map((ref) => <li key={ref.id}><Tag status={ref.status} /><span>{ref.label}<small>{ref.provenance.organisation} · {shortDate(ref.asOf)} · {ref.provenance.synthetic ? 'Synthetic' : ref.provenance.kind}</small></span></li>)}</ul><ul className="fi-caveats">{activeVersion.projection.assumptions.slice(0, 3).map((assumption) => <li key={assumption}>{assumption}</li>)}</ul></div>
          </div>
          {projectionMessage && <p className="fi-warning">{projectionMessage}</p>}
        </> : <p className="m-small">This scenario has no published projection version yet. Publish one to record its supply plan.</p>}
        <div className="fi-actions">
          <button type="button" className="m-btn m-btn-primary m-btn-sm" onClick={handlePublish}><ShieldCheck size={15} /> Publish new version</button>
          <span className="m-small">Publishing refreshes consent from the farmer record and keeps earlier versions unchanged.</span>
        </div>
      </div>}

      {selectedScenario && activeVersion && <div className="m-card">
        <h2>Revise from a cultivation observation</h2>
        <p className="m-small">A revision changes only weeks starting on or after the effective date. Weeks before the observation keep their published quantities.</p>
        <RevisionForm harvestStart={selectedScenario.harvestStart} onSubmit={(revision) => {
          try {
            const result = applyRevision(selectedScenario.id, revision, 'Workspace coordinator')
            setVersionId(result.version.id)
            setProjectionMessage(`Published v${result.version.version}. ${result.affectedWeeks} week(s) from ${shortDate(revision.effectiveFrom)} were revised; earlier weeks were unchanged.`)
          } catch (error) {
            setProjectionMessage(error instanceof Error ? error.message : 'Could not revise the projection.')
          }
        }} />
      </div>}
    </section>}
  </div>
}

function SoilSampleCard({ sample }: { sample: SoilSample }) {
  return <article className={`fi-sample ${sample.kind === 'mapped-estimate' ? 'fi-sample-estimate' : ''}`}>
    <header><div><strong>{sample.kind === 'mapped-estimate' ? 'Mapped estimate' : sample.kind === 'laboratory' ? 'Laboratory sample' : 'Field observation'}</strong><small>{shortDate(sample.sampledAt)} · {sample.depthFromCm}–{sample.depthToCm} cm · {sample.lab || 'Source not named'}</small></div><Tag status={sample.kind === 'mapped-estimate' ? 'estimated' : sample.kind === 'laboratory' ? 'verified' : 'reported'} /></header>
    <div className="m-table-wrap"><table className="m-table"><thead><tr><th>Analyte</th><th>Raw value</th><th>Normalised</th><th>Method</th></tr></thead><tbody>{sample.analytes.map((analyte) => <tr key={`${sample.id}-${analyte.code}`}><td>{analyte.label}<small>{analyte.basis}</small></td><td>{analyte.rawValue} {analyte.rawUnit}</td><td>{analyte.value == null ? 'Not converted' : `${analyte.value} ${analyte.unit}`}</td><td>{analyte.method || 'Not recorded'}</td></tr>)}</tbody></table></div>
    {sample.kind === 'mapped-estimate' && <p className="fi-warning"><AlertTriangle size={14} /> Mapped estimate only. It is not a laboratory test and cannot replace one.</p>}
  </article>
}

function WeatherTable({ records }: { records: { date: string; variable: string; value: number; unit: string; issuedAt: string | null; horizonDays: number | null }[] }) {
  const dates = [...new Set(records.map((record) => record.date))].sort()
  const valueOf = (date: string, variable: string) => records.find((record) => record.date === date && record.variable === variable)?.value
  return <div className="m-table-wrap"><table className="m-table"><thead><tr><th>Forecast date</th><th className="num">Min °C</th><th className="num">Max °C</th><th className="num">Rain mm</th><th>Issue time</th><th className="num">Horizon</th></tr></thead><tbody>{dates.map((date) => {
    const record = records.find((item) => item.date === date)
    return <tr key={date}><td>{shortDate(date)}</td><td className="num">{valueOf(date, 'temp_min_c') ?? 'Unknown'}</td><td className="num">{valueOf(date, 'temp_max_c') ?? 'Unknown'}</td><td className="num">{valueOf(date, 'rainfall_mm') ?? 'Unknown'}</td><td>{record?.issuedAt ? shortDate(record.issuedAt) : 'Not issued'}</td><td className="num">{record?.horizonDays == null ? 'Unknown' : `${record.horizonDays} days`}</td></tr>
  })}</tbody></table></div>
}

function CultivationTable({ title, events, empty }: { title: string; events: CultivationEvent[]; empty: string }) {
  return <div><h3>{title}</h3>{events.length === 0 ? <p className="m-small">{empty}</p> : <div className="m-table-wrap"><table className="m-table"><thead><tr><th>Activity</th><th>Date</th><th>Product</th><th className="num">Quantity</th><th>Evidence</th></tr></thead><tbody>{events.map((event) => <tr key={event.id}><td>{cultivationKindLabel[event.kind]}<small>{event.status} · {event.crop}</small></td><td>{shortDate(event.occurredOn ?? event.plannedFor)}</td><td>{event.product || 'Not recorded'}<small>{event.note}</small></td><td className="num">{event.quantity == null ? 'Unknown' : `${event.quantity} ${event.unit}`}</td><td><Tag status={event.evidence.status} /></td></tr>)}</tbody></table></div>}</div>
}

function CultivationForm({ plotId, defaultCrop, message, onSubmit }: {
  plotId: string
  defaultCrop: string
  message: string
  onSubmit: (event: CultivationEvent) => void
}) {
  const [kind, setKind] = useState<CultivationEventKind>('scouting')
  const [status, setStatus] = useState<'planned' | 'actual'>('actual')
  const [date, setDate] = useState(today)
  const [crop, setCrop] = useState(defaultCrop)
  const [product, setProduct] = useState('')
  const [activeIngredient, setActiveIngredient] = useState('')
  const [quantity, setQuantity] = useState('')
  const [unit, setUnit] = useState('')
  const [note, setNote] = useState('')
  const [revise, setRevise] = useState(false)
  const [effectiveFrom, setEffectiveFrom] = useState(today)
  const [adjustment, setAdjustment] = useState('-8')
  return <div className="fi-form-grid">
    <label className="m-field"><span>Activity</span><select className="m-select" value={kind} onChange={(event) => setKind(event.target.value as CultivationEventKind)}>{(Object.keys(cultivationKindLabel) as CultivationEventKind[]).map((value) => <option key={value} value={value}>{cultivationKindLabel[value]}</option>)}</select></label>
    <label className="m-field"><span>Record state</span><select className="m-select" value={status} onChange={(event) => setStatus(event.target.value as 'planned' | 'actual')}><option value="actual">Actual</option><option value="planned">Planned</option></select></label>
    <label className="m-field"><span>{status === 'actual' ? 'Happened on' : 'Planned for'}</span><input className="m-input" type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label>
    <label className="m-field"><span>Crop</span><input className="m-input" value={crop} onChange={(event) => setCrop(event.target.value)} /></label>
    <label className="m-field"><span>Product / activity</span><input className="m-input" value={product} onChange={(event) => setProduct(event.target.value)} placeholder="For example urea or field scouting" /></label>
    <label className="m-field"><span>Active ingredient</span><input className="m-input" value={activeIngredient} onChange={(event) => setActiveIngredient(event.target.value)} placeholder="Required for pesticide traceability" /></label>
    <label className="m-field"><span>Quantity & unit</span><div className="fi-inline-inputs"><input className="m-input" inputMode="decimal" value={quantity} onChange={(event) => setQuantity(event.target.value)} placeholder="0" aria-label="Quantity" /><input className="m-input" value={unit} onChange={(event) => setUnit(event.target.value)} placeholder="kg, litres, m³" aria-label="Unit" /></div></label>
    <label className="m-field"><span>Note</span><input className="m-input" value={note} onChange={(event) => setNote(event.target.value)} /></label>
    <label className="m-field fi-check"><span><input type="checkbox" checked={revise} onChange={(event) => setRevise(event.target.checked)} /> This observation revises future weekly supply</span><small>Only weeks on or after the effective date change.</small></label>
    {revise && <><label className="m-field"><span>Effective from</span><input className="m-input" type="date" value={effectiveFrom} onChange={(event) => setEffectiveFrom(event.target.value)} /></label>
      <label className="m-field"><span>Supply adjustment (%)</span><input className="m-input" inputMode="decimal" value={adjustment} onChange={(event) => setAdjustment(event.target.value)} /></label></>}
    <div className="fi-actions"><button type="button" className="m-btn m-btn-secondary m-btn-sm" onClick={() => {
      const quantityValue = quantity.trim() === '' ? null : Number(quantity)
      const adjustmentValue = Number(adjustment)
      const core = {
        id: `CULT-${Date.now().toString(36)}`, plotId, cropCycleId: null, crop, kind, status,
        occurredOn: status === 'actual' ? date : null, plannedFor: status === 'planned' ? date : null,
        product, activeIngredient, quantity: quantityValue, unit, nutrientBasis: 'unknown' as const, areaAcres: null,
        method: 'Manual workspace entry', stage: '', note, recordedAt: new Date().toISOString(),
        provenance: { sourceId: `MANUAL-${Date.now().toString(36)}`, kind: 'manual-import' as const, label: 'Manual workspace record', organisation: 'Local development workspace', capturedAt: date, receivedAt: new Date().toISOString(), method: 'Manual entry', reference: 'workspace', synthetic: true, note: 'Synthetic development record; not field-verified.' },
        supplyImpact: revise ? { effectiveFrom, yieldAdjustmentPct: adjustmentValue, note: note || 'Cultivation observation adjusts future supply.' } : null,
      }
      onSubmit({ ...core, evidence: cultivationEvidence(core) })
      setProduct(''); setActiveIngredient(''); setQuantity(''); setUnit(''); setNote(''); setRevise(false)
    }}><Sprout size={15} /> Record activity</button>{message && <span className="m-small">{message}</span>}</div>
  </div>
}

function WaterAccessEditor({ access, plotId, onSave }: { access: import('../farmdata/types').FarmWaterAccess | null; plotId: string; onSave: (access: import('../farmdata/types').FarmWaterAccess) => void }) {
  const [source, setSource] = useState(access?.source ?? 'borewell')
  const [rights, setRights] = useState(access?.rights ?? 'unknown')
  const [reliability, setReliability] = useState(access?.reliability ?? 'uncertain')
  const [discharge, setDischarge] = useState(access?.pumpDischargeLps?.toString() ?? '')
  const [hours, setHours] = useState(access?.pumpingHoursPerDay?.toString() ?? '')
  const [message, setMessage] = useState('')
  return <details className="fi-editor"><summary>Record farm water access for {plotId}</summary>
    <div className="fi-form-grid">
      <label className="m-field"><span>Source</span><select className="m-select" value={source} onChange={(event) => setSource(event.target.value as typeof source)}>{['borewell', 'open-well', 'canal', 'farm-pond', 'rainfed', 'shared-well', 'other'].map((value) => <option key={value}>{value}</option>)}</select></label>
      <label className="m-field"><span>Rights</span><select className="m-select" value={rights} onChange={(event) => setRights(event.target.value as typeof rights)}>{['documented', 'reported', 'none', 'unknown'].map((value) => <option key={value}>{value}</option>)}</select></label>
      <label className="m-field"><span>Reliability</span><select className="m-select" value={reliability} onChange={(event) => setReliability(event.target.value as typeof reliability)}>{['assured', 'seasonal', 'uncertain', 'none'].map((value) => <option key={value}>{value}</option>)}</select></label>
      <label className="m-field"><span>Pump discharge (litres/second)</span><input className="m-input" inputMode="decimal" value={discharge} onChange={(event) => setDischarge(event.target.value)} /></label>
      <label className="m-field"><span>Pumping hours/day</span><input className="m-input" inputMode="decimal" value={hours} onChange={(event) => setHours(event.target.value)} /></label>
    </div>
    <div className="fi-actions"><button type="button" className="m-btn m-btn-secondary m-btn-sm" onClick={() => {
      const numericDischarge = discharge.trim() === '' ? null : Number(discharge)
      const numericHours = hours.trim() === '' ? null : Number(hours)
      if ((numericDischarge != null && (!Number.isFinite(numericDischarge) || numericDischarge <= 0)) || (numericHours != null && (!Number.isFinite(numericHours) || numericHours <= 0))) { setMessage('Pump discharge and pumping hours must be positive numbers when provided.'); return }
      onSave({
        id: access?.id ?? `WATER-${Date.now().toString(36)}`, plotId, source, rights, reliability,
        pumpDischargeLps: numericDischarge, pumpingHoursPerDay: numericHours, storageM3: access?.storageM3 ?? null,
        sharedAllocationPct: access?.sharedAllocationPct ?? null, irrigationMethod: access?.irrigationMethod ?? '',
        measuredAt: today,
        provenance: { sourceId: `WATER-${Date.now().toString(36)}`, kind: 'manual-import', label: 'Manual workspace record', organisation: 'Local development workspace', capturedAt: today, receivedAt: new Date().toISOString(), method: 'Manual entry', reference: 'workspace', synthetic: true, note: 'Synthetic development record, not a verified field measurement.' },
        note: 'Synthetic workspace record. Rights and capacity are not field-verified.',
      })
      setMessage('Water access saved. Feasibility is recalculated from the farm record; regional wells remain context only.')
    }}>Save water access</button>{message && <span className="m-small">{message}</span>}</div>
  </details>
}

function ScenarioForm({ plots, saveScenario, onSaved }: {
  plots: { id: string; name: string; farmerId: string; location: string; acres: number }[]
  saveScenario: (input: ScenarioDraftInput, existingId?: string) => { id: string }
  onSaved: (id: string) => void
}) {
  const [open, setOpen] = useState(false)
  const first = plots[0]
  const [form, setForm] = useState<ScenarioDraftInput>({
    name: first ? `New scenario for ${first.name}` : 'New planting scenario', plotId: first?.id ?? '', farmerId: first?.farmerId ?? '',
    cropId: 'okra', variety: 'Arka Anamika', grade: 'Grade A', areaAcres: first?.acres ?? 1,
    plantingDate: addDays(today, 10), harvestStart: addDays(today, 60), harvestEnd: addDays(today, 125), decisionDate: today,
    gradeEligibleFraction: 0.88, committedShareFraction: 0.85, retentionFactor: 0.96, logisticsCapacityKgPerWeek: 2000,
    yieldOverrideKgPerAcre: null, yieldOverrideNote: 'Indicative crop reference; no reviewed farm yield observation.',
  })
  const [message, setMessage] = useState('')
  const set = <K extends keyof ScenarioDraftInput>(key: K, value: ScenarioDraftInput[K]) => setForm((current) => ({ ...current, [key]: value }))
  return <details className="fi-editor" open={open} onToggle={(event) => setOpen((event.target as HTMLDetailsElement).open)}><summary>Create a planting scenario</summary>
    <div className="fi-form-grid">
      <label className="m-field"><span>Scenario name</span><input className="m-input" value={form.name} onChange={(event) => set('name', event.target.value)} /></label>
      <label className="m-field"><span>Plot</span><select className="m-select" value={form.plotId} onChange={(event) => { const plot = plots.find((p) => p.id === event.target.value); if (plot) setForm((current) => ({ ...current, plotId: plot.id, farmerId: plot.farmerId, areaAcres: plot.acres })) }}>{plots.map((plot) => <option key={plot.id} value={plot.id}>{plot.name} · {plot.id}</option>)}</select></label>
      <label className="m-field"><span>Crop</span><select className="m-select" value={form.cropId} onChange={(event) => { const crop = crops.find((c) => c.id === event.target.value); if (crop) setForm((current) => ({ ...current, cropId: crop.id, variety: crop.defaultVariety })) }}>{crops.filter((crop) => !crop.perennial).map((crop) => <option key={crop.id} value={crop.id}>{crop.name}</option>)}</select></label>
      <label className="m-field"><span>Variety & grade</span><div className="fi-inline-inputs"><input className="m-input" value={form.variety} onChange={(event) => set('variety', event.target.value)} aria-label="Variety" /><input className="m-input" value={form.grade} onChange={(event) => set('grade', event.target.value)} aria-label="Grade" /></div></label>
      <label className="m-field"><span>Area (acres)</span><input className="m-input" inputMode="decimal" value={form.areaAcres} onChange={(event) => set('areaAcres', Number(event.target.value))} /></label>
      <label className="m-field"><span>Decision date</span><input className="m-input" type="date" value={form.decisionDate} onChange={(event) => set('decisionDate', event.target.value)} /></label>
      <label className="m-field"><span>Planting date</span><input className="m-input" type="date" value={form.plantingDate} onChange={(event) => set('plantingDate', event.target.value)} /></label>
      <label className="m-field"><span>Harvest window</span><div className="fi-inline-inputs"><input className="m-input" type="date" value={form.harvestStart} onChange={(event) => set('harvestStart', event.target.value)} aria-label="Harvest start" /><input className="m-input" type="date" value={form.harvestEnd} onChange={(event) => set('harvestEnd', event.target.value)} aria-label="Harvest end" /></div></label>
      <label className="m-field"><span>Grade-eligible fraction</span><input className="m-input" inputMode="decimal" value={form.gradeEligibleFraction} onChange={(event) => set('gradeEligibleFraction', Number(event.target.value))} /></label>
      <label className="m-field"><span>Committed share fraction</span><input className="m-input" inputMode="decimal" value={form.committedShareFraction} onChange={(event) => set('committedShareFraction', Number(event.target.value))} /></label>
      <label className="m-field"><span>Retention availability factor</span><input className="m-input" inputMode="decimal" value={form.retentionFactor} onChange={(event) => set('retentionFactor', Number(event.target.value))} /></label>
      <label className="m-field"><span>Weekly logistics capacity (kg)</span><input className="m-input" inputMode="decimal" value={form.logisticsCapacityKgPerWeek ?? ''} onChange={(event) => set('logisticsCapacityKgPerWeek', event.target.value.trim() === '' ? null : Number(event.target.value))} /></label>
    </div>
    <div className="fi-actions"><button type="button" className="m-btn m-btn-primary m-btn-sm" onClick={() => {
      try {
        const saved = saveScenario(form)
        setMessage('Scenario saved. Its consent snapshot and evidence are fixed until it is saved again or a new version is published.')
        onSaved(saved.id)
      } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not save the scenario.') }
    }}><Sprout size={15} /> Save scenario</button>{message && <span className="m-small">{message}</span>}</div>
  </details>
}

function RevisionForm({ harvestStart, onSubmit }: { harvestStart: string; onSubmit: (revision: import('../farmdata/types').ProjectionRevision) => void }) {
  const [effectiveFrom, setEffectiveFrom] = useState(harvestStart)
  const [adjustment, setAdjustment] = useState('-8')
  const [note, setNote] = useState('Cultivation observation reduces marketable supply from the effective date.')
  return <div className="fi-form-grid">
    <label className="m-field"><span>Observation kind</span><input className="m-input" value="Cultivation observation" readOnly /></label>
    <label className="m-field"><span>Effective from</span><input className="m-input" type="date" value={effectiveFrom} onChange={(event) => setEffectiveFrom(event.target.value)} /></label>
    <label className="m-field"><span>Supply adjustment (%)</span><input className="m-input" inputMode="decimal" value={adjustment} onChange={(event) => setAdjustment(event.target.value)} /></label>
    <label className="m-field"><span>Note</span><input className="m-input" value={note} onChange={(event) => setNote(event.target.value)} /></label>
    <div className="fi-actions"><button type="button" className="m-btn m-btn-secondary m-btn-sm" onClick={() => {
      const value = Number(adjustment)
      if (!Number.isFinite(value) || value < -100 || value > 100) return
      onSubmit({ id: `REVISION-${Date.now().toString(36)}`, observationKind: 'Cultivation observation', observedOn: today, effectiveFrom, yieldAdjustmentPct: value, note, cultivationEventId: null })
    }}><ThermometerSun size={15} /> Apply revision</button></div>
  </div>
}

