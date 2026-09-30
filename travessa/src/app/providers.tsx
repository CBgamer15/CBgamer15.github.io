import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { SessionUser } from '@/domain/types'
import { initRepository, type Repository } from '@/data'

const RepoContext = createContext<Repository | null>(null)
const AuthContext = createContext<{ user: SessionUser | null; ready: boolean }>({ user: null, ready: false })

export function AppProviders({ children }: { children: ReactNode }) {
  const [repository, setRepository] = useState<Repository | null>(null)
  const [auth, setAuth] = useState<{ user: SessionUser | null; ready: boolean }>({ user: null, ready: false })

  useEffect(() => {
    let unsub: (() => void) | undefined
    void initRepository().then(async (r) => {
      setRepository(r)
      setAuth({ user: await r.getSessionUser(), ready: true })
      unsub = r.onAuthChange((user) => setAuth({ user, ready: true }))
    })
    return () => unsub?.()
  }, [])

  if (!repository) return null
  return (
    <RepoContext.Provider value={repository}>
      <AuthContext.Provider value={auth}>{children}</AuthContext.Provider>
    </RepoContext.Provider>
  )
}

export function useRepo(): Repository {
  const r = useContext(RepoContext)
  if (!r) throw new Error('useRepo outside provider')
  return r
}

export function useAuth() {
  return useContext(AuthContext)
}
