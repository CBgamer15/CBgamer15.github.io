import { useState, type ComponentType, type SVGProps } from 'react'
import { Link, Navigate, NavLink, Route, Routes, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useAuth, useRepo } from '@/app/providers'
import { useAsync } from '@/data/hooks'
import { LocalRepository } from '@/data/local/localRepository'
import { isActive } from '@/domain/orderFlow'
import {
  IconCalendar, IconChart, IconChat, IconCube, IconExternal, IconFlameKitchen, IconHome, IconLogout,
  IconMenu, IconMenuBook, IconOrders, IconSettings, IconSparkle, IconStar, IconTable, IconUsers,
} from '@/components/icons'
import { Logo } from '@/components/ui'
import { cn } from '@/lib/cn'
import { DashboardProvider, useDashboard } from './DashboardContext'
import { Overview } from './overview/Overview'
import { OrdersPage } from './orders/OrdersPage'
import { KitchenPage } from './kitchen/KitchenPage'
import { TablesPage } from './tables/TablesPage'
import { MenuPage } from './menu/MenuPage'
import { SettingsPage } from './settings/SettingsPage'
import { TeamPage } from './team/TeamPage'
import { RoadmapPage } from './RoadmapPage'
import { ModelsPage } from './models/ModelsPage'
import { AnalyticsPage } from './analytics/AnalyticsPage'

type Icon = ComponentType<SVGProps<SVGSVGElement>>
interface NavItem { to: string; label: string; icon: Icon; phase?: string }

const NAV: { group: string; items: NavItem[] }[] = [
  {
    group: 'Operação',
    items: [
      { to: '', label: 'Visão geral', icon: IconHome },
      { to: 'pedidos', label: 'Pedidos', icon: IconOrders },
      { to: 'cozinha', label: 'Cozinha', icon: IconFlameKitchen },
      { to: 'mesas', label: 'Mesas e QR', icon: IconTable },
    ],
  },
  {
    group: 'Menu',
    items: [
      { to: 'menu', label: 'Menu', icon: IconMenuBook },
      { to: 'modelos-3d', label: 'Modelos 3D', icon: IconCube },
    ],
  },
  {
    group: 'Crescimento',
    items: [
      { to: 'analises', label: 'Análises', icon: IconChart },
      { to: 'assistente', label: 'Assistente IA', icon: IconSparkle, phase: 'Fase 4' },
      { to: 'reservas', label: 'Reservas', icon: IconCalendar, phase: 'Fase 6' },
      { to: 'avaliacoes', label: 'Avaliações', icon: IconStar, phase: 'Fase 6' },
      { to: 'whatsapp', label: 'WhatsApp', icon: IconChat, phase: 'Fase 7' },
    ],
  },
  {
    group: 'Conta',
    items: [
      { to: 'equipa', label: 'Equipa', icon: IconUsers },
      { to: 'definicoes', label: 'Definições', icon: IconSettings },
    ],
  },
]

export default function DashboardApp() {
  const { slug = '' } = useParams()
  const repo = useRepo()
  const { user, ready } = useAuth()
  const { data: restaurants, loading } = useAsync(() => (user ? repo.listMyRestaurants() : Promise.resolve([])), [user?.id])

  if (!ready || (user && loading)) return <div className="min-h-dvh bg-paper" />
  if (!user) return <Navigate to={`/entrar?next=/app/${slug}`} replace />
  const restaurant = restaurants?.find((r) => r.slug === slug)
  if (!restaurant) return <Navigate to="/app" replace />

  return (
    <DashboardProvider key={restaurant.id} initial={restaurant}>
      <Shell />
    </DashboardProvider>
  )
}

function Shell() {
  const repo = useRepo()
  const { user } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const { restaurant, today } = useDashboard()
  const [navOpen, setNavOpen] = useState(false)
  const base = `/app/${restaurant.slug}`
  const activeCount = today.filter((o) => isActive(o.status)).length
  const kitchenFocus = location.pathname.endsWith('/cozinha')
  const [params] = useSearchParams()

  // ?quiosque=1 → kitchen only, no navigation: for wall-mounted tablets and the demo stage.
  if (kitchenFocus && params.has('quiosque')) {
    return (
      <main className="min-h-dvh bg-paper px-5 py-6">
        <KitchenPage />
      </main>
    )
  }

  return (
    <div className="min-h-dvh bg-paper lg:grid lg:grid-cols-[15rem_1fr]">
      {/* Mobile top bar */}
      <div className="sticky top-0 z-30 flex items-center justify-between border-b border-line bg-paper px-4 py-3 lg:hidden">
        <button onClick={() => setNavOpen(true)} className="grid size-9 place-items-center rounded-md hover:bg-paper-2" aria-label="Abrir navegação">
          <IconMenu />
        </button>
        <span className="font-display text-lg">{restaurant.name}</span>
        <span className="w-9" />
      </div>

      {navOpen && <div className="fixed inset-0 z-40 bg-ink/30 lg:hidden" onClick={() => setNavOpen(false)} />}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex w-60 flex-col border-r border-line bg-paper-2 transition-transform lg:sticky lg:top-0 lg:h-dvh lg:translate-x-0',
          navOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="border-b border-line px-4 py-4">
          <Link to="/app" className="text-ink"><Logo className="text-base" /></Link>
          <Link to="/app" className="mt-4 block rounded-md border border-line-strong bg-surface px-3 py-2 hover:border-ink">
            <p className="truncate text-sm font-medium">{restaurant.name}</p>
            <p className="truncate text-xs text-mute">{restaurant.city ?? restaurant.slug}</p>
          </Link>
        </div>

        <nav className="flex-1 overflow-y-auto px-2 py-3" onClick={() => setNavOpen(false)}>
          {NAV.map((g) => (
            <div key={g.group} className="mb-4">
              <p className="px-2.5 pb-1.5 text-[11px] font-medium tracking-wider text-mute uppercase">{g.group}</p>
              {g.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to ? `${base}/${item.to}` : base}
                  end={!item.to}
                  className={({ isActive: on }) =>
                    cn(
                      'flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm transition-colors',
                      on ? 'bg-surface font-medium text-ink shadow-[inset_0_0_0_1px_var(--color-line)]' : 'text-ink-2 hover:text-ink',
                    )
                  }
                >
                  <item.icon width={17} height={17} className="shrink-0 opacity-80" />
                  <span className="flex-1">{item.label}</span>
                  {item.to === 'pedidos' && activeCount > 0 && (
                    <span className="rounded-sm bg-brand px-1.5 text-[11px] font-medium text-white tabular">{activeCount}</span>
                  )}
                  {item.phase && <span className="text-[10px] tracking-wide text-mute">{item.phase}</span>}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        <div className="space-y-1 border-t border-line px-2 py-3">
          <a
            href={`/m/${restaurant.slug}`}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm text-ink-2 hover:text-ink"
          >
            <IconExternal width={17} height={17} /> Ver menu público
          </a>
          <button
            onClick={async () => {
              await repo.signOut()
              navigate('/entrar')
            }}
            className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-sm text-ink-2 hover:text-ink"
          >
            <IconLogout width={17} height={17} />
            <span className="flex-1 truncate">{user?.name ?? user?.email}</span>
          </button>
        </div>
      </aside>

      <main className="min-w-0">
        {repo instanceof LocalRepository && (
          <div className="no-print flex flex-wrap items-center justify-between gap-2 border-b border-line bg-surface px-6 py-2 text-xs text-ink-2">
            <span>
              <span className="mr-2 inline-block size-1.5 rounded-full bg-brand align-middle" />
              Modo demonstração — os dados ficam guardados neste navegador e sincronizam entre separadores.
            </span>
            <button
              className="underline underline-offset-2 hover:text-ink"
              onClick={() => {
                if (confirm('Repor a demonstração da Casa do Mar? Pedidos e alterações serão apagados.')) {
                  repo.resetDemo()
                  window.location.reload()
                }
              }}
            >
              Repor demo
            </button>
          </div>
        )}
        <div className={cn('mx-auto px-5 py-7 sm:px-8', kitchenFocus ? 'max-w-none' : 'max-w-6xl')}>
          <Routes>
            <Route index element={<Overview />} />
            <Route path="pedidos" element={<OrdersPage />} />
            <Route path="cozinha" element={<KitchenPage />} />
            <Route path="mesas" element={<TablesPage />} />
            <Route path="menu" element={<MenuPage />} />
            <Route path="modelos-3d" element={<ModelsPage />} />
            <Route path="analises" element={<AnalyticsPage />} />
            <Route path="equipa" element={<TeamPage />} />
            <Route path="definicoes" element={<SettingsPage />} />
            <Route path=":module" element={<RoadmapPage />} />
          </Routes>
        </div>
      </main>
    </div>
  )
}
