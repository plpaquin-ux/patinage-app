/** Formate des millisecondes en m:ss.mmm (ou ss.mmm si < 1 min). */
export function fmtMs(ms: number | null | undefined, opts: { forceMinutes?: boolean; decimals?: 2 | 3 } = {}): string {
  if (ms == null || Number.isNaN(ms)) return '—'
  const decimals = opts.decimals ?? 3
  const sign = ms < 0 ? '-' : ''
  ms = Math.abs(Math.round(ms))
  const minutes = Math.floor(ms / 60000)
  const seconds = Math.floor((ms % 60000) / 1000)
  const frac = ms % 1000
  const fracStr = decimals === 3 ? String(frac).padStart(3, '0') : String(Math.floor(frac / 10)).padStart(2, '0')
  if (minutes > 0 || opts.forceMinutes) {
    return `${sign}${minutes}:${String(seconds).padStart(2, '0')}.${fracStr}`
  }
  return `${sign}${seconds}.${fracStr}`
}

/** Écart signé, ex. « +0.523 » / « −1.200 ». */
export function fmtDelta(ms: number | null | undefined): string {
  if (ms == null) return '—'
  const s = fmtMs(Math.abs(ms))
  return (ms >= 0 ? '+' : '−') + s
}

/**
 * Analyse une saisie humaine en millisecondes.
 * Accepte « 45.123 », « 45,12 », « 1:23.456 », « 1:23 », « 83.4 », « 2:05 ».
 */
export function parseTime(input: string): number | null {
  const s = input.trim().replace(',', '.').replace(/\s+/g, '')
  if (!s) return null
  const m = s.match(/^(?:(\d+):)?(\d{1,2})(?:\.(\d{1,3}))?$/)
  if (!m) {
    // nombre brut de secondes, ex. « 83.456 »
    const n = Number(s)
    return Number.isFinite(n) && n >= 0 ? Math.round(n * 1000) : null
  }
  const minutes = m[1] ? Number(m[1]) : 0
  const seconds = Number(m[2])
  const frac = m[3] ? Number(m[3].padEnd(3, '0')) : 0
  if (seconds >= 60 && m[1]) return null
  return minutes * 60000 + seconds * 1000 + frac
}

export function fmtDate(iso: string | null | undefined, withTime = false): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const date = d.toLocaleDateString('fr-CA', { year: 'numeric', month: 'short', day: 'numeric' })
  if (!withTime) return date
  return `${date} ${d.toLocaleTimeString('fr-CA', { hour: '2-digit', minute: '2-digit' })}`
}

export function todayIsoDate(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** Pour <input type="datetime-local"> : valeur locale sans fuseau. */
export function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
export function fromLocalInput(v: string): string | null {
  if (!v) return null
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

/** Temps retenu = officiel ?? ajusté ?? calculé (même règle que la BD). */
export function retenu(c: { temps_officiel_ms: number | null; temps_ajuste_ms: number | null; temps_calcule_ms: number | null }) {
  return c.temps_officiel_ms ?? c.temps_ajuste_ms ?? c.temps_calcule_ms ?? null
}

/** Longueur du tour effective : compétition > circuit > piste. */
export function longueurPiste(
  competition?: { longueur_piste_m: number | null } | null,
  circuit?: { longueur_piste_m: number | null } | null,
  piste?: { longueur_m: number | null } | null,
): number | null {
  return competition?.longueur_piste_m ?? circuit?.longueur_piste_m ?? piste?.longueur_m ?? null
}

/** Nombre de tours attendus (arrondi au supérieur) : metres / longueur, sinon défaut de la distance. */
export function nbToursAttendus(metres: number | null | undefined, longueur: number | null | undefined, defaut?: number | null): number | null {
  if (metres && longueur && longueur > 0) return Math.ceil(metres / longueur - 1e-9)
  if (defaut != null) return Math.ceil(defaut)
  return null
}

export function fmtLongueur(m: number | null | undefined): string {
  if (m == null) return '—'
  return `${Number.isInteger(m) ? m : m.toFixed(2).replace(/\.?0+$/, '')} m`
}
