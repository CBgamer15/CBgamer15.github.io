import { useParams } from 'react-router-dom'
import { Badge, PageHeader } from '@/components/ui'

// Modules that are part of the platform but not built yet. Shown honestly, with
// what they will do, so the sales conversation can include them.
const MODULES: Record<string, { title: string; phase: string; lead: string; points: string[] }> = {
  assistente: {
    title: 'Assistente IA',
    phase: 'Fase 4',
    lead: '“Quero algo leve.” “Não como carne.” “O que combina com tinto?”',
    points: [
      'Recomendações baseadas apenas nos dados do seu menu',
      'Nunca inventa pratos, ingredientes, alergénios ou preços',
      'Responde na língua do cliente',
      'Chaves de API apenas no servidor (Supabase Edge Functions)',
    ],
  },
  reservas: {
    title: 'Reservas',
    phase: 'Fase 6',
    lead: 'Reservas diretas, sem comissões por cliente.',
    points: ['Página de reserva com a imagem do restaurante', 'Confirmação e lembrete por WhatsApp', 'Gestão de capacidade por zona e turno'],
  },
  avaliacoes: {
    title: 'Avaliações',
    phase: 'Fase 6',
    lead: 'Mais avaliações Google, no momento certo.',
    points: [
      'Convite após o pedido ser servido (já ativo no menu)',
      'Mensagem de seguimento por WhatsApp',
      'Leitura e resposta às avaliações Google a partir do painel',
    ],
  },
  whatsapp: {
    title: 'WhatsApp',
    phase: 'Fase 7',
    lead: 'Automação com a WhatsApp Business Platform.',
    points: ['Confirmação de reservas', 'Pedido de avaliação após a visita', 'Campanhas para clientes que deram consentimento'],
  },
}

export function RoadmapPage() {
  const { module = '' } = useParams()
  const m = MODULES[module]
  if (!m) return <PageHeader title="Página não encontrada" />
  return (
    <div className="max-w-2xl">
      <PageHeader title={m.title} description={m.lead} actions={<Badge tone="brand">{m.phase}</Badge>} />
      <ul className="mt-6 space-y-3">
        {m.points.map((p) => (
          <li key={p} className="flex gap-3 text-[15px] leading-relaxed">
            <span className="mt-2.5 size-1.5 shrink-0 rounded-full bg-brand" />
            {p}
          </li>
        ))}
      </ul>
      <p className="mt-8 border-t border-line pt-5 text-sm text-ink-2">
        Este módulo está no plano de desenvolvimento. A estrutura de dados e a arquitetura já estão preparadas para ele.
      </p>
    </div>
  )
}
