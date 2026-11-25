import { ArrowRight, Building2, PackageCheck, Sprout } from 'lucide-react'
import { Link } from 'react-router-dom'
import { MerakiMark } from '../../components/ui'
import { useI18n } from '../../i18n'
import LanguageSelector from '../../i18n/LanguageSelector'

export default function SegmentSelection() {
  const { t } = useI18n()
  return <main className="e-entry">
    <LanguageSelector className="m-lang e-entry-language" />
    <div className="e-entry-brand"><MerakiMark size={44} /><span>Meraki</span></div>
    <div className="e-entry-content">
      <p className="e-eyebrow">{t('entry_eyebrow')}</p>
      <h1>{t('entry_title')}</h1>
      <p className="e-entry-lead">{t('entry_lead')}</p>
      <div className="e-segment-grid">
        <Link to="/fpo" className="e-segment-card">
          <span className="e-segment-icon"><Sprout size={25} /></span>
          <span className="e-eyebrow">{t('entry_supply_eyebrow')}</span>
          <strong>{t('entry_fpo_title')}</strong>
          <span>{t('entry_fpo_desc')}</span>
          <span className="e-segment-cta">{t('entry_fpo_action')} <ArrowRight size={17} /></span>
        </Link>
        <Link to="/exporter" className="e-segment-card e-segment-exporter">
          <span className="e-segment-icon"><Building2 size={25} /></span>
          <span className="e-eyebrow">{t('entry_procurement_eyebrow')}</span>
          <strong>{t('entry_exporter_title')}</strong>
          <span>{t('entry_exporter_desc')}</span>
          <span className="e-segment-cta">{t('entry_exporter_action')} <ArrowRight size={17} /></span>
        </Link>
      </div>
      <div className="e-entry-foot"><PackageCheck size={17} /> {t('entry_synthetic')}</div>
    </div>
  </main>
}
