import { useLiveQuery } from 'dexie-react-hooks'
import { useNavigate, useParams } from 'react-router-dom'
import { ChronoFiche } from '../components/ChronoFiche'
import { Empty, Page } from '../components/Layout'
import { db } from '../lib/db'
import { useChrono } from '../lib/hooks'
import { mancheLabel } from '../lib/types'


/**
 * Page /chrono/:id : fiche d'un chrono seul. Sert aux chronos d'entraînement et aux liens
 * profonds (accueil, historique, tableau de bord). En compétition, la fiche est intégrée à la
 * page de la manche (/courses/:id), où l'on arrive directement après un chrono.
 */
export default function ChronoEditPage() {
  const { id } = useParams()
  const nav = useNavigate()
  const chrono = useChrono(id)
  const distance = useLiveQuery(() => (chrono?.distance_id ? db.distance.get(chrono.distance_id) : undefined), [chrono?.distance_id])
  const participation = useLiveQuery(
    async () => (id ? (await db.participation.where('chrono_id').equals(id).toArray()).find((p) => !p.deleted_at) : undefined),
    [id],
  )
  const course = useLiveQuery(() => (participation ? db.course.get(participation.course_id) : undefined), [participation?.course_id])

  if (chrono === undefined) return <Page title="Chrono" back>…</Page>
  if (!chrono || chrono.deleted_at) {
    return (
      <Page title="Chrono" back>
        <Empty>Chrono introuvable.</Empty>
      </Page>
    )
  }

  const titre = course ? `${distance?.libelle ?? 'Course'} · ${mancheLabel(course)}` : `Entraînement${distance ? ` · ${distance.libelle}` : ''}`
  const back = course ? `/courses/${course.id}` : chrono.seance_entrainement_id ? `/entrainement/${chrono.seance_entrainement_id}` : '/'

  return (
    <Page title={titre} back={back}>
      <ChronoFiche chronoId={chrono.id} onDeleted={() => nav(back, { replace: true })} />
      <button className="btn-primary btn-block" onClick={() => nav(back)}>
        Terminer
      </button>
    </Page>
  )
}
