import { useMemo, useState } from 'react'
import { useRepo } from '@/app/providers'
import { useAsync } from '@/data/hooks'
import type { Category, Dish } from '@/domain/types'
import { DishImage } from '@/components/DishImage'
import { IconArrowLeft, IconArrowRight, IconEye, IconSearch } from '@/components/icons'
import { Badge, Button, Drawer, EmptyState, Field, Input, PageHeader, Switch, Textarea } from '@/components/ui'
import { guestStrings } from '@/i18n/guest'
import { cn } from '@/lib/cn'
import { useDashboard } from '../DashboardContext'
import { DishEditor, emptyDish } from './DishEditor'

const tagLabel = guestStrings.pt.tags

export function MenuPage() {
  const repo = useRepo()
  const { restaurant, money } = useDashboard()
  const cats = useAsync(() => repo.listCategories(restaurant.id), [restaurant.id])
  const dishesQ = useAsync(() => repo.listDishes(restaurant.id), [restaurant.id])
  const categories = useMemo(() => cats.data ?? [], [cats.data])
  const dishes = useMemo(() => dishesQ.data ?? [], [dishesQ.data])

  const [selected, setSelected] = useState<string | 'all'>('all')
  const [query, setQuery] = useState('')
  const [editingDish, setEditingDish] = useState<(Omit<Dish, 'id'> & { id?: string }) | null>(null)
  const [editingCat, setEditingCat] = useState<(Omit<Category, 'id'> & { id?: string }) | null>(null)

  const reload = async () => {
    await Promise.all([cats.reload(), dishesQ.reload()])
  }

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return dishes.filter(
      (d) => !d.isArchived && (selected === 'all' || d.categoryId === selected) && (!q || d.name.toLowerCase().includes(q)),
    )
  }, [dishes, selected, query])

  const move = async (c: Category, dir: -1 | 1) => {
    const i = categories.findIndex((x) => x.id === c.id)
    const other = categories[i + dir]
    if (!other) return
    await Promise.all([repo.saveCategory({ ...c, position: other.position }), repo.saveCategory({ ...other, position: c.position })])
    await cats.reload()
  }

  const toggleAvailability = async (d: Dish) => {
    await repo.saveDish({ ...d, isAvailable: !d.isAvailable })
    await dishesQ.reload()
  }

  const newCategory = () =>
    setEditingCat({ restaurantId: restaurant.id, name: '', position: (categories.at(-1)?.position ?? 0) + 1, isVisible: true })

  if (cats.loading && !cats.data) return null

  return (
    <div className="space-y-6">
      <PageHeader
        title="Menu"
        description="Categorias, pratos, preços, alergénios e opções. As alterações aparecem no menu dos clientes de imediato."
        actions={
          <>
            <a href={`/m/${restaurant.slug}`} target="_blank" rel="noreferrer"><Button><IconEye width={16} height={16} /> Pré-visualizar</Button></a>
            {categories.length > 0 && (
              <Button variant="primary" onClick={() => setEditingDish(emptyDish(restaurant.id, selected === 'all' ? categories[0].id : selected, dishes.length))}>
                Novo prato
              </Button>
            )}
          </>
        }
      />

      {categories.length === 0 ? (
        <EmptyState
          title="Comece pelas categorias"
          body="Por exemplo: Entradas, Peixe, Carne, Sobremesas, Vinhos. Depois adicione os pratos a cada uma."
          action={<Button variant="primary" onClick={newCategory}>Criar categoria</Button>}
        />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[15rem_1fr]">
          {/* Categories */}
          <aside>
            <div className="border border-line bg-surface">
              <button
                onClick={() => setSelected('all')}
                className={cn('flex w-full items-center justify-between border-b border-line px-4 py-2.5 text-left text-sm', selected === 'all' ? 'bg-paper font-medium' : 'hover:bg-paper')}
              >
                Todos os pratos <span className="text-mute tabular">{dishes.filter((d) => !d.isArchived).length}</span>
              </button>
              <ul className="divide-y divide-line">
                {categories.map((c, i) => (
                  <li key={c.id} className={cn('group flex items-center', selected === c.id ? 'bg-paper' : 'hover:bg-paper')}>
                    <button onClick={() => setSelected(c.id)} className={cn('flex-1 truncate px-4 py-2.5 text-left text-sm', selected === c.id && 'font-medium', !c.isVisible && 'text-mute')}>
                      {c.name}
                    </button>
                    <div className="hidden items-center pr-2 group-hover:flex max-lg:flex">
                      <button disabled={i === 0} onClick={() => move(c, -1)} className="p-1 text-mute hover:text-ink disabled:opacity-20" aria-label="Subir">
                        <IconArrowLeft width={14} height={14} className="rotate-90" />
                      </button>
                      <button disabled={i === categories.length - 1} onClick={() => move(c, 1)} className="p-1 text-mute hover:text-ink disabled:opacity-20" aria-label="Descer">
                        <IconArrowRight width={14} height={14} className="rotate-90" />
                      </button>
                      <button onClick={() => setEditingCat(c)} className="px-1.5 py-1 text-xs text-mute hover:text-ink">Editar</button>
                    </div>
                    <span className="pr-4 text-sm text-mute tabular group-hover:hidden max-lg:hidden">{dishes.filter((d) => d.categoryId === c.id && !d.isArchived).length}</span>
                  </li>
                ))}
              </ul>
              <button onClick={newCategory} className="w-full border-t border-line px-4 py-2.5 text-left text-sm text-ink-2 hover:bg-paper hover:text-ink">
                + Nova categoria
              </button>
            </div>
          </aside>

          {/* Dishes */}
          <section className="min-w-0">
            <div className="relative mb-3">
              <IconSearch width={16} height={16} className="absolute top-2.5 left-3 text-mute" />
              <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Procurar prato" className="pl-9" />
            </div>
            {visible.length === 0 ? (
              <EmptyState
                title="Sem pratos aqui"
                action={
                  <Button variant="primary" onClick={() => setEditingDish(emptyDish(restaurant.id, selected === 'all' ? categories[0].id : selected, dishes.length))}>
                    Adicionar prato
                  </Button>
                }
              />
            ) : (
              <ul className="divide-y divide-line border border-line bg-surface">
                {visible.map((d) => (
                  <li key={d.id} className="flex items-center gap-4 px-4 py-3">
                    <DishImage src={d.imageUrl} alt={d.name} className="size-12 shrink-0 rounded-sm" />
                    <button onClick={() => setEditingDish(d)} className="min-w-0 flex-1 text-left">
                      <p className={cn('truncate text-sm font-medium', !d.isAvailable && 'text-mute')}>{d.name}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        {selected === 'all' && <span className="text-xs text-mute">{categories.find((c) => c.id === d.categoryId)?.name}</span>}
                        {d.isFeatured && <Badge tone="brand">Destaque</Badge>}
                        {d.tags.filter((t) => t !== 'signature').slice(0, 3).map((t) => <Badge key={t}>{tagLabel[t]}</Badge>)}
                        {d.options.length > 0 && <Badge tone="info">{d.options.length} {d.options.length === 1 ? 'opção' : 'opções'}</Badge>}
                        {d.model && <Badge tone="ok">3D</Badge>}
                        {!d.imageUrl && <Badge tone="warn">Sem foto</Badge>}
                      </div>
                    </button>
                    <span className="w-20 text-right text-sm tabular">{money(d.priceCents)}</span>
                    <label className="flex w-28 items-center justify-end gap-2 text-xs text-ink-2" title="Disponível / Esgotado">
                      {d.isAvailable ? 'Disponível' : 'Esgotado'}
                      <Switch checked={d.isAvailable} onChange={() => toggleAvailability(d)} label={`Disponibilidade de ${d.name}`} />
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}

      {editingDish && (
        <DishEditor
          dish={editingDish}
          categories={categories}
          onClose={() => setEditingDish(null)}
          onSaved={async () => {
            setEditingDish(null)
            await reload()
          }}
        />
      )}

      {editingCat && (
        <CategoryEditor
          category={editingCat}
          dishCount={editingCat.id ? dishes.filter((d) => d.categoryId === editingCat.id).length : 0}
          onClose={() => setEditingCat(null)}
          onSaved={async (id) => {
            setEditingCat(null)
            await reload()
            if (id === undefined) setSelected('all')
          }}
        />
      )}
    </div>
  )
}

function CategoryEditor({
  category,
  dishCount,
  onClose,
  onSaved,
}: {
  category: Omit<Category, 'id'> & { id?: string }
  dishCount: number
  onClose: () => void
  onSaved: (id?: string) => void
}) {
  const repo = useRepo()
  const [draft, setDraft] = useState(category)
  const [error, setError] = useState<string>()
  const save = async () => {
    try {
      const saved = await repo.saveCategory({ ...draft, name: draft.name.trim() })
      onSaved(saved.id)
    } catch (e) {
      setError((e as Error).message)
    }
  }
  return (
    <Drawer
      title={category.id ? 'Editar categoria' : 'Nova categoria'}
      onClose={onClose}
      footer={
        <>
          {category.id && (
            <Button
              variant="danger"
              className="mr-auto"
              onClick={async () => {
                if (!confirm(dishCount ? `Apagar “${category.name}” e os ${dishCount} pratos que contém?` : `Apagar “${category.name}”?`)) return
                await repo.deleteCategory(category.id!)
                onSaved(undefined)
              }}
            >
              Apagar
            </Button>
          )}
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" onClick={save} disabled={!draft.name.trim()}>Guardar</Button>
        </>
      }
    >
      <div className="space-y-5">
        <Field label="Nome"><Input autoFocus value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Ex.: Do mar" /></Field>
        <Field label="Descrição" hint="Uma linha curta que aparece por baixo do título no menu.">
          <Textarea rows={2} value={draft.description ?? ''} onChange={(e) => setDraft({ ...draft, description: e.target.value || undefined })} />
        </Field>
        <div className="flex items-center justify-between border-t border-line pt-5">
          <div>
            <p className="text-sm font-medium">Visível no menu</p>
            <p className="text-xs text-mute">Esconda categorias sazonais sem as apagar.</p>
          </div>
          <Switch checked={draft.isVisible} onChange={(v) => setDraft({ ...draft, isVisible: v })} />
        </div>
        {error && <p className="text-sm text-alert">{error}</p>}
      </div>
    </Drawer>
  )
}
