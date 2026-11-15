import { Bell, ChevronDown } from 'lucide-react'

type HeaderProps = { title: string; description: string }

export default function Header({ title, description }: HeaderProps) {
  return (
    <header className="topbar">
      <div className="page-heading"><div className="eyebrow">FPO MANAGER WORKSPACE</div><h1>{title}</h1><p>{description}</p></div>
      <div className="topbar-actions">
        <button className="icon-button notification-button" aria-label="Notifications"><Bell size={19} /><span className="notification-dot" /></button>
        <div className="topbar-divider" />
        <button className="profile-button" aria-label="User profile menu"><div className="avatar">DM</div><span className="profile-copy"><strong>Demo Manager</strong><small>FPO Manager</small></span><ChevronDown size={15} className="profile-chevron" /></button>
      </div>
    </header>
  )
}
