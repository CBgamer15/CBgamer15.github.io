import { useEffect, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@/lib/cn'
import { IconClose } from './icons'

// Dashboard primitives: flat, hairline borders, small radii, dense but calm.

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
const variants: Record<Variant, string> = {
  primary: 'bg-ink text-paper hover:bg-ink/90',
  secondary: 'border border-line-strong bg-surface text-ink hover:bg-paper-2',
  ghost: 'text-ink-2 hover:bg-paper-2 hover:text-ink',
  danger: 'border border-alert/30 bg-surface text-alert hover:bg-alert-soft',
}

export function Button({ variant = 'secondary', size = 'md', className, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md' }) {
  return (
    <button
      {...p}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-md font-medium whitespace-nowrap transition-colors disabled:pointer-events-none disabled:opacity-50',
        size === 'sm' ? 'h-8 px-2.5 text-[13px]' : 'h-9 px-3.5 text-sm',
        variants[variant],
        className,
      )}
    />
  )
}

export function Field({ label, hint, children, className }: { label: string; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <label className={cn('block', className)}>
      <span className="text-[13px] font-medium text-ink">{label}</span>
      <div className="mt-1.5">{children}</div>
      {hint && <span className="mt-1 block text-xs text-mute">{hint}</span>}
    </label>
  )
}

const control = 'w-full rounded-md border border-line-strong bg-surface px-3 text-sm text-ink placeholder:text-mute focus:border-ink focus:outline-none'

export function Input({ className, ...p }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...p} className={cn(control, 'h-9', className)} />
}

export function Textarea({ className, ...p }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...p} className={cn(control, 'py-2 leading-relaxed', className)} />
}

export function Select({ className, children, ...p }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select {...p} className={cn(control, 'h-9 pr-8', className)}>
      {children}
    </select>
  )
}

export function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label?: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn('relative h-5 w-9 shrink-0 rounded-full transition-colors disabled:opacity-50', checked ? 'bg-ok' : 'bg-line-strong')}
    >
      <span className={cn('absolute top-0.5 left-0.5 size-4 rounded-full bg-white shadow-sm transition-transform', checked && 'translate-x-4')} />
    </button>
  )
}

type Tone = 'neutral' | 'ok' | 'warn' | 'alert' | 'info' | 'brand'
const tones: Record<Tone, string> = {
  neutral: 'bg-paper-2 text-ink-2',
  ok: 'bg-ok-soft text-ok',
  warn: 'bg-warn-soft text-warn',
  alert: 'bg-alert-soft text-alert',
  info: 'bg-info-soft text-info',
  brand: 'bg-brand/10 text-brand-ink',
}

export function Badge({ tone = 'neutral', children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return <span className={cn('inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-[11px] font-medium tracking-wide', tones[tone], className)}>{children}</span>
}

export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 border-b border-line pb-5">
      <div>
        <h1 className="font-display text-[1.75rem] leading-tight">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-sm text-ink-2">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

export function EmptyState({ title, body, action }: { title: string; body?: ReactNode; action?: ReactNode }) {
  return (
    <div className="border border-dashed border-line-strong px-6 py-14 text-center">
      <p className="font-display text-lg">{title}</p>
      {body && <p className="mx-auto mt-1.5 max-w-md text-sm text-ink-2">{body}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

/** Right-hand editing drawer. */
export function Drawer({ title, onClose, children, footer, width = 'max-w-lg' }: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode; width?: string }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return createPortal(
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label={title}>
      <div className="anim-fade absolute inset-0 bg-ink/30" onClick={onClose} />
      <div className={cn('relative flex h-full w-full flex-col border-l border-line bg-paper shadow-2xl', width)} style={{ animation: 'rise-in 280ms var(--ease-out-soft)' }}>
        <div className="flex items-center justify-between border-b border-line px-6 py-4">
          <h2 className="font-display text-xl">{title}</h2>
          <button onClick={onClose} className="grid size-8 place-items-center rounded-md text-ink-2 hover:bg-paper-2" aria-label="Fechar">
            <IconClose width={18} height={18} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
        {footer && <div className="flex items-center justify-end gap-2 border-t border-line px-6 py-3.5">{footer}</div>}
      </div>
    </div>,
    document.body,
  )
}

export function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="px-5 py-4">
      <p className="text-xs text-mute">{label}</p>
      <p className="mt-1.5 font-display text-[1.7rem] leading-none tabular">{value}</p>
      {sub && <p className="mt-1.5 text-xs text-ink-2">{sub}</p>}
    </div>
  )
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2 font-display text-lg tracking-tight', className)}>
      <svg viewBox="0 0 32 32" className="size-6" aria-hidden>
        <rect width="32" height="32" rx="6" fill="currentColor" />
        <path d="M7 12h18M16 12v12" stroke="var(--color-paper)" strokeWidth="2.5" strokeLinecap="round" />
        <ellipse cx="16" cy="9" rx="9" ry="2" fill="var(--color-brand)" />
      </svg>
      Travessa
    </span>
  )
}
