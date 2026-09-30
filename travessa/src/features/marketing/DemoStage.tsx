import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth, useRepo } from '@/app/providers'
import { DEMO_USER } from '@/data/local/seed'
import { tables } from '@/data/seed/casaDoMar'
import { Button, Logo } from '@/components/ui'
import { QrCode } from '@/components/QrCode'
import { publicOrigin } from '@/lib/env'

const DEMO_TABLE = tables[2] // Mesa 3

/**
 * Sales stage: the guest phone and the kitchen side by side in one window.
 * Both frames share storage, so an order placed on the phone lands in the
 * kitchen instantly — the whole loop in front of the restaurant owner.
 */
export default function DemoStage() {
  const repo = useRepo()
  const { user, ready } = useAuth()
  const [signing, setSigning] = useState(false)
  const guestPath = `/m/casa-do-mar/t/${DEMO_TABLE.qrToken}`

  useEffect(() => {
    if (ready && !user && repo.kind === 'local' && !signing) {
      setSigning(true)
      void repo.signInWithPassword(DEMO_USER.email, DEMO_USER.password)
    }
  }, [ready, user, repo, signing])

  return (
    <div className="flex min-h-dvh flex-col bg-paper-2">
      <header className="flex items-center justify-between border-b border-line bg-paper px-6 py-3">
        <Link to="/" className="text-ink"><Logo className="text-base" /></Link>
        <p className="hidden text-sm text-ink-2 md:block">Faça um pedido no telemóvel — veja-o chegar à cozinha.</p>
        <Link to="/app/casa-do-mar"><Button variant="primary" size="sm">Abrir painel</Button></Link>
      </header>

      <div className="flex flex-1 flex-col gap-8 p-6 lg:flex-row">
        <div className="flex shrink-0 flex-col items-center gap-5">
          <div className="relative h-[760px] w-[372px] overflow-hidden rounded-[44px] border-[10px] border-ink bg-ink shadow-2xl">
            <iframe title="Menu do cliente" src={guestPath} className="size-full rounded-[34px] bg-paper" />
          </div>
          <div className="flex items-center gap-4">
            <QrCode value={`${publicOrigin()}${guestPath}`} className="size-20" />
            <p className="max-w-[14rem] text-xs leading-relaxed text-ink-2">
              Ou leia com o seu telemóvel ({DEMO_TABLE.label}). Em modo demonstração, o telemóvel tem os seus próprios dados.
            </p>
          </div>
        </div>
        <div className="hidden min-h-[760px] flex-1 overflow-hidden border border-line bg-paper lg:block">
          {user ? (
            <iframe title="Cozinha" src="/app/casa-do-mar/cozinha?quiosque=1" className="size-full" />
          ) : (
            <div className="grid size-full place-items-center text-sm text-mute">A preparar a cozinha…</div>
          )}
        </div>
      </div>
    </div>
  )
}
