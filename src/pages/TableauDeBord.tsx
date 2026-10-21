import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Empty, Page } from '../components/Layout'
import { TableauDeBord } from '../components/TableauDeBord'
import { getDefaultAthleteId, setDefaultAthleteId, useAthletes } from '../lib/hooks'
import { portraitLocal } from '../lib/portrait'

/** Tableau de bord interne : la même vue que la page partagée, calculée hors ligne depuis IndexedDB. */
export default function TableauDeBordPage() {
  const athletes = useAthletes()
  const [athleteId, setAthleteId] = useState(getDefaultAthleteId() ?? '')
  useEffect(() => {
    if (!athleteId && athletes?.[0]) setAthleteId(athletes[0].id)
  }, [athletes, athleteId])

  // Réactif : toute écriture locale (chrono, résultat, inscription…) rafraîchit la vue.
  const data = useLiveQuery(() => (athleteId ? portraitLocal(athleteId) : Promise.resolve(null)), [athleteId])

  return (
    <Page title="Tableau de bord">
      {athletes && athletes.length > 1 && (
        <select
          value={athleteId}
          onChange={(e) => {
            setAthleteId(e.target.value)
            setDefaultAthleteId(e.target.value)
          }}
          style={{ marginBottom: 10 }}
          aria-label="Athlète"
        >
          {athletes.map((a) => (
            <option key={a.id} value={a.id}>
              {a.prenom} {a.nom}
            </option>
          ))}
        </select>
      )}
      {athletes && athletes.length === 0 ? (
        <Empty>
          Aucun athlète. <Link to="/plus/athletes">Ajoute-en un</Link> pour commencer.
        </Empty>
      ) : data === undefined ? (
        <div className="muted">Chargement…</div>
      ) : data === null ? (
        <Empty>Athlète introuvable.</Empty>
      ) : (
        <>
          <TableauDeBord data={data} liens />
          <p className="muted" style={{ textAlign: 'center', marginTop: 20 }}>
            <small>
              Même vue que la page partagée avec la famille · <Link to="/plus/athletes">gérer les liens de partage</Link>
            </small>
          </p>
        </>
      )}
    </Page>
  )
}
