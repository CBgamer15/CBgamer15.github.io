import { useState, type FormEvent } from 'react'
import { Navigate, useSearchParams } from 'react-router-dom'
import { useAuth, useRepo } from '@/app/providers'
import { DEMO_USER } from '@/data/local/seed'
import { Button, Field, Input } from '@/components/ui'
import { AuthLayout } from './AuthLayout'

export default function Login() {
  const repo = useRepo()
  const { user, ready } = useAuth()
  const [params] = useSearchParams()
  const next = params.get('next') ?? '/app'
  const [mode, setMode] = useState<'in' | 'up'>('in')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState(false)

  if (ready && user) return <Navigate to={next} replace />

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(undefined)
    try {
      if (mode === 'in') await repo.signInWithPassword(email, password)
      else await repo.signUp(email, password, name || undefined)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const demo = async () => {
    setBusy(true)
    try {
      await repo.signInWithPassword(DEMO_USER.email, DEMO_USER.password)
    } catch (err) {
      setError((err as Error).message)
      setBusy(false)
    }
  }

  return (
    <AuthLayout
      title={mode === 'in' ? 'Entrar' : 'Criar conta'}
      subtitle={mode === 'in' ? 'Painel do restaurante.' : 'Comece com o seu restaurante em poucos minutos.'}
    >
      {repo.kind === 'local' && mode === 'in' && (
        <div className="mb-8 border border-line bg-surface p-4">
          <p className="text-sm font-medium">Demonstração: Casa do Mar</p>
          <p className="mt-1 text-xs text-ink-2">Restaurante de exemplo com menu, mesas e pedidos.</p>
          <Button variant="primary" className="mt-3 w-full" onClick={demo} disabled={busy}>Entrar na demonstração</Button>
        </div>
      )}
      <form onSubmit={submit} className="space-y-4">
        {mode === 'up' && <Field label="Nome"><Input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" /></Field>}
        <Field label="Email"><Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" /></Field>
        <Field label="Palavra-passe" hint={mode === 'up' ? 'Mínimo 8 caracteres.' : undefined}>
          <Input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === 'in' ? 'current-password' : 'new-password'} />
        </Field>
        {error && <p className="text-sm text-alert">{error}</p>}
        <Button type="submit" variant={repo.kind === 'local' && mode === 'in' ? 'secondary' : 'primary'} className="w-full" disabled={busy}>
          {mode === 'in' ? 'Entrar' : 'Criar conta'}
        </Button>
      </form>
      <p className="mt-6 text-sm text-ink-2">
        {mode === 'in' ? 'Ainda não tem conta? ' : 'Já tem conta? '}
        <button className="text-ink underline underline-offset-4" onClick={() => setMode(mode === 'in' ? 'up' : 'in')}>
          {mode === 'in' ? 'Criar conta' : 'Entrar'}
        </button>
      </p>
    </AuthLayout>
  )
}
