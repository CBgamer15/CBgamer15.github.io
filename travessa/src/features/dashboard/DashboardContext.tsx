import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { useRepo } from '@/app/providers'
import type { Order, Restaurant } from '@/domain/types'
import { formatMoney } from '@/lib/format'

interface DashboardValue {
  restaurant: Restaurant
  setRestaurant: (r: Restaurant) => void
  /** Orders since the start of today, live. */
  today: Order[]
  reloadToday: () => Promise<void>
  money: (cents: number) => string
  newOrderIds: Set<string>
}

const Ctx = createContext<DashboardValue | null>(null)

export function startOfToday(): string {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.toISOString()
}

// Short two-tone chime, synthesised so there is no audio asset to load.
function chime() {
  try {
    const ctx = new AudioContext()
    const now = ctx.currentTime
    ;[880, 1320].forEach((freq, i) => {
      const o = ctx.createOscillator()
      const g = ctx.createGain()
      o.type = 'sine'
      o.frequency.value = freq
      g.gain.setValueAtTime(0.0001, now + i * 0.16)
      g.gain.exponentialRampToValueAtTime(0.18, now + i * 0.16 + 0.02)
      g.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.16 + 0.5)
      o.connect(g).connect(ctx.destination)
      o.start(now + i * 0.16)
      o.stop(now + i * 0.16 + 0.55)
    })
    window.setTimeout(() => void ctx.close(), 1200)
  } catch {
    // audio unavailable — visual alert still shows
  }
}

export function DashboardProvider({ initial, children }: { initial: Restaurant; children: ReactNode }) {
  const repo = useRepo()
  const [restaurant, setRestaurant] = useState(initial)
  const [today, setToday] = useState<Order[]>([])
  const [newOrderIds, setNewOrderIds] = useState<Set<string>>(new Set())
  const known = useRef<Set<string> | null>(null)

  const reloadToday = useCallback(async () => {
    const orders = await repo.listOrders(restaurant.id, { since: startOfToday() })
    setToday(orders)
    const ids = new Set(orders.map((o) => o.id))
    if (known.current) {
      const fresh = orders.filter((o) => !known.current!.has(o.id) && o.status === 'received')
      if (fresh.length) {
        chime()
        setNewOrderIds((prev) => new Set([...prev, ...fresh.map((o) => o.id)]))
        window.setTimeout(() => {
          setNewOrderIds((prev) => {
            const next = new Set(prev)
            fresh.forEach((o) => next.delete(o.id))
            return next
          })
        }, 8000)
      }
    }
    known.current = ids
  }, [repo, restaurant.id])

  useEffect(() => {
    known.current = null
    void reloadToday()
    return repo.subscribeOrders(restaurant.id, () => void reloadToday())
  }, [repo, restaurant.id, reloadToday])

  const value: DashboardValue = {
    restaurant,
    setRestaurant,
    today,
    reloadToday,
    money: (c) => formatMoney(c, restaurant.currency, restaurant.locale),
    newOrderIds,
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useDashboard(): DashboardValue {
  const v = useContext(Ctx)
  if (!v) throw new Error('useDashboard outside provider')
  return v
}
