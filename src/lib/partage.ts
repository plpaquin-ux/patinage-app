import { isOnline, supabase } from './supabase'

/**
 * Liens de partage public d'un athlète (table `partage`).
 * Gérés directement sur Supabase (pas de synchro hors ligne) : créer ou révoquer un lien
 * n'a de sens qu'en ligne, et le jeton est généré côté serveur.
 */
export interface Partage {
  id: string
  compte_id: string
  athlete_id: string
  jeton: string
  libelle: string | null
  actif: boolean
  nb_acces: number
  dernier_acces_a: string | null
  created_at: string
}

/** URL publique du lien (HashRouter → `#/partage/<jeton>`). */
export function urlPartage(jeton: string): string {
  const base = `${location.origin}${location.pathname}`.replace(/index\.html$/, '')
  return `${base}#/partage/${jeton}`
}

export async function listerPartages(athleteId: string): Promise<Partage[]> {
  if (!isOnline()) return []
  const { data, error } = await supabase.from('partage').select('*').eq('athlete_id', athleteId).is('deleted_at', null).order('created_at')
  if (error) throw error
  return (data ?? []) as Partage[]
}

export async function creerPartage(compteId: string, athleteId: string, libelle = 'Famille'): Promise<Partage> {
  const { data, error } = await supabase.from('partage').insert({ compte_id: compteId, athlete_id: athleteId, libelle }).select('*').single()
  if (error) throw error
  return data as Partage
}

export async function basculerPartage(id: string, actif: boolean): Promise<void> {
  const { error } = await supabase.from('partage').update({ actif }).eq('id', id)
  if (error) throw error
}

export async function supprimerPartage(id: string): Promise<void> {
  const { error } = await supabase.from('partage').update({ deleted_at: new Date().toISOString(), actif: false }).eq('id', id)
  if (error) throw error
}
