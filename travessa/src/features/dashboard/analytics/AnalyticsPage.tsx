import { useMemo, useRef, useState, type ReactNode } from 'react'
import { useRepo } from '@/app/providers'
import { useAsync } from '@/data/hooks'
import { peakOf, type AnalyticsReport } from '@/domain/analytics'
import { IconCube } from '@/components/icons'
import { Badge, PageHeader, Select } from '@/components/ui'
import { cn } from '@/lib/cn'
import { useDashboard } from '../DashboardContext'

type Range = 7 | 30

const WEEKDAYS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom']
const WEEKDAYS_LONG = ['segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado', 'domingo']
const HOURS = Array.from({ length: 13 }, (_, i) => i + 11) // 11h–23h service window
// Sequential ramp (one hue, light → dark) from the Travessa terracotta.
const RAMP = ['#f3ece6', '#f0d9cc', '#e8bba4', '#dc977a', '#cc6f4c', '#a8482a']

const pct = (x: number) => `${Math.round(x * 100)}%`
const fmt = (n: number) => n.toLocaleString('pt-PT')

function rangeDates(days: Range): [Date, Date] {
  const to = new Date()
  to.setHours(24, 0, 0, 0)
  const from = new Date(to)
  from.setDate(from.getDate() - days)
  return [from, to]
}

interface Tip {
  x: number
  y: number
  content: ReactNode
}

function Tooltip({ tip }: { tip: Tip | null }) {
  if (!tip) return null
  return (
    <div
      className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-md border border-line bg-surface px-3 py-2 text-xs shadow-lg"
      style={{ left: tip.x, top: tip.y - 8 }}
    >
      {tip.content}
    </div>
  )
}

export function AnalyticsPage() {
  const repo = useRepo()
  const { restaurant, money } = useDashboard()
  const [range, setRange] = useState<Range>(30)
  const { data: r } = useAsync(() => {
    const [from, to] = rangeDates(range)
    return repo.getAnalytics(restaurant.id, from, to)
  }, [range, restaurant.id])

  return (
    <div className="space-y-8">
      <PageHeader
        title="Análises"
        description="O que os clientes veem no menu, o que pedem e onde o menu perde vendas."
        actions={
          <Select value={range} onChange={(e) => setRange(Number(e.target.value) as Range)} className="w-44" aria-label="Período">
            <option value={7}>Últimos 7 dias</option>
            <option value={30}>Últimos 30 dias</option>
          </Select>
        }
      />
      {repo.kind === 'local' && (
        <p className="-mt-4 text-xs text-mute">Dados de demonstração: 30 dias de serviço simulados, mais a atividade real feita neste navegador.</p>
      )}
      {r && <Report r={r} money={money} />}
    </div>
  )
}

function Report({ r, money }: { r: AnalyticsReport; money: (c: number) => string }) {
  const tiles: [string, string, string?][] = [
    ['Visitas ao menu', fmt(r.sessions), `${fmt(r.menuViews)} aberturas`],
    ['Pratos vistos', fmt(r.dishViews)],
    ['Vistas em 3D', fmt(r.modelViews), `${fmt(r.arViews)} na mesa (RA)`],
    ['Adições ao pedido', fmt(r.addToCart)],
    ['Pedidos', fmt(r.orders)],
    ['Conversão', pct(r.conversion), 'Visitas que terminam em pedido'],
    ['Ticket médio', money(r.avgOrderCents)],
    ['Faturação', money(r.revenueCents), 'Pedidos à mesa'],
  ]
  return (
    <>
      <section className="grid grid-cols-2 gap-px border border-line bg-line lg:grid-cols-4 [&>*]:bg-surface">
        {tiles.map(([label, value, sub]) => (
          <div key={label} className="px-5 py-4">
            <p className="text-xs text-ink-2">{label}</p>
            <p className="mt-1.5 text-2xl font-semibold tracking-tight">{value}</p>
            {sub && <p className="mt-1 text-xs text-mute">{sub}</p>}
          </div>
        ))}
      </section>

      <div className="grid gap-8 lg:grid-cols-2">
        <Funnel r={r} />
        <ThreeDImpact r={r} />
      </div>

      <Daily r={r} money={money} />
      <Heatmap r={r} />
      <Dishes r={r} />
    </>
  )
}

function Section({ title, subtitle, children, aside }: { title: string; subtitle?: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section>
      <div className="flex items-end justify-between gap-4">
        <div>
          <h2 className="font-display text-xl">{title}</h2>
          {subtitle && <p className="mt-0.5 text-sm text-ink-2">{subtitle}</p>}
        </div>
        {aside}
      </div>
      <div className="mt-3 border border-line bg-surface p-5">{children}</div>
    </section>
  )
}

function Funnel({ r }: { r: AnalyticsReport }) {
  const top = Math.max(1, r.funnel[0]?.sessions ?? 1)
  return (
    <Section title="Funil do menu" subtitle="Visitas únicas em cada passo.">
      <ol className="space-y-4">
        {r.funnel.map((s, i) => {
          const prev = i > 0 ? r.funnel[i - 1].sessions : 0
          return (
            <li key={s.label}>
              <div className="flex items-baseline justify-between text-sm">
                <span>{s.label}</span>
                <span className="tabular">
                  <span className="font-medium">{fmt(s.sessions)}</span>
                  <span className="ml-2 text-xs text-mute">{pct(s.sessions / top)}</span>
                </span>
              </div>
              <div className="mt-1.5 h-3 w-full rounded-r bg-paper-2">
                <div className="h-full rounded-r bg-ink" style={{ width: `${(s.sessions / top) * 100}%` }} />
              </div>
              {i > 0 && prev > 0 && <p className="mt-1 text-xs text-mute">{pct(s.sessions / prev)} do passo anterior</p>}
            </li>
          )
        })}
      </ol>
    </Section>
  )
}

function ThreeDImpact({ r }: { r: AnalyticsReport }) {
  const m = r.model3d
  const lift = m && m.without > 0 ? m.with / m.without : null
  return (
    <Section title="Impacto do 3D" subtitle="Pratos com modelo 3D: quem roda o prato pede mais?">
      {!m ? (
        <p className="text-sm text-ink-2">Ainda sem dados. Adicione modelos em “Modelos 3D” para medir o efeito.</p>
      ) : (
        <div>
          <div className="flex items-baseline gap-3">
            <IconCube width={22} height={22} className="self-center text-brand" />
            <p className="text-5xl font-semibold tracking-tight tabular">{lift ? `${lift.toFixed(1).replace('.', ',')}×` : '—'}</p>
          </div>
          <p className="mt-2 text-sm text-ink-2">mais probabilidade de pedir o prato depois de o ver em 3D.</p>
          <dl className="mt-6 space-y-3 text-sm">
            {([['Viram em 3D', m.with, m.sessionsWith, 'bg-brand'], ['Só a fotografia', m.without, m.sessionsWithout, 'bg-ink-2']] as const).map(
              ([label, rate, n, color]) => (
                <div key={label}>
                  <div className="flex justify-between">
                    <dt>{label}</dt>
                    <dd className="tabular">
                      <span className="font-medium">{pct(rate)}</span> <span className="text-xs text-mute">de {fmt(n)} visitas</span>
                    </dd>
                  </div>
                  <div className="mt-1.5 h-3 w-full rounded-r bg-paper-2">
                    <div className={cn('h-full rounded-r', color)} style={{ width: `${rate * 100}%` }} />
                  </div>
                </div>
              ),
            )}
          </dl>
        </div>
      )}
    </Section>
  )
}

function Daily({ r, money }: { r: AnalyticsReport; money: (c: number) => string }) {
  const [tip, setTip] = useState<Tip | null>(null)
  const frame = useRef<HTMLDivElement>(null)
  const max = Math.max(1, ...r.daily.map((d) => d.sessions))
  const ticks = [0, Math.round(max / 2), max]
  const label = (day: string) => new Date(`${day}T12:00:00`).toLocaleDateString('pt-PT', { day: 'numeric', month: 'short' })
  const every = r.daily.length > 10 ? 5 : 1
  return (
    <Section
      title="Visitas e pedidos por dia"
      aside={
        <div className="flex items-center gap-4 text-xs text-ink-2">
          <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-line-strong" /> Visitas</span>
          <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-ink" /> Pedidos</span>
        </div>
      }
    >
      <div ref={frame} className="relative" onMouseLeave={() => setTip(null)}>
        <div className="flex">
          <div className="flex h-44 w-8 flex-col justify-between pr-2 text-right text-[10px] text-mute tabular">
            {[...ticks].reverse().map((t) => <span key={t}>{t}</span>)}
          </div>
          <div className="relative flex h-44 flex-1 items-end gap-[2px] border-b border-line">
            {[0.5, 1].map((f) => (
              <div key={f} className="pointer-events-none absolute inset-x-0 border-t border-line/70" style={{ bottom: `${f * 100}%` }} />
            ))}
            {r.daily.map((d) => (
              <div
                key={d.day}
                className="group relative flex h-full flex-1 items-end justify-center"
                onMouseMove={(e) => {
                  const box = frame.current!.getBoundingClientRect()
                  const me = e.currentTarget.getBoundingClientRect()
                  setTip({
                    x: me.left - box.left + me.width / 2,
                    y: me.top - box.top + me.height * (1 - d.sessions / max),
                    content: (
                      <>
                        <p className="font-medium">{label(d.day)}</p>
                        <p className="text-ink-2">{d.sessions} visitas · {d.orders} pedidos</p>
                        <p className="text-ink-2">{money(d.revenueCents)}</p>
                      </>
                    ),
                  })
                }}
              >
                <div className="relative w-full max-w-6 rounded-t bg-line-strong group-hover:bg-mute/50" style={{ height: `${(d.sessions / max) * 100}%` }}>
                  <div className="absolute inset-x-0 bottom-0 rounded-t bg-ink" style={{ height: d.sessions ? `${(d.orders / d.sessions) * 100}%` : 0 }} />
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="ml-8 flex gap-[2px] pt-1.5 text-[10px] text-mute">
          {r.daily.map((d, i) => (
            <span key={d.day} className="flex-1 text-center whitespace-nowrap">{i % every === 0 ? label(d.day) : ''}</span>
          ))}
        </div>
        <Tooltip tip={tip} />
      </div>
    </Section>
  )
}

function Heatmap({ r }: { r: AnalyticsReport }) {
  const [tip, setTip] = useState<Tip | null>(null)
  const frame = useRef<HTMLDivElement>(null)
  const max = Math.max(1, ...r.heat.flat())
  const peak = peakOf(r.heat)
  const color = (n: number) => (n === 0 ? RAMP[0] : RAMP[Math.min(RAMP.length - 1, 1 + Math.floor((n / max) * (RAMP.length - 1.01)))])
  return (
    <Section
      title="Horas de ponta"
      subtitle={peak ? `Pico: ${WEEKDAYS_LONG[peak.weekday]} às ${peak.hour}h (${peak.orders} pedidos no período).` : 'Pedidos por dia da semana e hora.'}
      aside={
        <div className="flex items-center gap-1.5 text-[10px] text-mute">
          menos {RAMP.map((c) => <span key={c} className="size-3 rounded-sm" style={{ background: c }} />)} mais
        </div>
      }
    >
      <div ref={frame} className="relative overflow-x-auto" onMouseLeave={() => setTip(null)}>
        <table className="w-full min-w-[560px] border-separate border-spacing-[2px] text-[10px]">
          <thead>
            <tr>
              <th />
              {HOURS.map((h) => <th key={h} className="font-normal text-mute">{h}h</th>)}
            </tr>
          </thead>
          <tbody>
            {WEEKDAYS.map((w, wi) => (
              <tr key={w}>
                <th className="w-9 pr-1 text-left font-normal text-mute">{w}</th>
                {HOURS.map((h) => {
                  const n = r.heat[wi]?.[h] ?? 0
                  return (
                    <td
                      key={h}
                      className="h-7 rounded-sm"
                      style={{ background: color(n) }}
                      onMouseMove={(e) => {
                        const box = frame.current!.getBoundingClientRect()
                        const me = e.currentTarget.getBoundingClientRect()
                        setTip({ x: me.left - box.left + me.width / 2, y: me.top - box.top, content: <span>{WEEKDAYS_LONG[wi]}, {h}h: <b>{n}</b> pedidos</span> })
                      }}
                    />
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
        <Tooltip tip={tip} />
      </div>
    </Section>
  )
}

function Dishes({ r }: { r: AnalyticsReport }) {
  const rows = useMemo(() => r.dishes.filter((d) => d.views > 0 || d.orderedQty > 0), [r.dishes])
  // "Muito visto, pouco pedido": top-third by views with conversion below the median.
  const flagged = useMemo(() => {
    const byViews = [...rows].sort((a, b) => b.views - a.views)
    const cutoff = byViews[Math.floor(byViews.length / 3)]?.views ?? Infinity
    const convs = rows.filter((d) => d.views > 0).map((d) => d.conversion).sort((a, b) => a - b)
    const median = convs[Math.floor(convs.length / 2)] ?? 0
    return new Set(rows.filter((d) => d.views >= cutoff && d.conversion < median).map((d) => d.dishId))
  }, [rows])
  const maxQty = Math.max(1, ...rows.map((d) => d.orderedQty))

  return (
    <Section title="Pratos" subtitle="Vistos, abertos em 3D, adicionados e pedidos. Conversão = visitas que viram o prato e o pediram.">
      <div className="-m-5 overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs text-mute">
              <th className="px-5 py-2.5 font-medium">Prato</th>
              <th className="px-3 py-2.5 text-right font-medium">Vistas</th>
              <th className="px-3 py-2.5 text-right font-medium">3D</th>
              <th className="px-3 py-2.5 text-right font-medium">Adições</th>
              <th className="w-48 px-3 py-2.5 font-medium">Pedidos (unid.)</th>
              <th className="px-5 py-2.5 text-right font-medium">Conversão</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((d) => (
              <tr key={d.dishId}>
                <td className="px-5 py-2.5">
                  {d.name}
                  {flagged.has(d.dishId) && <Badge tone="warn" className="ml-2">Muito visto, pouco pedido</Badge>}
                </td>
                <td className="px-3 py-2.5 text-right tabular">{fmt(d.views)}</td>
                <td className="px-3 py-2.5 text-right text-ink-2 tabular">{d.modelViews ? fmt(d.modelViews) : '—'}</td>
                <td className="px-3 py-2.5 text-right tabular">{fmt(d.adds)}</td>
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <div className="h-2 flex-1 rounded-r bg-paper-2">
                      <div className="h-full rounded-r bg-ink" style={{ width: `${(d.orderedQty / maxQty) * 100}%` }} />
                    </div>
                    <span className="w-8 text-right tabular">{fmt(d.orderedQty)}</span>
                  </div>
                </td>
                <td className="px-5 py-2.5 text-right tabular">{d.views ? pct(d.conversion) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {flagged.size > 0 && (
        <p className="mt-8 text-xs text-ink-2">
          <Badge tone="warn">Muito visto, pouco pedido</Badge> <span className="ml-1">Pratos que chamam a atenção mas não convencem: reveja fotografia, descrição ou preço.</span>
        </p>
      )}
    </Section>
  )
}
