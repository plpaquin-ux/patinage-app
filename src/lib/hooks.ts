import { useLiveQuery } from 'dexie-react-hooks'
import { db } from './db'
import { alive } from './repo'
import type { TypePiste } from './types'

export function useAthletes() {
  return useLiveQuery(async () => alive(await db.athlete.toArray()).sort((a, b) => a.prenom.localeCompare(b.prenom)), [])
}
export function useAthlete(id: string | null | undefined) {
  return useLiveQuery(() => (id ? db.athlete.get(id) : undefined), [id])
}
export function useDistances(typePiste?: TypePiste | null) {
  return useLiveQuery(
    async () =>
      alive(await db.distance.toArray())
        .filter((d) => d.actif && (!typePiste || d.type_piste === typePiste))
        .sort((a, b) => a.type_piste.localeCompare(b.type_piste) || a.metres - b.metres),
    [typePiste],
  )
}
export function usePistes() {
  return useLiveQuery(async () => alive(await db.piste.toArray()).sort((a, b) => a.nom.localeCompare(b.nom)), [])
}
export function useCircuits() {
  return useLiveQuery(async () => alive(await db.circuit.toArray()).sort((a, b) => a.nom.localeCompare(b.nom)), [])
}
export function useSaisons() {
  return useLiveQuery(async () => alive(await db.saison.toArray()).sort((a, b) => b.date_debut.localeCompare(a.date_debut)), [])
}
export function useCompetitions() {
  return useLiveQuery(
    async () => alive(await db.competition.toArray()).sort((a, b) => b.date_debut.localeCompare(a.date_debut)),
    [],
  )
}
export function useCompetition(id: string | undefined) {
  return useLiveQuery(() => (id ? db.competition.get(id) : undefined), [id])
}
export function useGroupes(competitionId: string | undefined) {
  return useLiveQuery(
    async () =>
      competitionId
        ? alive(await db.groupe.where('competition_id').equals(competitionId).toArray()).sort(
            (a, b) => (a.ordre ?? 0) - (b.ordre ?? 0) || a.nom.localeCompare(b.nom),
          )
        : [],
    [competitionId],
  )
}
export function useInscriptions(competitionId: string | undefined) {
  return useLiveQuery(
    async () => (competitionId ? alive(await db.inscription_competition.where('competition_id').equals(competitionId).toArray()) : []),
    [competitionId],
  )
}
export function useEpreuves(competitionId: string | undefined) {
  return useLiveQuery(
    async () =>
      competitionId
        ? alive(await db.epreuve.where('competition_id').equals(competitionId).toArray()).sort(
            (a, b) => (a.ordre ?? 0) - (b.ordre ?? 0) || a.created_at.localeCompare(b.created_at),
          )
        : [],
    [competitionId],
  )
}
export function useEpreuve(id: string | undefined) {
  return useLiveQuery(() => (id ? db.epreuve.get(id) : undefined), [id])
}
export function useCourses(epreuveId: string | undefined) {
  return useLiveQuery(
    async () =>
      epreuveId
        ? alive(await db.course.where('epreuve_id').equals(epreuveId).toArray()).sort(
            (a, b) => (a.ordre_manche ?? 0) - (b.ordre_manche ?? 0) || a.created_at.localeCompare(b.created_at),
          )
        : [],
    [epreuveId],
  )
}
export function useCourse(id: string | undefined) {
  return useLiveQuery(() => (id ? db.course.get(id) : undefined), [id])
}
export function useParticipations(courseId: string | undefined) {
  return useLiveQuery(
    async () => (courseId ? alive(await db.participation.where('course_id').equals(courseId).toArray()) : []),
    [courseId],
  )
}
export function useChrono(id: string | null | undefined) {
  return useLiveQuery(() => (id ? db.chrono.get(id) : undefined), [id])
}
export function useTours(chronoId: string | null | undefined) {
  return useLiveQuery(
    async () => (chronoId ? alive(await db.tour.where('chrono_id').equals(chronoId).toArray()).sort((a, b) => a.numero_tour - b.numero_tour) : []),
    [chronoId],
  )
}
export function useSeances(athleteId?: string | null) {
  return useLiveQuery(
    async () =>
      alive(await db.seance_entrainement.toArray())
        .filter((s) => !athleteId || s.athlete_id === athleteId)
        .sort((a, b) => b.date_seance.localeCompare(a.date_seance)),
    [athleteId],
  )
}
export function useSeance(id: string | undefined) {
  return useLiveQuery(() => (id ? db.seance_entrainement.get(id) : undefined), [id])
}
export function useChronosSeance(seanceId: string | undefined) {
  return useLiveQuery(
    async () =>
      seanceId
        ? alive(await db.chrono.where('seance_entrainement_id').equals(seanceId).toArray()).sort((a, b) =>
            (a.debute_a ?? a.created_at).localeCompare(b.debute_a ?? b.created_at),
          )
        : [],
    [seanceId],
  )
}

/** Clé « athlète par défaut » (dernier sélectionné). */
const ATHLETE_KEY = 'patinage.athlete_id'
export function getDefaultAthleteId(): string | null {
  return localStorage.getItem(ATHLETE_KEY)
}
export function setDefaultAthleteId(id: string) {
  localStorage.setItem(ATHLETE_KEY, id)
}
