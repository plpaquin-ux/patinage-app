import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { Empty, Field, Page } from '../components/Layout'
import { useAthletes, useCircuits, useDistances, usePistes, useSaisons } from '../lib/hooks'
import { create, softDelete, update } from '../lib/repo'
import { resetPullMarkers, syncNow } from '../lib/sync'
import { fmtLongueur } from '../lib/time'
import { LIBELLES, type Circuit, type Piste, type Saison, type TypeCourse, type TypePiste } from '../lib/types'
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
  const [editId, setEditId] = useState<string | null>(null)
  const [f, setF] = useState({ nom: '', ville: '', type_piste: 'courte_piste' as TypePiste, interieur: true, commentaire: '' })
  const vide = { nom: '', ville: '', type_piste: 'courte_piste' as TypePiste, interieur: true, commentaire: '' }

  function ouvrir(p: Piste) {
    setEditId(p.id)
    setF({ nom: p.nom, ville: p.ville ?? '', type_piste: p.type_piste, interieur: p.interieur, commentaire: p.commentaire ?? '' })
  }
  async function submit(e: FormEvent) {
    e.preventDefault()
    const data = { nom: f.nom.trim(), ville: f.ville.trim() || null, type_piste: f.type_piste, interieur: f.interieur, commentaire: f.commentaire.trim() || null }
    if (editId) await update('piste', editId, data)
    else await create('piste', { ...data, province: 'QC', longueur_m: null })
    setEditId(null)
    setF(vide)
  }

  const formulaire = (
    <form className="card" onSubmit={submit}>
      <h3>{editId ? 'Modifier la piste' : 'Ajouter une piste'}</h3>
      <Field label="Nom de l'aréna / anneau">
        <input value={f.nom} onChange={(e) => setF({ ...f, nom: e.target.value })} required />
      </Field>
      <div className="grid2">
        <Field label="Ville">
          <input value={f.ville} onChange={(e) => setF({ ...f, ville: e.target.value })} />
        </Field>
        <Field label="Type">
          <select value={f.type_piste} onChange={(e) => setF({ ...f, type_piste: e.target.value as TypePiste })}>
            <option value="courte_piste">Courte piste</option>
            <option value="longue_piste">Longue piste</option>
          </select>
        </Field>
      </div>
      <label className="check">
        <input type="checkbox" checked={f.interieur} onChange={(e) => setF({ ...f, interieur: e.target.checked })} />
        Intérieur
      </label>
      <Field label="Commentaire">
        <input value={f.commentaire} onChange={(e) => setF({ ...f, commentaire: e.target.value })} placeholder="ex. glace rapide, stationnement…" />
      </Field>
      <div className="actions">
        <button className="btn-primary">{editId ? 'Enregistrer' : 'Ajouter'}</button>
        {editId && (
          <button type="button" onClick={() => (setEditId(null), setF(vide))}>
            Annuler
          </button>
        )}
      </div>
    </form>
  )

  return (
    <Page title="Arénas et pistes" back="/plus">
      <p className="muted">La longueur du tour n'est pas liée à l'aréna : elle dépend du circuit (Plus › Circuits).</p>
      {pistes?.length === 0 && <Empty>Aucune piste. Ajoute les arénas que Jeanne fréquente.</Empty>}
      <ul className="list">
        {pistes?.map((p) => (
          <li key={p.id}>
            {editId === p.id ? (
              formulaire
            ) : (
              <div className="row">
                <button className="grow btn-ghost" style={{ justifyContent: 'flex-start', textAlign: 'left', padding: 0, color: 'inherit', minHeight: 0, display: 'block' }} onClick={() => ouvrir(p)}>
                  <div className="title">{p.nom}</div>
                  <div className="sub">{[p.ville, LIBELLES.type_piste[p.type_piste], p.interieur ? null : 'extérieur'].filter(Boolean).join(' · ')}</div>
                </button>
                <button className="btn-ghost btn-sm" onClick={() => ouvrir(p)} aria-label="Modifier">
                  ✎
                </button>
                <button className="btn-ghost btn-sm" style={{ color: 'var(--danger)' }} onClick={() => confirm(`Retirer ${p.nom} ?`) && softDelete('piste', p.id)} aria-label="Retirer">
                  ✕
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
      {!editId && <div style={{ marginTop: 12 }}>{formulaire}</div>}
    </Page>
  )
}

/* ------------------------------ Circuits ------------------------------ */
export function CircuitsPage() {
  const circuits = useCircuits()
  const [editId, setEditId] = useState<string | null>(null)
  const vide = { nom: '', type_piste: '' as TypePiste | '', organisme: '', longueur: '' }
  const [f, setF] = useState(vide)

  function ouvrir(c: Circuit) {
    setEditId(c.id)
    setF({ nom: c.nom, type_piste: c.type_piste ?? '', organisme: c.organisme ?? '', longueur: c.longueur_piste_m != null ? String(c.longueur_piste_m) : '' })
  }
  async function submit(e: FormEvent) {
    e.preventDefault()
    const data = {
      nom: f.nom.trim(),
      type_piste: f.type_piste || null,
      organisme: f.organisme.trim() || null,
      longueur_piste_m: f.longueur.trim() ? Number(f.longueur.replace(',', '.')) || null : null,
    }
    if (editId) await update('circuit', editId, data)
    else await create('circuit', { ...data, commentaire: null })
    setEditId(null)
    setF(vide)
  }

  const formulaire = (
    <form className="card" onSubmit={submit}>
      <h3>{editId ? 'Modifier le circuit' : 'Ajouter un circuit'}</h3>
      <Field label="Nom">
        <input value={f.nom} onChange={(e) => setF({ ...f, nom: e.target.value })} required />
      </Field>
      <div className="grid2">
        <Field label="Type de piste">
          <select value={f.type_piste} onChange={(e) => setF({ ...f, type_piste: e.target.value as TypePiste | '' })}>
            <option value="">—</option>
            <option value="courte_piste">Courte piste</option>
            <option value="longue_piste">Longue piste</option>
          </select>
        </Field>
        <Field label="Longueur du tour (m)">
          <input className="mono" inputMode="decimal" value={f.longueur} onChange={(e) => setF({ ...f, longueur: e.target.value })} placeholder="100 ou 111.12" />
        </Field>
      </div>
      <Field label="Organisme">
        <input value={f.organisme} onChange={(e) => setF({ ...f, organisme: e.target.value })} placeholder="ex. Patinage de vitesse Québec" />
      </Field>
      <div className="actions">
        <button className="btn-primary">{editId ? 'Enregistrer' : 'Ajouter'}</button>
        {editId && (
          <button type="button" onClick={() => (setEditId(null), setF(vide))}>
            Annuler
          </button>
        )}
      </div>
    </form>
  )

  return (
    <Page title="Circuits" back="/plus">
      <p className="muted">La longueur du tour définit le nombre de tours par distance (ex. 1000 m : 10 tours à 100 m, 9 tours à 111,12 m). Les chronos passés conservent la longueur en vigueur au moment de la course.</p>
      <ul className="list">
        {circuits?.map((c) => (
          <li key={c.id}>
            {editId === c.id ? (
              formulaire
            ) : (
              <div className="row">
                <button className="grow btn-ghost" style={{ justifyContent: 'flex-start', textAlign: 'left', padding: 0, color: 'inherit', minHeight: 0, display: 'block' }} onClick={() => ouvrir(c)}>
                  <div className="title">{c.nom}</div>
                  <div className="sub">{[c.type_piste ? LIBELLES.type_piste[c.type_piste] : null, c.organisme, `tour de ${fmtLongueur(c.longueur_piste_m)}`].filter(Boolean).join(' · ')}</div>
                </button>
                <button className="btn-ghost btn-sm" onClick={() => ouvrir(c)} aria-label="Modifier">
                  ✎
                </button>
                <button className="btn-ghost btn-sm" style={{ color: 'var(--danger)' }} onClick={() => confirm(`Retirer ${c.nom} ?`) && softDelete('circuit', c.id)} aria-label="Retirer">
                  ✕
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
      {!editId && <div style={{ marginTop: 12 }}>{formulaire}</div>}
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
                <input defaultValue={d.libelle} onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== d.libelle && update('distance', d.id, { libelle: e.target.value.trim() })} style={{ minHeight: 40 }} />
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
  const vide = { libelle: `${y}-${y + 1}`, date_debut: `${y}-07-01`, date_fin: `${y + 1}-06-30` }
  const [editId, setEditId] = useState<string | null>(null)
  const [f, setF] = useState(vide)
  function ouvrir(s: Saison) {
    setEditId(s.id)
    setF({ libelle: s.libelle, date_debut: s.date_debut, date_fin: s.date_fin })
  }
  async function submit(e: FormEvent) {
    e.preventDefault()
    if (editId) await update('saison', editId, f)
    else await create('saison', f)
    setEditId(null)
    setF(vide)
  }
  const formulaire = (
    <form className="card" onSubmit={submit}>
      <h3>{editId ? 'Modifier la saison' : 'Ajouter une saison'}</h3>
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
      <div className="actions">
        <button className="btn-primary">{editId ? 'Enregistrer' : 'Ajouter'}</button>
        {editId && (
          <button type="button" onClick={() => (setEditId(null), setF(vide))}>
            Annuler
          </button>
        )}
      </div>
    </form>
  )
  return (
    <Page title="Saisons" back="/plus">
      <ul className="list">
        {saisons?.map((s) => (
          <li key={s.id}>
            {editId === s.id ? (
              formulaire
            ) : (
              <div className="row">
                <button className="grow btn-ghost" style={{ justifyContent: 'flex-start', textAlign: 'left', padding: 0, color: 'inherit', minHeight: 0, display: 'block' }} onClick={() => ouvrir(s)}>
                  <div className="title">{s.libelle}</div>
                  <div className="sub">
                    {s.date_debut} → {s.date_fin}
                  </div>
                </button>
                <button className="btn-ghost btn-sm" onClick={() => ouvrir(s)} aria-label="Modifier">
                  ✎
                </button>
                <button className="btn-ghost btn-sm" style={{ color: 'var(--danger)' }} onClick={() => confirm(`Retirer ${s.libelle} ?`) && softDelete('saison', s.id)} aria-label="Retirer">
                  ✕
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
      {!editId && <div style={{ marginTop: 12 }}>{formulaire}</div>}
    </Page>
  )
}
