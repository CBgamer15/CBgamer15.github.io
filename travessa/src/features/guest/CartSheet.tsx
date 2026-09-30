import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useRepo } from '@/app/providers'
import { Sheet } from '@/components/Sheet'
import { Stepper } from '@/components/Stepper'
import { IconClose } from '@/components/icons'
import { useGuest } from './GuestContext'

export function CartSheet({ onClose }: { onClose: () => void }) {
  const repo = useRepo()
  const navigate = useNavigate()
  const { menu, table, tableToken, t, money, priced, setQty, clearCart, rememberOrder, session } = useGuest()
  const [note, setNote] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string>()

  const send = async () => {
    if (!tableToken || priced.lines.length === 0) return
    setSending(true)
    setError(undefined)
    try {
      const placed = await repo.placeOrder({
        slug: menu.restaurant.slug,
        tableToken,
        items: priced.lines.map((l) => ({ dishId: l.dishId, quantity: l.quantity, options: l.options, note: l.note })),
        note: note.trim() || undefined,
        session,
      })
      rememberOrder(placed)
      clearCart()
      navigate(`/m/${menu.restaurant.slug}/pedido/${placed.orderId}?k=${placed.accessToken}`)
    } catch (e) {
      setError((e as Error).message)
      setSending(false)
    }
  }

  return (
    <Sheet onClose={onClose} label={t.yourOrder}>
      <div className="flex items-center justify-between border-b border-line px-5 py-4">
        <div>
          <h2 className="font-display text-xl">{t.yourOrder}</h2>
          {table && <p className="text-xs text-mute">{table.label} · {t.items(priced.count)}</p>}
        </div>
        <button onClick={onClose} className="grid size-9 place-items-center rounded-full text-ink-2 hover:bg-paper-2" aria-label="Fechar">
          <IconClose width={18} height={18} />
        </button>
      </div>

      <div className="overflow-y-auto overscroll-contain px-5">
        {priced.lines.length === 0 ? (
          <p className="py-12 text-center text-mute">{t.empty}</p>
        ) : (
          <ul className="divide-y divide-line">
            {priced.lines.map((l) => (
              <li key={l.key} className="flex items-start justify-between gap-4 py-4">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{l.dish.name}</p>
                  {l.optionLabels.length > 0 && <p className="mt-0.5 text-sm text-ink-2">{l.optionLabels.join(' · ')}</p>}
                  {l.note && <p className="mt-0.5 text-sm text-mute italic">“{l.note}”</p>}
                  <p className="mt-1.5 text-sm tabular">{money(l.totalCents)}</p>
                </div>
                <Stepper size="sm" value={l.quantity} onChange={(v) => setQty(l.key, v)} />
              </li>
            ))}
          </ul>
        )}

        {priced.lines.length > 0 && (
          <label className="block pt-2 pb-5">
            <span className="text-xs tracking-wider text-mute uppercase">{t.orderNote}</span>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value.slice(0, 300))}
              placeholder={t.orderNotePlaceholder}
              rows={2}
              className="mt-1.5 w-full resize-none rounded-md border border-line-strong bg-surface px-3 py-2.5 text-[15px] placeholder:text-mute focus:border-ink focus:outline-none"
            />
          </label>
        )}
      </div>

      {priced.lines.length > 0 && (
        <div className="border-t border-line px-5 pt-4 safe-bottom">
          <div className="flex items-baseline justify-between">
            <span className="text-ink-2">{t.total}</span>
            <span className="font-display text-2xl tabular">{money(priced.totalCents)}</span>
          </div>
          {error && <p className="mt-2 text-sm text-alert">{error}</p>}
          <button
            onClick={send}
            disabled={sending}
            className="mt-4 w-full rounded-lg bg-[var(--accent)] py-4 font-medium text-white disabled:opacity-60"
          >
            {sending ? t.sending : t.send}
          </button>
          <p className="mt-2 text-center text-xs text-mute">{t.sentTo}</p>
        </div>
      )}
    </Sheet>
  )
}
