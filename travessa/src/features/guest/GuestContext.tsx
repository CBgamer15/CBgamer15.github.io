import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useRepo } from '@/app/providers'
import type { CartLine, SelectedOption } from '@/domain/types'
import { addLine, priceCart, setQuantity } from '@/domain/cart'
import type { PublicMenu, ResolvedTable, TrackedEvent } from '@/data/repository'
import { guestStrings, type GuestLang, type GuestStrings } from '@/i18n/guest'
import { formatMoney } from '@/lib/format'

interface RecentOrder {
  orderId: string
  accessToken: string
  number: number
  at: string
}

interface GuestContextValue {
  menu: PublicMenu
  table: ResolvedTable | null
  tableToken: string | null
  t: GuestStrings
  lang: GuestLang
  setLang: (l: GuestLang) => void
  money: (cents: number) => string
  cart: CartLine[]
  priced: ReturnType<typeof priceCart>
  add: (dishId: string, qty: number, options: SelectedOption[], note?: string) => void
  setQty: (key: string, qty: number) => void
  clearCart: () => void
  recentOrders: RecentOrder[]
  rememberOrder: (o: Omit<RecentOrder, 'at'>) => void
  session: string
  track: (type: TrackedEvent['type'], dishId?: string) => void
}

const Ctx = createContext<GuestContextValue | null>(null)

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function save(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // storage full or disabled: the cart simply won't survive a reload
  }
}

/**
 * Anonymous id for this visit only (sessionStorage: gone when the tab closes).
 * Links menu events to the order of the same visit; never tracks across visits.
 */
function visitSession(): string {
  try {
    let s = sessionStorage.getItem('travessa:visit')
    if (!s) {
      s = crypto.randomUUID()
      sessionStorage.setItem('travessa:visit', s)
    }
    return s
  } catch {
    return crypto.randomUUID()
  }
}

const FLUSH_MS = 2500

export function GuestProvider(props: {
  menu: PublicMenu
  table: ResolvedTable | null
  tableToken: string | null
  children: ReactNode
}) {
  const repo = useRepo()
  const { slug } = props.menu.restaurant
  const cartKey = `travessa:cart:${slug}`
  const ordersKey = `travessa:orders:${slug}`

  // Default is the restaurant's language (pt-PT); guests can switch and it is remembered.
  const [lang, setLangState] = useState<GuestLang>(() => load<GuestLang>('travessa:lang', props.menu.restaurant.locale.startsWith('en') ? 'en' : 'pt'))
  const [cart, setCart] = useState<CartLine[]>(() => load(cartKey, []))
  const [recentOrders, setRecent] = useState<RecentOrder[]>(() => load(ordersKey, []))
  const session = useMemo(visitSession, [])

  useEffect(() => save(cartKey, cart), [cart, cartKey])

  // Analytics: batch events; flush every few seconds and when the page is hidden.
  const queue = useRef<TrackedEvent[]>([])
  const tableToken = props.tableToken
  const flush = useCallback(() => {
    if (!queue.current.length) return
    const events = queue.current.splice(0, 25)
    void repo.trackEvents({ slug, session, tableToken, events }).catch(() => undefined)
  }, [repo, slug, session, tableToken])
  useEffect(() => {
    const id = window.setInterval(flush, FLUSH_MS)
    const onHide = () => document.visibilityState === 'hidden' && flush()
    document.addEventListener('visibilitychange', onHide)
    return () => {
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', onHide)
      flush()
    }
  }, [flush])
  const track = useCallback((type: TrackedEvent['type'], dishId?: string) => {
    queue.current.push({ type, dishId })
  }, [])

  // Sheets are portalled to <body>, so the brand accent lives on the root element.
  const accent = props.menu.restaurant.brand.accent ?? '#1c1b19'
  useEffect(() => {
    document.documentElement.style.setProperty('--accent', accent)
    return () => {
      document.documentElement.style.removeProperty('--accent')
    }
  }, [accent])

  const setLang = useCallback((l: GuestLang) => {
    setLangState(l)
    save('travessa:lang', l)
  }, [])

  const value = useMemo<GuestContextValue>(() => {
    const { currency, locale } = props.menu.restaurant
    return {
      ...props,
      t: guestStrings[lang],
      lang,
      setLang,
      money: (c) => formatMoney(c, currency, lang === 'pt' ? locale : 'en-IE'),
      cart,
      priced: priceCart(cart, props.menu.dishes),
      add: (dishId, qty, options, note) => {
        track('add_to_cart', dishId)
        setCart((c) => addLine(c, dishId, qty, options, note))
      },
      setQty: (key, qty) => setCart((c) => setQuantity(c, key, qty)),
      clearCart: () => setCart([]),
      recentOrders,
      rememberOrder: (o) =>
        setRecent((prev) => {
          const next = [{ ...o, at: new Date().toISOString() }, ...prev.filter((p) => p.orderId !== o.orderId)].slice(0, 10)
          save(ordersKey, next)
          return next
        }),
      session,
      track,
    }
  }, [props, lang, setLang, cart, recentOrders, ordersKey, session, track])

  return <Ctx.Provider value={value}>{props.children}</Ctx.Provider>
}

export function useGuest(): GuestContextValue {
  const v = useContext(Ctx)
  if (!v) throw new Error('useGuest outside GuestProvider')
  return v
}
