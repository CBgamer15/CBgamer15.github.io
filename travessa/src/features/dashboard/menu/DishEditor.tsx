import { useState } from 'react'
import { useRepo } from '@/app/providers'
import { ALLERGENS, DISH_TAGS, type Category, type Dish, type OptionGroup } from '@/domain/types'
import { DishImage } from '@/components/DishImage'
import { IconTrash } from '@/components/icons'
import { Button, Drawer, Field, Input, Select, Switch, Textarea } from '@/components/ui'
import { guestStrings } from '@/i18n/guest'
import { cn } from '@/lib/cn'
import { centsToInput, parseMoneyInput } from '@/lib/format'
import { uid } from '@/lib/ids'

type DishDraft = Omit<Dish, 'id'> & { id?: string }
const L = guestStrings.pt

export function emptyDish(restaurantId: string, categoryId: string, count: number): DishDraft {
  return {
    restaurantId,
    categoryId,
    name: '',
    priceCents: 0,
    allergens: [],
    ingredients: [],
    tags: [],
    options: [],
    isAvailable: true,
    isFeatured: false,
    isArchived: false,
    position: count + 1,
  }
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn('rounded-sm border px-2 py-1 text-xs transition-colors', on ? 'border-ink bg-ink text-paper' : 'border-line-strong text-ink-2 hover:border-ink')}
    >
      {children}
    </button>
  )
}

export function DishEditor({ dish, categories, onClose, onSaved }: { dish: DishDraft; categories: Category[]; onClose: () => void; onSaved: () => void }) {
  const repo = useRepo()
  const [d, setD] = useState<DishDraft>(dish)
  const [price, setPrice] = useState(dish.id ? centsToInput(dish.priceCents) : '')
  const [ingredients, setIngredients] = useState(dish.ingredients.join(', '))
  const [error, setError] = useState<string>()
  const [saving, setSaving] = useState(false)

  const priceCents = parseMoneyInput(price)
  const optionsValid = d.options.every((g) => g.name.trim() && g.choices.length > 0 && g.choices.every((c) => c.name.trim()) && g.min <= g.max && g.max <= g.choices.length)
  const valid = d.name.trim().length > 1 && priceCents !== null && optionsValid

  const toggle = <T extends string>(list: T[], v: T): T[] => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v])

  const save = async () => {
    if (!valid) return
    setSaving(true)
    try {
      await repo.saveDish({
        ...d,
        name: d.name.trim(),
        priceCents: priceCents!,
        ingredients: ingredients.split(',').map((s) => s.trim()).filter(Boolean),
      })
      onSaved()
    } catch (e) {
      setError((e as Error).message)
      setSaving(false)
    }
  }

  const updateGroup = (id: string, patch: Partial<OptionGroup>) =>
    setD({ ...d, options: d.options.map((g) => (g.id === id ? { ...g, ...patch } : g)) })

  return (
    <Drawer
      title={dish.id ? 'Editar prato' : 'Novo prato'}
      onClose={onClose}
      width="max-w-2xl"
      footer={
        <>
          {dish.id && (
            <Button
              variant="danger"
              className="mr-auto"
              onClick={async () => {
                if (!confirm(`Apagar “${dish.name}”? Os pedidos antigos mantêm o registo.`)) return
                await repo.deleteDish(dish.id!)
                onSaved()
              }}
            >
              Apagar
            </Button>
          )}
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" onClick={save} disabled={!valid || saving}>{saving ? 'A guardar…' : 'Guardar'}</Button>
        </>
      }
    >
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-[1fr_9rem]">
          <Field label="Nome"><Input autoFocus value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} placeholder="Ex.: Polvo à lagareiro" /></Field>
          <Field label="Preço (€)" hint={price && priceCents === null ? <span className="text-alert">Formato: 12,50</span> : undefined}>
            <Input inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0,00" className="tabular" />
          </Field>
        </div>

        <Field label="Categoria">
          <Select value={d.categoryId} onChange={(e) => setD({ ...d, categoryId: e.target.value })}>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </Field>

        <Field label="Descrição" hint="Duas frases. Origem, técnica, acompanhamento — o que faz o cliente escolher.">
          <Textarea rows={3} value={d.description ?? ''} onChange={(e) => setD({ ...d, description: e.target.value || undefined })} />
        </Field>

        <div className="grid gap-4 sm:grid-cols-[1fr_6rem]">
          <Field label="Fotografia (URL)" hint="Formato 4:3, mínimo 1200 px. O carregamento direto usa o Supabase Storage.">
            <Input value={d.imageUrl ?? ''} onChange={(e) => setD({ ...d, imageUrl: e.target.value.trim() || undefined })} placeholder="https://…" />
          </Field>
          <DishImage src={d.imageUrl} alt={d.name || 'Pré-visualização'} className="mt-6 aspect-[4/3] w-24 rounded-sm" />
        </div>
        <Field label="Vídeo (URL, opcional)">
          <Input value={d.videoUrl ?? ''} onChange={(e) => setD({ ...d, videoUrl: e.target.value.trim() || undefined })} placeholder="https://…/prato.mp4" />
        </Field>

        <Field label="Ingredientes" hint="Separados por vírgulas. Usados pelo assistente IA — nunca inventa ingredientes.">
          <Input value={ingredients} onChange={(e) => setIngredients(e.target.value)} placeholder="polvo, batata-nova, alho, azeite" />
        </Field>

        <div>
          <p className="text-[13px] font-medium">Alergénios</p>
          <p className="mt-0.5 text-xs text-mute">Os 14 alergénios de declaração obrigatória (Reg. UE 1169/2011).</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {ALLERGENS.map((a) => <Chip key={a} on={d.allergens.includes(a)} onClick={() => setD({ ...d, allergens: toggle(d.allergens, a) })}>{L.allergen[a]}</Chip>)}
          </div>
        </div>

        <div>
          <p className="text-[13px] font-medium">Etiquetas</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {DISH_TAGS.map((t) => <Chip key={t} on={d.tags.includes(t)} onClick={() => setD({ ...d, tags: toggle(d.tags, t) })}>{L.tags[t]}</Chip>)}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Harmonização" hint="Ex.: Alvarinho ou branco do Douro">
            <Input value={d.pairing ?? ''} onChange={(e) => setD({ ...d, pairing: e.target.value || undefined })} />
          </Field>
          <Field label="Tempo de preparação (min)">
            <Input type="number" min={0} value={d.prepMinutes ?? ''} onChange={(e) => setD({ ...d, prepMinutes: e.target.value ? Number(e.target.value) : undefined })} />
          </Field>
        </div>

        {/* Options */}
        <div className="border-t border-line pt-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[13px] font-medium">Opções</p>
              <p className="text-xs text-mute">Ponto da carne, acompanhamentos, copo ou garrafa…</p>
            </div>
            <Button
              size="sm"
              onClick={() => setD({ ...d, options: [...d.options, { id: uid().slice(0, 8), name: '', min: 1, max: 1, choices: [{ id: uid().slice(0, 8), name: '', priceDeltaCents: 0 }] }] })}
            >
              + Grupo
            </Button>
          </div>
          <div className="mt-3 space-y-4">
            {d.options.map((g) => (
              <div key={g.id} className="border border-line bg-surface p-4">
                <div className="grid grid-cols-[1fr_4.5rem_4.5rem_auto] items-end gap-2">
                  <Field label="Grupo"><Input value={g.name} onChange={(e) => updateGroup(g.id, { name: e.target.value })} placeholder="Ponto da carne" /></Field>
                  <Field label="Mín."><Input type="number" min={0} value={g.min} onChange={(e) => updateGroup(g.id, { min: Math.max(0, Number(e.target.value)) })} /></Field>
                  <Field label="Máx."><Input type="number" min={1} value={g.max} onChange={(e) => updateGroup(g.id, { max: Math.max(1, Number(e.target.value)) })} /></Field>
                  <Button variant="ghost" onClick={() => setD({ ...d, options: d.options.filter((x) => x.id !== g.id) })} aria-label="Remover grupo"><IconTrash width={16} height={16} /></Button>
                </div>
                <ul className="mt-3 space-y-2">
                  {g.choices.map((c) => (
                    <li key={c.id} className="grid grid-cols-[1fr_7rem_auto] gap-2">
                      <Input
                        value={c.name}
                        placeholder="Escolha"
                        onChange={(e) => updateGroup(g.id, { choices: g.choices.map((x) => (x.id === c.id ? { ...x, name: e.target.value } : x)) })}
                      />
                      <Input
                        inputMode="decimal"
                        defaultValue={c.priceDeltaCents ? centsToInput(c.priceDeltaCents) : ''}
                        placeholder="+0,00"
                        className="tabular"
                        onChange={(e) =>
                          updateGroup(g.id, { choices: g.choices.map((x) => (x.id === c.id ? { ...x, priceDeltaCents: parseMoneyInput(e.target.value.replace('+', '')) ?? 0 } : x)) })
                        }
                      />
                      <Button variant="ghost" disabled={g.choices.length === 1} onClick={() => updateGroup(g.id, { choices: g.choices.filter((x) => x.id !== c.id) })} aria-label="Remover escolha">
                        <IconTrash width={15} height={15} />
                      </Button>
                    </li>
                  ))}
                </ul>
                <button
                  className="mt-2 text-xs text-ink-2 hover:text-ink"
                  onClick={() => updateGroup(g.id, { choices: [...g.choices, { id: uid().slice(0, 8), name: '', priceDeltaCents: 0 }] })}
                >
                  + Escolha
                </button>
              </div>
            ))}
          </div>
          {!optionsValid && <p className="mt-2 text-xs text-alert">Cada grupo precisa de nome, escolhas com nome, e mín. ≤ máx. ≤ número de escolhas.</p>}
        </div>

        <div className="space-y-4 border-t border-line pt-5">
          <label className="flex items-center justify-between">
            <span>
              <span className="block text-sm font-medium">Disponível</span>
              <span className="text-xs text-mute">Desligue quando esgotar — o menu atualiza em tempo real.</span>
            </span>
            <Switch checked={d.isAvailable} onChange={(v) => setD({ ...d, isAvailable: v })} />
          </label>
          <label className="flex items-center justify-between">
            <span>
              <span className="block text-sm font-medium">Destaque “Da casa”</span>
              <span className="text-xs text-mute">Aparece no carrossel no topo do menu.</span>
            </span>
            <Switch checked={d.isFeatured} onChange={(v) => setD({ ...d, isFeatured: v })} />
          </label>
        </div>
        {error && <p className="text-sm text-alert">{error}</p>}
      </div>
    </Drawer>
  )
}
