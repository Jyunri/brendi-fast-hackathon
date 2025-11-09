import { createError } from 'h3'
import { z } from 'zod'
import type {
  CustomerFeedbackProfile,
  CustomerSegment,
  CustomerSegmentationPayload,
  Feedback
} from '~/types'

interface ProfileAccumulator {
  id: string
  ratingSum: number
  totalFeedbacks: number
  lastFeedbackAt: string | null
  categoryTotals: Map<string, { count: number, ratingSum: number }>
  sampleComments: string[]
}

const SEGMENTATION_SYSTEM_PROMPT = `Você é um estrategista de CRM especialista em fidelização.
Analise perfis agregados de clientes baseados em feedbacks reais para gerar segmentações acionáveis.
Cada perfil contém: storeConsumerId, volume de feedbacks, média de nota, categorias dominantes e comentários recentes.
Seu trabalho é propor clusters que possam ser ativados por marketing ou CX imediatamente.`

const RESPONSE_SEGMENT_SCHEMA = z.object({
  id: z.string().min(2),
  name: z.string().min(4),
  description: z.string().min(8),
  coverage: z.string().min(4),
  signals: z.array(z.string().min(4)).min(1).max(4),
  recommendedActions: z.array(z.string().min(4)).min(1).max(4),
  priority: z.enum(['alta', 'media', 'baixa']),
  memberIds: z.array(z.string().min(1)).min(1).max(80)
})

const RESPONSE_SCHEMA = z.object({
  summary: z.string().min(12),
  segments: z.array(RESPONSE_SEGMENT_SCHEMA).min(3).max(5)
})

const TOKEN_CHAR_RATIO = 4
const DEFAULT_TOKEN_LIMIT = 25000
const MAX_LLM_MEMBER_IDS = 80

const formatAverage = (value: number) => value.toFixed(1).replace('.', ',')

function ensureTokenLimit(
  text: string,
  maxTokens = DEFAULT_TOKEN_LIMIT,
  label = 'LLM prompt'
): string {
  const approxTokens = Math.ceil(text.length / TOKEN_CHAR_RATIO)
  if (approxTokens > maxTokens) {
    throw createError({
      statusCode: 400,
      statusMessage: `${label} excedeu o limite aproximado de ${approxTokens}/${maxTokens} tokens. Reduza o escopo e tente novamente.`
    })
  }
  return text
}

const sanitize = (content: string) =>
  content
    .trim()
    .replace(/^```json/, '')
    .replace(/^```/, '')
    .replace(/```$/, '')
    .trim()

const clampRating = (value: number) => {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(5, value))
}

const normalizeComment = (comment: string) => {
  const clean = comment.replace(/\s+/g, ' ').trim()
  if (clean.length <= 160) return clean
  return `${clean.slice(0, 157)}...`
}

const describeCategories = (profiles: CustomerFeedbackProfile[]) => {
  const counts = profiles.reduce<Map<string, number>>((acc, profile) => {
    profile.topCategories.forEach((cat) => {
      acc.set(cat.category, (acc.get(cat.category) ?? 0) + cat.count)
    })
    return acc
  }, new Map())

  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2)
  return ranked.length
    ? ranked.map(([category, count]) => `${category} (${count})`).join(', ')
    : null
}

const pickSampleComment = (profiles: CustomerFeedbackProfile[]) => {
  for (const profile of profiles) {
    const comment = profile.sampleComments.find(Boolean)
    if (comment) return normalizeComment(comment)
  }
  return null
}

const formatCoverage = (count: number, total: number) => {
  if (!total) return 'Nenhum cliente com feedback recente'
  const percentage = Math.round((count / total) * 100)
  return `${count} cliente${count === 1 ? '' : 's'} (${percentage}% dos perfis recentes)`
}

const buildSegmentSignals = (
  audience: CustomerFeedbackProfile[],
  defaultSignal: string
) => {
  const signals: string[] = []

  const categories = describeCategories(audience)
  if (categories) {
    signals.push(`Temas recorrentes: ${categories}.`)
  }

  const sample = pickSampleComment(audience)
  if (sample) {
    signals.push(`Exemplo recente: "${sample}".`)
  }

  if (!signals.length) {
    signals.push(defaultSignal)
  }

  return signals.slice(0, 2)
}

const buildSegment = (
  id: string,
  name: string,
  audience: CustomerFeedbackProfile[],
  total: number,
  priority: CustomerSegment['priority'],
  description: string,
  defaultSignal: string,
  recommendedActions: string[]
): CustomerSegment => ({
  id,
  name,
  description,
  coverage: formatCoverage(audience.length, total),
  signals: buildSegmentSignals(audience, defaultSignal),
  recommendedActions,
  priority,
  memberIds: audience.map(profile => profile.storeConsumerId)
})

export function buildCustomerFeedbackProfiles(
  feedbacks: Feedback[],
  limit = 180
): CustomerFeedbackProfile[] {
  const map = new Map<string, ProfileAccumulator>()

  const updateLastFeedback = (current: string | null, candidate: string | null) => {
    if (!candidate) return current
    if (!current) return candidate
    return new Date(candidate).getTime() > new Date(current).getTime() ? candidate : current
  }

  for (const feedback of feedbacks) {
    const profile = map.get(feedback.storeConsumerId) ?? {
      id: feedback.storeConsumerId,
      ratingSum: 0,
      totalFeedbacks: 0,
      lastFeedbackAt: null,
      categoryTotals: new Map<string, { count: number, ratingSum: number }>(),
      sampleComments: []
    }

    profile.totalFeedbacks += 1
    profile.ratingSum += clampRating(feedback.rating)
    profile.lastFeedbackAt = updateLastFeedback(
      profile.lastFeedbackAt,
      feedback.updatedAt ?? feedback.createdAt
    )

    if (feedback.category) {
      const entry = profile.categoryTotals.get(feedback.category) ?? { count: 0, ratingSum: 0 }
      entry.count += 1
      entry.ratingSum += clampRating(feedback.rating)
      profile.categoryTotals.set(feedback.category, entry)
    }

    if (feedback.comment) {
      if (profile.sampleComments.length < 3) {
        profile.sampleComments.push(feedback.comment)
      }
    }

    map.set(feedback.storeConsumerId, profile)
  }

  return [...map.values()]
    .sort((a, b) => {
      const timeA = a.lastFeedbackAt ? new Date(a.lastFeedbackAt).getTime() : 0
      const timeB = b.lastFeedbackAt ? new Date(b.lastFeedbackAt).getTime() : 0
      return timeB - timeA
    })
    .slice(0, limit)
    .map(profile => ({
      storeConsumerId: profile.id,
      totalFeedbacks: profile.totalFeedbacks,
      averageRating: profile.totalFeedbacks ? profile.ratingSum / profile.totalFeedbacks : 0,
      lastFeedbackAt: profile.lastFeedbackAt,
      topCategories: [...profile.categoryTotals.entries()]
        .map(([category, stats]) => ({
          category,
          count: stats.count,
          averageRating: stats.count ? stats.ratingSum / stats.count : 0
        }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 3),
      sampleComments: profile.sampleComments.map(normalizeComment)
    }))
}

export function buildFallbackSegmentation(
  profiles: CustomerFeedbackProfile[]
): CustomerSegmentationPayload {
  const total = profiles.length

  if (!total) {
    return {
      summary: 'Ainda não recebemos feedbacks suficientes para identificar padrões consistentes. Colete novas avaliações para desbloquear uma segmentação inteligente.',
      segments: [{
        id: 'collect-feedback',
        name: 'Coletar feedbacks recentes',
        description: 'Convide clientes recentes a avaliarem pedidos para formar massa crítica de dados.',
        coverage: '0 clientes com feedback recente',
        signals: ['Sem feedbacks ativos disponíveis.'],
        recommendedActions: [
          'Adicione um lembrete de pesquisa pós-pedido nas próximas campanhas.',
          'Ofereça cupom simbólico para quem responder rapidamente.'
        ],
        priority: 'media',
        memberIds: []
      }]
    }
  }

  const promoters = profiles.filter(profile => profile.averageRating >= 4)
  const neutrals = profiles.filter(profile => profile.averageRating >= 2.5 && profile.averageRating < 4)
  const detractors = profiles.filter(profile => profile.averageRating < 2.5)

  const averageOverall = profiles.reduce((acc, profile) => acc + profile.averageRating, 0) / total

  const segments: CustomerSegment[] = [
    buildSegment(
      'promoters',
      'Promotores embaixadores',
      promoters,
      total,
      'media',
      'Clientes com notas altas e frequência de feedbacks consistente. Ideais para campanhas VIP ou programas de indicação.',
      'Clientes com elogios, mas ainda sem ação específica registrada.',
      [
        'Ofereça combos exclusivos ou primeira mão de novidades.',
        'Peça depoimentos para usar em campanhas pagas ou landing pages.'
      ]
    ),
    buildSegment(
      'neutral',
      'Em risco silencioso',
      neutrals,
      total,
      'media',
      'Clientes que misturam elogios e alertas pontuais. Precisam de ações rápidas para não migrar para concorrência.',
      'Clientes com notas medianas e menções a inconsistências.',
      [
        'Dispare campanha de teste A/B com cupom no próximo pedido.',
        'Use notificações proativas abordando o principal tema mencionado.'
      ]
    ),
    buildSegment(
      'detractors',
      'Críticos urgentes',
      detractors,
      total,
      'alta',
      'Clientes com notas baixas e reclamações repetidas. Podem impactar avaliações públicas se não forem abordados.',
      'Clientes com recorrência de notas <= 2 e comentários negativos.',
      [
        'Abra canal 1:1 (telefone ou WhatsApp) com resolução em até 24h.',
        'Ofereça crédito direcionado após confirmar a correção da falha.'
      ]
    )
  ].filter(segment => segment.coverage !== '0 clientes (0% dos perfis recentes)')

  return {
    summary: [
      `${total} perfis com feedback recente analisados.`,
      `Média geral de ${formatAverage(averageOverall)}.`,
      detractors.length
        ? `${formatCoverage(detractors.length, total)} exigem tratamento prioritário.`
        : 'Nenhum crítico urgente identificado no recorte atual.'
    ].join(' '),
    segments
  }
}

function buildSegmentationPrompt(
  profiles: CustomerFeedbackProfile[],
  context: string | null
): string {
  const trimmedContext = context?.trim()
  return ensureTokenLimit([
    'Resumo dos perfis de clientes (um por linha):',
    JSON.stringify(profiles.slice(0, 140), null, 2),
    trimmedContext
      ? `Contexto adicional do usuário: """${trimmedContext}""". Priorize segmentos que ajudem esse objetivo.`
      : 'Sem contexto adicional. Foque em padrões dos feedbacks para sugerir oportunidades de retenção.',
    'Gere entre 3 e 5 segmentos, sempre em português.',
    'Cada segmento deve indicar um nome curto, descrição prática, cobertura, sinais observados (lista curta) e ações recomendadas (lista curta).',
    'Inclua também "memberIds" com os storeConsumerId (exatos) que pertencem ao segmento. Use somente IDs fornecidos na lista e limite a 80 por segmento.',
    'Retorne apenas JSON no formato: { "summary": string, "segments": [{ "id": string, "name": string, "description": string, "coverage": string, "signals": string[], "recommendedActions": string[], "priority": "alta" | "media" | "baixa", "memberIds": string[] }] }.'
  ].join('\n\n'))
}

export async function requestCustomerSegmentationFromLLM(
  profiles: CustomerFeedbackProfile[],
  context: string | null
): Promise<CustomerSegmentationPayload | null> {
  if (!profiles.length) return null

  const config = useRuntimeConfig()
  const llmConfig = config.llm || {}

  if (!llmConfig.apiUrl || !llmConfig.apiKey) {
    return null
  }

  try {
    interface LLMResponse {
      choices?: Array<{
        message?: {
          content?: string | null
        }
      }>
    }

    const response = await $fetch<LLMResponse>(llmConfig.apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${llmConfig.apiKey}`
      },
      body: {
        model: llmConfig.model || 'gpt-4o-mini',
        temperature: 0.25,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: SEGMENTATION_SYSTEM_PROMPT
          },
          {
            role: 'user',
            content: buildSegmentationPrompt(profiles, context)
          }
        ]
      }
    })

    const content = response?.choices?.[0]?.message?.content
    if (!content) return null

    const parsed = RESPONSE_SCHEMA.safeParse(JSON.parse(sanitize(content)))
    if (!parsed.success) {
      console.warn('LLM returned invalid segmentation payload:', parsed.error)
      return null
    }

    const validIds = new Set(profiles.map(profile => profile.storeConsumerId))

    const sanitizeMemberIds = (ids: string[]): string[] => {
      const result: string[] = []
      const seen = new Set<string>()

      for (const id of ids) {
        const normalized = String(id).trim()
        if (!normalized || !validIds.has(normalized) || seen.has(normalized)) {
          continue
        }
        result.push(normalized)
        seen.add(normalized)
        if (result.length >= MAX_LLM_MEMBER_IDS) {
          break
        }
      }

      return result
    }

    const sanitizedSegments = parsed.data.segments
      .map(segment => ({
        ...segment,
        memberIds: sanitizeMemberIds(segment.memberIds)
      }))
      .filter(segment => segment.memberIds.length)

    if (!sanitizedSegments.length) {
      return null
    }

    return {
      summary: parsed.data.summary,
      segments: sanitizedSegments
    }
  } catch (error) {
    console.error('LLM customer segmentation generation failed:', error)
    if (error && typeof error === 'object' && 'statusCode' in error) {
      throw error
    }
    return null
  }
}
