import { Info } from 'lucide-react'
import type { ReactNode } from 'react'

export default function DemoNotice({ children }: { children: ReactNode }) {
  return <div className="e-demo-notice" role="note"><Info size={18} aria-hidden="true" /><div>{children}</div></div>
}
