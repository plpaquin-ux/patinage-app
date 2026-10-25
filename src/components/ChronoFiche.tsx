import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState, type ReactNode } from 'react'
import { db } from '../lib/db'
import { useAthlete, useChrono, useTours } from '../lib/hooks'
import { create, softDelete, update } from '../lib/repo'
import { fmtDate, fmtDelta, fmtLongueur, fmtMs, retenu } from '../lib/time'
import { LIBELLES, type Chrono, type Participation, type StatutResultat, type Tour, type TypeCouloir } from '../lib/types'
import { Empty, Field } from './Layout'
import { TimeInput } from './TimeInput'

/**
 * Fiche complète d'un chrono : en-tête (athlète, temps retenu), résultat de course, tours,
 * détail du temps, ressenti / vidéo / commentaire. Sans `<Page>` : s'insère dans la page de
 * course (une fiche par athlète) ou dans la page /chrono/:id (entraînement, liens profonds).
 *
 * Sections ordonnées selon l'usage en aréna : ce qu'on remplit en direct est en haut, les
 * champs rarement touchés sont repliés.
 */
export function ChronoFiche({
  chronoId,
  contexte = true,
  complement,
  supprimable = true,
  onDeleted,
}: {
  chronoId: string
  /** Afficher la compétition / séance et la piste dans l'en-tête (inutile dans la page de course, qui les montre déjà). */
  contexte?: boolean
  /** Champs supplémentaires (p. ex. les détails de la course) ajoutés au bas du dernier bloc. */
  complement?: ReactNode
  /** Afficher le bouton de suppression (inutile dans la page de course avec un seul athlète : la course se supprime d'un bloc). */
  supprimable?: boolean
  onDeleted?: () => void
}) {
  const chrono = useChrono(chronoId)
  const tours = useTours(chronoId)
  const athlete = useAthlete(chrono?.athlete_id)
  const participation = useLiveQuery(
    async () => (await db.participation.where('chrono_id').equals(chronoId).toArray()).find((p) => !p.deleted_at),
    [chronoId],
  )
  const course = useLiveQuery(() => (participation ? db.course.get(participation.course_id) : undefined), [participation?.course_id])
  const epreuve = useLiveQuery(() => (course ? db.epreuve.get(course.epreuve_id) : undefined), [course?.epreuve_id])
  const competition = useLiveQuery(() => (epreuve ? db.competition.get(epreuve.competition_id) : undefined), [epreuve?.competition_id])
  const piste = useLiveQuery(() => (competition?.piste_id ? db.piste.get(competition.piste_id) : undefined), [competition?.piste_id])
  const seance = useLiveQuery(
    () => (chrono?.seance_entrainement_id ? db.seance_entrainement.get(chrono.seance_entrainement_id) : undefined),
    [chrono?.seance_entrainement_id],
  )

  const [saved, setSaved] = useState(false)
  useEffect(() => {
    if (!saved) return
    const t = setTimeout(() => setSaved(false), 1500)
    return () => clearTimeout(t)
  }, [saved])

  if (chrono === undefined || tours === undefined) return <div className="card muted">…</div>
  if (!chrono || chrono.deleted_at) return <Empty>Chrono introuvable.</Empty>
  const ch: Chrono = chrono
  const trs: Tour[] = tours

  const calcule = trs.reduce((s, t) => s + t.temps_tour_ms, 0)
  const ret = retenu({ ...ch, temps_calcule_ms: trs.length ? calcule : ch.temps_calcule_ms })
  const ecart = ch.temps_officiel_ms != null ? ch.temps_officiel_ms - (ch.temps_ajuste_ms ?? calcule) : null
  const best = trs.length > 1 ? Math.min(...trs.map((t) => t.temps_tour_ms)) : null
  const longuePiste = piste?.type_piste === 'longue_piste'

  async function patchChrono(p: Partial<Chrono>) {
    await update('chrono', ch.id, p)
    setSaved(true)
  }
  async function patchTour(t: Tour, ms: number) {
    await update('tour', t.id, { temps_tour_ms: ms })
    await recalc()
  }
  async function recalc() {
    const ts = (await db.tour.where('chrono_id').equals(ch.id).toArray()).filter((t) => !t.deleted_at)
    const total = ts.reduce((s, t) => s + t.temps_tour_ms, 0)
    await update('chrono', ch.id, {
      temps_calcule_ms: ts.length ? total : null,
      nb_tours_enregistres: ts.length,
      chrono_incomplet: ch.nb_tours_prevus != null ? ts.length !== ch.nb_tours_prevus : ch.chrono_incomplet,
    })
    setSaved(true)
  }
  async function ajouterTour() {
    const n = (trs.at(-1)?.numero_tour ?? 0) + 1
    await create('tour', {
      chrono_id: ch.id,
      numero_tour: n,
      temps_tour_ms: 0,
      temps_tour_capture_ms: null,
      cumul_capture_ms: null,
      capture_a: null,
      position_peloton: null,
      commentaire: null,
    })
    await recalc()
  }
  /** Contenu d'un tour (temps, capture, notes) : ce qu'on déplace quand on réordonne. Les numéros restent fixes
   *  par ligne, pour ne jamais envoyer au serveur deux tours portant le même numéro (index unique). */
  const CONTENU = ['temps_tour_ms', 'temps_tour_capture_ms', 'cumul_capture_ms', 'capture_a', 'position_peloton', 'commentaire'] as const
  function contenu(t: Tour): Pick<Tour, (typeof CONTENU)[number]> {
    return Object.fromEntries(CONTENU.map((k) => [k, t[k]])) as Pick<Tour, (typeof CONTENU)[number]>
  }
  /** Échange le tour avec son voisin (dir = -1 : vers le haut, +1 : vers le bas). */
  async function deplacerTour(t: Tour, dir: -1 | 1) {
    const idx = trs.findIndex((x) => x.id === t.id)
    const autre = trs[idx + dir]
    if (!autre) return
    await update('tour', t.id, contenu(autre))
    await update('tour', autre.id, contenu(t))
    setSaved(true)
  }
  /** Insère un tour vide juste après t : un tour est créé en fin de liste, puis les contenus glissent d'un cran. */
  async function insererTourApres(t: Tour) {
    const idx = trs.findIndex((x) => x.id === t.id)
    const dernier = await create('tour', {
      chrono_id: ch.id,
      numero_tour: (trs.at(-1)?.numero_tour ?? 0) + 1,
      temps_tour_ms: 0,
      temps_tour_capture_ms: null,
      cumul_capture_ms: null,
      capture_a: null,
      position_peloton: null,
      commentaire: null,
    })
    const liste = [...trs, dernier]
    for (let j = liste.length - 1; j > idx + 1; j--) await update('tour', liste[j].id, contenu(liste[j - 1]))
    await update('tour', liste[idx + 1].id, { temps_tour_ms: 0, temps_tour_capture_ms: null, cumul_capture_ms: null, capture_a: null, position_peloton: null, commentaire: null })
    await recalc()
  }
  async function renumeroter(rest: Tour[]) {
    for (let i = 0; i < rest.length; i++) {
      if (rest[i].numero_tour !== i + 1) await update('tour', rest[i].id, { numero_tour: i + 1 })
    }
  }
  /** Fusionne le tour t avec le précédent : le temps s'additionne, le tour t disparaît, les suivants sont renumérotés. */
  async function fusionnerAvecPrecedent(t: Tour) {
    const idx = trs.findIndex((x) => x.id === t.id)
    if (idx < 1) return
    const prev = trs[idx - 1]
    if (!confirm(`Fusionner T${prev.numero_tour} et T${t.numero_tour} en un seul tour de ${fmtMs(prev.temps_tour_ms + t.temps_tour_ms)} ?`)) return
    await update('tour', prev.id, {
      temps_tour_ms: prev.temps_tour_ms + t.temps_tour_ms,
      commentaire: [prev.commentaire, `fusion avec T${t.numero_tour} (${fmtMs(t.temps_tour_ms)})`].filter(Boolean).join(' · '),
    })
    await softDelete('tour', t.id)
    await renumeroter(trs.filter((x) => x.id !== t.id))
    await recalc()
  }
  async function supprimerTour(t: Tour) {
    if (!confirm(`Supprimer le tour ${t.numero_tour} ?`)) return
    await softDelete('tour', t.id)
    await renumeroter(trs.filter((x) => x.id !== t.id))
    await recalc()
  }
  async function patchParticipation(p: Partial<Participation>) {
    if (!participation) return
    await update('participation', participation.id, p)
    setSaved(true)
  }
  async function patchCourse(p: { nb_patineurs: number | null }) {
    if (!course) return
    await update('course', course.id, p)
    setSaved(true)
  }
  async function supprimerChrono() {
    if (!confirm(participation ? 'Supprimer ce résultat et son chrono ?' : 'Supprimer ce chrono ?')) return
    if (participation) await softDelete('participation', participation.id)
    for (const t of trs) await softDelete('tour', t.id)
    await softDelete('chrono', ch.id)
    onDeleted?.()
  }

  const ligneContexte = competition
    ? `${competition.nom} · ${course?.debutee_a ? fmtDate(course.debutee_a, true) : course?.prevue_a ? fmtDate(course.prevue_a, true) : fmtDate(competition.date_debut)}${piste ? ` · ${piste.nom}` : ''}`
    : seance
      ? `Entraînement · ${fmtDate(seance.date_seance, true)}${piste ? ` · ${piste.nom}` : ''}`
      : fmtDate(ch.debute_a ?? ch.created_at, true)

  return (
    <>
      {/* ---- En-tête : athlète, temps retenu, badges ---- */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
          <div className="grow">
            <div style={{ fontWeight: 700 }}>
              {athlete?.prenom} {athlete?.nom}
              {saved && (
                <span className="badge ok" style={{ marginLeft: 8 }}>
                  Enregistré
                </span>
              )}
            </div>
            {contexte && <small>{ligneContexte}</small>}
            <small style={{ display: 'block', opacity: 0.75 }}>
              {ch.source === 'chrono_app' && ch.debute_a ? `Chrono pris le ${fmtDate(ch.debute_a, true)}` : `Saisi le ${fmtDate(ch.created_at, true)}`}
            </small>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div className="mono" style={{ fontSize: '1.7rem', fontWeight: 800 }}>
              {fmtMs(ret)}
            </div>
            <small>
              {participation?.rang_officiel ? `${participation.rang_officiel}ᵉ${course?.nb_patineurs ? ` / ${course.nb_patineurs}` : ''} · ` : ''}
              temps retenu
            </small>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
          <span className="badge">{ch.source === 'chrono_app' ? 'Chrono app' : ch.source === 'saisie_manuelle' ? 'Saisie manuelle' : 'Import'}</span>
          {ch.longueur_piste_m != null && <span className="badge">tour de {fmtLongueur(ch.longueur_piste_m)}</span>}
          {ch.chrono_incomplet && <span className="badge warn">Tours incomplets</span>}
          {ch.temps_ajuste_ms != null && <span className="badge accent">Total ajusté</span>}
          {ch.temps_officiel_ms != null && <span className="badge ok">Officiel</span>}
          {participation && participation.statut !== 'termine' && <span className="badge warn">{LIBELLES.statut[participation.statut]}</span>}
        </div>
      </div>

      {/* ---- Tours ---- */}
      <div className="section-head">
        <h3>
          Tours ({trs.length}
          {ch.nb_tours_prevus ? ` / ${ch.nb_tours_prevus}` : ''})
        </h3>
        <button className="btn-sm" onClick={ajouterTour}>
          + Tour
        </button>
      </div>
      <div className="card" style={{ padding: '6px 10px' }}>
        {trs.length === 0 && <Empty>{participation ? 'Aucun tour. Saisis le temps officiel ci-dessous ou ajoute des tours.' : 'Aucun tour. Saisis le temps total dans « Détail du temps » ou ajoute des tours.'}</Empty>}
        {trs.map((t, i) => {
          const cumul = trs.slice(0, i + 1).reduce((s, x) => s + x.temps_tour_ms, 0)
          const delta = t.temps_tour_capture_ms != null ? t.temps_tour_ms - t.temps_tour_capture_ms : null
          return (
            <div key={t.id} style={{ display: 'grid', gridTemplateColumns: '40px 1fr auto 36px', gap: 8, alignItems: 'center', padding: '6px 0', borderBottom: '1px solid var(--line)' }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                <button className="btn-ghost btn-sm tour-move" onClick={() => deplacerTour(t, -1)} disabled={i === 0} aria-label={`Monter T${t.numero_tour}`}>
                  ▲
                </button>
                <span className="mono muted">T{t.numero_tour}</span>
                <button className="btn-ghost btn-sm tour-move" onClick={() => deplacerTour(t, 1)} disabled={i === trs.length - 1} aria-label={`Descendre T${t.numero_tour}`}>
                  ▼
                </button>
              </div>
              <div>
                <TimeInput value={t.temps_tour_ms} allowEmpty={false} onChange={(ms) => ms != null && patchTour(t, ms)} className={t.temps_tour_ms === best ? 'best' : ''} />
                {delta != null && delta !== 0 && (
                  <small>
                    capté {fmtMs(t.temps_tour_capture_ms)} ({fmtDelta(delta)})
                  </small>
                )}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0 4px' }}>
                  {i > 0 && (
                    <button className="btn-ghost btn-sm" style={{ minHeight: 28, padding: '0 6px', fontSize: '0.78rem' }} onClick={() => fusionnerAvecPrecedent(t)}>
                      ⤴ fusionner avec T{t.numero_tour - 1}
                    </button>
                  )}
                  <button className="btn-ghost btn-sm" style={{ minHeight: 28, padding: '0 6px', fontSize: '0.78rem' }} onClick={() => insererTourApres(t)}>
                    + tour après T{t.numero_tour}
                  </button>
                </div>
              </div>
              <span className="mono muted" style={{ fontSize: '0.85rem' }}>
                {fmtMs(cumul)}
              </span>
              <button className="btn-ghost btn-sm" style={{ padding: 0, minHeight: 36, color: 'var(--danger)' }} onClick={() => supprimerTour(t)} aria-label="Supprimer">
                ✕
              </button>
            </div>
          )
        })}
      </div>

      {/* ---- Détail du temps : replié en compétition (le temps officiel est dans Résultat), ouvert en entraînement ---- */}
      <Pliable titre="Détail du temps" resume={trs.length ? `calculé ${fmtMs(calcule)}` : undefined} ouvert={!participation}>
        <div className="grid2">
          <Field label="Calculé (somme des tours)">
            <input className="mono" value={trs.length ? fmtMs(calcule) : '—'} readOnly />
          </Field>
          <Field label="Total ajusté" hint="Si tu as raté l'arrivée">
            <TimeInput value={ch.temps_ajuste_ms} onChange={(ms) => patchChrono({ temps_ajuste_ms: ms })} />
          </Field>
        </div>
        {!participation && (
          <Field label="Temps officiel" hint={ecart != null ? `Écart avec ton chrono : ${fmtDelta(ecart)}` : 'Le temps des officiels prime sur les autres.'}>
            <TimeInput value={ch.temps_officiel_ms} onChange={(ms) => patchChrono({ temps_officiel_ms: ms })} />
          </Field>
        )}
        <div className="grid2">
          <Field label="Tours attendus">
            <input
              className="mono"
              inputMode="numeric"
              defaultValue={ch.nb_tours_prevus ?? ''}
              onBlur={(e) => {
                const v = e.target.value.trim()
                const n = v ? Number(v) : null
                patchChrono({ nb_tours_prevus: n, chrono_incomplet: n != null ? trs.length !== n : false })
              }}
            />
          </Field>
          <Field label="Longueur du tour (m)" hint="Figée au moment de la course">
            <input
              className="mono"
              inputMode="decimal"
              defaultValue={ch.longueur_piste_m ?? ''}
              placeholder="100 / 111.12"
              onBlur={(e) => patchChrono({ longueur_piste_m: e.target.value.trim() ? Number(e.target.value.replace(',', '.')) || null : null })}
            />
          </Field>
        </div>
        <label className="check">
          <input type="checkbox" checked={ch.chrono_incomplet} onChange={(e) => patchChrono({ chrono_incomplet: e.target.checked })} />
          Chrono incomplet (tour manqué, départ tardif…)
        </label>
        <Field label="Note sur l'ajustement">
          <input defaultValue={ch.note_ajustement ?? ''} onBlur={(e) => patchChrono({ note_ajustement: e.target.value || null })} placeholder="ex. appui tardif au tour 3" />
        </Field>
      </Pliable>

      {/* ---- Résultat : tout ce qui qualifie la course de l'athlète ---- */}
      {participation && (
        <>
          <h3 style={{ marginTop: 18 }}>Résultat</h3>
          <div className="card">
            <div className="grid2">
              <Field label="Rang officiel">
                <NumInput value={participation.rang_officiel} onChange={(v) => patchParticipation({ rang_officiel: v })} />
              </Field>
              <Field label="Patineurs au départ">
                <NumInput value={course?.nb_patineurs ?? null} onChange={(v) => patchCourse({ nb_patineurs: v })} />
              </Field>
            </div>
            <div className="grid2">
              <Field label="Statut">
                <select value={participation.statut} onChange={(e) => patchParticipation({ statut: e.target.value as StatutResultat })}>
                  {(Object.keys(LIBELLES.statut) as StatutResultat[]).map((s) => (
                    <option key={s} value={s}>
                      {LIBELLES.statut[s]}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Points">
                <NumInput value={participation.points} onChange={(v) => patchParticipation({ points: v })} decimal />
              </Field>
            </div>
            <Field label="Temps officiel" hint={ecart != null ? `Écart avec ton chrono : ${fmtDelta(ecart)}` : 'Le temps des officiels prime sur les autres.'}>
              <TimeInput value={ch.temps_officiel_ms} onChange={(ms) => patchChrono({ temps_officiel_ms: ms })} />
            </Field>
            <div className="grid2">
              <Field label="Position à l'arrivée" hint="Avant pénalités">
                <NumInput value={participation.position_arrivee} onChange={(v) => patchParticipation({ position_arrivee: v })} />
              </Field>
              <Field label="Position de départ">
                <NumInput value={participation.couloir_depart} onChange={(v) => patchParticipation({ couloir_depart: v })} />
              </Field>
            </div>
            {longuePiste && (
              <div className="grid2">
                <Field label="Couloir">
                  <select value={participation.type_couloir ?? ''} onChange={(e) => patchParticipation({ type_couloir: (e.target.value || null) as TypeCouloir | null })}>
                    <option value="">—</option>
                    <option value="interieur">Intérieur</option>
                    <option value="exterieur">Extérieur</option>
                  </select>
                </Field>
                <Field label="Partenaire de paire">
                  <input defaultValue={participation.partenaire_paire ?? ''} onBlur={(e) => patchParticipation({ partenaire_paire: e.target.value || null })} />
                </Field>
              </div>
            )}
            {epreuve?.type_course === 'mass_start' && (
              <Field label="Points de sprint (mass start)">
                <NumInput value={participation.points_sprint} onChange={(v) => patchParticipation({ points_sprint: v })} />
              </Field>
            )}
            {epreuve?.type_course === 'relais' && (
              <Field label="Coéquipières (séparées par des virgules)">
                <input
                  defaultValue={participation.coequipiers_relais?.join(', ') ?? ''}
                  onBlur={(e) =>
                    patchParticipation({
                      coequipiers_relais: e.target.value
                        .split(',')
                        .map((s) => s.trim())
                        .filter(Boolean),
                    })
                  }
                />
              </Field>
            )}
            <label className="check">
              <input type="checkbox" checked={participation.qualifie_suivant ?? false} onChange={(e) => patchParticipation({ qualifie_suivant: e.target.checked })} />
              Qualifiée pour la course suivante (finale)
            </label>
          </div>

          {/* ---- Ressenti, vidéo, commentaire — et les détails de la course quand la page les confie à la fiche ---- */}
          <h3 style={{ marginTop: 18 }}>{complement ? 'Ressenti, vidéo et détails de la course' : 'Ressenti, vidéo et commentaire'}</h3>
          <div className="card">
            <Field label="Ressenti (1–5)">
              <Ressenti value={participation.ressenti} onChange={(v) => patchParticipation({ ressenti: v })} />
            </Field>
            <Field label="Vidéo (lien YouTube)" hint="Lisible dans la page partagée avec la famille">
              <input type="url" inputMode="url" defaultValue={participation.url_video ?? ''} onBlur={(e) => patchParticipation({ url_video: e.target.value || null })} placeholder="https://youtu.be/…" />
            </Field>
            <Field label={`Commentaire sur la course${athlete ? ` de ${athlete.prenom}` : ''}`}>
              <textarea defaultValue={participation.commentaire ?? ''} onBlur={(e) => patchParticipation({ commentaire: e.target.value || null })} />
            </Field>
            {complement && (
              <div style={{ borderTop: '1px solid var(--line)', marginTop: 14, paddingTop: 12 }}>
                <h3 style={{ marginBottom: 10 }}>Détails de la course</h3>
                {complement}
              </div>
            )}
          </div>
        </>
      )}
      {!participation && (
        <div className="card">
          <Field label="Commentaire">
            <textarea defaultValue={ch.commentaire ?? ''} onBlur={(e) => patchChrono({ commentaire: e.target.value || null })} />
          </Field>
        </div>
      )}


      {supprimable && (
        <button className="btn-ghost btn-block" onClick={supprimerChrono} style={{ color: 'var(--danger)', marginBottom: 12 }}>
          {participation ? `Supprimer le résultat${athlete ? ` de ${athlete.prenom}` : ''}` : 'Supprimer le chrono'}
        </button>
      )}
    </>
  )
}

/** Section repliable (carte avec un en-tête cliquable). `resume` s'affiche à droite du titre quand la section est fermée. */
export function Pliable({ titre, resume, ouvert = false, children }: { titre: string; resume?: string; ouvert?: boolean; children: ReactNode }) {
  return (
    <details className="pliable" open={ouvert}>
      <summary>
        <span>{titre}</span>
        {resume && <span className="sub">{resume}</span>}
      </summary>
      <div className="inner">{children}</div>
    </details>
  )
}

export function NumInput({ value, onChange, decimal = false }: { value: number | null; onChange: (v: number | null) => void; decimal?: boolean }) {
  return (
    <input
      className="mono"
      inputMode={decimal ? 'decimal' : 'numeric'}
      defaultValue={value ?? ''}
      onBlur={(e) => {
        const v = e.target.value.trim().replace(',', '.')
        const n = v === '' ? null : Number(v)
        if (n === null || Number.isFinite(n)) onChange(n)
      }}
    />
  )
}

export function Ressenti({ value, onChange }: { value: number | null; onChange: (v: number | null) => void }) {
  return (
    <div style={{ display: 'flex', gap: 6 }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} className={`btn-sm${value === n ? ' btn-primary' : ''}`} style={{ flex: 1 }} onClick={() => onChange(value === n ? null : n)}>
          {n}
        </button>
      ))}
    </div>
  )
}
