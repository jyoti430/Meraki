import { useState } from 'react'
import { Link } from 'react-router-dom'
import { artifact, defaultInput, defaultSupply, predictSynthetic, projectSynthetic } from '../yieldPoc/model'
import type { YieldInput, SupplyAssumptions } from '../yieldPoc/model'
import './YieldPoc.css'

const fmt = (value: number) => Math.round(value).toLocaleString('en-IN')
const start = Object.fromEntries(Object.entries({ ...defaultInput, ...defaultSupply }).map(([key, value]) => [key, String(value)]))
function calculate(values: Record<string, string>, consent: boolean) {
  const number = (key: string) => {
    if (!values[key]?.trim()) throw new Error('Complete every numeric input; a missing value is not zero.')
    const value = Number(values[key])
    if (!Number.isFinite(value)) throw new Error('All inputs must be finite numbers.')
    return value
  }
  const input = Object.fromEntries(artifact.inputs.map(field => [field.key, number(field.key)])) as unknown as YieldInput
  const scenario: SupplyAssumptions = { areaHa: number('areaHa'), gradePct: number('gradePct'), committedPct: number('committedPct'),
    retentionPct: number('retentionPct'), capacityKgWeek: number('capacityKgWeek'), consent }
  const prediction = predictSynthetic(input)
  return { prediction, weekly: projectSynthetic(prediction.yieldKgHa, scenario) }
}

function TestPlot() {
  const max = Math.ceil(Math.max(...artifact.test_results.flatMap(row => [row.actual, row.predicted])) / 1000) * 1000
  const x = (v: number) => 45 + v / max * 390
  const y = (v: number) => 245 - v / max * 210
  return <svg viewBox="0 0 480 290" role="img" aria-label="Predicted versus invented harvest on 40 synthetic test farms; closer to the diagonal means smaller simulation error">
    <path d="M45 25V245H450" fill="none" stroke="#9cafab" />
    <path d={`M45 245L${x(max)} ${y(max)}`} fill="none" stroke="#b5a579" strokeDasharray="5 5" />
    {artifact.test_results.map(row => <circle key={row.record_id} cx={x(row.actual)} cy={y(row.predicted)} r="4" fill="#2f795e" opacity=".7"><title>{row.record_id}: invented {fmt(row.actual)}, predicted {fmt(row.predicted)} kg/ha</title></circle>)}
    <text x="45" y="263">0</text><text x="400" y="263">{fmt(max)}</text>
    <text x="150" y="285">Invented harvest · kg/ha</text><text x="15" y="23">Predicted · kg/ha</text>
  </svg>
}

export default function YieldPoc() {
  const [values, setValues] = useState<Record<string, string>>(start)
  const [consent, setConsent] = useState(true)
  const [result, setResult] = useState<ReturnType<typeof calculate> | null>(() => calculate(start, true))
  const [error, setError] = useState('')
  const change = (key: string, value: string) => { setValues(current => ({ ...current, [key]: value })); setResult(null); setError('') }
  const metric = artifact.test_metrics
  const baseline = artifact.baseline_test_metrics
  return <div className="m-page yp-page">
    <header className="yp-heading"><div><div className="m-eyebrow">SYNTHETIC MACHINE LEARNING DEMO</div><h1 className="m-h1">From dummy farms to a yield forecast</h1><p className="m-lead">A fitted model, held-out evaluation and an interactive supply scenario. Okra · fictional region · pre-sowing gross yield.</p></div><Link className="m-btn" to="/live-data">Real-data readiness</Link></header>
    <aside className="yp-notice"><strong>POC only · trained entirely on invented data</strong><p>The model learns a made-up relationship, not real agronomy. These scores do not establish farm accuracy. It cannot publish a planting plan, reserve stock or replace the existing planner.</p></aside>
    <ol className="yp-pipeline"><li>1,200 dummy seasons</li><li>480 training rows</li><li>40 validation rows</li><li>40 test rows</li><li>Browser inference</li></ol>
    <section className="m-card yp-section"><h2>What was trained?</h2><p>Standardized ridge regression learns six weights and an intercept from invented harvest labels. pH and temperature have explicit squared-deviation terms. Four regularization settings are compared using validation data; test harvests never choose the weights.</p><div className="yp-stats">
      <div><small>Training</small><strong>{artifact.split.train.rows} rows</strong><span>160 farms · 2021–2023</span></div>
      <div><small>Validation</small><strong>40 rows</strong><span>40 different farms · 2024</span></div>
      <div><small>Test</small><strong>40 rows</strong><span>40 unseen farms · 2025</span></div>
      <div><small>Excluded from fitting/scoring</small><strong>{artifact.split.excluded.rows} rows</strong><span>Unused farm/season combinations</span></div>
    </div><p>All features are fictional pre-decision soil, irrigation plans or prior climate references. No future observed weather or later management is supplied. Random farm effects, noise and simulated crop failures make the labels imperfect; zero harvests are retained.</p>
      <details><summary>Inspect the dataset, fitted weights and generator</summary><p>Seed {artifact.seed} · {artifact.version} · selected regularization {artifact.model.lambda}. Downloads contain only generated dummy records.</p><p><a href="/poc/synthetic-farm-seasons.csv" download>Download 1,200 dummy farm seasons (CSV)</a> · <a href="/poc/synthetic-model-card.json" download>Download fitted model and evaluation (JSON)</a></p><p>The generator invents a nonlinear equation with farm effects and noise. Feature engineering reflects that invented equation, so good results are expected by construction and do not validate a real model.</p><div className="yp-scroll"><table><caption>First five training records · all synthetic</caption><thead><tr><th>Dummy record</th><th>pH</th><th>Carbon %</th><th>Irrigation %</th><th>Invented yield kg/ha</th></tr></thead><tbody>{artifact.sample_rows.map(row => <tr key={row.record_id}><td>{row.record_id}</td><td>{row.soil_ph}</td><td>{row.organic_carbon_pct}</td><td>{row.planned_irrigation_pct}</td><td>{fmt(row.yield_kg_ha)}</td></tr>)}</tbody></table></div><p className="m-small">Dataset SHA-256: <code className="yp-hash">{artifact.dataset_sha256}</code>. Reproduce with <code>python scripts/train_synthetic_yield.py</code>.</p></details>
    </section>
    <section className="m-card yp-section"><h2>Held-out results · synthetic outcomes only</h2><div className="yp-evaluation"><div><div className="yp-stats"><div><small>Model mean absolute error</small><strong>{fmt(metric.mae_kg_ha)} kg/ha</strong><span>Lower is better within this simulation</span></div><div><small>Training-median baseline error</small><strong>{fmt(baseline.mae_kg_ha)} kg/ha</strong><span>Same 40 test records</span></div><div><small>Model R²</small><strong>{metric.r2}</strong><span>Explained synthetic variation</span></div><div><small>Model RMSE</small><strong>{fmt(metric.rmse_kg_ha)} kg/ha</strong><span>Penalizes larger errors</span></div></div><p>Signed prediction bias: {fmt(metric.bias_kg_ha)} kg/ha. A score here measures how well the model recovers our generator. It is not “accuracy on real farms”.</p></div><TestPlot /></div></section>
    <form className="m-card yp-section" onSubmit={event => { event.preventDefault(); try { setResult(calculate(values, consent)); setError('') } catch (reason) { setResult(null); setError(reason instanceof Error ? reason.message : 'Invalid scenario.') } }} noValidate>
      <h2>Try a dummy farm</h2><p>Edit the fictional inputs, then run the fitted model. Out-of-range and missing values are rejected instead of extrapolated.</p>
      <div className="yp-fields">{artifact.inputs.map(field => <label key={field.key}>{field.label}<input type="number" step="any" min={field.min} max={field.max} value={values[field.key]} onChange={event => change(field.key, event.target.value)} /><small>{field.unit} · demo range {field.min}–{field.max}</small></label>)}</div>
      <h3>Convert gross yield into a supply scenario</h3><p>These assumptions are separate from the learned yield model. They do not represent a real buyer commitment or laboratory grade assessment.</p>
      <div className="yp-fields">{[{ key: 'areaHa', label: 'Dummy plot area (ha)' }, { key: 'gradePct', label: 'Assumed grade-eligible share (%)' }, { key: 'committedPct', label: 'Assumed FPO-committed share (%)' }, { key: 'retentionPct', label: 'Assumed handling retention (%)' }, { key: 'capacityKgWeek', label: 'Weekly logistics capacity (kg)' }].map(field => <label key={field.key}>{field.label}<input type="number" step="any" value={values[field.key]} onChange={event => change(field.key, event.target.value)} /></label>)}</div>
      <label className="yp-consent"><input type="checkbox" checked={consent} onChange={event => { setConsent(event.target.checked); setResult(null) }} />Assume farmer consent for this dummy scenario</label>
      <button className="m-btn m-btn-primary" type="submit">Run synthetic prediction</button>{error && <p role="alert" className="yp-error">{error}</p>}{!result && !error && <p role="status">Inputs changed. Run again to update the prediction.</p>}
    </form>
    {result && <section className="m-card yp-section" aria-label="Synthetic prediction result" aria-live="polite"><h2>Dummy prediction · not farm advice</h2><div className="yp-stats"><div><small>Predicted gross yield</small><strong>{fmt(result.prediction.yieldKgHa)} kg/ha</strong><span>Fitted synthetic ridge model</span></div><div><small>Illustrative residual band</small><strong>{fmt(result.prediction.lowKgHa)}–{fmt(result.prediction.highKgHa)}</strong><span>kg/ha · not calibrated uncertainty</span></div><div><small>Gross dummy harvest</small><strong>{fmt(result.weekly.reduce((sum, row) => sum + row.grossKg, 0))} kg</strong><span>Yield × entered plot area</span></div><div><small>Constrained scenario supply</small><strong>{fmt(result.weekly.reduce((sum, row) => sum + row.supplyKg, 0))} kg</strong><span>No reservation or order is created</span></div></div>
      <p>The band is ± the 90th-percentile absolute error on 40 synthetic validation rows; no farm coverage guarantee is implied.</p>
      <details><summary>Explain this model output</summary><p>Training-derived intercept {fmt(result.prediction.intercept)} kg/ha, plus the following centered-feature contributions. These are model arithmetic, not causal treatment effects.</p><ul>{result.prediction.contributions.map(item => <li key={item.label}>{item.label}: {item.value >= 0 ? '+' : '−'}{fmt(Math.abs(item.value))} kg/ha</li>)}</ul><p>Raw total {fmt(result.prediction.rawYield)}; negative gross predictions are clipped to zero.</p></details>
      <h3>Ten-week supply illustration</h3><p>Invented picking curve → grade once → committed share → handling retention → consent → weekly capacity. Week numbers are illustrative, not harvest-date predictions.</p><div className="yp-scroll"><table><caption>Dummy supply scenario · kg; display values rounded independently</caption><thead><tr><th>Week</th><th>Gross</th><th>Grade loss</th><th>Committed</th><th>Handling loss</th><th>Consent withheld</th><th>Capacity shortfall</th><th>Scenario supply</th></tr></thead><tbody>{result.weekly.map(row => <tr key={row.week}><td>{row.week}</td><td>{fmt(row.grossKg)}</td><td>{fmt(row.gradeLossKg)}</td><td>{fmt(row.committedKg)}</td><td>{fmt(row.handlingLossKg)}</td><td>{fmt(row.consentBlockedKg)}</td><td>{fmt(row.capacityShortfallKg)}</td><td>{fmt(row.supplyKg)}</td></tr>)}</tbody></table></div></section>}
    <footer className="yp-notice"><strong>What changes for a real model?</strong><p>Replace invented records with consented measured plot-season outcomes, review feature availability and agronomy, evaluate independent farms/seasons, then run a monitored shadow pilot. The real-data validation report still has zero eligible farm outcomes and production promotion remains disabled.</p></footer>
  </div>
}
