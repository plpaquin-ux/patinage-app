import { db, getMeta, setMeta, type OutboxItem } from './db'
import { isOnline, supabase } from './supabase'
import { SERVER_ONLY_COLUMNS, SYNC_TABLES, type SyncTable } from './types'

export type SyncStatus = {
  running: boolean
  pending: number
  lastSync: string | null
  lastError: string | null
  online: boolean
}

type Listener = (s: SyncStatus) => void
const listeners = new Set<Listener>()
let status: SyncStatus = {
  running: false,
  pending: 0,
  lastSync: null,
  lastError: null,
  online: isOnline(),
}

function emit(patch: Partial<SyncStatus>) {
  status = { ...status, ...patch }
  listeners.forEach((l) => l(status))
}

export function subscribeSync(l: Listener): () => void {
  listeners.add(l)
  l(status)
  return () => listeners.delete(l)
}

export async function refreshPending(): Promise<void> {
  const pending = await db.outbox.count()
  emit({ pending })
}

function stripServerColumns(table: SyncTable, payload: Record<string, unknown>) {
  const out = { ...payload }
  for (const c of SERVER_ONLY_COLUMNS[table] ?? []) delete out[c]
  return out
}

/** Envoie la file d'attente, dans l'ordre, en s'arrêtant à la première erreur réseau. */
async function pushOutbox(): Promise<void> {
  const items = await db.outbox.orderBy('id').toArray()
  for (const item of items) {
    const payload = stripServerColumns(item.table, item.payload)
    const { error } = await supabase.from(item.table).upsert(payload, { onConflict: 'id' })
    if (error) {
      const permanent = /violates|invalid|permission|42|23|22P02/.test(error.code ?? '') || /violates|invalid input/.test(error.message)
      await db.outbox.update(item.id!, {
        attempts: item.attempts + 1,
        last_error: `${error.code ?? ''} ${error.message}`.trim(),
      })
      if (permanent && item.attempts >= 5) {
        // Après 5 tentatives sur une erreur de données, on retire l'élément pour ne pas bloquer la file.
        await db.outbox.delete(item.id!)
        continue
      }
      throw new Error(`${item.table}/${item.row_id}: ${error.message}`)
    }
    await db.outbox.delete(item.id!)
  }
}

/** Récupère les lignes modifiées depuis la dernière sync, table par table. */
async function pullTable(table: SyncTable): Promise<void> {
  const key = `last_pull:${table}`
  let since = (await getMeta(key)) ?? '1970-01-01T00:00:00Z'
  const pendingIds = new Set((await db.outbox.where('table').equals(table).toArray()).map((o) => o.row_id))
  const PAGE = 1000
  for (;;) {
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .gt('updated_at', since)
      .order('updated_at', { ascending: true })
      .limit(PAGE)
    if (error) throw new Error(`${table}: ${error.message}`)
    if (!data || data.length === 0) break
    const rows = (data as Record<string, unknown>[]).filter((r) => !pendingIds.has(r.id as string))
    await db.table_(table).bulkPut(rows)
    since = (data[data.length - 1] as { updated_at: string }).updated_at
    await setMeta(key, since)
    if (data.length < PAGE) break
  }
}

let inFlight: Promise<void> | null = null

/** Synchronisation complète : push puis pull. Sans effet hors ligne. */
export function syncNow(): Promise<void> {
  if (inFlight) return inFlight
  inFlight = (async () => {
    emit({ online: isOnline() })
    if (!isOnline()) {
      await refreshPending()
      return
    }
    const { data: sess } = await supabase.auth.getSession()
    if (!sess.session) return
    emit({ running: true, lastError: null })
    try {
      await pushOutbox()
      for (const t of SYNC_TABLES) await pullTable(t)
      const now = new Date().toISOString()
      await setMeta('last_sync', now)
      emit({ lastSync: now })
    } catch (e) {
      emit({ lastError: e instanceof Error ? e.message : String(e) })
    } finally {
      await refreshPending()
      emit({ running: false })
    }
  })().finally(() => {
    inFlight = null
  })
  return inFlight
}

/** Ajoute une opération à la file et déclenche une sync si on est en ligne. */
export async function enqueue(table: SyncTable, row: Record<string, unknown>): Promise<void> {
  const item: OutboxItem = {
    table,
    row_id: row.id as string,
    payload: row,
    created_at: new Date().toISOString(),
    attempts: 0,
    last_error: null,
  }
  // Une seule entrée par ligne : on remplace la précédente si elle existe encore.
  const existing = await db.outbox.where('row_id').equals(item.row_id).first()
  if (existing) await db.outbox.update(existing.id!, { payload: row, created_at: item.created_at })
  else await db.outbox.add(item)
  await refreshPending()
  scheduleSync(800)
}

let timer: ReturnType<typeof setTimeout> | null = null
export function scheduleSync(delayMs = 0) {
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => {
    timer = null
    void syncNow()
  }, delayMs)
}

let started = false
/** Sync au démarrage, au retour du réseau, au retour au premier plan et toutes les 2 min. */
export function startSyncLoop() {
  if (started) return
  started = true
  getMeta('last_sync').then((v) => emit({ lastSync: v ?? null }))
  void refreshPending()
  window.addEventListener('online', () => {
    emit({ online: true })
    scheduleSync(300)
  })
  window.addEventListener('offline', () => emit({ online: false }))
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') scheduleSync(500)
  })
  setInterval(() => scheduleSync(0), 120_000)
  scheduleSync(500)
}

/** Réinitialise les marqueurs de pull (force un rechargement complet au prochain sync). */
export async function resetPullMarkers() {
  for (const t of SYNC_TABLES) await db.meta.delete(`last_pull:${t}`)
}
