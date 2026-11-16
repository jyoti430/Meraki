export default function StatusBadge({ children, tone = 'neutral' }: { children: string; tone?: 'neutral' | 'good' | 'warn' | 'muted' }) {
  return <span className={`e-status e-status-${tone}`}>{children}</span>
}
