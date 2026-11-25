import type { ReactNode } from 'react'
import { useI18n } from '../../i18n'

export function EntityField({ label, required, error, hint, children }: { label: string; required?: boolean; error?: string; hint?: string; children: ReactNode }) {
  const { t } = useI18n()
  return <label className="entity-field"><span className="entity-field-label">{label}{required && <i>{t('f_form_required')}</i>}</span>{children}{hint && <small className="entity-field-hint">{hint}</small>}{error && <small className="entity-field-error">{error}</small>}</label>
}

export function EntitySection({ number, title, description, children }: { number: string; title: string; description: string; children: ReactNode }) {
  return <section className="entity-form-section"><header><span>{number}</span><div><h3>{title}</h3><p>{description}</p></div></header><div className="entity-form-section-content">{children}</div></section>
}

export function EntityAlert({ children }: { children: ReactNode }) {
  return <div className="entity-form-alert" role="alert">{children}</div>
}
