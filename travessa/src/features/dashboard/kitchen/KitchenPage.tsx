import { useRef, useState } from 'react'
import { useRepo } from '@/app/providers'
import { useNow } from '@/data/hooks'
import { nextStatus } from '@/domain/orderFlow'
import type { Order, OrderStatus } from '@/domain/types'
import { Button } from '@/components/ui'
import { cn } from '@/lib/cn'
import { formatTime, minutesSince } from '@/lib/format'
import { useDashboard } from '../DashboardContext'
import { NEXT_ACTION_LABEL } from '../orders/StatusBadge'

const COLUMNS: { status: OrderStatus; title: string }[] = [
  { status: 'received', title: 'Novos' },
  { status: 'preparing', title: 'Em preparação' },
  { status: 'ready', title: 'Prontos a servir' },
]

// Late thresholds in minutes since the order was placed.
const WARN_AT = 12
const LATE_AT = 20

/** Kitchen display: large type, one tap per ticket, readable from across the pass. */
export function KitchenPage() {
  const repo = useRepo()
  const { today, newOrderIds } = useDashboard()
  const now = useNow(15000)
  const root = useRef<HTMLDivElement>(null)
  const [busy, setBusy] = useState<string>()
  const [error, setError] = useState<string>()

  const advance = async (o: Order, to: OrderStatus) => {
    setBusy(o.id)
    setError(undefined)
    try {
      await repo.updateOrderStatus(o.id, to)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(undefined)
    }
  }

  const fullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen()
    else void root.current?.requestFullscreen()
  }

  return (
    <div ref={root} className="min-h-full bg-paper">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-line pb-5 [:fullscreen_&]:px-6 [:fullscreen_&]:pt-5">
        <div>
          <h1 className="font-display text-[1.75rem] leading-tight">Cozinha</h1>
          <p className="mt-1 text-sm text-ink-2">
            Pedidos em tempo real. Toque no botão do talão para avançar. Alerta sonoro em cada novo pedido.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-mute tabular">{new Date(now).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })}</span>
          <Button onClick={fullscreen}>Ecrã inteiro</Button>
        </div>
      </div>
      {error && <p className="mt-4 text-sm text-alert">{error}</p>}

      <div className="mt-6 grid gap-6 md:grid-cols-3 [:fullscreen_&]:px-6">
        {COLUMNS.map((col) => {
          const orders = today.filter((o) => o.status === col.status).sort((a, b) => a.createdAt.localeCompare(b.createdAt))
          return (
            <section key={col.status}>
              <h2 className="flex items-center justify-between border-b-2 border-ink pb-2 text-sm font-medium tracking-wide uppercase">
                {col.title}
                <span className="tabular">{orders.length}</span>
              </h2>
              <div className="mt-4 space-y-4">
                {orders.length === 0 && <p className="py-8 text-center text-sm text-mute">—</p>}
                {orders.map((o) => {
                  const mins = minutesSince(o.createdAt, now)
                  const next = nextStatus(o.status)
                  const isNew = newOrderIds.has(o.id)
                  return (
                    <article
                      key={o.id}
                      className={cn(
                        'anim-rise border bg-surface',
                        isNew ? 'anim-pulse border-brand' : 'border-line-strong',
                        o.status !== 'ready' && mins >= LATE_AT && 'border-alert',
                      )}
                    >
                      <header className="flex items-center justify-between border-b border-line px-4 py-3">
                        <div className="flex items-baseline gap-3">
                          <span className="font-display text-2xl tabular">#{o.number}</span>
                          <span className="font-medium">{o.tableLabel}</span>
                        </div>
                        <span
                          className={cn(
                            'rounded-sm px-2 py-0.5 text-sm font-medium tabular',
                            mins >= LATE_AT ? 'bg-alert text-white' : mins >= WARN_AT ? 'bg-warn-soft text-warn' : 'text-ink-2',
                          )}
                          title={`Recebido às ${formatTime(o.createdAt)}`}
                        >
                          {mins} min
                        </span>
                      </header>
                      <ul className="space-y-2 px-4 py-3">
                        {o.items.map((it) => (
                          <li key={it.id} className="text-[15px] leading-snug">
                            <span className="mr-2 inline-block min-w-6 font-semibold tabular">{it.quantity}×</span>
                            {it.name}
                            {it.options.length > 0 && <p className="ml-8 text-sm text-ink-2">{it.options.map((x) => x.choice).join(' · ')}</p>}
                            {it.note && <p className="ml-8 text-sm font-medium text-brand-ink">↳ {it.note}</p>}
                          </li>
                        ))}
                      </ul>
                      {o.note && <p className="mx-4 mb-3 border-l-2 border-brand bg-brand/5 px-3 py-2 text-sm">{o.note}</p>}
                      <footer className="flex gap-2 border-t border-line p-3">
                        {next && (
                          <button
                            disabled={busy === o.id}
                            onClick={() => advance(o, next)}
                            className={cn(
                              'h-11 flex-1 rounded-md text-sm font-medium text-white disabled:opacity-50',
                              next === 'preparing' ? 'bg-ink' : next === 'ready' ? 'bg-ok' : 'bg-ink-2',
                            )}
                          >
                            {NEXT_ACTION_LABEL[o.status]}
                          </button>
                        )}
                        {o.status === 'received' && (
                          <button
                            disabled={busy === o.id}
                            onClick={() => confirm(`Cancelar o pedido #${o.number}?`) && advance(o, 'cancelled')}
                            className="h-11 rounded-md border border-line-strong px-3 text-sm text-ink-2 hover:text-alert"
                          >
                            Cancelar
                          </button>
                        )}
                      </footer>
                    </article>
                  )
                })}
              </div>
            </section>
          )
        })}
      </div>
    </div>
  )
}
