import { useLiveQuery } from 'dexie-react-hooks'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Empty, Field, Page } from '../components/Layout'
import { db } from '../lib/db'
import { useAthletes, useChronosSeance, useDistances, usePistes, useSeance, useSeances } from '../lib/hooks'
import { softDelete, update } from '../lib/repo'
import { fmtDate, fmtMs, fromLocalInput, retenu, toLocalInput } from '../lib/time'
import { Ressenti } from './ChronoEdit'

export function EntrainementsPage() {
  const seances = useSeances()
  const athletes = useAthletes()
  const pistes = usePistes()
  const stats = useLiveQuery(async () => {
    const chronos = (await db.chrono.toArray()).filter((c) => !c.deleted_at && c.seance_entrainement_id)
    const m = new Map<string, number>()
    chronos.forEach((c) => m.set(c.seance_entrainement_id!, (m.get(c.seance_entrainement_id!) ?? 0) + 1))
    return m
  }, [])
  return (
    <Page title="Entraînements" back="/plus">
      {seances && seances.length === 0 && <Empty>Aucune séance. Lance un chrono en mode « Entraînement » pour en créer une.</Empty>}
      <ul className="list">
        {seances?.map((s) => {
          const a = athletes?.find((x) => x.id === s.athlete_id)
          const p = pistes?.find((x) => x.id === s.piste_id)
          return (
            <li key={s.id}>
              <Link className="row" to={`/entrainement/${s.id}`}>
                <div className="grow">
                  <div className="title">
                    {fmtDate(s.date_seance)} · {a?.prenom}
                  </div>
                  <div className="sub">{[s.type_seance, p?.nom, stats?.get(s.id) ? `${stats.get(s.id)} chrono(s)` : null].filter(Boolean).join(' · ')}</div>
                </div>
                <span className="chev">›</span>
              </Link>
            </li>
          )
        })}
      </ul>
      <Link className="btn fab" to="/chrono" aria-label="Nouveau chrono">
        ⏱
      </Link>
    </Page>
  )
}

export function SeancePage() {
  const { id } = useParams()
  const nav = useNavigate()
  const seance = useSeance(id)
  const chronos = useChronosSeance(id)
  const athletes = useAthletes()
  const pistes = usePistes()
  const distances = useDistances()

  if (seance === undefined) return <Page title="Séance" back="/entrainement">…</Page>
  if (!seance) {
    return (
      <Page title="Séance" back="/entrainement">
        <Empty>Séance introuvable.</Empty>
      </Page>
    )
  }
  const a = athletes?.find((x) => x.id === seance.athlete_id)

  async function supprimer() {
    if (!confirm('Supprimer cette séance et ses chronos ?')) return
    for (const c of chronos ?? []) await softDelete('chrono', c.id)
    await softDelete('seance_entrainement', seance!.id)
    nav('/entrainement', { replace: true })
  }

  return (
    <Page title={`Entraînement · ${a?.prenom ?? ''}`} back="/entrainement">
      <div className="card">
        <Field label="Date et heure">
          <input type="datetime-local" defaultValue={toLocalInput(seance.date_seance)} onBlur={(e) => { const v = fromLocalInput(e.target.value); if (v) update('seance_entrainement', seance.id, { date_seance: v }) }} />
        </Field>
        <div className="grid2">
          <Field label="Piste">
            <select value={seance.piste_id ?? ''} onChange={(e) => update('seance_entrainement', seance.id, { piste_id: e.target.value || null })}>
              <option value="">—</option>
              {pistes?.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nom}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Type de séance">
            <input defaultValue={seance.type_seance ?? ''} onBlur={(e) => update('seance_entrainement', seance.id, { type_seance: e.target.value || null })} placeholder="intervalles, technique…" />
          </Field>
        </div>
        <Field label="Objectif">
          <input defaultValue={seance.objectif ?? ''} onBlur={(e) => update('seance_entrainement', seance.id, { objectif: e.target.value || null })} />
        </Field>
        <Field label="Ressenti">
          <Ressenti value={seance.ressenti} onChange={(v) => update('seance_entrainement', seance.id, { ressenti: v })} />
        </Field>
        <Field label="Commentaire">
          <textarea defaultValue={seance.commentaire ?? ''} onBlur={(e) => update('seance_entrainement', seance.id, { commentaire: e.target.value || null })} />
        </Field>
      </div>

      <div className="section-head">
        <h3>Chronos</h3>
        <Link className="btn btn-sm btn-primary" to={`/chrono?seance=${seance.id}&athlete=${seance.athlete_id}`}>
          ⏱ Nouveau
        </Link>
      </div>
      {chronos && chronos.length === 0 && <Empty>Aucun chrono dans cette séance.</Empty>}
      <ul className="list">
        {chronos?.map((c) => {
          const d = distances?.find((x) => x.id === c.distance_id)
          return (
            <li key={c.id}>
              <Link className="row" to={`/chrono/${c.id}`}>
                <div className="grow">
                  <div className="title">{d?.libelle ?? 'Libre'}</div>
                  <div className="sub">
                    {fmtDate(c.debute_a ?? c.created_at, true)} · {c.nb_tours_enregistres} tour{c.nb_tours_enregistres > 1 ? 's' : ''}
                    {c.chrono_incomplet ? ' · incomplet' : ''}
                  </div>
                </div>
                <span className="time">{fmtMs(retenu(c))}</span>
                <span className="chev">›</span>
              </Link>
            </li>
          )
        })}
      </ul>
      <button className="btn-danger btn-block" onClick={supprimer} style={{ marginTop: 16 }}>
        Supprimer la séance
      </button>
    </Page>
  )
}
