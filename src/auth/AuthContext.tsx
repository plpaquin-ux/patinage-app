import type { Session } from '@supabase/supabase-js'
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { clearLocalData } from '../lib/db'
import { getCompteId, setCompteId } from '../lib/repo'
import { isOnline, supabase } from '../lib/supabase'
import { resetPullMarkers, startSyncLoop, syncNow } from '../lib/sync'

export interface CompteInfo {
  id: string
  nom: string
  role: string
}

interface AuthState {
  loading: boolean
  comptesLoaded: boolean
  session: Session | null
  compte: CompteInfo | null
  comptes: CompteInfo[]
  error: string | null
  signIn(email: string, password: string): Promise<string | null>
  signUp(email: string, password: string): Promise<string | null>
  signOut(): Promise<void>
  createCompte(nom: string): Promise<string | null>
  selectCompte(id: string): Promise<void>
  reloadComptes(): Promise<void>
}

const Ctx = createContext<AuthState | null>(null)

const COMPTE_CACHE = 'patinage.comptes'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true)
  const [session, setSession] = useState<Session | null>(null)
  const [comptes, setComptes] = useState<CompteInfo[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(COMPTE_CACHE) ?? '[]') as CompteInfo[]
    } catch {
      return []
    }
  })
  const [compteId, setCompteIdState] = useState<string | null>(getCompteId())
  const [error, setError] = useState<string | null>(null)
  // true dès que la liste des comptes a été lue depuis le serveur (ou qu'on est hors ligne avec un cache)
  const [comptesLoaded, setComptesLoaded] = useState<boolean>(() => !isOnline() || !!getCompteId())

  const reloadComptes = useCallback(async () => {
    if (!isOnline()) {
      setComptesLoaded(true)
      return
    }
    const { data, error } = await supabase
      .from('compte_membre')
      .select('role, compte:compte_id(id, nom)')
    if (error) {
      setError(error.message)
      setComptesLoaded(true)
      return
    }
    const list: CompteInfo[] = (data ?? [])
      .map((r) => {
        const c = r.compte as unknown as { id: string; nom: string } | null
        return c ? { id: c.id, nom: c.nom, role: r.role as string } : null
      })
      .filter((x): x is CompteInfo => !!x)
    setComptes(list)
    localStorage.setItem(COMPTE_CACHE, JSON.stringify(list))
    const current = getCompteId()
    if (list.length > 0 && (!current || !list.some((c) => c.id === current))) {
      // Bascule automatique sur un compte existant : on repart d'une base locale propre
      await clearLocalData()
      setCompteId(list[0].id)
      setCompteIdState(list[0].id)
    }
    if (list.length === 0 && current) {
      setCompteId(null)
      setCompteIdState(null)
    }
    setComptesLoaded(true)
  }, [])

  useEffect(() => {
    let mounted = true
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return
      setSession(data.session)
      setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, s) => {
      setSession(s)
    })
    return () => {
      mounted = false
      sub.subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (!session) return
    void reloadComptes()
  }, [session, reloadComptes])

  useEffect(() => {
    if (session && compteId) {
      startSyncLoop()
      void syncNow()
    }
  }, [session, compteId])

  const signIn = useCallback(async (email: string, password: string) => {
    setError(null)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return error ? traduireErreur(error.message) : null
  }, [])

  const signUp = useCallback(async (email: string, password: string) => {
    setError(null)
    const { data, error } = await supabase.auth.signUp({ email, password })
    if (error) return traduireErreur(error.message)
    if (!data.session) return 'Compte créé. Vérifie ton courriel pour confirmer ton adresse, puis connecte-toi.'
    return null
  }, [])

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
    setCompteId(null)
    setCompteIdState(null)
    setComptes([])
    localStorage.removeItem(COMPTE_CACHE)
    await clearLocalData()
  }, [])

  const createCompte = useCallback(
    async (nom: string) => {
      // Fonction atomique côté serveur : compte + membre propriétaire + amorçage (distances, circuits)
      const { data, error } = await supabase.rpc('fn_creer_compte', { p_nom: nom })
      if (error) return traduireErreur(error.message)
      const id = data as string
      await resetPullMarkers()
      setCompteId(id)
      setCompteIdState(id)
      await reloadComptes()
      return null
    },
    [reloadComptes],
  )

  const selectCompte = useCallback(async (id: string) => {
    await clearLocalData()
    await resetPullMarkers()
    setCompteId(id)
    setCompteIdState(id)
    void syncNow()
  }, [])

  const compte = useMemo(() => comptes.find((c) => c.id === compteId) ?? null, [comptes, compteId])

  const value: AuthState = {
    loading,
    comptesLoaded,
    session,
    compte: compteId ? (compte ?? { id: compteId, nom: 'Mon compte', role: 'editeur' }) : null,
    comptes,
    error,
    signIn,
    signUp,
    signOut,
    createCompte,
    selectCompte,
    reloadComptes,
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useAuth(): AuthState {
  const v = useContext(Ctx)
  if (!v) throw new Error('useAuth hors AuthProvider')
  return v
}

function traduireErreur(msg: string): string {
  if (/invalid login credentials/i.test(msg)) return 'Courriel ou mot de passe invalide.'
  if (/email not confirmed/i.test(msg)) return 'Adresse courriel non confirmée. Vérifie ta boîte de réception.'
  if (/password should be at least/i.test(msg)) return 'Le mot de passe doit contenir au moins 6 caractères.'
  if (/already registered/i.test(msg)) return 'Un compte existe déjà avec ce courriel.'
  if (/fetch/i.test(msg)) return 'Impossible de joindre le serveur. Vérifie ta connexion.'
  return msg
}
