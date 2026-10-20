import { db } from './db'
import { enqueue } from './sync'
import type { BaseRow, SyncTable, TableMap } from './types'

const COMPTE_KEY = 'patinage.compte_id'

export function getCompteId(): string | null {
  return localStorage.getItem(COMPTE_KEY)
}
export function setCompteId(id: string | null) {
  if (id) localStorage.setItem(COMPTE_KEY, id)
  else localStorage.removeItem(COMPTE_KEY)
}

export function uuid(): string {
  return crypto.randomUUID()
}
export function nowIso(): string {
  return new Date().toISOString()
}

type NewRow<T extends BaseRow> = Omit<T, keyof BaseRow> & Partial<Pick<T, 'id'>>

/** Crée une ligne localement et la met en file d'envoi. */
export async function create<K extends SyncTable>(table: K, data: NewRow<TableMap[K]>): Promise<TableMap[K]> {
  const compte_id = getCompteId()
  if (!compte_id) throw new Error('Aucun compte actif')
  const ts = nowIso()
  const row = {
    ...data,
    id: data.id ?? uuid(),
    compte_id,
    created_at: ts,
    updated_at: ts,
    deleted_at: null,
  } as unknown as TableMap[K]
  await db.table_(table).put(row as unknown as Record<string, unknown>)
  await enqueue(table, row as unknown as Record<string, unknown>)
  return row
}

/** Met à jour une ligne (fusion) localement et en file d'envoi. */
export async function update<K extends SyncTable>(
  table: K,
  id: string,
  patch: Partial<TableMap[K]>,
): Promise<TableMap[K]> {
  const existing = (await db.table_(table).get(id)) as TableMap[K] | undefined
  if (!existing) throw new Error(`${table} ${id} introuvable`)
  const row = { ...existing, ...patch, updated_at: nowIso() } as TableMap[K]
  await db.table_(table).put(row as unknown as Record<string, unknown>)
  await enqueue(table, row as unknown as Record<string, unknown>)
  return row
}

/** Suppression logique. */
export async function softDelete<K extends SyncTable>(table: K, id: string): Promise<void> {
  await update(table, id, { deleted_at: nowIso() } as Partial<TableMap[K]>)
}

/** Filtre standard : lignes non supprimées. */
export function alive<T extends { deleted_at: string | null }>(rows: T[]): T[] {
  return rows.filter((r) => !r.deleted_at)
}
