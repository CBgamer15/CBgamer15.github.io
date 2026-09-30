import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useRepo } from '@/app/providers'
import { useAsync } from '@/data/hooks'
import { isActive } from '@/domain/orderFlow'
import type { RestaurantTable } from '@/domain/types'
import { QrCode } from '@/components/QrCode'
import { IconExternal, IconPrint } from '@/components/icons'
import { Badge, Button, Drawer, EmptyState, Field, Input, PageHeader, Switch } from '@/components/ui'
import { useDashboard } from '../DashboardContext'
import { tableUrl } from './tableUrl'

type Draft = Omit<RestaurantTable, 'id' | 'qrToken'> & { id?: string; qrToken?: string }

export function TablesPage() {
  const repo = useRepo()
  const { restaurant, today } = useDashboard()
  const { data: tables = [], reload } = useAsync(() => repo.listTables(restaurant.id), [restaurant.id])
  const [draft, setDraft] = useState<Draft | null>(null)
  const [error, setError] = useState<string>()

  const busyTables = new Set(today.filter((o) => isActive(o.status)).map((o) => o.tableId))
  const newDraft = (): Draft => ({
    restaurantId: restaurant.id,
    label: `Mesa ${tables.length + 1}`,
    area: tables.at(-1)?.area ?? 'Sala',
    seats: 4,
    isActive: true,
    position: tables.length + 1,
  })

  const save = async () => {
    if (!draft) return
    try {
      await repo.saveTable(draft)
      setDraft(null)
      await reload()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const areas = [...new Set(tables.map((t) => t.area ?? 'Sem zona'))]

  return (
    <div className="space-y-6">
      <PageHeader
        title="Mesas e QR"
        description="Cada mesa tem um código QR único. O cliente lê o código, abre o menu e o pedido chega à cozinha já identificado com a mesa."
        actions={
          <>
            {tables.length > 0 && (
              <Link to={`/app/${restaurant.slug}/mesas/imprimir`} target="_blank">
                <Button><IconPrint width={16} height={16} /> Imprimir códigos</Button>
              </Link>
            )}
            <Button variant="primary" onClick={() => setDraft(newDraft())}>Nova mesa</Button>
          </>
        }
      />

      {tables.length === 0 ? (
        <EmptyState
          title="Ainda sem mesas"
          body="Crie as mesas da sala e da esplanada. Depois imprima os códigos QR em folha A4, prontos a colocar em suportes de mesa."
          action={<Button variant="primary" onClick={() => setDraft(newDraft())}>Criar primeira mesa</Button>}
        />
      ) : (
        areas.map((area) => (
          <section key={area}>
            <h2 className="mb-3 text-xs font-medium tracking-wider text-mute uppercase">{area}</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              {tables
                .filter((t) => (t.area ?? 'Sem zona') === area)
                .map((t) => (
                  <div key={t.id} className="flex flex-col border border-line bg-surface p-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-medium">{t.label}</p>
                        <p className="text-xs text-mute">{t.seats} lugares</p>
                      </div>
                      {!t.isActive ? <Badge>Inativa</Badge> : busyTables.has(t.id) ? <Badge tone="brand">Com pedido</Badge> : null}
                    </div>
                    <QrCode value={tableUrl(restaurant.slug, t.qrToken)} className="mx-auto my-4 size-24" label={`QR ${t.label}`} />
                    <div className="mt-auto flex gap-1">
                      <Button size="sm" variant="ghost" className="flex-1" onClick={() => setDraft(t)}>Editar</Button>
                      <a href={`/m/${restaurant.slug}/t/${t.qrToken}`} target="_blank" rel="noreferrer" title="Abrir como cliente">
                        <Button size="sm" variant="ghost"><IconExternal width={15} height={15} /></Button>
                      </a>
                    </div>
                  </div>
                ))}
            </div>
          </section>
        ))
      )}

      {draft && (
        <Drawer
          title={draft.id ? draft.label : 'Nova mesa'}
          onClose={() => setDraft(null)}
          footer={
            <>
              {draft.id && (
                <Button
                  variant="danger"
                  className="mr-auto"
                  onClick={async () => {
                    if (!confirm(`Apagar ${draft.label}? O código QR impresso deixa de funcionar.`)) return
                    await repo.deleteTable(draft.id!)
                    setDraft(null)
                    await reload()
                  }}
                >
                  Apagar
                </Button>
              )}
              <Button onClick={() => setDraft(null)}>Cancelar</Button>
              <Button variant="primary" onClick={save} disabled={!draft.label.trim()}>Guardar</Button>
            </>
          }
        >
          <div className="space-y-5">
            <Field label="Nome"><Input value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} /></Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Zona" hint="Ex.: Sala, Esplanada, Balcão">
                <Input value={draft.area ?? ''} onChange={(e) => setDraft({ ...draft, area: e.target.value || undefined })} />
              </Field>
              <Field label="Lugares">
                <Input type="number" min={1} value={draft.seats} onChange={(e) => setDraft({ ...draft, seats: Math.max(1, Number(e.target.value)) })} />
              </Field>
            </div>
            <div className="flex items-center justify-between border-t border-line pt-5">
              <div>
                <p className="text-sm font-medium">Aceita pedidos</p>
                <p className="text-xs text-mute">Desative para bloquear pedidos a partir desta mesa.</p>
              </div>
              <Switch checked={draft.isActive} onChange={(v) => setDraft({ ...draft, isActive: v })} />
            </div>
            {draft.id && draft.qrToken && (
              <div className="border-t border-line pt-5">
                <QrCode value={tableUrl(restaurant.slug, draft.qrToken)} className="size-40" />
                <p className="mt-3 text-xs break-all text-mute">{tableUrl(restaurant.slug, draft.qrToken)}</p>
                <Button
                  size="sm"
                  className="mt-3"
                  onClick={async () => {
                    if (!confirm('Gerar um novo código? O QR atualmente impresso deixa de funcionar.')) return
                    const t = await repo.rotateTableToken(draft.id!)
                    setDraft({ ...draft, qrToken: t.qrToken })
                    await reload()
                  }}
                >
                  Gerar novo código
                </Button>
              </div>
            )}
            {error && <p className="text-sm text-alert">{error}</p>}
          </div>
        </Drawer>
      )}
    </div>
  )
}
