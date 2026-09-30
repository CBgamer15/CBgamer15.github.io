import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { CartLine, SelectedOption } from '@/domain/types'
import { addLine, priceCart, setQuantity } from '@/domain/cart'
import type { PublicMenu, ResolvedTable } from '@/data/repository'
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

function guestSession(): string {
  let s = load<string | null>('travessa:guest-session', null)
  if (!s) {
    s = crypto.randomUUID()
    save('travessa:guest-session', s)
  }
  return s
}

export function GuestProvider(props: {
  menu: PublicMenu
  table: ResolvedTable | null
  tableToken: string | null
  children: ReactNode
}) {
  const { slug } = props.menu.restaurant
  const cartKey = `travessa:cart:${slug}`
  const ordersKey = `travessa:orders:${slug}`

  // Default is the restaurant's language (pt-PT); guests can switch and it is remembered.
  const [lang, setLangState] = useState<GuestLang>(() => load<GuestLang>('travessa:lang', props.menu.restaurant.locale.startsWith('en') ? 'en' : 'pt'))
  const [cart, setCart] = useState<CartLine[]>(() => load(cartKey, []))
  const [recentOrders, setRecent] = useState<RecentOrder[]>(() => load(ordersKey, []))
  const session = useMemo(guestSession, [])

  useEffect(() => save(cartKey, cart), [cart, cartKey])

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
      add: (dishId, qty, options, note) => setCart((c) => addLine(c, dishId, qty, options, note)),
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
    }
  }, [props, lang, setLang, cart, recentOrders, ordersKey, session])

  return <Ctx.Provider value={value}>{props.children}</Ctx.Provider>
}

export function useGuest(): GuestContextValue {
  const v = useContext(Ctx)
  if (!v) throw new Error('useGuest outside GuestProvider')
  return v
}
