import { useState } from 'react'
import { useRepo } from '@/app/providers'
import type { Restaurant } from '@/domain/types'
import { DishImage } from '@/components/DishImage'
import { Button, Field, Input, PageHeader, Switch, Textarea } from '@/components/ui'
import { slugify } from '@/lib/format'
import { useDashboard } from '../DashboardContext'

const ACCENTS = ['#1f4e5a', '#1c1b19', '#7a2e1f', '#2f5d3a', '#3b3f7a', '#8a5a14']

export function SettingsPage() {
  const repo = useRepo()
  const { restaurant, setRestaurant } = useDashboard()
  const [d, setD] = useState<Restaurant>(restaurant)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string>()
  const dirty = JSON.stringify(d) !== JSON.stringify(restaurant)

  const save = async () => {
    setError(undefined)
    try {
      const { id: _id, createdAt: _c, ...patch } = d
      const next = await repo.updateRestaurant(restaurant.id, patch)
      setRestaurant(next)
      setSaved(true)
      window.setTimeout(() => setSaved(false), 2000)
      if (next.slug !== restaurant.slug) window.location.replace(`/app/${next.slug}/definicoes`)
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const section = 'grid gap-6 border-t border-line py-7 md:grid-cols-[16rem_1fr]'

  return (
    <div>
      <PageHeader
        title="Definições"
        description="Perfil do restaurante, imagem e funcionamento do menu digital."
        actions={
          <Button variant="primary" onClick={save} disabled={!dirty}>
            {saved ? 'Guardado' : 'Guardar alterações'}
          </Button>
        }
      />
      {error && <p className="mt-4 text-sm text-alert">{error}</p>}

      <div className={section + ' border-t-0'}>
        <div>
          <p className="font-medium">Publicação</p>
          <p className="mt-1 text-sm text-ink-2">Enquanto não estiver publicado, só a sua equipa vê o menu.</p>
        </div>
        <div className="space-y-4">
          <label className="flex items-center justify-between border border-line bg-surface px-4 py-3">
            <span>
              <span className="block text-sm font-medium">Menu publicado</span>
              <span className="text-xs text-mute">/m/{d.slug}</span>
            </span>
            <Switch checked={d.isPublished} onChange={(v) => setD({ ...d, isPublished: v })} />
          </label>
          <label className="flex items-center justify-between border border-line bg-surface px-4 py-3">
            <span>
              <span className="block text-sm font-medium">Pedidos à mesa</span>
              <span className="text-xs text-mute">Desligue para usar apenas como menu de consulta.</span>
            </span>
            <Switch checked={d.settings.orderingEnabled} onChange={(v) => setD({ ...d, settings: { ...d.settings, orderingEnabled: v } })} />
          </label>
        </div>
      </div>

      <div className={section}>
        <div>
          <p className="font-medium">Perfil</p>
          <p className="mt-1 text-sm text-ink-2">Aparece no topo do menu e nos códigos QR.</p>
        </div>
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nome"><Input value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} /></Field>
            <Field label="Endereço do menu" hint="Mudar o endereço invalida códigos QR já impressos.">
              <Input value={d.slug} onChange={(e) => setD({ ...d, slug: slugify(e.target.value) })} />
            </Field>
          </div>
          <Field label="Frase de apresentação"><Input value={d.tagline ?? ''} onChange={(e) => setD({ ...d, tagline: e.target.value || undefined })} placeholder="Cozinha de mar e brasa · Cascais" /></Field>
          <Field label="Descrição"><Textarea rows={3} value={d.description ?? ''} onChange={(e) => setD({ ...d, description: e.target.value || undefined })} /></Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Morada"><Input value={d.address ?? ''} onChange={(e) => setD({ ...d, address: e.target.value || undefined })} /></Field>
            <Field label="Cidade"><Input value={d.city ?? ''} onChange={(e) => setD({ ...d, city: e.target.value || undefined })} /></Field>
            <Field label="Telefone"><Input value={d.phone ?? ''} onChange={(e) => setD({ ...d, phone: e.target.value || undefined })} /></Field>
            <Field label="Tipo de cozinha"><Input value={d.cuisine ?? ''} onChange={(e) => setD({ ...d, cuisine: e.target.value || undefined })} /></Field>
          </div>
        </div>
      </div>

      <div className={section}>
        <div>
          <p className="font-medium">Imagem</p>
          <p className="mt-1 text-sm text-ink-2">Uma cor e uma fotografia de capa. O resto do menu mantém-se sóbrio.</p>
        </div>
        <div className="space-y-4">
          <div>
            <p className="text-[13px] font-medium">Cor de destaque</p>
            <div className="mt-2 flex items-center gap-2">
              {ACCENTS.map((c) => (
                <button
                  key={c}
                  onClick={() => setD({ ...d, brand: { ...d.brand, accent: c } })}
                  className="size-8 rounded-full ring-offset-2 ring-offset-paper"
                  style={{ background: c, boxShadow: d.brand.accent === c ? `0 0 0 2px var(--color-paper), 0 0 0 4px ${c}` : undefined }}
                  aria-label={`Cor ${c}`}
                />
              ))}
              <Input value={d.brand.accent ?? ''} onChange={(e) => setD({ ...d, brand: { ...d.brand, accent: e.target.value } })} className="ml-2 w-28 font-mono text-xs" />
            </div>
          </div>
          <Field label="Fotografia de capa (URL)">
            <Input value={d.brand.coverUrl ?? ''} onChange={(e) => setD({ ...d, brand: { ...d.brand, coverUrl: e.target.value.trim() || undefined } })} />
          </Field>
          <DishImage src={d.brand.coverUrl} alt={d.name} className="h-36 w-full max-w-md rounded-sm" />
        </div>
      </div>

      <div className={section}>
        <div>
          <p className="font-medium">Depois da refeição</p>
          <p className="mt-1 text-sm text-ink-2">Quando o pedido é servido, o cliente vê um convite para avaliar. Sem filtros: o convite é igual para todos.</p>
        </div>
        <div className="space-y-4">
          <Field label="Link de avaliação Google" hint="Google Business Profile → Pedir avaliações → copiar link.">
            <Input value={d.settings.googleReviewUrl ?? ''} onChange={(e) => setD({ ...d, settings: { ...d.settings, googleReviewUrl: e.target.value.trim() || undefined } })} />
          </Field>
          <Field label="Nota de rodapé do menu">
            <Input value={d.settings.serviceNote ?? ''} onChange={(e) => setD({ ...d, settings: { ...d.settings, serviceNote: e.target.value || undefined } })} />
          </Field>
        </div>
      </div>
    </div>
  )
}
