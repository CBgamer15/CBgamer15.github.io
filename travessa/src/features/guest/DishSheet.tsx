import { useMemo, useState } from 'react'
import type { Dish, OptionGroup, SelectedOption } from '@/domain/types'
import { defaultSelection, priceLine, selectionIsValid } from '@/domain/pricing'
import { DishImage } from '@/components/DishImage'
import { Sheet } from '@/components/Sheet'
import { Stepper } from '@/components/Stepper'
import { IconClock, IconClose } from '@/components/icons'
import { cn } from '@/lib/cn'
import { useGuest } from './GuestContext'

export function DishSheet({ dish, canOrder, onClose }: { dish: Dish; canOrder: boolean; onClose: () => void }) {
  const { t, money, add } = useGuest()
  const [selection, setSelection] = useState<SelectedOption[]>(() => defaultSelection(dish))
  const [qty, setQty] = useState(1)
  const [note, setNote] = useState('')
  const [noteOpen, setNoteOpen] = useState(false)

  const valid = selectionIsValid(dish, selection)
  const unit = useMemo(() => (valid ? priceLine(dish, selection).unitCents : dish.priceCents), [dish, selection, valid])

  const toggle = (group: OptionGroup, choiceId: string) => {
    setSelection((prev) => {
      const current = prev.find((s) => s.groupId === group.id)?.choiceIds ?? []
      let next: string[]
      if (group.max === 1) next = current.includes(choiceId) && group.min === 0 ? [] : [choiceId]
      else if (current.includes(choiceId)) next = current.filter((c) => c !== choiceId)
      else if (current.length < group.max) next = [...current, choiceId]
      else return prev
      return [...prev.filter((s) => s.groupId !== group.id), { groupId: group.id, choiceIds: next }]
    })
  }

  const submit = () => {
    add(dish.id, qty, selection, note)
    onClose()
  }

  return (
    <Sheet onClose={onClose} label={dish.name}>
      <div className="overflow-y-auto overscroll-contain">
        <div className="relative">
          <DishImage src={dish.imageUrl} alt={dish.name} className="aspect-[4/3] w-full" eager />
          <button
            onClick={onClose}
            className="absolute top-3 right-3 grid size-9 place-items-center rounded-full bg-paper/95 text-ink shadow-sm backdrop-blur"
            aria-label="Fechar"
          >
            <IconClose width={18} height={18} />
          </button>
          {/* Phase 2 mounts the 3D / AR entry points here, lazy-loaded on tap. */}
        </div>

        <div className="px-5 pt-5 pb-6">
          <div className="flex items-start justify-between gap-4">
            <h2 className="font-display text-[1.65rem] leading-tight">{dish.name}</h2>
            <p className="pt-1.5 text-lg tabular">{money(dish.priceCents)}</p>
          </div>

          {dish.tags.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {dish.tags.map((tag) => (
                <span key={tag} className="rounded-full border border-line-strong px-2.5 py-0.5 text-xs text-ink-2">
                  {t.tags[tag]}
                </span>
              ))}
              {dish.prepMinutes && dish.prepMinutes >= 10 && (
                <span className="flex items-center gap-1 rounded-full border border-line-strong px-2.5 py-0.5 text-xs text-ink-2">
                  <IconClock width={13} height={13} /> {t.prep(dish.prepMinutes)}
                </span>
              )}
            </div>
          )}

          {dish.description && <p className="mt-4 leading-relaxed text-ink-2">{dish.description}</p>}

          {dish.pairing && (
            <p className="mt-4 border-l-2 border-[var(--accent)] pl-3 text-sm text-ink-2">
              <span className="font-medium text-ink">{t.pairing}:</span> {dish.pairing}
            </p>
          )}

          <dl className="mt-6 space-y-4 text-sm">
            {dish.ingredients.length > 0 && (
              <div>
                <dt className="text-xs tracking-wider text-mute uppercase">{t.ingredients}</dt>
                <dd className="mt-1 leading-relaxed text-ink-2">{dish.ingredients.join(', ')}</dd>
              </div>
            )}
            <div>
              <dt className="text-xs tracking-wider text-mute uppercase">{t.allergens}</dt>
              <dd className="mt-1.5">
                {dish.allergens.length === 0 ? (
                  <span className="text-ink-2">{t.noAllergens}</span>
                ) : (
                  <ul className="flex flex-wrap gap-1.5">
                    {dish.allergens.map((a) => (
                      <li key={a} className="rounded-sm bg-warn-soft px-2 py-0.5 text-xs text-warn">
                        {t.allergen[a]}
                      </li>
                    ))}
                  </ul>
                )}
              </dd>
            </div>
          </dl>

          {canOrder && dish.isAvailable && (
            <>
              {dish.options.map((group) => {
                const chosen = selection.find((s) => s.groupId === group.id)?.choiceIds ?? []
                return (
                  <fieldset key={group.id} className="mt-7">
                    <legend className="flex w-full items-baseline justify-between">
                      <span className="font-medium">{group.name}</span>
                      <span className="text-xs text-mute">
                        {group.min > 0 ? t.required : t.optional}
                        {group.max > 1 && ` · ${t.upTo(group.max)}`}
                      </span>
                    </legend>
                    <div className="mt-2 divide-y divide-line border-y border-line">
                      {group.choices.map((c) => {
                        const on = chosen.includes(c.id)
                        return (
                          <label key={c.id} className="flex cursor-pointer items-center justify-between py-3.5">
                            <span className="flex items-center gap-3">
                              <input
                                type={group.max === 1 ? 'radio' : 'checkbox'}
                                name={group.id}
                                checked={on}
                                onChange={() => toggle(group, c.id)}
                                className="size-4.5 accent-[var(--accent)]"
                              />
                              <span className={cn('text-[15px]', on && 'font-medium')}>{c.name}</span>
                            </span>
                            {c.priceDeltaCents !== 0 && <span className="text-sm text-ink-2 tabular">+{money(c.priceDeltaCents)}</span>}
                          </label>
                        )
                      })}
                    </div>
                  </fieldset>
                )
              })}

              <div className="mt-6">
                {noteOpen ? (
                  <textarea
                    autoFocus
                    value={note}
                    onChange={(e) => setNote(e.target.value.slice(0, 200))}
                    placeholder={t.notePlaceholder}
                    rows={2}
                    className="w-full resize-none rounded-md border border-line-strong bg-surface px-3 py-2.5 text-[15px] placeholder:text-mute focus:border-ink focus:outline-none"
                  />
                ) : (
                  <button onClick={() => setNoteOpen(true)} className="text-sm text-ink-2 underline decoration-line-strong underline-offset-4">
                    {t.addNote}
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {canOrder && (
        <div className="flex items-center gap-4 border-t border-line bg-paper px-5 pt-4 safe-bottom">
          {dish.isAvailable ? (
            <>
              <Stepper value={qty} onChange={setQty} min={1} />
              <button
                onClick={submit}
                disabled={!valid}
                className="flex flex-1 items-center justify-between rounded-lg bg-[var(--accent)] px-5 py-3.5 font-medium text-white disabled:opacity-40"
              >
                <span>{t.add}</span>
                <span className="tabular">{money(unit * qty)}</span>
              </button>
            </>
          ) : (
            <p className="w-full py-3 text-center text-mute">{t.soldOut}</p>
          )}
        </div>
      )}
    </Sheet>
  )
}
