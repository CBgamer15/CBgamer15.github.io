import { useCallback, useEffect, useRef, useState } from 'react'

interface AsyncState<T> {
  data: T | undefined
  error: Error | undefined
  loading: boolean
  reload: () => Promise<void>
}

/** Minimal data hook: load on mount/deps change, expose reload. */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]): AsyncState<T> {
  const [data, setData] = useState<T>()
  const [error, setError] = useState<Error>()
  const [loading, setLoading] = useState(true)
  const fnRef = useRef(fn)
  fnRef.current = fn
  const seq = useRef(0)

  const reload = useCallback(async () => {
    const mine = ++seq.current
    try {
      const value = await fnRef.current()
      if (mine === seq.current) {
        setData(value)
        setError(undefined)
      }
    } catch (e) {
      if (mine === seq.current) setError(e as Error)
    } finally {
      if (mine === seq.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    setLoading(true)
    void reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  return { data, error, loading, reload }
}

/** Re-render every `ms` — for "há 4 min" style timers. */
export function useNow(ms = 30000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), ms)
    return () => window.clearInterval(id)
  }, [ms])
  return now
}
