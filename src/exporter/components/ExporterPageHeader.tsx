import type { ReactNode } from 'react'

export default function ExporterPageHeader({ eyebrow, title, description, actions }: { eyebrow: string; title: string; description: string; actions?: ReactNode }) {
  return <header className="e-page-head">
    <div><p className="e-eyebrow">{eyebrow}</p><h1>{title}</h1><p className="e-page-description">{description}</p></div>
    {actions && <div className="e-page-actions">{actions}</div>}
  </header>
}
