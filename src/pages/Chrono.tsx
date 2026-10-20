import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Empty, Field, Page } from '../components/Layout'
import { db } from '../lib/db'
import {
  getDefaultAthleteId,
  setDefaultAthleteId,
  useAthletes,
  useCompetitions,
  useCourses,
  useDistances,
  useEpreuves,
  useSeances,
} from '../lib/hooks'
import { create, update } from '../lib/repo'
import { useStopwatch, type StopwatchContext } from '../lib/stopwatch'
import { fmtMs, todayIsoDate } from '../lib/time'
import { mancheLabel, type Distance } from '../lib/types'

export default function ChronoPage() {
  const sw = useStopwatch()
  const nav = useNavigate()
  const [saving, setSaving] = useState(false)

  async function enregistrer() {
    const { state, laps, total } = sw
    const ctx = state.context
    if (!ctx || !state.startedAt || !state.stoppedAt) return
    setSaving(true)
    try {
      const nbPrevus = ctx.nbToursPrevus
      const chrono = await create('chrono', {
        athlete_id: ctx.athleteId,
        contexte: ctx.courseId ? 'competition' : 'entrainement',
        seance_entrainement_id: ctx.seanceId,
        distance_id: ctx.distanceId,
        equipement_id: null,
        source: 'chrono_app',
        debute_a: new Date(state.startedAt).toISOString(),
        termine_a: new Date(state.stoppedAt).toISOString(),
        nb_tours_prevus: nbPrevus,
        nb_tours_enregistres: laps.length,
        temps_calcule_ms: total,
        temps_ajuste_ms: null,
        temps_officiel_ms: null,
        chrono_incomplet: nbPrevus != null && laps.length !== nbPrevus,
        note_ajustement: null,
        commentaire: null,
      })
      for (const l of laps) {
        await create('tour', {
          chrono_id: chrono.id,
          numero_tour: l.n,
          temps_tour_ms: l.ms,
          temps_tour_capture_ms: l.ms,
          cumul_capture_ms: l.cumul,
          capture_a: new Date(l.at).toISOString(),
          position_peloton: null,
          commentaire: null,
        })
      }
      if (ctx.courseId) {
        await create('participation', {
          course_id: ctx.courseId,
          athlete_id: ctx.athleteId,
          chrono_id: chrono.id,
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
        // Horodatage réel de la course = départ du premier chrono enregistré
        const course = await db.course.get(ctx.courseId)
        if (course && !course.debutee_a) await update('course', course.id, { debutee_a: chrono.debute_a })
      }
      sw.reset()
      nav(`/chrono/${chrono.id}`, { replace: true })
    } finally {
      setSaving(false)
    }
  }

  if (!sw.state.context) return <Setup onArm={sw.arm} />

  const ctx = sw.state.context
  const { laps, current, total } = sw
  const best = laps.length > 1 ? Math.min(...laps.map((l) => l.ms)) : null
  const worst = laps.length > 1 ? Math.max(...laps.map((l) => l.ms)) : null
  const toursAttendus = ctx.nbToursPrevus

  return (
    <Page title={ctx.label} full>
      <div className="chrono-screen">
        <div className="chrono-display">
          <div className="chrono-main">{fmtMs(total, { decimals: sw.stopped ? 3 : 2, forceMinutes: total >= 60000 })}</div>
          <div className="chrono-sub">
            <div>
              <span className="label">Tour en cours</span>
              <span className="mono">{fmtMs(sw.stopped ? (laps.at(-1)?.ms ?? 0) : current, { decimals: 2 })}</span>
            </div>
            <div>
              <span className="label">Tours</span>
              <span className="mono">
                {sw.stopped ? laps.length : laps.length + (sw.running ? 1 : 0)}
                {toursAttendus ? ` / ${toursAttendus}` : ''}
              </span>
            </div>
            {best != null && (
              <div>
                <span className="label">Meilleur</span>
                <span className="mono" style={{ color: 'var(--ok)' }}>
                  {fmtMs(best, { decimals: 2 })}
                </span>
              </div>
            )}
          </div>
        </div>

        <div className="laps">
          {laps.length === 0 && (
            <Empty>{sw.running ? 'Appuie sur TOUR à chaque passage de la ligne.' : 'Prêt. Appuie sur DÉPART au signal.'}</Empty>
          )}
          {[...laps].reverse().map((l) => (
            <div key={l.n} className={`lap${l.ms === best ? ' best' : ''}${l.ms === worst ? ' worst' : ''}`}>
              <span className="n">T{l.n}</span>
              <span className="t">{fmtMs(l.ms, { decimals: 2 })}</span>
              <span className="c">{fmtMs(l.cumul, { decimals: 2 })}</span>
            </div>
          ))}
        </div>

        {!sw.running && !sw.stopped && (
          <div className="chrono-controls">
            <button className="bigbtn start" onClick={sw.start}>
              DÉPART
            </button>
            <button className="btn-ghost" onClick={sw.reset} style={{ gridColumn: '1 / -1' }}>
              Changer de course / d'athlète
            </button>
          </div>
        )}
        {sw.running && (
          <div className="chrono-controls">
            <button className="bigbtn lap" onClick={sw.lap}>
              TOUR
            </button>
            <button className="bigbtn stop" onClick={sw.stop}>
              ARRIVÉE
            </button>
            <button className="btn-ghost btn-sm" onClick={sw.undoLap} disabled={laps.length === 0} style={{ gridColumn: '1 / -1' }}>
              Annuler le dernier tour
            </button>
          </div>
        )}
        {sw.stopped && (
          <div className="chrono-controls">
            <button className="btn-primary bigbtn" style={{ gridColumn: '1 / -1', minHeight: 72 }} onClick={enregistrer} disabled={saving}>
              {saving ? 'Enregistrement…' : 'Enregistrer et réviser'}
            </button>
            <button onClick={() => sw.arm(ctx)}>Recommencer</button>
            <button className="btn-danger" onClick={() => confirm('Abandonner ce chrono ?') && sw.reset()}>
              Abandonner
            </button>
          </div>
        )}
      </div>
    </Page>
  )
}

/* ------------------------------------------------------------------ */

function Setup({ onArm }: { onArm: (c: StopwatchContext) => void }) {
  const [params] = useSearchParams()
  const athletes = useAthletes()
  const [athleteId, setAthleteId] = useState<string>(params.get('athlete') ?? getDefaultAthleteId() ?? '')
  const [mode, setMode] = useState<'competition' | 'entrainement'>(params.get('course') ? 'competition' : params.get('seance') ? 'entrainement' : 'entrainement')
  const [competitionId, setCompetitionId] = useState('')
  const [epreuveId, setEpreuveId] = useState('')
  const [courseId, setCourseId] = useState(params.get('course') ?? '')
  const [seanceId, setSeanceId] = useState(params.get('seance') ?? '')
  const [distanceId, setDistanceId] = useState('')
  const [nbTours, setNbTours] = useState<string>('')

  const competitions = useCompetitions()
  const epreuves = useEpreuves(competitionId || undefined)
  const courses = useCourses(epreuveId || undefined)
  const seances = useSeances(athleteId || null)
  const distances = useDistances()

  useEffect(() => {
    if (!athleteId && athletes && athletes.length > 0) setAthleteId(athletes[0].id)
  }, [athletes, athleteId])

  // Pré-remplissage depuis ?course=…
  useEffect(() => {
    const cid = params.get('course')
    if (!cid) return
    ;(async () => {
      const c = await db.course.get(cid)
      if (!c) return
      const e = await db.epreuve.get(c.epreuve_id)
      if (!e) return
      setCompetitionId(e.competition_id)
      setEpreuveId(e.id)
      setCourseId(c.id)
      setDistanceId(e.distance_id)
    })()
  }, [params])

  // Distance déduite de l'épreuve en mode compétition
  useEffect(() => {
    if (mode !== 'competition' || !epreuveId) return
    const e = epreuves?.find((x) => x.id === epreuveId)
    if (e) setDistanceId(e.distance_id)
  }, [mode, epreuveId, epreuves])

  const distance: Distance | undefined = useMemo(() => distances?.find((d) => d.id === distanceId), [distances, distanceId])
  useEffect(() => {
    if (distance?.nb_tours_defaut != null) setNbTours(String(Math.ceil(distance.nb_tours_defaut)))
  }, [distance])

  const athlete = athletes?.find((a) => a.id === athleteId)
  const ready = !!athleteId && (mode === 'entrainement' ? true : !!courseId)

  async function go() {
    if (!athlete) return
    setDefaultAthleteId(athlete.id)
    let sid: string | null = null
    let label = athlete.prenom
    if (mode === 'entrainement') {
      sid = seanceId
      if (!sid) {
        const s = await create('seance_entrainement', {
          athlete_id: athlete.id,
          piste_id: null,
          date_seance: new Date().toISOString(),
          type_seance: null,
          objectif: null,
          ressenti: null,
          commentaire: null,
        })
        sid = s.id
      }
      label += ` · Entraînement${distance ? ` · ${distance.libelle}` : ''}`
    } else {
      const c = courses?.find((x) => x.id === courseId)
      label += ` · ${distance?.libelle ?? ''}${c ? ` · ${mancheLabel(c)}` : ''}`
    }
    onArm({
      athleteId: athlete.id,
      distanceId: distanceId || null,
      nbToursPrevus: nbTours ? Number(nbTours) : null,
      courseId: mode === 'competition' ? courseId : null,
      seanceId: sid,
      label,
    })
  }

  if (athletes && athletes.length === 0) {
    return (
      <Page title="Chrono">
        <Empty>
          Aucun athlète. <a href="#/plus/athletes">Ajoute un athlète</a> pour commencer.
        </Empty>
      </Page>
    )
  }

  return (
    <Page title="Nouveau chrono">
      <Field label="Athlète">
        <select value={athleteId} onChange={(e) => setAthleteId(e.target.value)}>
          {athletes?.map((a) => (
            <option key={a.id} value={a.id}>
              {a.prenom} {a.nom}
            </option>
          ))}
        </select>
      </Field>

      <div className="segmented">
        <button className={mode === 'entrainement' ? 'active' : ''} onClick={() => setMode('entrainement')}>
          Entraînement
        </button>
        <button className={mode === 'competition' ? 'active' : ''} onClick={() => setMode('competition')}>
          Compétition
        </button>
      </div>

      {mode === 'competition' && (
        <>
          <Field label="Compétition">
            <select value={competitionId} onChange={(e) => (setCompetitionId(e.target.value), setEpreuveId(''), setCourseId(''))}>
              <option value="">— Choisir —</option>
              {competitions?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nom} ({c.date_debut})
                </option>
              ))}
            </select>
          </Field>
          {competitionId && (
            <Field label="Épreuve (distance)">
              <select value={epreuveId} onChange={(e) => (setEpreuveId(e.target.value), setCourseId(''))}>
                <option value="">— Choisir —</option>
                {epreuves?.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.nom ?? distances?.find((d) => d.id === e.distance_id)?.libelle ?? 'Épreuve'}
                  </option>
                ))}
              </select>
              {epreuves?.length === 0 && (
                <small>
                  Aucune épreuve. <a href={`#/competitions/${competitionId}`}>Ajoute-en dans la compétition.</a>
                </small>
              )}
            </Field>
          )}
          {epreuveId && (
            <Field label="Course (manche)">
              <select value={courseId} onChange={(e) => setCourseId(e.target.value)}>
                <option value="">— Choisir —</option>
                {courses?.map((c) => (
                  <option key={c.id} value={c.id}>
                    {mancheLabel(c)}
                    {c.numero_course ? ` · #${c.numero_course}` : ''}
                  </option>
                ))}
              </select>
              {courses?.length === 0 && (
                <small>
                  Aucune course. <a href={`#/epreuves/${epreuveId}`}>Ajoute une manche à l'épreuve.</a>
                </small>
              )}
            </Field>
          )}
        </>
      )}

      {mode === 'entrainement' && (
        <>
          <Field label="Séance">
            <select value={seanceId} onChange={(e) => setSeanceId(e.target.value)}>
              <option value="">Nouvelle séance (aujourd'hui)</option>
              {seances
                ?.filter((s) => s.date_seance.slice(0, 10) >= todayIsoDate().slice(0, 10) || s === seances[0])
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.date_seance.slice(0, 10)} {s.type_seance ? `· ${s.type_seance}` : ''}
                  </option>
                ))}
            </select>
          </Field>
          <Field label="Distance (facultatif)">
            <select value={distanceId} onChange={(e) => setDistanceId(e.target.value)}>
              <option value="">— Aucune —</option>
              {distances?.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.libelle} · {d.type_piste === 'courte_piste' ? 'CP' : 'LP'}
                </option>
              ))}
            </select>
          </Field>
        </>
      )}

      <Field label="Nombre de tours attendus" hint="Sert à signaler un tour manqué. Laisse vide si inconnu.">
        <input className="mono" inputMode="numeric" value={nbTours} onChange={(e) => setNbTours(e.target.value.replace(/\D/g, ''))} placeholder="ex. 5" />
      </Field>

      <button className="btn-primary btn-block bigbtn" disabled={!ready} onClick={go}>
        Préparer le chrono
      </button>
    </Page>
  )
}
