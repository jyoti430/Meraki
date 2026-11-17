import { useState } from 'react'
import { buildCropOutlook } from '../yieldPoc/cropOutlook'
import './YieldPoc.css'

const fmt = (value: number) => Math.round(value).toLocaleString('en-IN')

type Outlook = { areaHa: number; crops: ReturnType<typeof buildCropOutlook> }

export default function YieldPoc() {
  const [area, setArea] = useState('1')
  const [result, setResult] = useState<Outlook | null>(null)
  const [error, setError] = useState('')

  return <div className="m-page yp-page">
    <header className="yp-heading"><div>
      <div className="m-eyebrow">CROP PLANNING</div>
      <h1 className="m-h1">Crop yield outlook</h1>
      <p className="m-lead">Explore seven crop options and their expected harvest for your plot area.</p>
    </div></header>

    <form className="m-card yp-section" noValidate onSubmit={event => {
      event.preventDefault()
      try {
        const areaHa = Number(area)
        const crops = buildCropOutlook(areaHa)
        setResult({ areaHa, crops })
        setError('')
      } catch (reason) {
        setResult(null)
        setError(reason instanceof Error ? reason.message : 'Check the plot area and try again.')
      }
    }}>
      <h2>Plan your crop options</h2>
      <p>Enter the land area to compare expected yields across crops.</p>
      <div className="yp-fields yp-area-field"><label>Plot area (ha)
        <input type="number" min="0.01" max="100" step="any" required value={area}
          aria-invalid={Boolean(error)} aria-describedby={error ? 'yield-area-error' : 'yield-area-help'}
          onChange={event => { setArea(event.target.value); setResult(null); setError('') }} />
        <small id="yield-area-help">1 hectare = 10,000 square metres</small>
      </label></div>
      <button className="m-btn m-btn-primary" type="submit">Run synthesis</button>
      {error && <p id="yield-area-error" role="alert" className="yp-error">{error}</p>}
    </form>

    <div aria-live="polite" aria-atomic="true">
      {result ? <section className="m-card yp-section" aria-label="Crop yield results">
        <h2>Expected crop yields</h2>
        <p>7 crop options · {result.areaHa.toLocaleString('en-IN')} ha · Scenario estimates</p>
        <div className="yp-crop-grid">{result.crops.map(row => <article className="yp-crop-card" key={row.crop}>
          <h3>{row.crop}</h3>
          <dl><div><dt>Expected yield</dt><dd>{fmt(row.yieldKgHa)} <span>kg/ha</span></dd></div>
          <div><dt>Expected harvest</dt><dd>{fmt(row.harvestKg)} <span>kg</span></dd></div></dl>
        </article>)}</div>
        <p className="m-small">Fixed reference yields are used for this comparison. Expected harvest = yield per hectare × plot area; these estimates do not assess plot-specific suitability.</p>
      </section> : <p className="m-small" role="status">Run synthesis to see crop options and expected yields.</p>}
    </div>
  </div>
}
