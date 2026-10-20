import { useLiveQuery } from 'dexie-react-hooks'
import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Empty, Field, Page } from '../components/Layout'
import { db } from '../lib/db'
import { useAthletes, useCourse, useCourses, useEpreuve, useInscriptions, useParticipations } from '../lib/hooks'
import { alive, create, softDelete, update } from '../lib/repo'
import { fmtDate, fmtLongueur, fmtMs, fromLocalInput, longueurPiste, nbToursAttendus, retenu, toLocalInput } from '../lib/time'
import { LIBELLES, mancheLabel, type TypeManche } from '../lib/types'
import { NumInput } from './ChronoEdit'

/* ------------------------------ Épreuve ------------------------------ */
export function EpreuvePage() {
  const { id } = useParams()
  const nav = useNavigate()
  const epreuve = useEpreuve(id)
  const competition = useLiveQuery(() => (epreuve ? db.competition.get(epreuve.competition_id) : undefined), [epreuve?.competition_id])
  const circuitE = useLiveQuery(() => (competition?.circuit_id ? db.circuit.get(competition.circuit_id) : undefined), [competition?.circuit_id])
  const pisteE = useLiveQuery(() => (competition?.piste_id ? db.piste.get(competition.piste_id) : undefined), [competition?.piste_id])
  const distance = useLiveQuery(() => (epreuve ? db.distance.get(epreuve.distance_id) : undefined), [epreuve?.distance_id])
  const courses = useCourses(id)
  const longueurE = longueurPiste(competition, circuitE, pisteE)
  const nbToursE = nbToursAttendus(distance?.metres, longueurE, distance?.nb_tours_defaut)
  const [showForm, setShowForm] = useState(false)

  const resume = useLiveQuery(async () => {
    if (!courses) return []
    return Promise.all(
      courses.map(async (c) => {
        const parts = alive(await db.participation.where('course_id').equals(c.id).toArray())
        const rows = await Promise.all(
          parts.map(async (p) => ({ p, ch: await db.chrono.get(p.chrono_id), a: await db.athlete.get(p.athlete_id) })),
        )
        return { course: c, rows }
      }),
    )
  }, [courses])

  if (epreuve === undefined) return <Page title="Épreuve" back>…</Page>
  if (!epreuve) {
    return (
      <Page title="Épreuve" back>
        <Empty>Épreuve introuvable.</Empty>
      </Page>
    )
  }

  async function supprimer() {
    if (!confirm('Supprimer cette épreuve et ses manches ?')) return
    await softDelete('epreuve', epreuve!.id)
    nav(`/competitions/${epreuve!.competition_id}`, { replace: true })
  }

  const titre = epreuve.nom ?? distance?.libelle ?? 'Épreuve'
  return (
    <Page title={titre} back={`/competitions/${epreuve.competition_id}`}>
      <div className="card">
        <div style={{ fontWeight: 700 }}>{competition?.nom}</div>
        <small>
          {distance?.libelle} · {LIBELLES.type_course[epreuve.type_course]}
          {nbToursE ? ` · ${nbToursE} tours de ${fmtLongueur(longueurE)}` : ''}
        </small>
      </div>

      <div className="section-head">
        <h3>Manches</h3>
        <button className="btn-sm" onClick={() => setShowForm(!showForm)}>
          + Manche
        </button>
      </div>
      {showForm && <CourseForm epreuveId={epreuve.id} ordre={(courses?.length ?? 0) + 1} onDone={() => setShowForm(false)} />}
      {resume && resume.length === 0 && !showForm && <Empty>Aucune manche. Ajoute une qualification, une finale…</Empty>}
      <ul className="list">
        {resume?.map(({ course, rows }) => (
          <li key={course.id}>
            <Link className="row" to={`/courses/${course.id}`} style={{ alignItems: 'flex-start' }}>
              <div className="grow">
                <div className="title">
                  {mancheLabel(course)}
                  {course.numero_course ? ` · #${course.numero_course}` : ''}
                </div>
                <div className="sub">
                  {course.debutee_a ? fmtDate(course.debutee_a, true) : course.prevue_a ? `prévue ${fmtDate(course.prevue_a, true)}` : 'heure inconnue'}
                  {course.nb_patineurs ? ` · ${course.nb_patineurs} patineurs` : ''}
                </div>
                {rows.map(({ p, ch, a }) => (
                  <div key={p.id} className="sub" style={{ marginTop: 4, display: 'flex', gap: 8 }}>
                    <span>{a?.prenom}</span>
                    <span className="mono" style={{ color: 'var(--fg)' }}>
                      {fmtMs(ch ? retenu(ch) : null)}
                    </span>
                    {p.rang_officiel && <span>{p.rang_officiel}ᵉ</span>}
                    {p.statut !== 'termine' && <span className="badge warn">{LIBELLES.statut[p.statut]}</span>}
                  </div>
                ))}
              </div>
              <span className="chev">›</span>
            </Link>
          </li>
        ))}
      </ul>

      <button className="btn-danger btn-block" onClick={supprimer} style={{ marginTop: 16 }}>
        Supprimer l'épreuve
      </button>
    </Page>
  )
}

function CourseForm({ epreuveId, ordre, onDone }: { epreuveId: string; ordre: number; onDone: () => void }) {
  const [type, setType] = useState<TypeManche>('finale')
  const [lettre, setLettre] = useState('A')
  const [numero, setNumero] = useState('')
  async function submit(e: FormEvent) {
    e.preventDefault()
    await create('course', {
      epreuve_id: epreuveId,
      type_manche: type,
      lettre_finale: type === 'finale' ? lettre.trim().toUpperCase() || null : null,
      ordre_manche: ordre,
      numero_course: numero.trim() || null,
      prevue_a: null,
      debutee_a: null,
      nb_patineurs: null,
      regle_qualification: null,
      temperature_c: null,
      vent: null,
      etat_glace: null,
      url_video: null,
      commentaire: null,
    })
    onDone()
  }
  return (
    <form className="card" onSubmit={submit}>
      <div className="grid2">
        <Field label="Type de manche">
          <select value={type} onChange={(e) => setType(e.target.value as TypeManche)}>
            {(Object.keys(LIBELLES.type_manche) as TypeManche[]).map((t) => (
              <option key={t} value={t}>
                {LIBELLES.type_manche[t]}
              </option>
            ))}
          </select>
        </Field>
        {type === 'finale' ? (
          <Field label="Finale">
            <input value={lettre} onChange={(e) => setLettre(e.target.value)} placeholder="A, B, C…" maxLength={2} />
          </Field>
        ) : (
          <Field label="Numéro de course">
            <input value={numero} onChange={(e) => setNumero(e.target.value)} placeholder="ex. 42" />
          </Field>
        )}
      </div>
      <div className="actions">
        <button className="btn-primary">Ajouter</button>
        <button type="button" onClick={onDone}>
          Annuler
        </button>
      </div>
    </form>
  )
}

/* ------------------------------ Course ------------------------------ */
export function CoursePage() {
  const { id } = useParams()
  const nav = useNavigate()
  const course = useCourse(id)
  const epreuve = useEpreuve(course?.epreuve_id)
  const competition = useLiveQuery(() => (epreuve ? db.competition.get(epreuve.competition_id) : undefined), [epreuve?.competition_id])
  const piste = useLiveQuery(() => (competition?.piste_id ? db.piste.get(competition.piste_id) : undefined), [competition?.piste_id])
  const circuit = useLiveQuery(() => (competition?.circuit_id ? db.circuit.get(competition.circuit_id) : undefined), [competition?.circuit_id])
  const distance = useLiveQuery(() => (epreuve ? db.distance.get(epreuve.distance_id) : undefined), [epreuve?.distance_id])
  const participations = useParticipations(id)
  const inscriptions = useInscriptions(epreuve?.competition_id)
  const athletes = useAthletes()
  const chronos = useLiveQuery(
    async () => (participations ? Promise.all(participations.map((p) => db.chrono.get(p.chrono_id))) : []),
    [participations],
  )

  if (course === undefined) return <Page title="Course" back>…</Page>
  if (!course) {
    return (
      <Page title="Course" back>
        <Empty>Course introuvable.</Empty>
      </Page>
    )
  }

  const candidats = (athletes ?? []).filter(
    (a) => (inscriptions?.some((i) => i.athlete_id === a.id) ?? true) && !participations?.some((p) => p.athlete_id === a.id),
  )

  async function saisieManuelle(athleteId: string) {
    const ch = await create('chrono', {
      athlete_id: athleteId,
      contexte: 'competition',
      seance_entrainement_id: null,
      distance_id: epreuve?.distance_id ?? null,
      equipement_id: null,
      source: 'saisie_manuelle',
      debute_a: course!.debutee_a ?? course!.prevue_a ?? null,
      termine_a: null,
      nb_tours_prevus: nbToursAttendus(distance?.metres, longueurPiste(competition, circuit, piste), distance?.nb_tours_defaut),
      longueur_piste_m: longueurPiste(competition, circuit, piste),
      nb_tours_enregistres: 0,
      temps_calcule_ms: null,
      temps_ajuste_ms: null,
      temps_officiel_ms: null,
      chrono_incomplet: false,
      note_ajustement: null,
      commentaire: null,
    })
    await create('participation', {
      course_id: course!.id,
      athlete_id: athleteId,
      chrono_id: ch.id,
      couloir_depart: null,
      type_couloir: null,
      partenaire_paire: null,
      position_arrivee: null,
      rang_officiel: null,
      statut: 'termine',
      qualifie_suivant: null,
      points: null,
      points_sprint: null,
      segments_relais: null,
      coequipiers_relais: null,
      ressenti: null,
      url_video: null,
      commentaire: null,
    })
    nav(`/chrono/${ch.id}`)
  }

  async function supprimer() {
    if (!confirm('Supprimer cette manche et ses résultats ?')) return
    await softDelete('course', course!.id)
    nav(`/epreuves/${course!.epreuve_id}`, { replace: true })
  }

  const titre = `${distance?.libelle ?? ''} · ${mancheLabel(course)}`
  return (
    <Page title={titre} back={`/epreuves/${course.epreuve_id}`}>
      <div className="card">
        <div style={{ fontWeight: 700 }}>{competition?.nom}</div>
        <small>{[piste?.nom, epreuve?.nom].filter(Boolean).join(' · ')}</small>
      </div>

      <div className="section-head">
        <h3>Résultats</h3>
      </div>
      {participations && participations.length === 0 && <Empty>Aucun temps enregistré pour cette manche.</Empty>}
      <ul className="list">
        {participations?.map((p, i) => {
          const a = athletes?.find((x) => x.id === p.athlete_id)
          const ch = chronos?.[i]
          return (
            <li key={p.id}>
              <Link className="row" to={`/chrono/${p.chrono_id}`}>
                <div className="grow">
                  <div className="title">
                    {a?.prenom} {a?.nom}
                  </div>
                  <div className="sub">
                    {p.rang_officiel ? `${p.rang_officiel}ᵉ` : p.position_arrivee ? `${p.position_arrivee}ᵉ à l'arrivée` : 'rang non saisi'}
                    {p.points != null ? ` · ${p.points} pts` : ''}
                    {ch?.temps_officiel_ms != null ? ' · officiel' : ch?.chrono_incomplet ? ' · incomplet' : ''}
                  </div>
                </div>
                {p.statut !== 'termine' && <span className="badge warn">{LIBELLES.statut[p.statut]}</span>}
                <span className="time">{fmtMs(ch ? retenu(ch) : null)}</span>
                <span className="chev">›</span>
              </Link>
            </li>
          )
        })}
      </ul>

      {candidats.length > 0 && (
        <div className="card" style={{ marginTop: 12 }}>
          {candidats.map((a) => (
            <div key={a.id} className="actions" style={{ marginTop: 0, marginBottom: 8 }}>
              <Link className="btn btn-primary" to={`/chrono?course=${course.id}&athlete=${a.id}`}>
                ⏱ Chrono {a.prenom}
              </Link>
              <button onClick={() => saisieManuelle(a.id)}>Saisir un temps</button>
            </div>
          ))}
        </div>
      )}

      <h3 style={{ marginTop: 18 }}>Détails de la manche</h3>
      <div className="card">
        <div className="grid2">
          <Field label="Numéro officiel">
            <input defaultValue={course.numero_course ?? ''} onBlur={(e) => update('course', course.id, { numero_course: e.target.value || null })} />
          </Field>
          <Field label="Patineurs au départ">
            <NumInput value={course.nb_patineurs} onChange={(v) => update('course', course.id, { nb_patineurs: v })} />
          </Field>
        </div>
        <div className="grid2">
          <Field label="Heure prévue">
            <input type="datetime-local" defaultValue={toLocalInput(course.prevue_a)} onBlur={(e) => update('course', course.id, { prevue_a: fromLocalInput(e.target.value) })} />
          </Field>
          <Field label="Heure réelle">
            <input type="datetime-local" defaultValue={toLocalInput(course.debutee_a)} onBlur={(e) => update('course', course.id, { debutee_a: fromLocalInput(e.target.value) })} />
          </Field>
        </div>
        <Field label="Règle de qualification">
          <input defaultValue={course.regle_qualification ?? ''} onBlur={(e) => update('course', course.id, { regle_qualification: e.target.value || null })} placeholder="ex. 2 premières + meilleur 3e temps" />
        </Field>
        {piste?.type_piste === 'longue_piste' && (
          <div className="grid2">
            <Field label="Température (°C)">
              <NumInput value={course.temperature_c} onChange={(v) => update('course', course.id, { temperature_c: v })} decimal />
            </Field>
            <Field label="Vent">
              <input defaultValue={course.vent ?? ''} onBlur={(e) => update('course', course.id, { vent: e.target.value || null })} />
            </Field>
          </div>
        )}
        <Field label="État de la glace">
          <input defaultValue={course.etat_glace ?? ''} onBlur={(e) => update('course', course.id, { etat_glace: e.target.value || null })} />
        </Field>
        <Field label="Lien vidéo">
          <input type="url" defaultValue={course.url_video ?? ''} onBlur={(e) => update('course', course.id, { url_video: e.target.value || null })} placeholder="https://" />
        </Field>
        <Field label="Commentaire">
          <textarea defaultValue={course.commentaire ?? ''} onBlur={(e) => update('course', course.id, { commentaire: e.target.value || null })} />
        </Field>
      </div>
      <button className="btn-danger btn-block" onClick={supprimer}>
        Supprimer la manche
      </button>
    </Page>
  )
}
