import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import type { Dish, DishTag } from '@/domain/types'
import { DishImage } from '@/components/DishImage'
import { IconFlame, IconLeaf, IconReceipt } from '@/components/icons'
import { cn } from '@/lib/cn'
import { useGuest } from './GuestContext'
import { DishSheet } from './DishSheet'
import { CartSheet } from './CartSheet'

const MARKER_TAGS: DishTag[] = ['vegetarian', 'vegan', 'spicy']

export function MenuScreen({ tableInvalid }: { tableInvalid: boolean }) {
  const { menu, table, t, lang, setLang, money, priced, recentOrders } = useGuest()
  const { restaurant } = menu
  const [openDish, setOpenDish] = useState<Dish | null>(null)
  const [cartOpen, setCartOpen] = useState(false)

  const sections = useMemo(
    () =>
      menu.categories
        .filter((c) => c.isVisible)
        .map((c) => ({ category: c, dishes: menu.dishes.filter((d) => d.categoryId === c.id) }))
        .filter((s) => s.dishes.length > 0),
    [menu],
  )
  const featured = useMemo(() => menu.dishes.filter((d) => d.isFeatured && d.isAvailable), [menu])
  const activeId = useScrollSpy(sections.map((s) => s.category.id))
  const canOrder = Boolean(table) && restaurant.settings.orderingEnabled
  const lastOrder = recentOrders[0]

  // Keep the open sheet in sync with live menu changes (e.g. sold out).
  const liveOpenDish = openDish ? (menu.dishes.find((d) => d.id === openDish.id) ?? null) : null

  return (
    <div className="mx-auto min-h-dvh max-w-xl bg-paper pb-32">
      {/* Cover */}
      <header className="relative">
        <DishImage src={restaurant.brand.coverUrl} alt={restaurant.name} className="h-60 w-full" eager />
        <div className="absolute inset-0 bg-linear-to-t from-black/55 via-black/10 to-transparent" />
        <div className="absolute inset-x-0 top-0 flex items-center justify-between p-4">
          {table ? (
            <span className="rounded-full bg-paper/95 px-3 py-1.5 text-xs font-medium tracking-wide text-ink backdrop-blur">
              {table.label}
              {table.area && table.area !== table.label ? <span className="text-mute"> · {table.area}</span> : null}
            </span>
          ) : (
            <span />
          )}
          <button
            onClick={() => setLang(lang === 'pt' ? 'en' : 'pt')}
            className="rounded-full bg-paper/95 px-3 py-1.5 text-xs font-medium uppercase tracking-wider text-ink backdrop-blur"
            aria-label="Mudar idioma / Change language"
          >
            {lang === 'pt' ? 'EN' : 'PT'}
          </button>
        </div>
        <div className="absolute inset-x-0 bottom-0 px-5 pb-5 text-white">
          <h1 className="font-display text-[2.1rem] leading-none font-normal tracking-tight">{restaurant.name}</h1>
          {restaurant.tagline && <p className="mt-2 text-sm text-white/85">{restaurant.tagline}</p>}
        </div>
      </header>

      {!restaurant.isPublished && (
        <p className="bg-warn-soft px-5 py-2 text-xs text-warn">Pré-visualização — este menu ainda não está publicado.</p>
      )}
      {tableInvalid && <p className="bg-alert-soft px-5 py-3 text-sm text-alert">{t.tableInvalid}</p>}

      {lastOrder && (
        <Link
          to={`/m/${restaurant.slug}/pedido/${lastOrder.orderId}?k=${lastOrder.accessToken}`}
          className="flex items-center justify-between border-b border-line bg-surface px-5 py-3 text-sm"
        >
          <span className="flex items-center gap-2">
            <IconReceipt width={18} height={18} className="text-mute" />
            {t.order} #{lastOrder.number}
          </span>
          <span className="text-mute">{t.myOrders} →</span>
        </Link>
      )}

      {/* Category nav */}
      <nav className="sticky top-0 z-20 border-b border-line bg-paper/95 backdrop-blur">
        <ul className="scrollbar-none flex gap-6 overflow-x-auto px-5">
          {sections.map(({ category }) => (
            <li key={category.id} className="shrink-0">
              <a
                href={`#c-${category.id}`}
                onClick={(e) => {
                  e.preventDefault()
                  document.getElementById(`c-${category.id}`)?.scrollIntoView({ behavior: 'smooth' })
                }}
                className={cn(
                  'block border-b-2 py-3.5 text-sm transition-colors',
                  activeId === category.id ? 'border-[var(--accent)] font-medium text-ink' : 'border-transparent text-mute',
                )}
              >
                {category.name}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      {/* Featured */}
      {featured.length > 0 && (
        <section className="pt-7">
          <h2 className="px-5 font-display text-xl">{t.featured}</h2>
          <div className="scrollbar-none mt-4 flex snap-x snap-mandatory scroll-px-5 gap-3 overflow-x-auto px-5 pb-1">
            {featured.map((d) => (
              <button key={d.id} onClick={() => setOpenDish(d)} className="w-60 shrink-0 snap-start text-left">
                <DishImage src={d.imageUrl} alt={d.name} className="aspect-[4/3] w-full rounded-md" />
                <p className="mt-2.5 text-[15px] leading-snug font-medium">{d.name}</p>
                <p className="mt-0.5 text-sm text-ink-2 tabular">{money(d.priceCents)}</p>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Sections */}
      {sections.map(({ category, dishes }) => (
        <section key={category.id} id={`c-${category.id}`} data-spy={category.id} className="scroll-mt-14 px-5 pt-9">
          <h2 className="font-display text-xl">{category.name}</h2>
          {category.description && <p className="mt-1 text-sm text-mute">{category.description}</p>}
          <ul className="mt-2 divide-y divide-line">
            {dishes.map((d) => (
              <li key={d.id}>
                <DishRow dish={d} onOpen={() => setOpenDish(d)} />
              </li>
            ))}
          </ul>
        </section>
      ))}

      <footer className="px-5 pt-12 pb-6 text-xs leading-relaxed text-mute">
        <p>{t.vatNote} {restaurant.settings.serviceNote}</p>
        {restaurant.address && <p className="mt-1">{restaurant.address}</p>}
        <p className="mt-6 tracking-wide">
          Menu digital por <span className="font-medium text-ink-2">Travessa</span>
        </p>
      </footer>

      {/* Bottom bar */}
      <div className="fixed inset-x-0 bottom-0 z-30 mx-auto max-w-xl px-4 safe-bottom">
        {canOrder ? (
          priced.count > 0 && (
            <button
              onClick={() => setCartOpen(true)}
              className="anim-rise flex w-full items-center justify-between rounded-lg bg-[var(--accent)] px-5 py-4 text-white shadow-[0_8px_30px_-8px_rgba(0,0,0,0.45)]"
            >
              <span className="flex items-center gap-3">
                <span className="grid size-7 place-items-center rounded-full bg-white/15 text-sm font-medium tabular">{priced.count}</span>
                <span className="font-medium">{t.viewOrder}</span>
              </span>
              <span className="font-medium tabular">{money(priced.totalCents)}</span>
            </button>
          )
        ) : (
          <p className="rounded-lg bg-ink/90 px-4 py-3 text-center text-sm text-paper backdrop-blur">
            {restaurant.settings.orderingEnabled ? t.browseOnly : restaurant.phone}
          </p>
        )}
      </div>

      {liveOpenDish && <DishSheet dish={liveOpenDish} canOrder={canOrder} onClose={() => setOpenDish(null)} />}
      {cartOpen && <CartSheet onClose={() => setCartOpen(false)} />}
    </div>
  )
}

function DishRow({ dish, onOpen }: { dish: Dish; onOpen: () => void }) {
  const { t, money } = useGuest()
  const markers = dish.tags.filter((tag) => MARKER_TAGS.includes(tag))
  return (
    <button onClick={onOpen} className={cn('flex w-full gap-4 py-5 text-left', !dish.isAvailable && 'opacity-55')}>
      <div className="min-w-0 flex-1">
        <p className="text-[15px] leading-snug font-medium">
          {dish.name}
          {dish.tags.includes('signature') && <span className="ml-2 align-middle text-[11px] font-normal tracking-wide text-[var(--accent)] uppercase">{t.tags.signature}</span>}
        </p>
        {dish.description && <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-ink-2">{dish.description}</p>}
        <div className="mt-2 flex items-center gap-3 text-sm">
          <span className="tabular">{dish.isAvailable ? money(dish.priceCents) : t.soldOut}</span>
          {markers.map((m) => (
            <span key={m} className="flex items-center gap-1 text-xs text-mute" title={t.tags[m]}>
              {m === 'spicy' ? <IconFlame width={14} height={14} /> : <IconLeaf width={14} height={14} />}
              {t.tags[m]}
            </span>
          ))}
        </div>
      </div>
      {dish.imageUrl && <DishImage src={dish.imageUrl} alt={dish.name} className="size-24 shrink-0 rounded-md" />}
    </button>
  )
}

function useScrollSpy(ids: string[]): string | undefined {
  const [active, setActive] = useState<string | undefined>(ids[0])
  const key = ids.join(',')
  const visible = useRef(new Map<string, number>())
  useEffect(() => {
    const els = key
      .split(',')
      .map((id) => document.querySelector<HTMLElement>(`[data-spy="${id}"]`))
      .filter((el): el is HTMLElement => Boolean(el))
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) visible.current.set((e.target as HTMLElement).dataset.spy!, e.isIntersecting ? e.boundingClientRect.top : Infinity)
        const top = [...visible.current.entries()].filter(([, v]) => v !== Infinity).sort((a, b) => a[1] - b[1])[0]
        if (top) setActive(top[0])
      },
      { rootMargin: '-56px 0px -60% 0px' },
    )
    els.forEach((el) => io.observe(el))
    return () => io.disconnect()
  }, [key])
  // Scroll the active tab into view.
  useEffect(() => {
    document.querySelector(`a[href="#c-${active}"]`)?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' })
  }, [active])
  return active
}

