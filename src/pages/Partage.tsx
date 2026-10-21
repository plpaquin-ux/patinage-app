import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { useParams } from 'react-router-dom'
import { TableauDeBord } from '../components/TableauDeBord'
import type { Portrait } from '../lib/portrait'
import { supabase } from '../lib/supabase'
import { fmtDate } from '../lib/time'

type Etat = { statut: 'chargement' } | { statut: 'introuvable' } | { statut: 'erreur'; message: string } | { statut: 'ok'; data: Portrait; a: number }

/** Page publique /partage/:jeton : portrait d'un athlète sans connexion (fn_partage_lecture). */
export default function PartagePage() {
  const { jeton = '' } = useParams()
  const [etat, setEtat] = useState<Etat>({ statut: 'chargement' })

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
        <div className="grow">
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
        <TableauDeBord data={data} />
        <p className="muted" style={{ textAlign: 'center', marginTop: 24 }}>
          <small>Mis à jour le {fmtDate(data.genere_a, true)} · lecture seule</small>
        </p>
      </main>
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
