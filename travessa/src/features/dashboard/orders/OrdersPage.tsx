import { useMemo, useState } from 'react'
import { useRepo } from '@/app/providers'
import { useAsync } from '@/data/hooks'
import { canTransition } from '@/domain/orderFlow'
import type { Order, OrderStatus } from '@/domain/types'
import { Button, Drawer, EmptyState, PageHeader, Select } from '@/components/ui'
import { cn } from '@/lib/cn'
import { formatTime } from '@/lib/format'
import { startOfToday, useDashboard } from '../DashboardContext'
import { STATUS_LABEL, StatusBadge } from './StatusBadge'

type Range = 'today' | '7d' | '30d'
type Filter = 'all' | 'active' | OrderStatus

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'Todos' },
  { id: 'active', label: 'Em curso' },
  { id: 'served', label: 'Servidos' },
  { id: 'cancelled', label: 'Cancelados' },
]

function rangeStart(r: Range): string {
  if (r === 'today') return startOfToday()
  const d = new Date()
  d.setDate(d.getDate() - (r === '7d' ? 7 : 30))
  return d.toISOString()
}

export function OrdersPage() {
  const repo = useRepo()
  const { restaurant, today, money } = useDashboard()
  const [range, setRange] = useState<Range>('today')
  const [filter, setFilter] = useState<Filter>('all')
  const [openId, setOpenId] = useState<string>()

  // Today comes live from context; longer ranges are fetched on demand.
  const history = useAsync(
    () => (range === 'today' ? Promise.resolve(null) : repo.listOrders(restaurant.id, { since: rangeStart(range) })),
    [range, restaurant.id, today],
  )
  const source = useMemo(() => (range === 'today' ? today : (history.data ?? [])), [range, today, history.data])

  const orders = useMemo(
    () =>
      source.filter((o) =>
        filter === 'all' ? true : filter === 'active' ? ['received', 'preparing', 'ready'].includes(o.status) : o.status === filter,
      ),
    [source, filter],
  )
  const total = orders.filter((o) => o.status !== 'cancelled').reduce((s, o) => s + o.totalCents, 0)
  const open = source.find((o) => o.id === openId)

  return (
    <div className="space-y-6">
      <PageHeader
        title="Pedidos"
        description="Todos os pedidos feitos às mesas através do menu digital."
        actions={
          <Select value={range} onChange={(e) => setRange(e.target.value as Range)} className="w-40">
            <option value="today">Hoje</option>
            <option value="7d">Últimos 7 dias</option>
            <option value="30d">Últimos 30 dias</option>
          </Select>
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={cn('rounded-md px-3 py-1.5 text-sm', filter === f.id ? 'bg-ink text-paper' : 'text-ink-2 hover:bg-paper-2')}
            >
              {f.label}
            </button>
          ))}
        </div>
        <p className="text-sm text-ink-2">
          {orders.length} pedidos · <span className="tabular">{money(total)}</span>
        </p>
      </div>

      {orders.length === 0 ? (
        <EmptyState title="Sem pedidos" body="Quando um cliente pedir a partir do QR da mesa, o pedido aparece aqui e na cozinha, em tempo real." />
      ) : (
        <div className="overflow-x-auto border border-line bg-surface">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs text-mute">
                <th className="px-5 py-2.5 font-medium">Pedido</th>
                <th className="px-3 py-2.5 font-medium">Mesa</th>
                <th className="px-3 py-2.5 font-medium">Hora</th>
                <th className="px-3 py-2.5 font-medium">Artigos</th>
                <th className="px-3 py-2.5 font-medium">Estado</th>
                <th className="px-5 py-2.5 text-right font-medium">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {orders.map((o) => (
                <tr key={o.id} onClick={() => setOpenId(o.id)} className="cursor-pointer hover:bg-paper">
                  <td className="px-5 py-3 font-medium tabular">#{o.number}</td>
                  <td className="px-3 py-3">{o.tableLabel ?? '—'}</td>
                  <td className="px-3 py-3 text-ink-2 tabular">
                    {range !== 'today' && new Date(o.createdAt).toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit' }) + ' '}
                    {formatTime(o.createdAt)}
                  </td>
                  <td className="max-w-xs truncate px-3 py-3 text-ink-2">{o.items.map((i) => `${i.quantity}× ${i.name}`).join(', ')}</td>
                  <td className="px-3 py-3"><StatusBadge status={o.status} /></td>
                  <td className="px-5 py-3 text-right tabular">{money(o.totalCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {open && <OrderDrawer order={open} onClose={() => setOpenId(undefined)} />}
    </div>
  )
}

function OrderDrawer({ order, onClose }: { order: Order; onClose: () => void }) {
  const repo = useRepo()
  const { money } = useDashboard()
  const [error, setError] = useState<string>()
  const move = async (to: OrderStatus) => {
    try {
      await repo.updateOrderStatus(order.id, to)
    } catch (e) {
      setError((e as Error).message)
    }
  }
  const timeline: [string, string | undefined][] = [
    ['Recebido', order.createdAt],
    ['Em preparação', order.preparingAt],
    ['Pronto', order.readyAt],
    ['Servido', order.servedAt],
    ['Cancelado', order.cancelledAt],
  ]
  const actions = (['preparing', 'ready', 'served', 'cancelled'] as OrderStatus[]).filter((s) => canTransition(order.status, s))

  return (
    <Drawer
      title={`Pedido #${order.number}`}
      onClose={onClose}
      footer={actions.map((s) => (
        <Button key={s} variant={s === 'cancelled' ? 'danger' : 'primary'} onClick={() => move(s)}>
          {s === 'cancelled' ? 'Cancelar' : `Marcar “${STATUS_LABEL[s].toLowerCase()}”`}
        </Button>
      ))}
    >
      <div className="flex items-center justify-between">
        <p className="text-sm text-ink-2">{order.tableLabel} · {new Date(order.createdAt).toLocaleString('pt-PT')}</p>
        <StatusBadge status={order.status} />
      </div>
      {error && <p className="mt-3 text-sm text-alert">{error}</p>}
      <ul className="mt-5 divide-y divide-line border-y border-line">
        {order.items.map((it) => (
          <li key={it.id} className="flex justify-between gap-4 py-3 text-sm">
            <div>
              <p><span className="text-mute tabular">{it.quantity}×</span> {it.name}</p>
              {it.options.length > 0 && <p className="text-ink-2">{it.options.map((o) => o.choice).join(' · ')}</p>}
              {it.note && <p className="text-brand-ink">↳ {it.note}</p>}
            </div>
            <span className="tabular">{money(it.lineTotalCents)}</span>
          </li>
        ))}
      </ul>
      <div className="flex justify-between py-3 font-medium">
        <span>Total</span>
        <span className="tabular">{money(order.totalCents)}</span>
      </div>
      {order.note && <p className="mt-2 border-l-2 border-brand bg-brand/5 px-3 py-2 text-sm">{order.note}</p>}
      <h3 className="mt-6 text-xs font-medium tracking-wider text-mute uppercase">Cronologia</h3>
      <ol className="mt-2 space-y-1.5 text-sm">
        {timeline.filter(([, at]) => at).map(([label, at]) => (
          <li key={label} className="flex justify-between">
            <span>{label}</span>
            <span className="text-ink-2 tabular">{formatTime(at!)}</span>
          </li>
        ))}
      </ol>
    </Drawer>
  )
}
