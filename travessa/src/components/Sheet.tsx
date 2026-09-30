import { useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@/lib/cn'

/** Bottom sheet on phones, centred panel on larger screens. Locks body scroll, closes on Esc/backdrop. */
export function Sheet({ onClose, children, label, className }: { onClose: () => void; children: ReactNode; label: string; className?: string }) {
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label={label}>
      <div className="anim-fade absolute inset-0 bg-ink/45" onClick={onClose} />
      <div
        className={cn(
          'anim-sheet relative flex max-h-[92dvh] w-full max-w-xl flex-col overflow-hidden rounded-t-xl bg-paper sm:max-h-[88dvh] sm:rounded-xl',
          className,
        )}
      >
        {children}
      </div>
    </div>,
    document.body,
  )
}
