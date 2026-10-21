import { useEffect, useState, type ReactNode } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { subscribeSync, syncNow, type SyncStatus } from '../lib/sync'

export function SyncPill() {
  const [s, setS] = useState<SyncStatus | null>(null)
  useEffect(() => subscribeSync(setS), [])
  if (!s) return null
  const cls = !s.online ? 'offline' : s.lastError ? 'error' : s.running ? 'running' : ''
  const label = !s.online
    ? `Hors ligne${s.pending ? ` · ${s.pending} en attente` : ''}`
    : s.running
      ? 'Sync…'
      : s.lastError
        ? 'Erreur sync'
        : s.pending
          ? `${s.pending} en attente`
          : 'Synchronisé'
  return (
    <button className={`syncpill ${cls}`} onClick={() => void syncNow()} title={s.lastError ?? ''} style={{ minHeight: 0 }}>
      <span className="dot" /> {label}
    </button>
  )
}

export function Page({
  title,
  back,
  children,
  right,
  full,
  className,
}: {
  title: string
  back?: string | true
  children: ReactNode
  right?: ReactNode
  full?: boolean
  className?: string
}) {
  const nav = useNavigate()
  return (
    <div className="app">
      <header className="topbar">
        {back && (
          <button className="back" aria-label="Retour" onClick={() => (back === true ? nav(-1) : nav(back))}>
            ‹
          </button>
        )}
        <h1>{title}</h1>
        {right}
        <SyncPill />
      </header>
      <main className={`content${full ? ' full' : ''}${className ? ` ${className}` : ''}`}>{children}</main>
      <BottomNav />
    </div>
  )
}

const Icon = {
  home: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 11l9-8 9 8v10a1 1 0 0 1-1 1h-5v-7h-6v7H4a1 1 0 0 1-1-1z" />
    </svg>
  ),
  dashboard: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="9" rx="1.5" />
      <rect x="14" y="3" width="7" height="5" rx="1.5" />
      <rect x="14" y="12" width="7" height="9" rx="1.5" />
      <rect x="3" y="16" width="7" height="5" rx="1.5" />
    </svg>
  ),
  chrono: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="13" r="8" />
      <path d="M12 9v4l3 2M9 2h6M12 2v3" />
    </svg>
  ),
  trophy: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0zM7 6H4v2a3 3 0 0 0 3 3M17 6h3v2a3 3 0 0 1-3 3" />
    </svg>
  ),
  chart: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 3v18h18M7 15l4-5 3 3 5-7" />
    </svg>
  ),
  more: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="5" cy="12" r="1.5" />
      <circle cx="12" cy="12" r="1.5" />
      <circle cx="19" cy="12" r="1.5" />
    </svg>
  ),
}

export function BottomNav() {
  return (
    <nav className="bottomnav">
      <NavLink to="/" end>
        {Icon.home}Accueil
      </NavLink>
      <NavLink to="/tableau" aria-label="Tableau de bord">
        {Icon.dashboard}Tableau
      </NavLink>
      <NavLink to="/chrono">{Icon.chrono}Chrono</NavLink>
      <NavLink to="/competitions">{Icon.trophy}Compétitions</NavLink>
      <NavLink to="/historique">{Icon.chart}Historique</NavLink>
      <NavLink to="/plus">{Icon.more}Plus</NavLink>
    </nav>
  )
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <div className="field">
      <label>{label}</label>
      {children}
      {hint && <small>{hint}</small>}
    </div>
  )
}
