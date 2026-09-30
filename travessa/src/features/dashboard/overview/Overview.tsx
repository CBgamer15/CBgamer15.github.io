import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useRepo } from '@/app/providers'
import { useAsync, useNow } from '@/data/hooks'
import { isActive } from '@/domain/orderFlow'
import type { Order } from '@/domain/types'
import { IconCheck, IconArrowRight } from '@/components/icons'
import { Badge, Button, PageHeader, Stat } from '@/components/ui'
import { cn } from '@/lib/cn'
import { formatTime, minutesSince } from '@/lib/format'
import { useDashboard } from '../DashboardContext'
import { StatusBadge } from '../orders/StatusBadge'

export function todayStats(orders: Order[]) {
  const valid = orders.filter((o) => o.status !== 'cancelled')
  const revenue = valid.reduce((s, o) => s + o.totalCents, 0)
  const prepTimes = valid.filter((o) => o.readyAt).map((o) => (new Date(o.readyAt!).getTime() - new Date(o.createdAt).getTime()) / 60000)
  const dishCounts = new Map<string, number>()
  for (const o of valid) for (const i of o.items) dishCounts.set(i.name, (dishCounts.get(i.name) ?? 0) + i.quantity)
  const byHour = new Map<number, number>()
  for (const o of valid) {
    const h = new Date(o.createdAt).getHours()
    byHour.set(h, (byHour.get(h) ?? 0) + 1)
  }
  return {
    count: valid.length,
    revenue,
    avg: valid.length ? Math.round(revenue / valid.length) : 0,
    prep: prepTimes.length ? Math.round(prepTimes.reduce((a, b) => a + b, 0) / prepTimes.length) : null,
    active: orders.filter((o) => isActive(o.status)).length,
    top: [...dishCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5),
    byHour,
  }
}

export function Overview() {
  const repo = useRepo()
  const { restaurant, today, money } = useDashboard()
  const now = useNow()
  const stats = useMemo(() => todayStats(today), [today])
  const base = `/app/${restaurant.slug}`
  const setup = useAsync(
    async () => {
      const [cats, dishes, tables] = await Promise.all([
        repo.listCategories(restaurant.id),
        repo.listDishes(restaurant.id),
        repo.listTables(restaurant.id),
      ])
      return { cats: cats.length, dishes: dishes.length, tables: tables.length }
    },
    [restaurant.id],
  )

  const steps = setup.data
    ? [
        { done: setup.data.cats > 0, label: 'Criar as categorias do menu', to: 'menu' },
        { done: setup.data.dishes >= 3, label: 'Adicionar pratos com fotografia e preço', to: 'menu' },
        { done: setup.data.tables > 0, label: 'Criar mesas e imprimir os códigos QR', to: 'mesas' },
        { done: restaurant.isPublished, label: 'Publicar o menu', to: 'definicoes' },
      ]
    : []
  const setupDone = steps.every((s) => s.done)
  const active = today.filter((o) => isActive(o.status)).sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  const hours = Array.from({ length: 13 }, (_, i) => i + 11) // 11h–23h
  const maxHour = Math.max(1, ...hours.map((h) => stats.byHour.get(h) ?? 0))
  const greeting = new Date(now).getHours() < 13 ? 'Bom dia' : new Date(now).getHours() < 20 ? 'Boa tarde' : 'Boa noite'

  return (
    <div className="space-y-8">
      <PageHeader
        title={greeting}
        description={`${restaurant.name} · ${new Date(now).toLocaleDateString('pt-PT', { weekday: 'long', day: 'numeric', month: 'long' })}`}
        actions={
          <>
            <Link to={`${base}/cozinha`}><Button>Abrir cozinha</Button></Link>
            <a href={`/m/${restaurant.slug}`} target="_blank" rel="noreferrer"><Button variant="primary">Ver menu</Button></a>
          </>
        }
      />

      {setup.data && !setupDone && (
        <section className="border border-line bg-surface">
          <div className="border-b border-line px-5 py-3.5">
            <p className="font-medium">Colocar o restaurante online</p>
            <p className="text-sm text-ink-2">Quatro passos. A equipa Travessa pode tratar de tudo por si.</p>
          </div>
          <ol className="divide-y divide-line">
            {steps.map((s, i) => (
              <li key={s.label}>
                <Link to={`${base}/${s.to}`} className="flex items-center gap-3 px-5 py-3 text-sm hover:bg-paper">
                  <span className={cn('grid size-6 place-items-center rounded-full border text-xs', s.done ? 'border-ok bg-ok text-white' : 'border-line-strong text-mute')}>
                    {s.done ? <IconCheck width={14} height={14} /> : i + 1}
                  </span>
                  <span className={cn('flex-1', s.done && 'text-mute line-through')}>{s.label}</span>
                  {!s.done && <IconArrowRight width={16} height={16} className="text-mute" />}
                </Link>
              </li>
            ))}
          </ol>
        </section>
      )}

      <section className="grid grid-cols-2 gap-px border border-line bg-line md:grid-cols-5 [&>*]:bg-surface [&>*:last-child]:max-md:col-span-2">
        <Stat label="Pedidos hoje" value={stats.count} />
        <Stat label="Faturação" value={money(stats.revenue)} sub="Pedidos à mesa" />
        <Stat label="Ticket médio" value={money(stats.avg)} />
        <Stat label="Preparação média" value={stats.prep !== null ? `${stats.prep} min` : '—'} sub="Receção → pronto" />
        <Stat label="Em curso" value={stats.active} sub={stats.active ? 'Na cozinha agora' : 'Sala tranquila'} />
      </section>

      <div className="grid gap-8 lg:grid-cols-[1.4fr_1fr]">
        <section>
          <div className="flex items-baseline justify-between">
            <h2 className="font-display text-xl">Em curso</h2>
            <Link to={`${base}/pedidos`} className="text-sm text-ink-2 hover:text-ink">Todos os pedidos →</Link>
          </div>
          {active.length === 0 ? (
            <p className="mt-3 border border-dashed border-line-strong px-5 py-10 text-center text-sm text-ink-2">
              Sem pedidos em curso. Abra o menu de uma mesa e faça um pedido para ver o fluxo em tempo real.
            </p>
          ) : (
            <ul className="mt-3 divide-y divide-line border border-line bg-surface">
              {active.map((o) => (
                <li key={o.id} className="flex items-center gap-4 px-5 py-3.5">
                  <span className="w-12 font-display text-xl tabular">#{o.number}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{o.tableLabel}</p>
                    <p className="truncate text-xs text-ink-2">{o.items.map((i) => `${i.quantity}× ${i.name}`).join(', ')}</p>
                  </div>
                  <span className={cn('text-xs tabular', minutesSince(o.createdAt, now) > 20 ? 'text-alert' : 'text-mute')}>
                    {minutesSince(o.createdAt, now)} min
                  </span>
                  <StatusBadge status={o.status} />
                </li>
              ))}
            </ul>
          )}

          <h2 className="mt-10 font-display text-xl">Pedidos por hora</h2>
          <div className="mt-3 border border-line bg-surface px-5 pt-6 pb-3">
            <div className="flex h-32 items-end gap-1.5">
              {hours.map((h) => {
                const v = stats.byHour.get(h) ?? 0
                return (
                  <div key={h} className="flex h-full flex-1 flex-col justify-end" title={`${h}h: ${v} pedidos`}>
                    <div className={cn('rounded-t-sm', v ? 'bg-ink' : 'bg-line')} style={{ height: `${v ? Math.max(6, (v / maxHour) * 100) : 3}%` }} />
                  </div>
                )
              })}
            </div>
            <div className="mt-2 flex gap-1.5 text-[10px] text-mute tabular">
              {hours.map((h) => <span key={h} className="flex-1 text-center">{h % 2 ? '' : `${h}h`}</span>)}
            </div>
          </div>
        </section>

        <section>
          <h2 className="font-display text-xl">Mais pedidos hoje</h2>
          {stats.top.length === 0 ? (
            <p className="mt-3 text-sm text-ink-2">Ainda sem pedidos hoje.</p>
          ) : (
            <ol className="mt-3 divide-y divide-line border border-line bg-surface">
              {stats.top.map(([name, qty], i) => (
                <li key={name} className="flex items-center gap-3 px-5 py-3 text-sm">
                  <span className="w-4 text-mute tabular">{i + 1}</span>
                  <span className="flex-1">{name}</span>
                  <span className="tabular text-ink-2">{qty}</span>
                </li>
              ))}
            </ol>
          )}

          <h2 className="mt-10 font-display text-xl">Últimos pedidos</h2>
          <ul className="mt-3 divide-y divide-line border border-line bg-surface">
            {today.slice(0, 6).map((o) => (
              <li key={o.id} className="flex items-center gap-3 px-5 py-2.5 text-sm">
                <span className="w-10 tabular text-mute">#{o.number}</span>
                <span className="flex-1">{o.tableLabel}</span>
                <span className="text-xs text-mute tabular">{formatTime(o.createdAt)}</span>
                <span className="w-20 text-right tabular">{money(o.totalCents)}</span>
              </li>
            ))}
            {today.length === 0 && <li className="px-5 py-4 text-sm text-ink-2">—</li>}
          </ul>
          <p className="mt-6 text-xs text-mute">
            <Badge tone="brand">Fase 3</Badge> <span className="ml-1">Visualizações do menu, 3D, conversão e horas de ponta chegam com o módulo de Análises.</span>
          </p>
        </section>
      </div>
    </div>
  )
}
