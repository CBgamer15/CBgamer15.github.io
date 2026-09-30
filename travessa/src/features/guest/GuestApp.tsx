import { useEffect, useState } from 'react'
import { Route, Routes, useParams } from 'react-router-dom'
import { useRepo } from '@/app/providers'
import type { PublicMenu, ResolvedTable } from '@/data/repository'
import { GuestProvider } from './GuestContext'
import { MenuScreen } from './MenuScreen'
import { OrderStatusScreen } from './OrderStatusScreen'

const tableKey = (slug: string) => `travessa:table:${slug}`

type LoadState =
  | { status: 'loading' }
  | { status: 'missing' }
  | { status: 'ready'; menu: PublicMenu; table: ResolvedTable | null; token: string | null; tableInvalid: boolean }

export default function GuestApp() {
  const { slug = '', '*': rest = '' } = useParams()
  const repo = useRepo()
  // Token from /m/:slug/t/:token, else the one remembered for this visit.
  const urlToken = rest.startsWith('t/') ? rest.slice(2).split('/')[0] : null
  const [state, setState] = useState<LoadState>({ status: 'loading' })

  useEffect(() => {
    let cancelled = false
    let unsub: (() => void) | undefined
    const token = urlToken ?? sessionStorage.getItem(tableKey(slug))

    const load = async (initial: boolean) => {
      const menu = await repo.getPublicMenu(slug)
      if (cancelled) return
      if (!menu) return setState({ status: 'missing' })
      let table: ResolvedTable | null = null
      if (token) table = await repo.resolveTable(slug, token)
      if (cancelled) return
      if (table && token) sessionStorage.setItem(tableKey(slug), token)
      setState({ status: 'ready', menu, table, token: table ? token : null, tableInvalid: Boolean(token && !table) })
      if (initial) unsub = repo.subscribeMenu(menu.restaurant.id, () => void load(false))
    }
    void load(true)
    return () => {
      cancelled = true
      unsub?.()
    }
  }, [repo, slug, urlToken])

  if (state.status === 'loading') return <MenuSkeleton />
  if (state.status === 'missing') {
    return (
      <div className="grid min-h-dvh place-items-center px-8 text-center">
        <div>
          <p className="font-display text-2xl">Menu indisponível</p>
          <p className="mt-2 text-sm text-mute">Não encontrámos este menu. Confirme o código QR.</p>
        </div>
      </div>
    )
  }

  return (
    <GuestProvider menu={state.menu} table={state.table} tableToken={state.token}>
      <Routes>
        <Route path="pedido/:orderId" element={<OrderStatusScreen />} />
        <Route path="*" element={<MenuScreen tableInvalid={state.tableInvalid} />} />
      </Routes>
    </GuestProvider>
  )
}

function MenuSkeleton() {
  return (
    <div className="mx-auto min-h-dvh max-w-xl animate-pulse">
      <div className="h-64 bg-paper-2" />
      <div className="space-y-3 px-5 pt-6">
        <div className="h-7 w-2/3 rounded bg-paper-2" />
        <div className="h-4 w-1/2 rounded bg-paper-2" />
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="flex gap-4 pt-6">
            <div className="flex-1 space-y-2">
              <div className="h-4 w-3/4 rounded bg-paper-2" />
              <div className="h-3 w-full rounded bg-paper-2" />
            </div>
            <div className="size-22 rounded-md bg-paper-2" />
          </div>
        ))}
      </div>
    </div>
  )
}
