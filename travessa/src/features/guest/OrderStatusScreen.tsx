import { useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { useRepo } from '@/app/providers'
import type { GuestOrder, OrderStatus } from '@/domain/types'
import { IconArrowLeft, IconCheck, IconStar } from '@/components/icons'
import { cn } from '@/lib/cn'
import { formatTime } from '@/lib/format'
import { useGuest } from './GuestContext'

const STEPS: OrderStatus[] = ['received', 'preparing', 'ready', 'served']

export function OrderStatusScreen() {
  const { orderId = '' } = useParams()
  const [params] = useSearchParams()
  const accessToken = params.get('k') ?? ''
  const repo = useRepo()
  const { menu, t, money, table } = useGuest()
  const [order, setOrder] = useState<GuestOrder | null | undefined>(undefined)

  useEffect(() => {
    let alive = true
    void repo.getGuestOrder(orderId, accessToken).then((o) => alive && setOrder(o))
    const unsub = repo.subscribeGuestOrder(orderId, accessToken, (o) => alive && setOrder(o))
    return () => {
      alive = false
      unsub()
    }
  }, [repo, orderId, accessToken])

  const menuHref = `/m/${menu.restaurant.slug}`

  if (order === undefined) return <div className="min-h-dvh bg-paper" />
  if (order === null) {
    return (
      <div className="grid min-h-dvh place-items-center px-8 text-center">
        <div>
          <p className="font-display text-2xl">{t.orderNotFound}</p>
          <Link to={menuHref} className="mt-4 inline-block text-sm underline underline-offset-4">{t.backToMenu}</Link>
        </div>
      </div>
    )
  }

  const stepIndex = STEPS.indexOf(order.status)
  const cancelled = order.status === 'cancelled'
  const reviewUrl = menu.restaurant.settings.googleReviewUrl

  return (
    <div className="mx-auto min-h-dvh max-w-xl bg-paper pb-16">
      <header className="flex items-center gap-2 px-3 py-3">
        <Link to={menuHref} className="grid size-10 place-items-center rounded-full hover:bg-paper-2" aria-label={t.backToMenu}>
          <IconArrowLeft />
        </Link>
        <span className="text-sm text-ink-2">{menu.restaurant.name}</span>
      </header>

      <section className="px-6 pt-6">
        <p className="text-xs tracking-[0.18em] text-mute uppercase">
          {t.order} · {order.tableLabel} · {formatTime(order.createdAt)}
        </p>
        <h1 className="mt-2 font-display text-6xl leading-none tabular">#{order.number}</h1>
        <p key={order.status} className="anim-rise mt-5 font-display text-2xl">{t.status[order.status]}</p>
        <p className="mt-1 text-ink-2">{t.statusLine[order.status]}</p>

        {!cancelled && (
          <ol className="mt-8 grid grid-cols-4 gap-2" aria-label="Estado do pedido">
            {STEPS.map((s, i) => {
              const done = i < stepIndex || order.status === 'served'
              const current = i === stepIndex && order.status !== 'served'
              return (
                <li key={s}>
                  <div
                    className={cn(
                      'h-1 rounded-full transition-colors duration-700',
                      done || current ? 'bg-[var(--accent)]' : 'bg-line',
                      current && 'animate-pulse',
                    )}
                  />
                  <p className={cn('mt-2 flex items-center gap-1 text-xs', done || current ? 'text-ink' : 'text-mute')}>
                    {done && <IconCheck width={12} height={12} />}
                    {t.status[s]}
                  </p>
                </li>
              )
            })}
          </ol>
        )}
      </section>

      {order.status === 'served' && (
        <section className="anim-rise mx-6 mt-10 rounded-lg border border-line bg-surface p-5">
          <div className="flex gap-1 text-[var(--accent)]">
            {Array.from({ length: 5 }, (_, i) => <IconStar key={i} width={18} height={18} fill="currentColor" />)}
          </div>
          <p className="mt-3 font-display text-xl">{t.thanks}</p>
          <p className="mt-1 text-sm leading-relaxed text-ink-2">{t.reviewAsk}</p>
          {reviewUrl && (
            <a
              href={reviewUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-4 inline-block rounded-md bg-ink px-4 py-2.5 text-sm font-medium text-paper"
            >
              {t.reviewCta}
            </a>
          )}
        </section>
      )}

      <section className="mt-10 px-6">
        <ul className="divide-y divide-line border-y border-line">
          {order.items.map((it, i) => (
            <li key={i} className="flex justify-between gap-4 py-3.5 text-sm">
              <div>
                <p><span className="tabular text-mute">{it.quantity}×</span> {it.name}</p>
                {it.options.length > 0 && <p className="mt-0.5 text-ink-2">{it.options.map((o) => o.choice).join(' · ')}</p>}
                {it.note && <p className="mt-0.5 text-mute italic">“{it.note}”</p>}
              </div>
              <span className="tabular">{money(it.lineTotalCents)}</span>
            </li>
          ))}
        </ul>
        <div className="flex items-baseline justify-between py-4">
          <span className="text-ink-2">{t.total}</span>
          <span className="font-display text-xl tabular">{money(order.totalCents)}</span>
        </div>
      </section>

      {table && !cancelled && (
        <div className="px-6 pt-4">
          <Link to={menuHref} className="block rounded-lg border border-ink py-3.5 text-center font-medium">
            {t.orderMore}
          </Link>
        </div>
      )}
    </div>
  )
}
