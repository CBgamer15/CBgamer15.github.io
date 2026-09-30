import { IconMinus, IconPlus } from './icons'
import { cn } from '@/lib/cn'

export function Stepper({ value, onChange, min = 0, max = 50, size = 'md' }: { value: number; onChange: (v: number) => void; min?: number; max?: number; size?: 'sm' | 'md' }) {
  const btn = cn('grid place-items-center rounded-full border border-line-strong text-ink disabled:opacity-30', size === 'sm' ? 'size-8' : 'size-10')
  return (
    <div className="flex items-center gap-3">
      <button type="button" className={btn} onClick={() => onChange(value - 1)} disabled={value <= min} aria-label="Menos">
        <IconMinus width={16} height={16} />
      </button>
      <span className={cn('min-w-5 text-center font-medium tabular', size === 'sm' && 'text-sm')}>{value}</span>
      <button type="button" className={btn} onClick={() => onChange(value + 1)} disabled={value >= max} aria-label="Mais">
        <IconPlus width={16} height={16} />
      </button>
    </div>
  )
}
