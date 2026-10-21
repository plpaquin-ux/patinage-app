/** Reconnaissance des liens vidéo (YouTube) pour la lecture intégrée. */

export interface VideoInfo {
  fournisseur: 'youtube' | 'autre'
  /** URL d'intégration (iframe) ; absente si non reconnue. */
  embed?: string
  url: string
}

/** Extrait l'identifiant YouTube et le temps de départ d'une URL (watch, youtu.be, shorts, live, embed). */
export function parseYouTube(url: string): { id: string; start?: number } | null {
  let u: URL
  try {
    u = new URL(url.trim())
  } catch {
    return null
  }
  const host = u.hostname.replace(/^(www|m|music)\./, '')
  let id: string | null = null
  if (host === 'youtu.be') id = u.pathname.slice(1).split('/')[0]
  else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    if (u.pathname === '/watch') id = u.searchParams.get('v')
    else {
      const m = u.pathname.match(/^\/(?:embed|shorts|live|v)\/([^/?#]+)/)
      if (m) id = m[1]
    }
  }
  if (!id || !/^[\w-]{6,}$/.test(id)) return null
  const t = u.searchParams.get('t') ?? u.searchParams.get('start')
  const start = t ? parseStart(t) : undefined
  return { id, start }
}

/** « 90 », « 90s », « 1m30s », « 1h2m3s » → secondes. */
function parseStart(t: string): number | undefined {
  if (/^\d+$/.test(t)) return Number(t)
  const m = t.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/)
  if (!m || (!m[1] && !m[2] && !m[3])) return undefined
  return Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0)
}

export function videoInfo(url: string | null | undefined): VideoInfo | null {
  if (!url) return null
  const yt = parseYouTube(url)
  if (yt) {
    const p = new URLSearchParams({ autoplay: '1', playsinline: '1', rel: '0', modestbranding: '1' })
    if (yt.start) p.set('start', String(yt.start))
    return { fournisseur: 'youtube', embed: `https://www.youtube-nocookie.com/embed/${yt.id}?${p}`, url }
  }
  return { fournisseur: 'autre', url }
}
