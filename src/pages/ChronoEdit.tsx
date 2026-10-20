import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Empty, Field, Page } from '../components/Layout'
import { TimeInput } from '../components/TimeInput'
import { db } from '../lib/db'
import { useAthlete, useChrono, useTours } from '../lib/hooks'
import { create, softDelete, update } from '../lib/repo'
import { fmtDate, fmtDelta, fmtLongueur, fmtMs, retenu } from '../lib/time'
import { LIBELLES, mancheLabel, type Chrono, type Participation, type StatutResultat, type Tour, type TypeCouloir } from '../lib/types'

export default function ChronoEditPage() {
  const { id } = useParams()
  const nav = useNavigate()
  const chrono = useChrono(id)
  const tours = useTours(id)
  const athlete = useAthlete(chrono?.athlete_id)
  const distance = useLiveQuery(() => (chrono?.distance_id ? db.distance.get(chrono.distance_id) : undefined), [chrono?.distance_id])
  const participation = useLiveQuery(
    async () => (id ? (await db.participation.where('chrono_id').equals(id).toArray()).find((p) => !p.deleted_at) : undefined),
    [id],
  )
  const course = useLiveQuery(() => (participation ? db.course.get(participation.course_id) : undefined), [participation?.course_id])
  const epreuve = useLiveQuery(() => (course ? db.epreuve.get(course.epreuve_id) : undefined), [course?.epreuve_id])
  const competition = useLiveQuery(() => (epreuve ? db.competition.get(epreuve.competition_id) : undefined), [epreuve?.competition_id])
  const piste = useLiveQuery(() => (competition?.piste_id ? db.piste.get(competition.piste_id) : undefined), [competition?.piste_id])
  const seance = useLiveQuery(
    () => (chrono?.seance_entrainement_id ? db.seance_entrainement.get(chrono.seance_entrainement_id) : undefined),
    [chrono?.seance_entrainement_id],
  )

  const [saved, setSaved] = useState<string | null>(null)
  useEffect(() => {
    if (!saved) return
    const t = setTimeout(() => setSaved(null), 1500)
    return () => clearTimeout(t)
  }, [saved])

  if (chrono === undefined || tours === undefined) return <Page title="Chrono" back>…</Page>
  if (!chrono || chrono.deleted_at) {
    return (
      <Page title="Chrono" back>
        <Empty>Chrono introuvable.</Empty>
      </Page>
    )
  }
  const ch: Chrono = chrono
  const trs: Tour[] = tours

  const calcule = tours.reduce((s, t) => s + t.temps_tour_ms, 0)
  const ret = retenu({ ...chrono, temps_calcule_ms: tours.length ? calcule : chrono.temps_calcule_ms })
  const ecart = chrono.temps_officiel_ms != null ? chrono.temps_officiel_ms - (chrono.temps_ajuste_ms ?? calcule) : null
  const best = tours.length > 1 ? Math.min(...tours.map((t) => t.temps_tour_ms)) : null

  async function patchChrono(p: Partial<Chrono>) {
    await update('chrono', ch.id, p)
    setSaved('ok')
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
    setSaved('ok')
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
    const rest = trs.filter((x) => x.id !== t.id)
    for (let i = 0; i < rest.length; i++) {
      if (rest[i].numero_tour !== i + 1) await update('tour', rest[i].id, { numero_tour: i + 1 })
    }
    await recalc()
  }
  async function supprimerTour(t: Tour) {
    if (!confirm(`Supprimer le tour ${t.numero_tour} ?`)) return
    await softDelete('tour', t.id)
    // Renumérotation des tours suivants
    const rest = trs.filter((x) => x.id !== t.id)
    for (let i = 0; i < rest.length; i++) {
      if (rest[i].numero_tour !== i + 1) await update('tour', rest[i].id, { numero_tour: i + 1 })
    }
    await recalc()
  }
  async function patchParticipation(p: Partial<Participation>) {
    if (!participation) return
    await update('participation', participation.id, p)
    setSaved('ok')
  }
  async function supprimerChrono() {
    if (!confirm('Supprimer ce chrono et son résultat ?')) return
    if (participation) await softDelete('participation', participation.id)
    for (const t of trs) await softDelete('tour', t.id)
    await softDelete('chrono', ch.id)
    nav(-1)
  }

  const titre = course ? `${distance?.libelle ?? 'Course'} · ${mancheLabel(course)}` : `Entraînement${distance ? ` · ${distance.libelle}` : ''}`
  const back = course ? `/courses/${course.id}` : seance ? `/entrainement/${seance.id}` : '/'

  return (
    <Page title={titre} back={back} right={saved ? <span className="badge ok">Enregistré</span> : undefined}>
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
          <div>
            <div style={{ fontWeight: 700 }}>
              {athlete?.prenom} {athlete?.nom}
            </div>
            <small>
              {competition ? `${competition.nom} · ` : ''}
              {piste ? `${piste.nom} · ` : ''}
              {fmtDate(chrono.debute_a ?? chrono.created_at, true)}
            </small>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div className="mono" style={{ fontSize: '1.7rem', fontWeight: 800 }}>
              {fmtMs(ret)}
            </div>
            <small>temps retenu</small>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
          <span className="badge">{chrono.source === 'chrono_app' ? 'Chrono app' : chrono.source === 'saisie_manuelle' ? 'Saisie manuelle' : 'Import'}</span>
          {chrono.longueur_piste_m != null && <span className="badge">tour de {fmtLongueur(chrono.longueur_piste_m)}</span>}
          {chrono.chrono_incomplet && <span className="badge warn">Tours incomplets</span>}
          {chrono.temps_ajuste_ms != null && <span className="badge accent">Total ajusté</span>}
          {chrono.temps_officiel_ms != null && <span className="badge ok">Officiel</span>}
        </div>
      </div>

      <div className="section-head">
        <h3>Tours ({tours.length}{chrono.nb_tours_prevus ? ` / ${chrono.nb_tours_prevus}` : ''})</h3>
        <button className="btn-sm" onClick={ajouterTour}>
          + Tour
        </button>
      </div>
      <div className="card" style={{ padding: '6px 10px' }}>
        {tours.length === 0 && <Empty>Aucun tour. Saisis le temps total ci-dessous ou ajoute des tours.</Empty>}
        {tours.map((t, i) => {
          const cumul = tours.slice(0, i + 1).reduce((s, x) => s + x.temps_tour_ms, 0)
          const delta = t.temps_tour_capture_ms != null ? t.temps_tour_ms - t.temps_tour_capture_ms : null
          return (
            <div key={t.id} style={{ display: 'grid', gridTemplateColumns: '40px 1fr auto 36px', gap: 8, alignItems: 'center', padding: '6px 0', borderBottom: '1px solid var(--line)' }}>
              <span className="mono muted">T{t.numero_tour}</span>
              <div>
                <TimeInput value={t.temps_tour_ms} allowEmpty={false} onChange={(ms) => ms != null && patchTour(t, ms)} className={t.temps_tour_ms === best ? 'best' : ''} />
                {delta != null && delta !== 0 && <small>capté {fmtMs(t.temps_tour_capture_ms)} ({fmtDelta(delta)})</small>}
                {i > 0 && (
                  <button className="btn-ghost btn-sm" style={{ minHeight: 28, padding: '0 6px', fontSize: '0.78rem' }} onClick={() => fusionnerAvecPrecedent(t)}>
                    ⤴ fusionner avec T{t.numero_tour - 1}
                  </button>
                )}
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

      <h3 style={{ marginTop: 18 }}>Temps</h3>
      <div className="card">
        <div className="grid2">
          <Field label="Calculé (somme des tours)">
            <input className="mono" value={tours.length ? fmtMs(calcule) : '—'} readOnly />
          </Field>
          <Field label="Total ajusté" hint="Si tu as raté l'arrivée">
            <TimeInput value={chrono.temps_ajuste_ms} onChange={(ms) => patchChrono({ temps_ajuste_ms: ms })} />
          </Field>
        </div>
        <Field label="Temps officiel" hint={ecart != null ? `Écart avec ton chrono : ${fmtDelta(ecart)}` : 'Le temps des officiels prime sur les autres.'}>
          <TimeInput value={chrono.temps_officiel_ms} onChange={(ms) => patchChrono({ temps_officiel_ms: ms })} />
        </Field>
        <div className="grid2">
          <Field label="Tours attendus">
            <input
              className="mono"
              inputMode="numeric"
              defaultValue={chrono.nb_tours_prevus ?? ''}
              onBlur={(e) => {
                const v = e.target.value.trim()
                const n = v ? Number(v) : null
                patchChrono({ nb_tours_prevus: n, chrono_incomplet: n != null ? tours.length !== n : false })
              }}
            />
          </Field>
          <Field label="Longueur du tour (m)" hint="Figée au moment de la course">
            <input
              className="mono"
              inputMode="decimal"
              defaultValue={chrono.longueur_piste_m ?? ''}
              placeholder="100 / 111.12"
              onBlur={(e) => patchChrono({ longueur_piste_m: e.target.value.trim() ? Number(e.target.value.replace(',', '.')) || null : null })}
            />
          </Field>
        </div>
        <label className="check">
          <input type="checkbox" checked={chrono.chrono_incomplet} onChange={(e) => patchChrono({ chrono_incomplet: e.target.checked })} />
          Chrono incomplet (tour manqué, départ tardif…)
        </label>
        <Field label="Note sur l'ajustement">
          <input defaultValue={chrono.note_ajustement ?? ''} onBlur={(e) => patchChrono({ note_ajustement: e.target.value || null })} placeholder="ex. appui tardif au tour 3" />
        </Field>
      </div>

      {participation && (
        <>
          <h3 style={{ marginTop: 18 }}>Résultat de la course</h3>
          <div className="card">
            <Field label="Statut">
              <select value={participation.statut} onChange={(e) => patchParticipation({ statut: e.target.value as StatutResultat })}>
                {(Object.keys(LIBELLES.statut) as StatutResultat[]).map((s) => (
                  <option key={s} value={s}>
                    {LIBELLES.statut[s]}
                  </option>
                ))}
              </select>
            </Field>
            <div className="grid2">
              <Field label="Position à l'arrivée">
                <NumInput value={participation.position_arrivee} onChange={(v) => patchParticipation({ position_arrivee: v })} />
              </Field>
              <Field label="Rang officiel">
                <NumInput value={participation.rang_officiel} onChange={(v) => patchParticipation({ rang_officiel: v })} />
              </Field>
              <Field label="Points">
                <NumInput value={participation.points} onChange={(v) => patchParticipation({ points: v })} decimal />
              </Field>
              <Field label="Position de départ">
                <NumInput value={participation.couloir_depart} onChange={(v) => patchParticipation({ couloir_depart: v })} />
              </Field>
            </div>
            {piste?.type_piste === 'longue_piste' && (
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
              Qualifiée pour la manche suivante
            </label>
            <Field label="Ressenti (1–5)">
              <Ressenti value={participation.ressenti} onChange={(v) => patchParticipation({ ressenti: v })} />
            </Field>
            <Field label="Lien vidéo">
              <input type="url" defaultValue={participation.url_video ?? ''} onBlur={(e) => patchParticipation({ url_video: e.target.value || null })} placeholder="https://" />
            </Field>
            <Field label="Commentaire sur la course">
              <textarea defaultValue={participation.commentaire ?? ''} onBlur={(e) => patchParticipation({ commentaire: e.target.value || null })} />
            </Field>
          </div>
        </>
      )}

      {!participation && (
        <div className="card">
          <Field label="Commentaire">
            <textarea defaultValue={chrono.commentaire ?? ''} onBlur={(e) => patchChrono({ commentaire: e.target.value || null })} />
          </Field>
        </div>
      )}

      <div className="actions">
        <button className="btn-primary" onClick={() => nav(back)}>
          Terminer
        </button>
        <button className="btn-danger" onClick={supprimerChrono}>
          Supprimer
        </button>
      </div>
    </Page>
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
