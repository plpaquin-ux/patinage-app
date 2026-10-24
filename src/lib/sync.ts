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
  const skipped: string[] = []
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
        // Erreur de données persistante : on passe au suivant pour ne pas bloquer la file,
        // mais on GARDE l'élément (jamais de perte silencieuse). « Renvoyer les données locales »
        // dans Plus › Compte permet de le réessayer une fois la cause corrigée côté serveur.
        skipped.push(`${item.table}: ${error.message}`)
        continue
      }
      throw new Error(`${item.table}/${item.row_id}: ${error.message}`)
    }
    await db.outbox.delete(item.id!)
  }
  if (skipped.length > 0) {
    // La sync continue (pull), mais l'erreur reste visible dans la pastille.
    throw new Error(`${skipped.length} élément(s) refusé(s) par le serveur — ${skipped[0]}`)
  }
}

/**
 * Remet TOUTES les lignes locales dans la file d'envoi (upsert idempotent côté serveur).
 * À utiliser quand des données n'ont jamais atteint le serveur (ex. refus RLS corrigé depuis).
 * Retourne le nombre de lignes mises en file.
 */
export async function reenvoyerTout(): Promise<number> {
  let n = 0
  await db.transaction('rw', [...SYNC_TABLES.map((t) => db.table_(t)), db.outbox], async () => {
    // On repart d'une file propre : les anciennes entrées seront recréées depuis les lignes locales.
    await db.outbox.clear()
    const now = new Date().toISOString()
    for (const table of SYNC_TABLES) {
      const rows = (await db.table_(table).toArray()) as Record<string, unknown>[]
      for (const row of rows) {
        await db.outbox.add({
          table,
          row_id: row.id as string,
          payload: row,
          created_at: now,
          attempts: 0,
          last_error: null,
        })
        n++
      }
    }
  })
  await refreshPending()
  void syncNow()
  return n
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
