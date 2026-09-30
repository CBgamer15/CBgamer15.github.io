import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Logo } from '@/components/ui'

export function AuthLayout({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <div className="grid min-h-dvh bg-paper lg:grid-cols-2">
      <div className="flex flex-col px-6 py-8 sm:px-12">
        <Link to="/" className="text-ink"><Logo /></Link>
        <div className="my-auto w-full max-w-sm py-12">
          <h1 className="font-display text-3xl">{title}</h1>
          {subtitle && <p className="mt-2 text-sm text-ink-2">{subtitle}</p>}
          <div className="mt-8">{children}</div>
        </div>
      </div>
      <div className="hidden border-l border-line bg-ink p-12 text-paper lg:flex lg:flex-col lg:justify-end">
        <p className="max-w-md font-display text-4xl leading-tight font-light">
          De restaurante tradicional a experiência digital — sem que a sua equipa tenha de aprender tecnologia.
        </p>
        <p className="mt-6 text-sm text-paper/60">Menu digital · Pedidos à mesa · Cozinha em tempo real · 3D · IA</p>
      </div>
    </div>
  )
}
