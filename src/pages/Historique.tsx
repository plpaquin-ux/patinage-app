import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Empty, Page } from '../components/Layout'
import { db } from '../lib/db'
import { getDefaultAthleteId, useAthletes, useDistances } from '../lib/hooks'
import { alive } from '../lib/repo'
import { fmtDate, fmtDelta, fmtLongueur, fmtMs, longueurPiste, parseDateLocale, retenu } from '../lib/time'
import { LIBELLES, mancheLabel, type Chrono, type Course, type Participation, type TypePiste } from '../lib/types'

interface Point {
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
      out.push({ chrono: ch, part, course, competition: comp?.nom, piste: piste?.nom, date, temps: t, longueur })
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
              <Chart points={pts} />
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

/* Graphique SVG : une série, axe y = temps (plus bas = mieux), infobulle au toucher. */
function Chart({ points }: { points: Point[] }) {
  const [sel, setSel] = useState<number | null>(null)
  const W = 640
  const H = 260
  const m = { t: 16, r: 16, b: 36, l: 56 }
  const xs = points.map((p) => parseDateLocale(p.date).getTime())
  const ys = points.map((p) => p.temps)
  const x0 = Math.min(...xs)
  const x1 = Math.max(...xs)
  const yMin = Math.min(...ys)
  const yMax = Math.max(...ys)
  const pad = Math.max((yMax - yMin) * 0.15, 500)
  const y0 = yMin - pad
  const y1 = yMax + pad
  const X = (v: number) => m.l + (x1 === x0 ? (W - m.l - m.r) / 2 : ((v - x0) / (x1 - x0)) * (W - m.l - m.r))
  const Y = (v: number) => m.t + ((v - y0) / (y1 - y0)) * (H - m.t - m.b)
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${X(xs[i]).toFixed(1)},${Y(p.temps).toFixed(1)}`).join(' ')
  const bestIdx = ys.indexOf(yMin)
  const yTicks = 4
  const ticks = Array.from({ length: yTicks + 1 }, (_, i) => y0 + ((y1 - y0) * i) / yTicks)
  const s = sel != null ? points[sel] : null

  return (
    <div style={{ position: 'relative' }}>
      <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Évolution des temps">
        {ticks.map((t, i) => (
          <g key={i}>
            <line className="axis" x1={m.l} x2={W - m.r} y1={Y(t)} y2={Y(t)} strokeDasharray={i === 0 || i === yTicks ? undefined : '2 4'} />
            <text className="tick" x={m.l - 6} y={Y(t) + 3} textAnchor="end">
              {fmtMs(t, { decimals: 2 })}
            </text>
          </g>
        ))}
        <text className="tick" x={m.l} y={H - 8}>
          {fmtDate(points[0].date)}
        </text>
        <text className="tick" x={W - m.r} y={H - 8} textAnchor="end">
          {fmtDate(points.at(-1)!.date)}
        </text>
        <path className="line" d={path} />
        {points.map((p, i) => (
          <g key={p.chrono.id} onClick={() => setSel(sel === i ? null : i)} style={{ cursor: 'pointer' }}>
            <circle cx={X(xs[i])} cy={Y(p.temps)} r={18} fill="transparent" />
            <circle className={`pt${i === bestIdx ? ' best' : ''}`} cx={X(xs[i])} cy={Y(p.temps)} r={sel === i ? 7 : 5} stroke="var(--bg-2)" strokeWidth={2} />
          </g>
        ))}
        <text className="tick" x={X(xs[bestIdx])} y={Y(yMin) + 18} textAnchor="middle" style={{ fill: 'var(--ok)', fontWeight: 700 }}>
          {fmtMs(yMin)}
        </text>
      </svg>
      {s && (
        <div className="notice" style={{ marginTop: 6 }}>
          <strong className="mono">{fmtMs(s.temps)}</strong> · {fmtDate(s.date)}
          {s.competition ? ` · ${s.competition}` : ' · Entraînement'}
          {s.course ? ` · ${mancheLabel(s.course)}` : ''}
          {s.part?.rang_officiel ? ` · ${s.part.rang_officiel}ᵉ` : ''} ·{' '}
          <Link to={`/chrono/${s.chrono.id}`}>ouvrir</Link>
        </div>
      )}
    </div>
  )
}
