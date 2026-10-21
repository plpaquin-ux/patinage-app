import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Chart } from '../components/Chart'
import { Empty, Page } from '../components/Layout'
import { db } from '../lib/db'
import { getDefaultAthleteId, useAthletes, useDistances } from '../lib/hooks'
import { alive } from '../lib/repo'
import { fmtDate, fmtDelta, fmtLongueur, fmtMs, longueurPiste, retenu } from '../lib/time'
import { LIBELLES, mancheLabel, type Chrono, type Course, type Participation, type TypePiste } from '../lib/types'

interface Point {
  id: string
  chrono: Chrono
  part?: Participation
  course?: Course
  competition?: string
  piste?: string
  date: string
  temps: number
  longueur: number | null
}

export default function HistoriquePage() {
  const athletes = useAthletes()
  const [athleteId, setAthleteId] = useState(getDefaultAthleteId() ?? '')
  const [typePiste, setTypePiste] = useState<TypePiste>('courte_piste')
  const [distanceId, setDistanceId] = useState('')
  const [inclureEntrainement, setInclureEntrainement] = useState(false)
  const [longueurFiltre, setLongueurFiltre] = useState<number | 'toutes'>('toutes')
  const distances = useDistances(typePiste)

  useEffect(() => {
    if (!athleteId && athletes?.[0]) setAthleteId(athletes[0].id)
  }, [athletes, athleteId])

  // Distances pour lesquelles l'athlète a des chronos (pour ne pas afficher des listes vides)
  const chronos = useLiveQuery(
    async () => (athleteId ? alive(await db.chrono.where('athlete_id').equals(athleteId).toArray()) : []),
    [athleteId],
  )
  const distancesAvecDonnees = useMemo(() => {
    const ids = new Set(chronos?.map((c) => c.distance_id).filter(Boolean))
    return (distances ?? []).filter((d) => ids.has(d.id))
  }, [chronos, distances])
  useEffect(() => {
    if (!distancesAvecDonnees.some((d) => d.id === distanceId)) setDistanceId(distancesAvecDonnees[0]?.id ?? '')
  }, [distancesAvecDonnees, distanceId])

  const points = useLiveQuery(async (): Promise<Point[]> => {
    if (!chronos || !distanceId) return []
    const out: Point[] = []
    for (const ch of chronos.filter((c) => c.distance_id === distanceId)) {
      const t = retenu(ch)
      if (t == null) continue
      if (ch.contexte === 'entrainement' && !inclureEntrainement) continue
      const part = (await db.participation.where('chrono_id').equals(ch.id).toArray()).find((p) => !p.deleted_at)
      if (part && !['termine', 'avance'].includes(part.statut)) continue
      const course = part ? await db.course.get(part.course_id) : undefined
      const epreuve = course ? await db.epreuve.get(course.epreuve_id) : undefined
      const comp = epreuve ? await db.competition.get(epreuve.competition_id) : undefined
      const piste = comp?.piste_id ? await db.piste.get(comp.piste_id) : undefined
      const circuit = comp?.circuit_id ? await db.circuit.get(comp.circuit_id) : undefined
      const date = course?.debutee_a ?? course?.prevue_a ?? comp?.date_debut ?? ch.debute_a ?? ch.created_at
      const longueur = ch.longueur_piste_m ?? longueurPiste(comp, circuit, piste)
      out.push({ id: ch.id, chrono: ch, part, course, competition: comp?.nom, piste: piste?.nom, date, temps: t, longueur })
    }
    return out.sort((a, b) => a.date.localeCompare(b.date))
  }, [chronos, distanceId, inclureEntrainement])

  const longueurs = useMemo(() => Array.from(new Set((points ?? []).map((p) => p.longueur).filter((l): l is number => l != null))).sort((a, b) => a - b), [points])
  const pts = useMemo(() => (longueurFiltre === 'toutes' ? points : points?.filter((p) => p.longueur === longueurFiltre)), [points, longueurFiltre])
  const best = pts && pts.length ? pts.reduce((m, p) => (p.temps < m.temps ? p : m)) : null
  const dernier = pts?.at(-1)
  const distance = distances?.find((d) => d.id === distanceId)

  return (
    <Page title="Historique">
      <div className="grid2" style={{ marginBottom: 10 }}>
        <select value={athleteId} onChange={(e) => setAthleteId(e.target.value)}>
          {athletes?.map((a) => (
            <option key={a.id} value={a.id}>
              {a.prenom} {a.nom}
            </option>
          ))}
        </select>
        <select value={typePiste} onChange={(e) => setTypePiste(e.target.value as TypePiste)}>
          <option value="courte_piste">Courte piste</option>
          <option value="longue_piste">Longue piste</option>
        </select>
      </div>
      {distancesAvecDonnees.length === 0 ? (
        <Empty>Aucun temps enregistré en {LIBELLES.type_piste[typePiste].toLowerCase()} pour cet athlète.</Empty>
      ) : (
        <>
          <div className="segmented" style={{ overflowX: 'auto' }}>
            {distancesAvecDonnees.map((d) => (
              <button key={d.id} className={d.id === distanceId ? 'active' : ''} onClick={() => setDistanceId(d.id)}>
                {d.libelle}
              </button>
            ))}
          </div>
          {longueurs.length > 1 && (
            <div className="segmented">
              <button className={longueurFiltre === 'toutes' ? 'active' : ''} onClick={() => setLongueurFiltre('toutes')}>
                Toutes longueurs
              </button>
              {longueurs.map((l) => (
                <button key={l} className={longueurFiltre === l ? 'active' : ''} onClick={() => setLongueurFiltre(l)}>
                  Tour de {fmtLongueur(l)}
                </button>
              ))}
            </div>
          )}
          <label className="check" style={{ marginBottom: 8 }}>
            <input type="checkbox" checked={inclureEntrainement} onChange={(e) => setInclureEntrainement(e.target.checked)} />
            Inclure les entraînements
          </label>
          {longueurFiltre === 'toutes' && longueurs.length > 1 && (
            <div className="notice">Attention : des tours de {longueurs.map(fmtLongueur).join(' et ')} sont mélangés ; un même 1000 m n'a pas le même nombre de tours. Filtre par longueur pour comparer à armes égales.</div>
          )}

          {best && dernier && (
            <div className="grid2">
              <div className="card" style={{ margin: 0 }}>
                <small>Meilleur temps</small>
                <div className="mono" style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--ok)' }}>
                  {fmtMs(best.temps)}
                </div>
                <small>
                  {fmtDate(best.date)}
                  {best.competition ? ` · ${best.competition}` : ''}
                </small>
              </div>
              <div className="card" style={{ margin: 0 }}>
                <small>Dernier</small>
                <div className="mono" style={{ fontSize: '1.6rem', fontWeight: 800 }}>
                  {fmtMs(dernier.temps)}
                </div>
                <small>{dernier.temps === best.temps ? 'Record personnel' : `${fmtDelta(dernier.temps - best.temps)} vs record`}</small>
              </div>
            </div>
          )}

          {pts && pts.length >= 2 && (
            <div className="card" style={{ marginTop: 12 }}>
              <h3>Évolution · {distance?.libelle}{longueurFiltre !== 'toutes' ? ` · tour de ${fmtLongueur(longueurFiltre)}` : ''}</h3>
              <Chart
                points={pts}
                renderInfo={(s) => (
                  <>
                    <strong className="mono">{fmtMs(s.temps)}</strong> · {fmtDate(s.date)}
                    {s.competition ? ` · ${s.competition}` : ' · Entraînement'}
                    {s.course ? ` · ${mancheLabel(s.course)}` : ''}
                    {s.part?.rang_officiel ? ` · ${s.part.rang_officiel}ᵉ` : ''} · <Link to={`/chrono/${s.chrono.id}`}>ouvrir</Link>
                  </>
                )}
              />
              <small>Temps retenu par course (officiel, sinon ajusté, sinon calculé). Touche un point pour les détails.</small>
            </div>
          )}

          <table className="table" style={{ marginTop: 12 }}>
            <thead>
              <tr>
                <th>Date</th>
                <th>Contexte</th>
                <th style={{ textAlign: 'right' }}>Temps</th>
              </tr>
            </thead>
            <tbody>
              {[...(pts ?? [])].reverse().map((p) => (
                <tr key={p.chrono.id}>
                  <td>
                    <Link to={`/chrono/${p.chrono.id}`}>{fmtDate(p.date)}</Link>
                  </td>
                  <td>
                    {p.course ? (
                      <>
                        {p.competition}
                        <br />
                        <small>
                          {mancheLabel(p.course)}
                          {p.part?.rang_officiel ? ` · ${p.part.rang_officiel}ᵉ` : ''}
                          {p.piste ? ` · ${p.piste}` : ''}
                          {p.longueur != null ? ` · tour de ${fmtLongueur(p.longueur)}` : ''}
                        </small>
                      </>
                    ) : (
                      <small>Entraînement{p.longueur != null ? ` · tour de ${fmtLongueur(p.longueur)}` : ''}</small>
                    )}
                  </td>
                  <td className="num" style={{ color: p === best ? 'var(--ok)' : undefined, fontWeight: 600 }}>
                    {fmtMs(p.temps)}
                    {p.chrono.temps_officiel_ms == null && <small> *</small>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <small>* temps non officiel (chrono manuel)</small>
        </>
      )}
    </Page>
  )
}
