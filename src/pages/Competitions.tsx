import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Empty, Field, Page } from '../components/Layout'
import { db } from '../lib/db'
import {
  useAthletes,
  useCircuitDistances,
  useCircuits,
  useCompetition,
  useCompetitions,
  useDistances,
  useEpreuves,
  useGroupes,
  useInscriptions,
  usePistes,
  useSaisons,
} from '../lib/hooks'
import { alive, create, softDelete, update } from '../lib/repo'
import { fmtDate, fmtLongueur, fmtMs, nbToursAttendus, retenu, todayIsoDate } from '../lib/time'
import { LIBELLES, mancheLabel, type Competition, type TypeCourse } from '../lib/types'
import { NumInput } from './ChronoEdit'

/* ------------------------------ Liste ------------------------------ */
export function CompetitionsPage() {
  const competitions = useCompetitions()
  const pistes = usePistes()
  const circuits = useCircuits()
  const [filtre, setFiltre] = useState<'toutes' | 'courte_piste' | 'longue_piste'>('toutes')
  const list = competitions?.filter((c) => {
    if (filtre === 'toutes') return true
    const p = pistes?.find((x) => x.id === c.piste_id)
    const ci = circuits?.find((x) => x.id === c.circuit_id)
    return (p?.type_piste ?? ci?.type_piste) === filtre
  })
  return (
    <Page title="Compétitions">
      <div className="segmented">
        {(['toutes', 'courte_piste', 'longue_piste'] as const).map((f) => (
          <button key={f} className={filtre === f ? 'active' : ''} onClick={() => setFiltre(f)}>
            {f === 'toutes' ? 'Toutes' : LIBELLES.type_piste[f]}
          </button>
        ))}
      </div>
      {list && list.length === 0 && <Empty>Aucune compétition. Appuie sur + pour en créer une.</Empty>}
      <ul className="list">
        {list?.map((c) => {
          const p = pistes?.find((x) => x.id === c.piste_id)
          return (
            <li key={c.id}>
              <Link className="row" to={`/competitions/${c.id}`}>
                <div className="grow">
                  <div className="title">{c.nom}</div>
                  <div className="sub">
                    {fmtDate(c.date_debut)}
                    {p ? ` · ${p.ville ?? p.nom}` : ''}
                  </div>
                </div>
                {p && <span className="badge">{p.type_piste === 'courte_piste' ? 'CP' : 'LP'}</span>}
                <span className="chev">›</span>
              </Link>
            </li>
          )
        })}
      </ul>
      <Link className="btn fab" to="/competitions/nouvelle" aria-label="Nouvelle compétition">
        +
      </Link>
    </Page>
  )
}

/* ------------------------------ Formulaire ------------------------------ */
export function CompetitionFormPage() {
  const { id } = useParams()
  const nav = useNavigate()
  const existing = useCompetition(id)
  const pistes = usePistes()
  const circuits = useCircuits()
  const saisons = useSaisons()
  const athletes = useAthletes()
  const [f, setF] = useState<Partial<Competition>>({ nom: '', date_debut: todayIsoDate(), date_fin: null, niveau: null, longueur_piste_m: null })
  const [longueurTxt, setLongueurTxt] = useState('')
  const [inscrire, setInscrire] = useState<string[]>([])

  useEffect(() => {
    if (existing) {
      setF(existing)
      setLongueurTxt(existing.longueur_piste_m != null ? String(existing.longueur_piste_m) : '')
    }
  }, [existing])

  // Longueur du tour proposée : circuit > piste (seulement si l'usager n'a rien saisi)
  const circuitSel = circuits?.find((c) => c.id === f.circuit_id)
  const longueurSuggeree = circuitSel?.longueur_piste_m ?? null
  useEffect(() => {
    if (!id && athletes && inscrire.length === 0) setInscrire(athletes.map((a) => a.id))
  }, [athletes, id, inscrire.length])

  // Saison déduite de la date si aucune choisie
  useEffect(() => {
    if (f.saison_id || !saisons || !f.date_debut) return
    const s = saisons.find((s) => s.date_debut <= f.date_debut! && s.date_fin >= f.date_debut!)
    if (s) setF((x) => ({ ...x, saison_id: s.id }))
  }, [saisons, f.date_debut, f.saison_id])

  async function submit(e: FormEvent) {
    e.preventDefault()
    const data = {
      nom: f.nom!.trim(),
      date_debut: f.date_debut!,
      date_fin: f.date_fin || null,
      saison_id: f.saison_id ?? null,
      circuit_id: f.circuit_id ?? null,
      piste_id: f.piste_id ?? null,
      niveau: f.niveau || null,
      longueur_piste_m: longueurTxt.trim() ? Number(longueurTxt.replace(',', '.')) || null : null,
      url_resultats: f.url_resultats || null,
      commentaire: f.commentaire || null,
    }
    if (id) {
      await update('competition', id, data)
      nav(`/competitions/${id}`)
    } else {
      const c = await create('competition', data)
      for (const aid of inscrire) {
        await create('inscription_competition', {
          competition_id: c.id,
          athlete_id: aid,
          groupe_id: null,
          dossard: null,
          rang_final: null,
          points_total: null,
          commentaire: null,
        })
      }
      nav(`/competitions/${c.id}`, { replace: true })
    }
  }

  return (
    <Page title={id ? 'Modifier la compétition' : 'Nouvelle compétition'} back>
      <form onSubmit={submit}>
        <Field label="Nom">
          <input value={f.nom ?? ''} onChange={(e) => setF({ ...f, nom: e.target.value })} required placeholder="ex. InterRégional #2 – Sherbrooke" />
        </Field>
        <div className="grid2">
          <Field label="Date de début">
            <input type="date" value={f.date_debut ?? ''} onChange={(e) => setF({ ...f, date_debut: e.target.value })} required />
          </Field>
          <Field label="Date de fin">
            <input type="date" value={f.date_fin ?? ''} onChange={(e) => setF({ ...f, date_fin: e.target.value || null })} />
          </Field>
        </div>
        <Field label="Circuit">
          <select value={f.circuit_id ?? ''} onChange={(e) => setF({ ...f, circuit_id: e.target.value || null })}>
            <option value="">—</option>
            {circuits?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nom}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Aréna / piste" hint={pistes?.length === 0 ? 'Aucune piste définie : ajoute-les dans Plus › Pistes.' : undefined}>
          <select value={f.piste_id ?? ''} onChange={(e) => setF({ ...f, piste_id: e.target.value || null })}>
            <option value="">—</option>
            {pistes?.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nom}
                {p.ville ? ` (${p.ville})` : ''} · {p.type_piste === 'courte_piste' ? 'CP' : 'LP'}
              </option>
            ))}
          </select>
        </Field>
        <div className="grid2">
          <Field label="Saison">
            <select value={f.saison_id ?? ''} onChange={(e) => setF({ ...f, saison_id: e.target.value || null })}>
              <option value="">—</option>
              {saisons?.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.libelle}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Niveau">
            <input value={f.niveau ?? ''} onChange={(e) => setF({ ...f, niveau: e.target.value })} placeholder="régional, provincial…" />
          </Field>
        </div>
        <Field
          label="Longueur du tour (m)"
          hint={
            longueurSuggeree != null
              ? `Laisse vide pour utiliser ${fmtLongueur(longueurSuggeree)} (circuit). Ex. 1000 m = ${nbToursAttendus(1000, Number(longueurTxt.replace(',', '.')) || longueurSuggeree)} tours.`
              : 'Ex. 100 m en InterRégional, 111,12 m au provincial. Sinon, définis-la sur le circuit.'
          }
        >
          <input className="mono" inputMode="decimal" value={longueurTxt} onChange={(e) => setLongueurTxt(e.target.value)} placeholder={longueurSuggeree != null ? String(longueurSuggeree) : '100'} />
        </Field>
        <Field label="Lien vers les résultats officiels">
          <input type="url" value={f.url_resultats ?? ''} onChange={(e) => setF({ ...f, url_resultats: e.target.value })} placeholder="https://" />
        </Field>
        <Field label="Commentaire">
          <textarea value={f.commentaire ?? ''} onChange={(e) => setF({ ...f, commentaire: e.target.value })} />
        </Field>
        {!id && athletes && athletes.length > 0 && (
          <Field label="Athlètes inscrits">
            {athletes.map((a) => (
              <label key={a.id} className="check">
                <input
                  type="checkbox"
                  checked={inscrire.includes(a.id)}
                  onChange={(e) => setInscrire(e.target.checked ? [...inscrire, a.id] : inscrire.filter((x) => x !== a.id))}
                />
                {a.prenom} {a.nom}
              </label>
            ))}
          </Field>
        )}
        <button className="btn-primary btn-block">{id ? 'Enregistrer' : 'Créer la compétition'}</button>
      </form>
    </Page>
  )
}

/* ------------------------------ Détail ------------------------------ */
export function CompetitionDetailPage() {
  const { id } = useParams()
  const nav = useNavigate()
  const comp = useCompetition(id)
  const piste = useLiveQuery(() => (comp?.piste_id ? db.piste.get(comp.piste_id) : undefined), [comp?.piste_id])
  const circuit = useLiveQuery(() => (comp?.circuit_id ? db.circuit.get(comp.circuit_id) : undefined), [comp?.circuit_id])
  const epreuves = useEpreuves(id)
  const groupes = useGroupes(id)
  const inscriptions = useInscriptions(id)
  const athletes = useAthletes()
  const liens = useCircuitDistances()
  const allDistances = useDistances()
  // Distances proposées : programme du circuit si défini, sinon celles du type de piste, sinon toutes
  const distancesCircuit = useMemo(() => {
    if (!allDistances) return []
    const ids = new Set((liens ?? []).filter((l) => l.circuit_id === comp?.circuit_id).map((l) => l.distance_id))
    if (comp?.circuit_id && ids.size > 0) return allDistances.filter((d) => ids.has(d.id))
    const tp = piste?.type_piste ?? circuit?.type_piste ?? null
    return tp ? allDistances.filter((d) => d.type_piste === tp) : allDistances
  }, [allDistances, liens, comp?.circuit_id, piste?.type_piste, circuit?.type_piste])
  const [showEpreuve, setShowEpreuve] = useState(false)
  const [newGroupe, setNewGroupe] = useState('')

  // Résumé par épreuve : courses + meilleur temps retenu
  const resume = useLiveQuery(async () => {
    if (!epreuves) return []
    return Promise.all(
      epreuves.map(async (e) => {
        const courses = alive(await db.course.where('epreuve_id').equals(e.id).toArray()).sort(
          (a, b) => (a.ordre_manche ?? 0) - (b.ordre_manche ?? 0) || a.created_at.localeCompare(b.created_at),
        )
        const parts = alive((await Promise.all(courses.map((c) => db.participation.where('course_id').equals(c.id).toArray()))).flat())
        const chronos = (await Promise.all(parts.map((p) => db.chrono.get(p.chrono_id)))).filter((c): c is NonNullable<typeof c> => !!c)
        const temps = chronos.map(retenu).filter((t): t is number => t != null)
        return { epreuve: e, courses, nbParts: parts.length, best: temps.length ? Math.min(...temps) : null }
      }),
    )
  }, [epreuves])

  if (comp === undefined) return <Page title="Compétition" back="/competitions">…</Page>
  if (!comp) {
    return (
      <Page title="Compétition" back="/competitions">
        <Empty>Compétition introuvable.</Empty>
      </Page>
    )
  }

  async function ajouterGroupe(e: FormEvent) {
    e.preventDefault()
    if (!newGroupe.trim()) return
    await create('groupe', { competition_id: comp!.id, nom: newGroupe.trim(), ordre: (groupes?.length ?? 0) + 1 })
    setNewGroupe('')
  }
  async function supprimer() {
    if (!confirm(`Supprimer « ${comp!.nom} » et tout son contenu ?`)) return
    await softDelete('competition', comp!.id)
    nav('/competitions', { replace: true })
  }

  return (
    <Page
      title={comp.nom}
      back="/competitions"
      right={
        <Link to={`/competitions/${comp.id}/modifier`} className="btn-ghost btn-sm">
          Modifier
        </Link>
      }
    >
      <div className="card">
        <div>{fmtDate(comp.date_debut)}{comp.date_fin && comp.date_fin !== comp.date_debut ? ` → ${fmtDate(comp.date_fin)}` : ''}</div>
        <small>
          {[circuit?.nom, piste ? `${piste.nom}${piste.ville ? `, ${piste.ville}` : ''}` : null, piste ? LIBELLES.type_piste[piste.type_piste] : null, comp.niveau]
            .filter(Boolean)
            .join(' · ')}
        </small>
        <div>
          <span className="badge accent">tour de {fmtLongueur(comp.longueur_piste_m ?? circuit?.longueur_piste_m)}</span>
        </div>
        {comp.url_resultats && (
          <div>
            <a href={comp.url_resultats} target="_blank" rel="noreferrer">
              Résultats officiels ↗
            </a>
          </div>
        )}
        {comp.commentaire && <p style={{ marginTop: 8 }}>{comp.commentaire}</p>}
      </div>

      {/* Épreuves */}
      <div className="section-head">
        <h3>Épreuves</h3>
        <button className="btn-sm" onClick={() => setShowEpreuve(!showEpreuve)}>
          + Épreuve
        </button>
      </div>
      {showEpreuve && (
        <EpreuveForm
          competitionId={comp.id}
          distances={distancesCircuit.length > 0 ? distancesCircuit : (allDistances ?? [])}
          filtre={comp.circuit_id && distancesCircuit.length > 0 ? `Programme du circuit ${circuit?.nom ?? ''}` : null}
          groupes={groupes ?? []}
          ordre={(epreuves?.length ?? 0) + 1}
          onDone={() => setShowEpreuve(false)}
        />
      )}
      {resume && resume.length === 0 && !showEpreuve && <Empty>Ajoute les distances au programme (500 m, 1000 m…).</Empty>}
      <ul className="list">
        {resume?.map(({ epreuve, courses, nbParts, best }) => {
          const d = allDistances?.find((x) => x.id === epreuve.distance_id)
          const g = groupes?.find((x) => x.id === epreuve.groupe_id)
          const nbT = nbToursAttendus(d?.metres, comp.longueur_piste_m ?? circuit?.longueur_piste_m, d?.nb_tours_defaut)
          return (
            <li key={epreuve.id}>
              <Link className="row" to={`/epreuves/${epreuve.id}`}>
                <div className="grow">
                  <div className="title">
                    {epreuve.nom ?? d?.libelle ?? 'Épreuve'}
                    {epreuve.type_course !== 'individuelle' ? ` · ${LIBELLES.type_course[epreuve.type_course]}` : ''}
                    {nbT ? ` · ${nbT} tours` : ''}
                  </div>
                  <div className="sub">
                    {courses.length === 0 ? 'Aucune manche' : courses.map(mancheLabel).join(' → ')}
                    {g ? ` · ${g.nom}` : ''}
                    {nbParts ? ` · ${nbParts} chrono${nbParts > 1 ? 's' : ''}` : ''}
                  </div>
                </div>
                {best != null && <span className="time">{fmtMs(best)}</span>}
                <span className="chev">›</span>
              </Link>
            </li>
          )
        })}
      </ul>

      {/* Résultat global par athlète */}
      <div className="section-head">
        <h3>Résultat de la compétition</h3>
      </div>
      {inscriptions && inscriptions.length === 0 && <Empty>Aucun athlète inscrit.</Empty>}
      {inscriptions?.map((ins) => {
        const a = athletes?.find((x) => x.id === ins.athlete_id)
        return (
          <div className="card" key={ins.id}>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>
              {a?.prenom} {a?.nom}
            </div>
            <div className="grid2">
              <Field label="Groupe">
                <select value={ins.groupe_id ?? ''} onChange={(e) => update('inscription_competition', ins.id, { groupe_id: e.target.value || null })}>
                  <option value="">—</option>
                  {groupes?.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.nom}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Dossard">
                <input defaultValue={ins.dossard ?? ''} onBlur={(e) => update('inscription_competition', ins.id, { dossard: e.target.value || null })} />
              </Field>
              <Field label="Classement final">
                <NumInput value={ins.rang_final} onChange={(v) => update('inscription_competition', ins.id, { rang_final: v })} />
              </Field>
              <Field label="Points (cumul)">
                <NumInput value={ins.points_total} onChange={(v) => update('inscription_competition', ins.id, { points_total: v })} decimal />
              </Field>
            </div>
            <Field label="Commentaire">
              <input defaultValue={ins.commentaire ?? ''} onBlur={(e) => update('inscription_competition', ins.id, { commentaire: e.target.value || null })} />
            </Field>
          </div>
        )
      })}
      {athletes && athletes.some((a) => !inscriptions?.some((i) => i.athlete_id === a.id)) && (
        <div className="card">
          <div className="label" style={{ marginBottom: 8 }}>
            Inscrire un athlète
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {athletes
              .filter((a) => !inscriptions?.some((i) => i.athlete_id === a.id))
              .map((a) => (
                <button
                  key={a.id}
                  className="btn-sm"
                  onClick={() =>
                    create('inscription_competition', {
                      competition_id: comp.id,
                      athlete_id: a.id,
                      groupe_id: null,
                      dossard: null,
                      rang_final: null,
                      points_total: null,
                      commentaire: null,
                    })
                  }
                >
                  + {a.prenom}
                </button>
              ))}
          </div>
        </div>
      )}

      {/* Groupes */}
      <div className="section-head">
        <h3>Groupes de course</h3>
      </div>
      <div className="card">
        {groupes && groupes.length > 0 && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
            {groupes.map((g) => (
              <span key={g.id} className="badge accent" style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                {g.nom}
                <button className="btn-ghost" style={{ minHeight: 0, padding: 0, color: 'inherit' }} onClick={() => softDelete('groupe', g.id)} aria-label="Retirer">
                  ✕
                </button>
              </span>
            ))}
          </div>
        )}
        <form onSubmit={ajouterGroupe} style={{ display: 'flex', gap: 8 }}>
          <input value={newGroupe} onChange={(e) => setNewGroupe(e.target.value)} placeholder="ex. Groupe 2 Filles" />
          <button className="btn-sm" style={{ minHeight: 48 }}>
            Ajouter
          </button>
        </form>
      </div>

      <button className="btn-danger btn-block" onClick={supprimer} style={{ marginTop: 12 }}>
        Supprimer la compétition
      </button>
    </Page>
  )
}

function EpreuveForm({
  competitionId,
  distances,
  groupes,
  ordre,
  onDone,
  filtre,
}: {
  competitionId: string
  distances: { id: string; libelle: string; type_piste: string; type_course: TypeCourse }[]
  groupes: { id: string; nom: string }[]
  ordre: number
  onDone: () => void
  filtre?: string | null
}) {
  const [distanceId, setDistanceId] = useState(distances[0]?.id ?? '')
  const [groupeId, setGroupeId] = useState('')
  const [nom, setNom] = useState('')
  const [manches, setManches] = useState<'finale' | 'qualif_finale' | 'serie'>('qualif_finale')

  useEffect(() => {
    if (!distanceId && distances[0]) setDistanceId(distances[0].id)
  }, [distances, distanceId])

  async function submit(e: FormEvent) {
    e.preventDefault()
    const d = distances.find((x) => x.id === distanceId)
    if (!d) return
    const ep = await create('epreuve', {
      competition_id: competitionId,
      groupe_id: groupeId || null,
      distance_id: d.id,
      type_course: d.type_course,
      nom: nom.trim() || null,
      ordre,
      commentaire: null,
    })
    const base = { epreuve_id: ep.id, lettre_finale: null, numero_course: null, prevue_a: null, debutee_a: null, nb_patineurs: null, regle_qualification: null, temperature_c: null, vent: null, etat_glace: null, url_video: null, commentaire: null }
    if (manches === 'serie') await create('course', { ...base, type_manche: 'serie_unique', ordre_manche: 1 })
    if (manches === 'finale') await create('course', { ...base, type_manche: 'finale', lettre_finale: 'A', ordre_manche: 1 })
    if (manches === 'qualif_finale') {
      await create('course', { ...base, type_manche: 'qualification', ordre_manche: 1 })
      await create('course', { ...base, type_manche: 'finale', lettre_finale: null, ordre_manche: 2 })
    }
    onDone()
  }

  return (
    <form className="card" onSubmit={submit}>
      <Field label="Distance" hint={filtre ?? undefined}>
        <select value={distanceId} onChange={(e) => setDistanceId(e.target.value)} required>
          {distances.map((d) => (
            <option key={d.id} value={d.id}>
              {d.libelle} · {d.type_piste === 'courte_piste' ? 'CP' : 'LP'}
            </option>
          ))}
        </select>
      </Field>
      <div className="grid2">
        <Field label="Groupe">
          <select value={groupeId} onChange={(e) => setGroupeId(e.target.value)}>
            <option value="">—</option>
            {groupes.map((g) => (
              <option key={g.id} value={g.id}>
                {g.nom}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Nom (facultatif)">
          <input value={nom} onChange={(e) => setNom(e.target.value)} placeholder="ex. 500 m (2)" />
        </Field>
      </div>
      <Field label="Manches à créer" hint="Tu pourras en ajouter ou en retirer ensuite.">
        <select value={manches} onChange={(e) => setManches(e.target.value as typeof manches)}>
          <option value="qualif_finale">Qualification + finale</option>
          <option value="finale">Finale directe</option>
          <option value="serie">Série unique (contre-la-montre)</option>
        </select>
      </Field>
      <div className="actions">
        <button className="btn-primary">Ajouter l'épreuve</button>
        <button type="button" onClick={onDone}>
          Annuler
        </button>
      </div>
    </form>
  )
}
