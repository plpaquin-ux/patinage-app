import { useState, type FormEvent } from 'react'
import { useAuth } from '../auth/AuthContext'
import { Field } from '../components/Layout'

export function Logo() {
  return (
    <svg className="logo" viewBox="0 0 64 64" aria-hidden>
      <rect width="64" height="64" rx="16" fill="#0ea5e9" />
      <path d="M14 42c6-2 10-8 14-14s8-12 20-12" stroke="#fff" strokeWidth="5" fill="none" strokeLinecap="round" />
      <circle cx="46" cy="18" r="4" fill="#fff" />
      <path d="M12 48h40" stroke="#fff" strokeWidth="4" strokeLinecap="round" opacity=".7" />
    </svg>
  )
}

export default function LoginPage() {
  const { signIn, signUp } = useAuth()
  const [mode, setMode] = useState<'in' | 'up'>('in')
  const [email, setEmail] = useState('')
  const [pwd, setPwd] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setMsg(null)
    const err = mode === 'in' ? await signIn(email.trim(), pwd) : await signUp(email.trim(), pwd)
    setBusy(false)
    if (err) setMsg(err)
  }

  return (
    <div className="login">
      <form className="card" onSubmit={submit}>
        <Logo />
        <h1 style={{ textAlign: 'center' }}>Patinage de vitesse</h1>
        <p className="muted" style={{ textAlign: 'center' }}>
          Chrono et suivi des performances
        </p>
        {msg && <div className={/créé/i.test(msg) ? 'notice' : 'error'}>{msg}</div>}
        <Field label="Courriel">
          <input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </Field>
        <Field label="Mot de passe">
          <input type="password" autoComplete={mode === 'in' ? 'current-password' : 'new-password'} value={pwd} onChange={(e) => setPwd(e.target.value)} required minLength={6} />
        </Field>
        <button className="btn-primary btn-block" disabled={busy}>
          {busy ? '…' : mode === 'in' ? 'Se connecter' : 'Créer mon compte'}
        </button>
        <button type="button" className="btn-ghost btn-block" onClick={() => setMode(mode === 'in' ? 'up' : 'in')}>
          {mode === 'in' ? 'Première fois ? Créer un compte' : 'J’ai déjà un compte'}
        </button>
      </form>
    </div>
  )
}

export function OnboardingPage() {
  const { createCompte, comptes, selectCompte, signOut, session } = useAuth()
  const [nom, setNom] = useState('Famille')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [montrerCreation, setMontrerCreation] = useState(false)

  async function go(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    const r = await createCompte(nom.trim() || 'Mon compte')
    setBusy(false)
    if (r) setErr(r)
  }

  return (
    <div className="login">
      <div className="card">
        <Logo />
        <h1 style={{ textAlign: 'center' }}>Bienvenue</h1>
        <p className="muted" style={{ textAlign: 'center' }}>{session?.user.email}</p>
        {comptes.length > 0 && (
          <>
            <h3>Comptes existants</h3>
            <ul className="list" style={{ marginBottom: 16 }}>
              {comptes.map((c) => (
                <li key={c.id}>
                  <button className="row btn-block" onClick={() => selectCompte(c.id)}>
                    <span className="grow title" style={{ textAlign: 'left' }}>
                      {c.nom}
                    </span>
                    <span className="badge">{c.role}</span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
        {comptes.length > 0 && !montrerCreation && (
          <button className="btn-ghost btn-block" onClick={() => setMontrerCreation(true)}>
            Créer un autre compte (rarement nécessaire)
          </button>
        )}
        <form onSubmit={go} style={{ display: comptes.length > 0 && !montrerCreation ? 'none' : undefined }}>
          <h3>Créer un compte</h3>
          <p className="muted">Un compte regroupe les athlètes, compétitions et chronos d'une famille ou d'un club. Les distances et circuits standard seront préremplis.</p>
          {err && <div className="error">{err}</div>}
          <Field label="Nom du compte">
            <input value={nom} onChange={(e) => setNom(e.target.value)} required />
          </Field>
          <button className="btn-primary btn-block" disabled={busy}>
            {busy ? '…' : 'Créer'}
          </button>
        </form>
        <button className="btn-ghost btn-block" onClick={signOut} style={{ marginTop: 8 }}>
          Se déconnecter
        </button>
      </div>
    </div>
  )
}
