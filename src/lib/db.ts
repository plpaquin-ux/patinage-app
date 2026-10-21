import Dexie, { type Table } from 'dexie'
import type {
  Athlete,
  AthleteSaison,
  Chrono,
  Circuit,
  CircuitDistance,
  Competition,
  Course,
  Distance,
  Epreuve,
  Equipement,
  Groupe,
  InscriptionCompetition,
  Participation,
  Piste,
  Saison,
  SeanceEntrainement,
  SyncTable,
  Tour,
} from './types'

/** Opération en attente d'envoi vers Supabase. */
export interface OutboxItem {
  id?: number
  table: SyncTable
  row_id: string
  payload: Record<string, unknown>
  created_at: string
  attempts: number
  last_error: string | null
}

export interface Meta {
  key: string
  value: string
}

class PatinageDB extends Dexie {
  athlete!: Table<Athlete, string>
  saison!: Table<Saison, string>
  athlete_saison!: Table<AthleteSaison, string>
  circuit!: Table<Circuit, string>
  piste!: Table<Piste, string>
  distance!: Table<Distance, string>
  circuit_distance!: Table<CircuitDistance, string>
  equipement!: Table<Equipement, string>
  competition!: Table<Competition, string>
  groupe!: Table<Groupe, string>
  inscription_competition!: Table<InscriptionCompetition, string>
  epreuve!: Table<Epreuve, string>
  course!: Table<Course, string>
  seance_entrainement!: Table<SeanceEntrainement, string>
  chrono!: Table<Chrono, string>
  tour!: Table<Tour, string>
  participation!: Table<Participation, string>
  outbox!: Table<OutboxItem, number>
  meta!: Table<Meta, string>

  constructor() {
    super('patinage')
    this.version(1).stores({
      athlete: 'id, compte_id, updated_at',
      saison: 'id, compte_id, updated_at',
      athlete_saison: 'id, athlete_id, saison_id, updated_at',
      circuit: 'id, compte_id, updated_at',
      piste: 'id, compte_id, updated_at',
      distance: 'id, compte_id, type_piste, updated_at',
      equipement: 'id, athlete_id, updated_at',
      competition: 'id, compte_id, date_debut, updated_at',
      groupe: 'id, competition_id, updated_at',
      inscription_competition: 'id, competition_id, athlete_id, updated_at',
      epreuve: 'id, competition_id, updated_at',
      course: 'id, epreuve_id, updated_at',
      seance_entrainement: 'id, athlete_id, date_seance, updated_at',
      chrono: 'id, athlete_id, seance_entrainement_id, debute_a, updated_at',
      tour: 'id, chrono_id, updated_at',
      participation: 'id, course_id, athlete_id, chrono_id, updated_at',
      outbox: '++id, table, row_id, created_at',
      meta: 'key',
    })
    this.version(2).stores({
      circuit_distance: 'id, circuit_id, distance_id, updated_at',
    })
  }

  table_(name: SyncTable): Table<Record<string, unknown>, string> {
    return this.table(name) as Table<Record<string, unknown>, string>
  }
}

export const db = new PatinageDB()

export async function getMeta(key: string): Promise<string | undefined> {
  return (await db.meta.get(key))?.value
}
export async function setMeta(key: string, value: string): Promise<void> {
  await db.meta.put({ key, value })
}

/** Vide toutes les données locales (déconnexion / changement de compte). */
export async function clearLocalData(): Promise<void> {
  await db.transaction('rw', db.tables, async () => {
    for (const t of db.tables) await t.clear()
  })
}
