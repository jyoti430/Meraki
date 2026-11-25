import { useState } from 'react'
import { Link } from 'react-router-dom'
import { buildCropOutlook } from '../yieldPoc/cropOutlook'
import { cropLabel, formatNumber, useI18n } from '../i18n'
import './YieldPoc.css'

type Outlook = { areaHa: number; crops: ReturnType<typeof buildCropOutlook> }

export default function YieldPoc() {
  const { t, lang } = useI18n()
  const [area, setArea] = useState('1')
  const [result, setResult] = useState<Outlook | null>(null)
  const [error, setError] = useState('')

  return <div className="m-page yp-page">
    <header className="yp-heading"><div>
      <div className="m-eyebrow">{t('entry_eyebrow')}</div>
      <h1 className="m-h1">{t('yield_outlook_title')}</h1>
      <p className="m-lead">{t('yield_outlook_intro')} <Link to="/plan">{t('planting_title')}</Link>.</p>
    </div></header>

    <form className="m-card yp-section" noValidate onSubmit={event => {
      event.preventDefault()
      try {
        const areaHa = Number(area)
        const crops = buildCropOutlook(areaHa)
        setResult({ areaHa, crops })
        setError('')
      } catch {
        setResult(null)
        setError(t('yield_outlook_invalid_area'))
      }
    }}>
      <h2>{t('yield_plan_options')}</h2>
      <p>{t('yield_area_prompt')}</p>
      <div className="yp-fields yp-area-field"><label>{t('yield_plot_area')}
        <input type="number" min="0.01" max="100" step="any" required value={area}
          aria-invalid={Boolean(error)} aria-describedby={error ? 'yield-area-error' : 'yield-area-help'}
          onChange={event => { setArea(event.target.value); setResult(null); setError('') }} />
        <small id="yield-area-help">{t('yield_hectare_help')}</small>
      </label></div>
      <button className="m-btn m-btn-primary" type="submit">{t('yield_compare')}</button>
      {error && <p id="yield-area-error" role="alert" className="yp-error">{error}</p>}
    </form>

    <div aria-live="polite" aria-atomic="true">
      {result ? <section className="m-card yp-section" aria-label={t('yield_results_aria')}>
        <h2>{t('yield_expected_heading')}</h2>
        <p>{t('yield_options_area', { count: formatNumber(result.crops.length, lang), area: formatNumber(result.areaHa, lang) })} · {t('yield_scenario_estimates')}</p>
        <div className="yp-crop-grid">{result.crops.map(row => <article className="yp-crop-card" key={row.crop}>
          <h3>{cropLabel(row.crop, t)}</h3>
          <dl><div><dt>{t('yield_per_hectare')}</dt><dd>{formatNumber(Math.round(row.yieldKgHa), lang)} <span>kg/ha</span></dd></div>
          <div><dt>{t('yield_expected_harvest')}</dt><dd>{formatNumber(Math.round(row.harvestKg), lang)} <span>kg</span></dd></div></dl>
        </article>)}</div>
        <p className="m-small">{t('yield_reference_disclaimer')}</p>
      </section> : <p className="m-small" role="status">{t('yield_empty_help')}</p>}
    </div>
  </div>
}
