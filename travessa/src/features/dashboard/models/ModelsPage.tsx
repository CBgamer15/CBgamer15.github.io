import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { useRepo } from '@/app/providers'
import { useAsync } from '@/data/hooks'
import type { Dish, DishModel } from '@/domain/types'
import { DishImage } from '@/components/DishImage'
import { IconCube } from '@/components/icons'
import { Badge, Button, Drawer, Field, Input, PageHeader } from '@/components/ui'
import { useDashboard } from '../DashboardContext'

const ModelViewer = lazy(() => import('@/features/three/ModelViewer'))

// Mobile budget: models above this size are flagged (they still work, just slower on 4G).
const RECOMMENDED_MAX_BYTES = 5 * 1024 * 1024

function formatBytes(n?: number) {
  if (!n) return '—'
  return n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.round(n / 1024)} kB`
}

async function probeSize(url: string): Promise<number | undefined> {
  try {
    const res = await fetch(url, { method: 'HEAD' })
    const len = res.headers.get('content-length')
    return res.ok && len ? Number(len) : undefined
  } catch {
    return undefined
  }
}

export function ModelsPage() {
  const repo = useRepo()
  const { restaurant } = useDashboard()
  const dishesQ = useAsync(() => repo.listDishes(restaurant.id), [restaurant.id])
  const catsQ = useAsync(() => repo.listCategories(restaurant.id), [restaurant.id])
  const [editing, setEditing] = useState<Dish | null>(null)
  const [filter, setFilter] = useState<'all' | 'with' | 'without'>('all')

  const dishes = useMemo(() => (dishesQ.data ?? []).filter((d) => !d.isArchived), [dishesQ.data])
  const withModel = dishes.filter((d) => d.model).length
  const shown = dishes.filter((d) => (filter === 'all' ? true : filter === 'with' ? d.model : !d.model))
  const catName = (id: string) => catsQ.data?.find((c) => c.id === id)?.name

  return (
    <div className="space-y-6">
      <PageHeader
        title="Modelos 3D"
        description="O prato em 3D no telemóvel do cliente. O modelo só é descarregado quando o cliente toca em “Ver em 3D” — o menu continua rápido."
      />

      <div className="grid gap-px border border-line bg-line sm:grid-cols-3 [&>*]:bg-surface">
        <div className="px-5 py-4">
          <p className="text-xs text-mute">Pratos com 3D</p>
          <p className="mt-1.5 font-display text-[1.7rem] leading-none tabular">
            {withModel}<span className="text-base text-mute"> / {dishes.length}</span>
          </p>
        </div>
        <div className="px-5 py-4 sm:col-span-2">
          <p className="text-xs text-mute">Como funciona</p>
          <p className="mt-1.5 text-sm leading-relaxed text-ink-2">
            A equipa Travessa fotografa o prato em 360° no restaurante e entrega o modelo otimizado: <strong className="font-medium text-ink">GLB</strong> para
            Android e web, <strong className="font-medium text-ink">USDZ</strong> para iPhone (realidade aumentada). Recomendado: até 5 MB por prato.
          </p>
        </div>
      </div>

      <div className="flex gap-1">
        {([['all', 'Todos'], ['with', 'Com 3D'], ['without', 'Sem 3D']] as const).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setFilter(id)}
            className={filter === id ? 'rounded-md bg-ink px-3 py-1.5 text-sm text-paper' : 'rounded-md px-3 py-1.5 text-sm text-ink-2 hover:bg-paper-2'}
          >
            {label}
          </button>
        ))}
      </div>

      <ul className="divide-y divide-line border border-line bg-surface">
        {shown.map((d) => (
          <li key={d.id} className="flex items-center gap-4 px-4 py-3">
            <DishImage src={d.imageUrl} alt={d.name} className="size-12 shrink-0 rounded-sm" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{d.name}</p>
              <p className="text-xs text-mute">{catName(d.categoryId)}</p>
            </div>
            {d.model ? (
              <div className="flex items-center gap-2">
                <Badge tone="ok"><IconCube width={12} height={12} /> 3D ativo</Badge>
                {d.model.usdzUrl ? <Badge>RA iPhone + Android</Badge> : <Badge tone="warn">RA só Android</Badge>}
              </div>
            ) : (
              <Badge>Sem modelo</Badge>
            )}
            <Button size="sm" onClick={() => setEditing(d)}>{d.model ? 'Gerir' : 'Adicionar'}</Button>
          </li>
        ))}
      </ul>

      {editing && (
        <ModelEditor
          dish={editing}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null)
            await dishesQ.reload()
          }}
        />
      )}
    </div>
  )
}

function ModelEditor({ dish, onClose, onSaved }: { dish: Dish; onClose: () => void; onSaved: () => void }) {
  const repo = useRepo()
  const [draft, setDraft] = useState<DishModel>(dish.model ?? { glbUrl: '', scale: 1 })
  const [preview, setPreview] = useState<DishModel | null>(dish.model ?? null)
  const [size, setSize] = useState<number | undefined>(dish.model?.sizeBytes)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()

  useEffect(() => {
    if (!preview?.glbUrl) return
    let alive = true
    void probeSize(preview.glbUrl).then((n) => alive && setSize(n))
    return () => {
      alive = false
    }
  }, [preview?.glbUrl])

  const upload = async (file: File, key: 'glbUrl' | 'usdzUrl' | 'posterUrl') => {
    setBusy(true)
    setError(undefined)
    try {
      const url = await repo.uploadMedia(dish.restaurantId, file, key === 'posterUrl' ? 'photos' : 'models')
      setDraft((d) => ({ ...d, [key]: url }))
      if (key === 'glbUrl') setPreview((p) => ({ ...(p ?? draft), glbUrl: url }))
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const save = async () => {
    setBusy(true)
    try {
      await repo.saveDishModel(dish, { ...draft, glbUrl: draft.glbUrl.trim(), sizeBytes: size })
      onSaved()
    } catch (e) {
      setError((e as Error).message)
      setBusy(false)
    }
  }

  const fileField = (key: 'glbUrl' | 'usdzUrl' | 'posterUrl', accept: string) =>
    repo.kind === 'supabase' && (
      <input
        type="file"
        accept={accept}
        className="mt-1.5 block text-xs text-ink-2 file:mr-3 file:rounded-md file:border file:border-line-strong file:bg-surface file:px-2.5 file:py-1 file:text-xs"
        onChange={(e) => e.target.files?.[0] && upload(e.target.files[0], key)}
      />
    )

  return (
    <Drawer
      title={dish.name}
      onClose={onClose}
      width="max-w-2xl"
      footer={
        <>
          {dish.model && (
            <Button
              variant="danger"
              className="mr-auto"
              onClick={async () => {
                if (!confirm('Remover o modelo 3D deste prato?')) return
                await repo.saveDishModel(dish, null)
                onSaved()
              }}
            >
              Remover
            </Button>
          )}
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" onClick={save} disabled={busy || !/^(https?:\/\/|\/)\S+\.glb(\?\S*)?$/i.test(draft.glbUrl.trim())}>
            Guardar
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <div className="relative aspect-[4/3] w-full border border-line bg-paper-2">
          {preview?.glbUrl ? (
            <Suspense fallback={<p className="grid size-full place-items-center text-sm text-mute">A carregar o visualizador…</p>}>
              <ModelViewer key={preview.glbUrl + preview.scale} model={preview} loadingLabel="A carregar o modelo…" errorLabel="Não foi possível abrir este ficheiro GLB." />
            </Suspense>
          ) : (
            <p className="grid size-full place-items-center px-10 text-center text-sm text-mute">Indique um ficheiro GLB para pré-visualizar.</p>
          )}
          {preview?.glbUrl && (
            <span className={`absolute top-3 left-3 rounded-sm px-2 py-0.5 text-xs ${size && size > RECOMMENDED_MAX_BYTES ? 'bg-warn-soft text-warn' : 'bg-surface text-ink-2'}`}>
              {formatBytes(size)}
            </span>
          )}
        </div>

        <Field label="Modelo GLB" hint="Android, web e pré-visualização. Obrigatório.">
          <div className="flex gap-2">
            <Input value={draft.glbUrl} onChange={(e) => setDraft({ ...draft, glbUrl: e.target.value })} placeholder="https://…/prato.glb" />
            <Button onClick={() => setPreview({ ...draft })} disabled={!draft.glbUrl.trim()}>Pré-visualizar</Button>
          </div>
          {fileField('glbUrl', '.glb,model/gltf-binary')}
        </Field>
        <Field label="Modelo USDZ (opcional)" hint="Necessário para “Ver na minha mesa” no iPhone (AR Quick Look). No Android basta o GLB.">
          <Input value={draft.usdzUrl ?? ''} onChange={(e) => setDraft({ ...draft, usdzUrl: e.target.value.trim() || undefined })} placeholder="https://…/prato.usdz" />
          {fileField('usdzUrl', '.usdz,model/vnd.usdz+zip')}
        </Field>
        <div className="grid grid-cols-[1fr_8rem] gap-4">
          <Field label="Imagem de espera (opcional)" hint="Mostrada enquanto o 3D carrega. Por omissão, a foto do prato.">
            <Input value={draft.posterUrl ?? ''} onChange={(e) => setDraft({ ...draft, posterUrl: e.target.value.trim() || undefined })} />
          </Field>
          <Field label="Escala" hint="1 = tamanho real">
            <Input
              type="number"
              step="0.05"
              min="0.05"
              max="10"
              value={draft.scale}
              onChange={(e) => {
                const scale = Math.min(10, Math.max(0.05, Number(e.target.value) || 1))
                setDraft({ ...draft, scale })
              }}
            />
          </Field>
        </div>
        {repo.kind === 'local' && <p className="text-xs text-mute">Em modo demonstração, use URLs. Com o Supabase ligado, os ficheiros carregam diretamente para o armazenamento do restaurante.</p>}
        {error && <p className="text-sm text-alert">{error}</p>}
      </div>
    </Drawer>
  )
}
