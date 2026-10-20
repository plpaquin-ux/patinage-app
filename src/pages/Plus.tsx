import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { Empty, Field, Page } from '../components/Layout'
import { useAthletes, useCircuits, useDistances, usePistes, useSaisons } from '../lib/hooks'
import { create, softDelete, update } from '../lib/repo'
import { resetPullMarkers, syncNow } from '../lib/sync'
import { fmtLongueur } from '../lib/time'
import { LIBELLES, type TypeCourse, type TypePiste } from '../lib/types'
import { NumInput } from './ChronoEdit'

export function PlusPage() {
  const { compte, comptes, session, signOut, selectCompte } = useAuth()
  const [busy, setBusy] = useState(false)
  const items = [
    ['/entrainement', 'Entraînements', 'Séances et chronos libres'],
    ['/plus/athletes', 'Athlètes', 'Patineurs suivis'],
    ['/plus/pistes', 'Arénas et pistes', 'Lieux, longueur de piste'],
    ['/plus/circuits', 'Circuits', 'InterRégional, provincial…'],
    ['/plus/distances', 'Distances', 'Programme CP / LP et nombre de tours'],
    ['/plus/saisons', 'Saisons', 'Pour comparer d’une année à l’autre'],
  ] as const
  async function recharger() {
    setBusy(true)
    await resetPullMarkers()
    await syncNow()
    setBusy(false)
  }
  return (
    <Page title="Plus">
      <ul className="list">
        {items.map(([to, t, s]) => (
          <li key={to}>
            <Link className="row" to={to}>
              <div className="grow">
                <div className="title">{t}</div>
                <div className="sub">{s}</div>
              </div>
              <span className="chev">›</span>
            </Link>
          </li>
        ))}
      </ul>
      <h3 style={{ marginTop: 20 }}>Compte</h3>
      <div className="card">
        <div style={{ fontWeight: 700 }}>{compte?.nom}</div>
        <small>{session?.user.email}</small>
        {comptes.length > 1 && (
          <Field label="Changer de compte">
            <select value={compte?.id ?? ''} onChange={(e) => selectCompte(e.target.value)}>
              {comptes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nom}
                </option>
              ))}
            </select>
          </Field>
        )}
        <div className="actions">
          <button onClick={recharger} disabled={busy}>
            {busy ? '…' : 'Recharger les données'}
          </button>
          <button className="btn-danger" onClick={() => confirm('Se déconnecter ? Les données non synchronisées seront perdues.') && signOut()}>
            Se déconnecter
          </button>
        </div>
      </div>
      <small>Version {__APP_VERSION__}</small>
    </Page>
  )
}

/* ------------------------------ Athlètes ------------------------------ */
export function AthletesPage() {
  const athletes = useAthletes()
  const [prenom, setPrenom] = useState('')
  const [nom, setNom] = useState('')
  async function add(e: FormEvent) {
    e.preventDefault()
    if (!prenom.trim()) return
    await create('athlete', { prenom: prenom.trim(), nom: nom.trim(), date_naissance: null, sexe: null, actif: true, commentaire: null })
    setPrenom('')
    setNom('')
  }
  return (
    <Page title="Athlètes" back="/plus">
      {athletes?.map((a) => (
        <div className="card" key={a.id}>
          <div className="grid2">
            <Field label="Prénom">
              <input defaultValue={a.prenom} onBlur={(e) => update('athlete', a.id, { prenom: e.target.value })} />
            </Field>
            <Field label="Nom">
              <input defaultValue={a.nom} onBlur={(e) => update('athlete', a.id, { nom: e.target.value })} />
            </Field>
            <Field label="Date de naissance">
              <input type="date" defaultValue={a.date_naissance ?? ''} onBlur={(e) => update('athlete', a.id, { date_naissance: e.target.value || null })} />
            </Field>
            <Field label="Sexe">
              <select value={a.sexe ?? ''} onChange={(e) => update('athlete', a.id, { sexe: (e.target.value || null) as 'F' | 'M' | 'X' | null })}>
                <option value="">—</option>
                <option value="F">F</option>
                <option value="M">M</option>
                <option value="X">X</option>
              </select>
            </Field>
          </div>
          <button className="btn-danger btn-sm" onClick={() => confirm(`Retirer ${a.prenom} ?`) && softDelete('athlete', a.id)}>
            Retirer
          </button>
        </div>
      ))}
      <form className="card" onSubmit={add}>
        <h3>Ajouter un athlète</h3>
        <div className="grid2">
          <input value={prenom} onChange={(e) => setPrenom(e.target.value)} placeholder="Prénom" required />
          <input value={nom} onChange={(e) => setNom(e.target.value)} placeholder="Nom" />
        </div>
        <button className="btn-primary btn-block" style={{ marginTop: 10 }}>
          Ajouter
        </button>
      </form>
    </Page>
  )
}

/* ------------------------------ Pistes ------------------------------ */
export function PistesPage() {
  const pistes = usePistes()
  const [f, setF] = useState({ nom: '', ville: '', type_piste: 'courte_piste' as TypePiste, longueur_m: '111.12', interieur: true })
  async function add(e: FormEvent) {
    e.preventDefault()
    await create('piste', {
      nom: f.nom.trim(),
      ville: f.ville.trim() || null,
      province: 'QC',
      type_piste: f.type_piste,
      longueur_m: f.longueur_m ? Number(f.longueur_m.replace(',', '.')) : null,
      interieur: f.interieur,
      commentaire: null,
    })
    setF({ ...f, nom: '', ville: '' })
  }
  return (
    <Page title="Arénas et pistes" back="/plus">
      {pistes?.length === 0 && <Empty>Aucune piste. Ajoute les arénas que Jeanne fréquente.</Empty>}
      <ul className="list">
        {pistes?.map((p) => (
          <li key={p.id} className="row">
            <div className="grow">
              <div className="title">{p.nom}</div>
              <div className="sub">
                {[p.ville, LIBELLES.type_piste[p.type_piste], p.longueur_m ? `${p.longueur_m} m` : null, p.interieur ? null : 'extérieur'].filter(Boolean).join(' · ')}
              </div>
            </div>
            <button className="btn-ghost btn-sm" style={{ color: 'var(--danger)' }} onClick={() => confirm(`Retirer ${p.nom} ?`) && softDelete('piste', p.id)}>
              ✕
            </button>
          </li>
        ))}
      </ul>
      <form className="card" onSubmit={add} style={{ marginTop: 12 }}>
        <h3>Ajouter une piste</h3>
        <Field label="Nom de l'aréna / anneau">
          <input value={f.nom} onChange={(e) => setF({ ...f, nom: e.target.value })} required />
        </Field>
        <div className="grid2">
          <Field label="Ville">
            <input value={f.ville} onChange={(e) => setF({ ...f, ville: e.target.value })} />
          </Field>
          <Field label="Type">
            <select
              value={f.type_piste}
              onChange={(e) => {
                const t = e.target.value as TypePiste
                setF({ ...f, type_piste: t, longueur_m: t === 'courte_piste' ? '111.12' : '400' })
              }}
            >
              <option value="courte_piste">Courte piste</option>
              <option value="longue_piste">Longue piste</option>
            </select>
          </Field>
          <Field label="Longueur (m)">
            <input className="mono" inputMode="decimal" value={f.longueur_m} onChange={(e) => setF({ ...f, longueur_m: e.target.value })} />
          </Field>
          <label className="check" style={{ marginTop: 22 }}>
            <input type="checkbox" checked={f.interieur} onChange={(e) => setF({ ...f, interieur: e.target.checked })} />
            Intérieur
          </label>
        </div>
        <button className="btn-primary btn-block">Ajouter</button>
      </form>
    </Page>
  )
}

/* ------------------------------ Circuits ------------------------------ */
export function CircuitsPage() {
  const circuits = useCircuits()
  const [nom, setNom] = useState('')
  const [type, setType] = useState<TypePiste | ''>('')
  const [longueur, setLongueur] = useState('')
  async function add(e: FormEvent) {
    e.preventDefault()
    await create('circuit', {
      nom: nom.trim(),
      type_piste: type || null,
      organisme: null,
      longueur_piste_m: longueur.trim() ? Number(longueur.replace(',', '.')) || null : null,
      commentaire: null,
    })
    setNom('')
    setLongueur('')
  }
  return (
    <Page title="Circuits" back="/plus">
      <p className="muted">La longueur du tour définit le nombre de tours par distance (ex. 1000 m : 10 tours à 100 m, 9 tours à 111,12 m). Les chronos passés conservent la longueur en vigueur au moment de la course.</p>
      <ul className="list">
        {circuits?.map((c) => (
          <li key={c.id} className="row">
            <div className="grow">
              <div className="title">{c.nom}</div>
              <div className="sub">{[c.type_piste ? LIBELLES.type_piste[c.type_piste] : null, c.organisme, `tour de ${fmtLongueur(c.longueur_piste_m)}`].filter(Boolean).join(' · ')}</div>
            </div>
            <input
              className="mono"
              inputMode="decimal"
              style={{ width: 84, minHeight: 40 }}
              defaultValue={c.longueur_piste_m ?? ''}
              placeholder="m"
              onBlur={(e) => update('circuit', c.id, { longueur_piste_m: e.target.value.trim() ? Number(e.target.value.replace(',', '.')) || null : null })}
              aria-label="Longueur du tour (m)"
            />
            <button className="btn-ghost btn-sm" style={{ color: 'var(--danger)' }} onClick={() => confirm(`Retirer ${c.nom} ?`) && softDelete('circuit', c.id)}>
              ✕
            </button>
          </li>
        ))}
      </ul>
      <form className="card" onSubmit={add} style={{ marginTop: 12 }}>
        <h3>Ajouter un circuit</h3>
        <div className="grid2">
          <input value={nom} onChange={(e) => setNom(e.target.value)} placeholder="Nom" required />
          <select value={type} onChange={(e) => setType(e.target.value as TypePiste | '')}>
            <option value="">Type —</option>
            <option value="courte_piste">Courte piste</option>
            <option value="longue_piste">Longue piste</option>
          </select>
        </div>
        <Field label="Longueur du tour (m)">
          <input className="mono" inputMode="decimal" value={longueur} onChange={(e) => setLongueur(e.target.value)} placeholder="100 ou 111.12" />
        </Field>
        <button className="btn-primary btn-block" style={{ marginTop: 10 }}>
          Ajouter
        </button>
      </form>
    </Page>
  )
}

/* ------------------------------ Distances ------------------------------ */
export function DistancesPage() {
  const distances = useDistances()
  const [f, setF] = useState({ type_piste: 'courte_piste' as TypePiste, metres: '', libelle: '', type_course: 'individuelle' as TypeCourse, nb_tours: '' })
  async function add(e: FormEvent) {
    e.preventDefault()
    const metres = Number(f.metres)
    if (!metres) return
    await create('distance', {
      type_piste: f.type_piste,
      metres,
      libelle: f.libelle.trim() || `${metres} m`,
      type_course: f.type_course,
      nb_tours_defaut: f.nb_tours ? Number(f.nb_tours.replace(',', '.')) : null,
      actif: true,
    })
    setF({ ...f, metres: '', libelle: '', nb_tours: '' })
  }
  return (
    <Page title="Distances" back="/plus">
      <p className="muted">Le nombre de tours est normalement calculé à partir de la longueur du tour (circuit / compétition). La valeur ici ne sert que si la longueur est inconnue.</p>
      <table className="table">
        <thead>
          <tr>
            <th>Distance</th>
            <th>Piste</th>
            <th style={{ textAlign: 'right' }}>Tours</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {distances?.map((d) => (
            <tr key={d.id}>
              <td>
                {d.libelle}
                {d.type_course !== 'individuelle' && <small> · {LIBELLES.type_course[d.type_course]}</small>}
              </td>
              <td>{d.type_piste === 'courte_piste' ? 'CP' : 'LP'}</td>
              <td className="num" style={{ width: 90 }}>
                <NumInput value={d.nb_tours_defaut} onChange={(v) => update('distance', d.id, { nb_tours_defaut: v })} decimal />
              </td>
              <td style={{ width: 40 }}>
                <button className="btn-ghost btn-sm" style={{ color: 'var(--danger)', padding: 0 }} onClick={() => confirm(`Retirer ${d.libelle} ?`) && update('distance', d.id, { actif: false })}>
                  ✕
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <form className="card" onSubmit={add} style={{ marginTop: 12 }}>
        <h3>Ajouter une distance</h3>
        <div className="grid2">
          <Field label="Mètres">
            <input className="mono" inputMode="numeric" value={f.metres} onChange={(e) => setF({ ...f, metres: e.target.value.replace(/\D/g, '') })} required />
          </Field>
          <Field label="Type de piste">
            <select value={f.type_piste} onChange={(e) => setF({ ...f, type_piste: e.target.value as TypePiste })}>
              <option value="courte_piste">Courte piste</option>
              <option value="longue_piste">Longue piste</option>
            </select>
          </Field>
          <Field label="Type de course">
            <select value={f.type_course} onChange={(e) => setF({ ...f, type_course: e.target.value as TypeCourse })}>
              {(Object.keys(LIBELLES.type_course) as TypeCourse[]).map((t) => (
                <option key={t} value={t}>
                  {LIBELLES.type_course[t]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Tours">
            <input className="mono" inputMode="decimal" value={f.nb_tours} onChange={(e) => setF({ ...f, nb_tours: e.target.value })} placeholder="ex. 4.5" />
          </Field>
        </div>
        <Field label="Libellé (facultatif)">
          <input value={f.libelle} onChange={(e) => setF({ ...f, libelle: e.target.value })} placeholder="ex. Relais 3000 m" />
        </Field>
        <button className="btn-primary btn-block">Ajouter</button>
      </form>
    </Page>
  )
}

/* ------------------------------ Saisons ------------------------------ */
export function SaisonsPage() {
  const saisons = useSaisons()
  const y = new Date().getMonth() >= 6 ? new Date().getFullYear() : new Date().getFullYear() - 1
  const [f, setF] = useState({ libelle: `${y}-${y + 1}`, date_debut: `${y}-07-01`, date_fin: `${y + 1}-06-30` })
  async function add(e: FormEvent) {
    e.preventDefault()
    await create('saison', f)
    setF({ libelle: `${y + 1}-${y + 2}`, date_debut: `${y + 1}-07-01`, date_fin: `${y + 2}-06-30` })
  }
  return (
    <Page title="Saisons" back="/plus">
      <ul className="list">
        {saisons?.map((s) => (
          <li key={s.id} className="row">
            <div className="grow">
              <div className="title">{s.libelle}</div>
              <div className="sub">
                {s.date_debut} → {s.date_fin}
              </div>
            </div>
            <button className="btn-ghost btn-sm" style={{ color: 'var(--danger)' }} onClick={() => confirm(`Retirer ${s.libelle} ?`) && softDelete('saison', s.id)}>
              ✕
            </button>
          </li>
        ))}
      </ul>
      <form className="card" onSubmit={add} style={{ marginTop: 12 }}>
        <h3>Ajouter une saison</h3>
        <Field label="Libellé">
          <input value={f.libelle} onChange={(e) => setF({ ...f, libelle: e.target.value })} required />
        </Field>
        <div className="grid2">
          <Field label="Début">
            <input type="date" value={f.date_debut} onChange={(e) => setF({ ...f, date_debut: e.target.value })} required />
          </Field>
          <Field label="Fin">
            <input type="date" value={f.date_fin} onChange={(e) => setF({ ...f, date_fin: e.target.value })} required />
          </Field>
        </div>
        <button className="btn-primary btn-block">Ajouter</button>
      </form>
    </Page>
  )
}
