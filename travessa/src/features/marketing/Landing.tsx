import { Link } from 'react-router-dom'
import { Button, Logo } from '@/components/ui'

const JOURNEY = [
  ['QR na mesa', 'O código identifica o restaurante e a mesa. Sem aplicações.'],
  ['Menu', 'Fotografia, descrição, alergénios e preços — rápido em qualquer rede.'],
  ['Prato em 3D', 'O cliente vê o prato antes de pedir. E na própria mesa, em RA.'],
  ['Pedido', 'Enviado da mesa, com opções e notas, sem esperar pelo empregado.'],
  ['Cozinha', 'Chega ao ecrã da cozinha num segundo, com alerta e cronómetro.'],
  ['Crescimento', 'Análises, avaliações Google e automação por WhatsApp.'],
]

const MODULES: [string, string, string][] = [
  ['Menu digital e QR por mesa', 'Disponível', 'ok'],
  ['Pedidos à mesa e ecrã de cozinha', 'Disponível', 'ok'],
  ['Pratos em 3D', 'Disponível', 'ok'],
  ['Análises do menu', 'Disponível', 'ok'],
  ['Assistente IA do menu', 'Fase 4', ''],
  ['Realidade aumentada', 'Disponível', 'ok'],
  ['Reservas e avaliações Google', 'Fase 6', ''],
  ['Automação WhatsApp', 'Fase 7', ''],
]

export default function Landing() {
  return (
    <div className="min-h-dvh bg-paper">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <Logo />
        <nav className="flex items-center gap-2">
          <Link to="/entrar"><Button variant="ghost">Entrar</Button></Link>
          <Link to="/demo"><Button variant="primary">Ver demonstração</Button></Link>
        </nav>
      </header>

      <section className="mx-auto max-w-6xl px-6 pt-16 pb-24 sm:pt-24">
        <p className="text-sm tracking-[0.2em] text-brand uppercase">Plataforma de crescimento digital para restaurantes</p>
        <h1 className="mt-6 max-w-4xl font-display text-5xl leading-[1.05] font-light tracking-tight sm:text-7xl">
          Transforme um restaurante tradicional numa experiência digital moderna.
        </h1>
        <p className="mt-8 max-w-2xl text-lg leading-relaxed text-ink-2">
          Menu digital, pedidos à mesa, pratos em 3D, cozinha em tempo real e automação — instalado e gerido pela nossa equipa.
          O restaurante não precisa de perceber de tecnologia.
        </p>
        <div className="mt-10 flex flex-wrap gap-3">
          <Link to="/demo"><Button variant="primary" className="h-11 px-5 text-[15px]">Experimentar a Casa do Mar</Button></Link>
          <Link to="/entrar"><Button className="h-11 px-5 text-[15px]">Painel do restaurante</Button></Link>
        </div>
      </section>

      <section className="border-y border-line bg-surface">
        <ol className="mx-auto grid max-w-6xl sm:grid-cols-2 lg:grid-cols-6">
          {JOURNEY.map(([title, body], i) => (
            <li key={title} className="border-line px-6 py-8 max-lg:border-b lg:border-r lg:last:border-r-0">
              <span className="font-display text-sm text-mute tabular">0{i + 1}</span>
              <p className="mt-3 font-medium">{title}</p>
              <p className="mt-1.5 text-sm leading-relaxed text-ink-2">{body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="mx-auto grid max-w-6xl gap-16 px-6 py-24 lg:grid-cols-2">
        <div>
          <h2 className="font-display text-4xl leading-tight font-light">Nós tratamos de tudo.</h2>
          <p className="mt-5 max-w-lg leading-relaxed text-ink-2">
            Fotografamos os pratos, criamos os modelos 3D, carregamos o menu, imprimimos os códigos QR e formamos a equipa.
            Depois acompanhamos os números consigo, todos os meses.
          </p>
        </div>
        <ul className="divide-y divide-line border-y border-line">
          {MODULES.map(([name, status, tone]) => (
            <li key={name} className="flex items-center justify-between py-3.5">
              <span>{name}</span>
              <span className={tone === 'ok' ? 'text-sm text-ok' : 'text-sm text-mute'}>{status}</span>
            </li>
          ))}
        </ul>
      </section>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-8 text-sm text-mute">
          <Logo className="text-base text-ink" />
          <span>Feito em Portugal</span>
        </div>
      </footer>
    </div>
  )
}
