import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Chrono basé sur des horodatages absolus (Date.now()) : il reste exact même si
 * l'écran se verrouille ou si l'onglet est suspendu, et il survit à un rechargement
 * grâce à la persistance dans localStorage.
 */
export interface StopwatchContext {
  athleteId: string
  distanceId: string | null
  nbToursPrevus: number | null
  courseId: string | null
  seanceId: string | null
  label: string
}

export interface StopwatchState {
  startedAt: number | null
  marks: number[]
  stoppedAt: number | null
  context: StopwatchContext | null
}

const KEY = 'patinage.stopwatch'
const EMPTY: StopwatchState = { startedAt: null, marks: [], stoppedAt: null, context: null }

function load(): StopwatchState {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? { ...EMPTY, ...(JSON.parse(raw) as StopwatchState) } : EMPTY
  } catch {
    return EMPTY
  }
}
function save(s: StopwatchState) {
  localStorage.setItem(KEY, JSON.stringify(s))
}

export interface LapInfo {
  n: number
  ms: number
  cumul: number
  at: number
}

export function computeLaps(s: StopwatchState, now: number): { laps: LapInfo[]; current: number; total: number } {
  if (!s.startedAt) return { laps: [], current: 0, total: 0 }
  const end = s.stoppedAt ?? now
  const laps: LapInfo[] = []
  let prev = s.startedAt
  s.marks.forEach((m, i) => {
    laps.push({ n: i + 1, ms: m - prev, cumul: m - s.startedAt!, at: m })
    prev = m
  })
  if (s.stoppedAt) {
    laps.push({ n: s.marks.length + 1, ms: s.stoppedAt - prev, cumul: s.stoppedAt - s.startedAt, at: s.stoppedAt })
  }
  return { laps, current: end - prev, total: end - s.startedAt }
}

export function useStopwatch() {
  const [state, setState] = useState<StopwatchState>(load)
  const [now, setNow] = useState(() => Date.now())
  const raf = useRef<number | null>(null)
  const wakeLock = useRef<WakeLockSentinel | null>(null)

  const running = !!state.startedAt && !state.stoppedAt

  // Boucle d'affichage (seulement quand ça tourne).
  useEffect(() => {
    if (!running) return
    let alive = true
    const tick = () => {
      if (!alive) return
      setNow(Date.now())
      raf.current = requestAnimationFrame(tick)
    }
    raf.current = requestAnimationFrame(tick)
    return () => {
      alive = false
      if (raf.current) cancelAnimationFrame(raf.current)
    }
  }, [running])

  // Garde l'écran allumé pendant la course.
  useEffect(() => {
    if (!running) {
      wakeLock.current?.release().catch(() => {})
      wakeLock.current = null
      return
    }
    const acquire = async () => {
      try {
        if ('wakeLock' in navigator) wakeLock.current = await navigator.wakeLock.request('screen')
      } catch {
        /* non supporté ou refusé */
      }
    }
    void acquire()
    const onVis = () => {
      if (document.visibilityState === 'visible') void acquire()
    }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [running])

  const commit = useCallback((next: StopwatchState) => {
    save(next)
    setState(next)
  }, [])

  const vibrate = (pattern: number | number[]) => {
    try {
      navigator.vibrate?.(pattern)
    } catch {
      /* ignore */
    }
  }

  const arm = useCallback(
    (context: StopwatchContext) => commit({ startedAt: null, marks: [], stoppedAt: null, context }),
    [commit],
  )
  const start = useCallback(() => {
    if (!state.context) return
    vibrate(40)
    commit({ ...state, startedAt: Date.now(), marks: [], stoppedAt: null })
  }, [state, commit])
  const lap = useCallback(() => {
    if (!running) return
    vibrate(25)
    commit({ ...state, marks: [...state.marks, Date.now()] })
  }, [state, running, commit])
  const undoLap = useCallback(() => {
    if (!running || state.marks.length === 0) return
    commit({ ...state, marks: state.marks.slice(0, -1) })
  }, [state, running, commit])
  const stop = useCallback(() => {
    if (!running) return
    vibrate([40, 60, 40])
    commit({ ...state, stoppedAt: Date.now() })
  }, [state, running, commit])
  const reset = useCallback(() => commit(EMPTY), [commit])

  const computed = computeLaps(state, now)
  return { state, running, stopped: !!state.stoppedAt, ...computed, arm, start, lap, undoLap, stop, reset }
}
