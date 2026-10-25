import { useLiveQuery } from 'dexie-react-hooks'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { ChronoFiche } from '../components/ChronoFiche'
import { Empty, Page } from '../components/Layout'
import { db } from '../lib/db'
import { useChrono } from '../lib/hooks'

/**
 * Page /chrono/:id : fiche d'un chrono d'entraînement. Un chrono de compétition n'a qu'un seul
 * écran, la page de sa course (/courses/:id) : les liens profonds (accueil, historique,
 * tableau de bord, saisie rapide) y sont redirigés, avec un retour vers la page d'origine.
 */
export default function ChronoEditPage() {
  const { id } = useParams()
  const nav = useNavigate()
  const chrono = useChrono(id)
  const distance = useLiveQuery(() => (chrono?.distance_id ? db.distance.get(chrono.distance_id) : undefined), [chrono?.distance_id])
  const participation = useLiveQuery(
    async () => (id ? ((await db.participation.where('chrono_id').equals(id).toArray()).find((p) => !p.deleted_at) ?? null) : undefined),
    [id],
  )

  if (chrono === undefined || participation === undefined) return <Page title="Chrono" back>…</Page>
  if (!chrono || chrono.deleted_at) {
    return (
      <Page title="Chrono" back>
        <Empty>Chrono introuvable.</Empty>
      </Page>
    )
  }
  if (participation) return <Navigate to={`/courses/${participation.course_id}`} replace state={{ retour: true, chronoId: chrono.id }} />

  const titre = `Entraînement${distance ? ` · ${distance.libelle}` : ''}`
  const back = chrono.seance_entrainement_id ? `/entrainement/${chrono.seance_entrainement_id}` : '/'

  return (
    <Page title={titre} back={back}>
      <ChronoFiche chronoId={chrono.id} onDeleted={() => nav(back, { replace: true })} />
      <button className="btn-primary btn-block" onClick={() => nav(back)}>
        Terminer
      </button>
    </Page>
  )
}
