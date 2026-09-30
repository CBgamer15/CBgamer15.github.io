import { useState, type FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useAuth, useRepo } from '@/app/providers'
import { Button, Field, Input } from '@/components/ui'
import { slugify } from '@/lib/format'
import { AuthLayout } from '../auth/AuthLayout'

export default function CreateRestaurant() {
  const repo = useRepo()
  const { user, ready } = useAuth()
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [slugTouched, setSlugTouched] = useState(false)
  const [city, setCity] = useState('')
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState(false)

  if (ready && !user) return <Navigate to="/entrar?next=/app/novo" replace />
  const effectiveSlug = slugTouched ? slug : slugify(name)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(undefined)
    try {
      const r = await repo.createRestaurant({ name: name.trim(), slug: effectiveSlug, city: city.trim() || undefined })
      navigate(`/app/${r.slug}`)
    } catch (err) {
      setError((err as Error).message)
      setBusy(false)
    }
  }

  return (
    <AuthLayout title="Novo restaurante" subtitle="O essencial agora. Menu, mesas e imagem configuram-se a seguir.">
      <form onSubmit={submit} className="space-y-4">
        <Field label="Nome do restaurante"><Input required autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Tasca do Largo" /></Field>
        <Field label="Endereço do menu" hint={`O QR das mesas abre /m/${effectiveSlug || '…'}`}>
          <Input
            required
            value={effectiveSlug}
            onChange={(e) => {
              setSlugTouched(true)
              setSlug(slugify(e.target.value))
            }}
          />
        </Field>
        <Field label="Cidade"><Input value={city} onChange={(e) => setCity(e.target.value)} placeholder="Ex.: Lisboa" /></Field>
        {error && <p className="text-sm text-alert">{error}</p>}
        <Button type="submit" variant="primary" className="w-full" disabled={busy || name.trim().length < 2 || effectiveSlug.length < 3}>
          Criar restaurante
        </Button>
      </form>
    </AuthLayout>
  )
}
