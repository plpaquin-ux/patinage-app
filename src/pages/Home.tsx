import { useLiveQuery } from 'dexie-react-hooks'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { Empty, Page } from '../components/Layout'
import { db } from '../lib/db'
import { useAthletes, useCompetitions } from '../lib/hooks'
import { alive } from '../lib/repo'
import { fmtDate, fmtMs, retenu, todayIsoDate } from '../lib/time'
import { mancheLabel } from '../lib/types'

export default function HomePage() {
  const { compte } = useAuth()
  const athletes = useAthletes()
  const competitions = useCompetitions()
  const today = todayIsoDate()
  const aVenir = competitions?.filter((c) => (c.date_fin ?? c.date_debut) >= today).slice(-3).reverse()
  const recentes = competitions?.filter((c) => (c.date_fin ?? c.date_debut) < today).slice(0, 3)

  const derniers = useLiveQuery(async () => {
    const chronos = alive(await db.chrono.toArray())
      .sort((a, b) => (b.debute_a ?? b.created_at).localeCompare(a.debute_a ?? a.created_at))
      .slice(0, 6)
    return Promise.all(
      chronos.map(async (ch) => {
        const athlete = await db.athlete.get(ch.athlete_id)
        const distance = ch.distance_id ? await db.distance.get(ch.distance_id) : undefined
        const part = (await db.participation.where('chrono_id').equals(ch.id).toArray()).find((p) => !p.deleted_at)
        const course = part ? await db.course.get(part.course_id) : undefined
        return { ch, athlete, distance, course, part }
      }),
    )
  }, [])

  return (
    <Page title={compte?.nom ?? 'Accueil'}>
      <div className="actions" style={{ marginTop: 0 }}>
        <Link className="btn btn-primary" to="/chrono" style={{ minHeight: 64, fontSize: '1.1rem' }}>
          ⏱ Nouveau chrono
        </Link>
        <Link className="btn" to="/competitions/nouvelle" style={{ minHeight: 64 }}>
          + Compétition
        </Link>
      </div>
      <Link className="btn btn-block" to="/saisie" style={{ marginTop: 10 }}>
        ✎ Saisir un résultat passé (sans chrono)
      </Link>

      {athletes && athletes.length === 0 && (
        <div className="notice" style={{ marginTop: 14 }}>
          Commence par <Link to="/plus/athletes">ajouter un athlète</Link>.
        </div>
      )}

      {aVenir && aVenir.length > 0 && (
        <>
          <div className="section-head">
            <h3>À venir</h3>
          </div>
          <ul className="list">
            {aVenir.map((c) => (
              <li key={c.id}>
                <Link className="row" to={`/competitions/${c.id}`}>
                  <div className="grow">
                    <div className="title">{c.nom}</div>
                    <div className="sub">{fmtDate(c.date_debut)}</div>
                  </div>
                  <span className="chev">›</span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}

      <div className="section-head">
        <h3>Derniers chronos</h3>
        <Link to="/historique" className="btn-ghost btn-sm">
          Historique
        </Link>
      </div>
      {derniers && derniers.length === 0 && <Empty>Aucun chrono pour l'instant.</Empty>}
      <ul className="list">
        {derniers?.map(({ ch, athlete, distance, course, part }) => (
          <li key={ch.id}>
            <Link className="row" to={`/chrono/${ch.id}`}>
              <div className="grow">
                <div className="title">
                  {athlete?.prenom} · {distance?.libelle ?? (ch.contexte === 'entrainement' ? 'Entraînement' : 'Course')}
                  {course ? ` · ${mancheLabel(course)}` : ''}
                </div>
                <div className="sub">
                  {fmtDate(ch.debute_a ?? ch.created_at, true)}
                  {part?.rang_officiel ? ` · ${part.rang_officiel}ᵉ` : ''}
                  {ch.chrono_incomplet ? ' · incomplet' : ''}
                </div>
              </div>
              <span className="time">{fmtMs(retenu(ch))}</span>
            </Link>
          </li>
        ))}
      </ul>

      {recentes && recentes.length > 0 && (
        <>
          <div className="section-head">
            <h3>Compétitions récentes</h3>
            <Link to="/competitions" className="btn-ghost btn-sm">
              Toutes
            </Link>
          </div>
          <ul className="list">
            {recentes.map((c) => (
              <li key={c.id}>
                <Link className="row" to={`/competitions/${c.id}`}>
                  <div className="grow">
                    <div className="title">{c.nom}</div>
                    <div className="sub">{fmtDate(c.date_debut)}</div>
                  </div>
                  <span className="chev">›</span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </Page>
  )
}
