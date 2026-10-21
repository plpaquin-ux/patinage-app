import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useParams } from 'react-router-dom'
import { Chart } from '../components/Chart'
import { IconPlay, VideoModal } from '../components/VideoModal'
import { supabase } from '../lib/supabase'
import { fmtDate, fmtDelta, fmtLongueur, fmtMs, todayIsoDate } from '../lib/time'
import { LIBELLES, mancheLabel, type StatutResultat, type TypeCourse, type TypeManche, type TypePiste } from '../lib/types'

/* ------------------------------------------------------------------ */
/* Types du JSON retourné par fn_partage_lecture                        */
/* ------------------------------------------------------------------ */
interface PCourse {
  epreuve_id: string
  epreuve_ordre: number | null
  course_id: string
  type_manche: TypeManche
  lettre_finale: string | null
  ordre_manche: number | null
  course_a: string | null
  nb_patineurs: number | null
  distance_id: string
  distance: string
  metres: number
  type_piste: TypePiste
  type_course: TypeCourse
  participation_id: string
  statut: StatutResultat
  rang_officiel: number | null
  position_arrivee: number | null
  points: number | null
  url_video: string | null
  commentaire: string | null
  chrono_id: string
  temps_retenu_ms: number | null
  temps_officiel_ms: number | null
  longueur_piste_m: number | null
  nb_tours_prevus: number | null
  chrono_incomplet: boolean
  tours: number[] | null
}
interface PCompetition {
  id: string
  nom: string
  date_debut: string
  date_fin: string | null
  niveau: string | null
  circuit: string | null
  type_piste: TypePiste | null
  arena: string | null
  ville: string | null
  saison: string | null
  longueur_piste_m: number | null
  rang_final: number | null
  nb_participants: number | null
  points_total: number | null
  dossard: string | null
  courses: PCourse[] | null
}
interface Portrait {
  athlete: { prenom: string; nom: string; categorie: string | null; club: string | null; saison: string | null } | null
  libelle: string | null
  genere_a: string
  competitions: PCompetition[]
}

/** Course aplatie avec sa compétition (pour les records et l'évolution). */
interface Ligne extends PCourse {
  id: string
  competition: PCompetition
  date: string
  temps: number
}

type Etat = { statut: 'chargement' } | { statut: 'introuvable' } | { statut: 'erreur'; message: string } | { statut: 'ok'; data: Portrait; a: number }

const ORDINAL = (n: number) => `${n}${n === 1 ? 'ᵉʳ' : 'ᵉ'}`

/* ------------------------------------------------------------------ */
/* Page                                                                 */
/* ------------------------------------------------------------------ */
export default function PartagePage() {
  const { jeton = '' } = useParams()
  const [etat, setEtat] = useState<Etat>({ statut: 'chargement' })
  const [onglet, setOnglet] = useState<'portrait' | 'competitions'>('portrait')
  const [video, setVideo] = useState<{ url: string; titre: string } | null>(null)

  const charger = useCallback(async () => {
    if (!jeton) return setEtat({ statut: 'introuvable' })
    try {
      const { data, error } = await supabase.rpc('fn_partage_lecture', { p_jeton: jeton })
      if (error) throw error
      if (!data) return setEtat({ statut: 'introuvable' })
      setEtat({ statut: 'ok', data: data as Portrait, a: Date.now() })
    } catch (e) {
      setEtat((prev) => (prev.statut === 'ok' ? prev : { statut: 'erreur', message: e instanceof Error ? e.message : String(e) }))
    }
  }, [jeton])

  useEffect(() => {
    void charger()
    // Pendant une compétition, la famille garde la page ouverte : on recharge au retour au premier plan.
    const onVis = () => document.visibilityState === 'visible' && void charger()
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [charger])

  const fermerVideo = useCallback(() => setVideo(null), [])

  if (etat.statut === 'chargement') return <Centre>Chargement…</Centre>
  if (etat.statut === 'introuvable')
    return (
      <Centre>
        <h2>Lien introuvable</h2>
        <p className="muted">Ce lien de partage n'existe pas ou a été désactivé.</p>
      </Centre>
    )
  if (etat.statut === 'erreur')
    return (
      <Centre>
        <h2>Impossible de charger</h2>
        <p className="muted">Vérifie ta connexion internet.</p>
        <small>{etat.message}</small>
        <button className="btn-primary" style={{ marginTop: 12 }} onClick={() => void charger()}>
          Réessayer
        </button>
      </Centre>
    )

  const { data } = etat
  const nomComplet = data.athlete ? `${data.athlete.prenom} ${data.athlete.nom}`.trim() : 'Athlète'

  return (
    <div className="app partage">
      <header className="topbar">
        <div className="grow" style={{ minWidth: 0 }}>
          <h1>{nomComplet}</h1>
          <small style={{ display: 'block', lineHeight: 1.1 }}>
            {[data.athlete?.categorie, data.athlete?.club].filter(Boolean).join(' · ') || 'Patinage de vitesse'}
          </small>
        </div>
        <button className="btn-sm" onClick={() => void charger()} aria-label="Actualiser" title="Actualiser">
          ↻
        </button>
      </header>
      <main className="content">
        <div className="segmented">
          <button className={onglet === 'portrait' ? 'active' : ''} onClick={() => setOnglet('portrait')}>
            Portrait
          </button>
          <button className={onglet === 'competitions' ? 'active' : ''} onClick={() => setOnglet('competitions')}>
            Compétitions
          </button>
        </div>
        {onglet === 'portrait' ? <PortraitTab data={data} onVideo={setVideo} /> : <CompetitionsTab data={data} onVideo={setVideo} />}
        <p className="muted" style={{ textAlign: 'center', marginTop: 24 }}>
          <small>Mis à jour le {fmtDate(data.genere_a, true)} · lecture seule</small>
        </p>
      </main>
      {video && <VideoModal url={video.url} titre={video.titre} onClose={fermerVideo} />}
    </div>
  )
}

function Centre({ children }: { children: ReactNode }) {
  return (
    <div className="login">
      <div className="card" style={{ textAlign: 'center' }}>{children}</div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Helpers                                                              */
/* ------------------------------------------------------------------ */
function lignes(data: Portrait): Ligne[] {
  const out: Ligne[] = []
  for (const comp of data.competitions) {
    for (const c of comp.courses ?? []) {
      if (c.temps_retenu_ms == null) continue
      out.push({ ...c, id: c.participation_id, competition: comp, date: c.course_a ?? comp.date_debut, temps: c.temps_retenu_ms })
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date))
}

function titreVideo(c: PCourse, comp: PCompetition) {
  return `${c.distance} · ${mancheLabel(c)} · ${comp.nom}`
}

function BadgeStatut({ statut }: { statut: StatutResultat }) {
  if (statut === 'termine') return null
  const cls = statut === 'avance' ? 'ok' : statut === 'penalite' || statut === 'disqualifie' ? 'danger' : 'warn'
  return <span className={`badge ${cls}`}>{LIBELLES.statut[statut]}</span>
}

function Rang({ rang, nb }: { rang: number | null; nb: number | null }) {
  if (rang == null) return null
  const medaille = rang === 1 ? '🥇' : rang === 2 ? '🥈' : rang === 3 ? '🥉' : null
  return (
    <span className="rang">
      {medaille ? <span aria-hidden="true">{medaille} </span> : null}
      {ORDINAL(rang)}
      {nb ? <span className="muted"> / {nb}</span> : null}
    </span>
  )
}

/* ------------------------------------------------------------------ */
/* Onglet Portrait : records par distance + évolution                   */
/* ------------------------------------------------------------------ */
function PortraitTab({ data, onVideo }: { data: Portrait; onVideo: (v: { url: string; titre: string }) => void }) {
  const toutes = useMemo(() => lignes(data), [data])
  const typesPiste = useMemo(() => Array.from(new Set(toutes.map((l) => l.type_piste))).sort(), [toutes])
  const [typePiste, setTypePiste] = useState<TypePiste>('courte_piste')
  useEffect(() => {
    if (typesPiste.length && !typesPiste.includes(typePiste)) setTypePiste(typesPiste[0])
  }, [typesPiste, typePiste])
  const [distanceSel, setDistanceSel] = useState<string | null>(null)

  const valides = useMemo(() => toutes.filter((l) => l.type_piste === typePiste && ['termine', 'avance'].includes(l.statut)), [toutes, typePiste])

  // Records : par distance, en distinguant la longueur du tour (un 1000 m à 9 tours ≠ à 10 tours)
  const records = useMemo(() => {
    const map = new Map<string, { cle: string; distance: string; metres: number; longueur: number | null; best: Ligne; dernier: Ligne; n: number }>()
    for (const l of valides) {
      const cle = `${l.distance_id}|${l.longueur_piste_m ?? ''}`
      const r = map.get(cle)
      if (!r) map.set(cle, { cle, distance: l.distance, metres: l.metres, longueur: l.longueur_piste_m, best: l, dernier: l, n: 1 })
      else {
        r.n++
        if (l.temps < r.best.temps) r.best = l
        if (l.date >= r.dernier.date) r.dernier = l
      }
    }
    return Array.from(map.values()).sort((a, b) => a.metres - b.metres || (a.longueur ?? 0) - (b.longueur ?? 0))
  }, [valides])
  const plusieursLongueurs = useMemo(() => new Set(records.map((r) => r.longueur)).size > 1, [records])

  const nbComp = data.competitions.length
  const nbCourses = toutes.length
  // Podium = top 3 d'une finale (chaque finale A, B, C… remet ses médailles en InterRégional)
  const nbPodiums = toutes.filter((l) => l.rang_officiel != null && l.rang_officiel <= 3 && l.type_manche === 'finale' && ['termine', 'avance'].includes(l.statut)).length
  const nbVideos = data.competitions.reduce((n, c) => n + (c.courses ?? []).filter((x) => x.url_video).length, 0)

  const serie = distanceSel ? valides.filter((l) => `${l.distance_id}|${l.longueur_piste_m ?? ''}` === distanceSel) : []
  const recSel = records.find((r) => r.cle === distanceSel)

  return (
    <>
      <div className="stats">
        <Stat n={nbComp} label="compétitions" />
        <Stat n={nbCourses} label="courses" />
        <Stat n={nbPodiums} label="podiums" />
        <Stat n={nbVideos} label="vidéos" />
      </div>

      {typesPiste.length > 1 && (
        <div className="segmented">
          {typesPiste.map((tp) => (
            <button key={tp} className={tp === typePiste ? 'active' : ''} onClick={() => (setTypePiste(tp), setDistanceSel(null))}>
              {LIBELLES.type_piste[tp]}
            </button>
          ))}
        </div>
      )}

      {records.length === 0 ? (
        <div className="empty">Aucun temps enregistré pour l'instant.</div>
      ) : (
        <>
          <h3>Meilleurs temps{typesPiste.length === 1 ? ` · ${LIBELLES.type_piste[typePiste].toLowerCase()}` : ''}</h3>
          <div className="records">
            {records.map((r) => {
              const actif = r.cle === distanceSel
              const delta = r.dernier.temps - r.best.temps
              return (
                <button key={r.cle} className={`record${actif ? ' active' : ''}`} onClick={() => setDistanceSel(actif ? null : r.cle)} aria-pressed={actif}>
                  <div className="record-head">
                    <span className="record-dist">{r.distance}</span>
                    {plusieursLongueurs && r.longueur != null && <span className="badge">tour {fmtLongueur(r.longueur)}</span>}
                  </div>
                  <div className="mono record-temps">{fmtMs(r.best.temps)}</div>
                  <small>
                    {fmtDate(r.best.date)} · {r.best.competition.nom}
                  </small>
                  <small style={{ display: 'block', marginTop: 4 }}>
                    {r.n} course{r.n > 1 ? 's' : ''} · dernier : <span className="mono">{fmtMs(r.dernier.temps)}</span>
                    {r.n > 1 && delta !== 0 ? <span style={{ color: delta < 0 ? 'var(--ok)' : 'var(--fg-3)' }}> ({fmtDelta(delta)})</span> : null}
                  </small>
                </button>
              )
            })}
          </div>
          <small>Temps des courses terminées (ou avancées). Touche une distance pour voir l'évolution.</small>

          {recSel && (
            <div className="card" style={{ marginTop: 14 }}>
              <h3>
                Évolution · {recSel.distance}
                {plusieursLongueurs && recSel.longueur != null ? ` · tour de ${fmtLongueur(recSel.longueur)}` : ''}
              </h3>
              {serie.length >= 2 ? (
                <Chart
                  points={serie}
                  renderInfo={(s) => (
                    <>
                      <strong className="mono">{fmtMs(s.temps)}</strong> · {fmtDate(s.date)} · {s.competition.nom} · {mancheLabel(s)}
                      {s.rang_officiel ? ` · ${ORDINAL(s.rang_officiel)}` : ''}
                    </>
                  )}
                />
              ) : (
                <small>Une seule course sur cette distance pour l'instant.</small>
              )}
              <table className="table" style={{ marginTop: 10 }}>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Compétition</th>
                    <th style={{ textAlign: 'right' }}>Temps</th>
                  </tr>
                </thead>
                <tbody>
                  {[...serie].reverse().map((l) => (
                    <tr key={l.id}>
                      <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(l.date)}</td>
                      <td>
                        {l.competition.nom}
                        <br />
                        <small>
                          {mancheLabel(l)}
                          {l.rang_officiel ? ` · ${ORDINAL(l.rang_officiel)}` : ''}
                          {l.nb_patineurs ? ` / ${l.nb_patineurs}` : ''}
                        </small>
                      </td>
                      <td className="num" style={{ color: l === recSel.best ? 'var(--ok)' : undefined, fontWeight: 600, whiteSpace: 'nowrap' }}>
                        {fmtMs(l.temps)}
                        {l.url_video && (
                          <button className="play" onClick={() => onVideo({ url: l.url_video!, titre: titreVideo(l, l.competition) })} aria-label="Voir la vidéo">
                            {IconPlay}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </>
  )
}

function Stat({ n, label }: { n: number; label: string }) {
  return (
    <div className="stat">
      <div className="stat-n">{n}</div>
      <small>{label}</small>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Onglet Compétitions : courses par compétition, vidéos                */
/* ------------------------------------------------------------------ */
function CompetitionsTab({ data, onVideo }: { data: Portrait; onVideo: (v: { url: string; titre: string }) => void }) {
  const today = todayIsoDate()
  const [ouvertes, setOuvertes] = useState<Set<string>>(() => new Set(data.competitions.slice(0, 1).map((c) => c.id)))
  const [detail, setDetail] = useState<string | null>(null)
  const toggle = (id: string) =>
    setOuvertes((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })

  if (data.competitions.length === 0) return <div className="empty">Aucune compétition pour l'instant.</div>

  return (
    <ul className="list">
      {data.competitions.map((comp) => {
        const ouverte = ouvertes.has(comp.id)
        const fin = comp.date_fin ?? comp.date_debut
        const enCours = comp.date_debut <= today && fin >= today
        const aVenir = comp.date_debut > today
        const courses = comp.courses ?? []
        // Regroupement par épreuve (distance), dans l'ordre du programme
        const epreuves: { id: string; distance: string; type_course: TypeCourse; courses: PCourse[] }[] = []
        for (const c of courses) {
          let e = epreuves.find((x) => x.id === c.epreuve_id)
          if (!e) epreuves.push((e = { id: c.epreuve_id, distance: c.distance, type_course: c.type_course, courses: [] }))
          e.courses.push(c)
        }
        const nbVideos = courses.filter((c) => c.url_video).length
        return (
          <li key={comp.id} className="card comp" style={{ padding: 0 }}>
            <button className="comp-head" onClick={() => toggle(comp.id)} aria-expanded={ouverte}>
              <div className="grow" style={{ minWidth: 0 }}>
                <div className="title">
                  {comp.nom}
                  {enCours && <span className="badge accent" style={{ marginLeft: 8 }}>En cours</span>}
                  {aVenir && <span className="badge" style={{ marginLeft: 8 }}>À venir</span>}
                </div>
                <div className="sub">
                  {fmtDate(comp.date_debut)}
                  {comp.date_fin && comp.date_fin !== comp.date_debut ? ` → ${fmtDate(comp.date_fin)}` : ''}
                  {[comp.arena ?? comp.ville, comp.circuit].filter(Boolean).map((x) => ` · ${x}`)}
                </div>
                {(comp.rang_final != null || comp.points_total != null) && (
                  <div className="sub" style={{ marginTop: 4, color: 'var(--fg)' }}>
                    {comp.rang_final != null && (
                      <>
                        Classement final : <Rang rang={comp.rang_final} nb={comp.nb_participants} />
                      </>
                    )}
                    {comp.points_total != null ? `${comp.rang_final != null ? ' · ' : ''}${fmtPoints(comp.points_total)} pts` : ''}
                  </div>
                )}
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <small>{courses.length} course{courses.length > 1 ? 's' : ''}</small>
                {nbVideos > 0 && (
                  <small style={{ display: 'block', color: 'var(--accent)' }}>
                    {IconPlay} {nbVideos}
                  </small>
                )}
                <span className="chev" style={{ display: 'block', transform: ouverte ? 'rotate(90deg)' : undefined, transition: 'transform .15s' }}>
                  ›
                </span>
              </div>
            </button>
            {ouverte && (
              <div className="comp-body">
                {epreuves.length === 0 && <small>Aucune course enregistrée.</small>}
                {epreuves.map((e) => (
                  <div key={e.id} className="epreuve">
                    <div className="epreuve-titre">
                      {e.distance}
                      {e.type_course !== 'individuelle' ? ` · ${LIBELLES.type_course[e.type_course]}` : ''}
                    </div>
                    {e.courses.map((c) => {
                      const ouvert = detail === c.participation_id
                      const aDetail = (c.tours && c.tours.length > 0) || c.commentaire
                      return (
                        <div key={c.participation_id} className="course">
                          <button className={`course-row${aDetail ? ' has-detail' : ''}`} onClick={() => aDetail && setDetail(ouvert ? null : c.participation_id)} aria-expanded={aDetail ? ouvert : undefined}>
                            <span className="course-manche">
                              {mancheLabel(c)}
                              <BadgeStatut statut={c.statut} />
                            </span>
                            <span className="course-rang">
                              <Rang rang={c.rang_officiel} nb={c.nb_patineurs} />
                            </span>
                            <span className="mono course-temps">
                              {fmtMs(c.temps_retenu_ms)}
                              {c.temps_retenu_ms != null && c.temps_officiel_ms == null ? <small> *</small> : null}
                            </span>
                          </button>
                          {c.url_video ? (
                            <button className="play big" onClick={() => onVideo({ url: c.url_video!, titre: titreVideo(c, comp) })} aria-label={`Voir la vidéo : ${titreVideo(c, comp)}`}>
                              {IconPlay}
                            </button>
                          ) : (
                            <span className="play placeholder" aria-hidden="true" />
                          )}
                          {ouvert && (
                            <div className="course-detail">
                              {c.tours && c.tours.length > 0 && (
                                <div className="tours">
                                  {c.tours.map((t, i) => {
                                    const best = Math.min(...c.tours!)
                                    return (
                                      <span key={i} className={`tour${t === best ? ' best' : ''}`}>
                                        <small>T{i + 1}</small>
                                        <span className="mono">{fmtMs(t)}</span>
                                      </span>
                                    )
                                  })}
                                  {c.nb_tours_prevus != null && c.longueur_piste_m != null && (
                                    <small style={{ width: '100%' }}>
                                      {c.nb_tours_prevus} tours de {fmtLongueur(c.longueur_piste_m)}
                                      {c.chrono_incomplet ? ' · chrono incomplet' : ''}
                                    </small>
                                  )}
                                </div>
                              )}
                              {c.commentaire && <p className="muted" style={{ margin: '6px 0 0' }}>{c.commentaire}</p>}
                              {c.points != null && <small>{fmtPoints(c.points)} points</small>}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                ))}
                {courses.some((c) => c.temps_retenu_ms != null && c.temps_officiel_ms == null) && <small>* temps au chrono manuel (non officiel)</small>}
              </div>
            )}
          </li>
        )
      })}
    </ul>
  )
}

function fmtPoints(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, '')
}
