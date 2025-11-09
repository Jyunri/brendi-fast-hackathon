import { createError } from 'h3'
import { z } from 'zod'
import type { CampaignAssistantResponse } from '~/types'
import {
  buildCampaignResultSummaries,
  getCampaignsWithResults
} from '../utils/campaigns'
import { requestCampaignAssistantResponse } from '../utils/useCampaignInsightLLM'

const requestSchema = z.object({
  context: z.string().trim().min(3).max(600)
})

const formatCurrencyBRL = (value: number): string => (
  (value / 100).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 2
  })
)

export default defineEventHandler(async (event): Promise<CampaignAssistantResponse> => {
  const body = await readBody(event).catch(() => ({}))
  const parsed = requestSchema.safeParse(body || {})

  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Contexto inválido. Compartilhe pelo menos 3 caracteres.'
    })
  }

  const context = parsed.data.context.trim()

  const campaigns = await getCampaignsWithResults()
  const summaries = buildCampaignResultSummaries(campaigns)
  const assistantMessage = await requestCampaignAssistantResponse(summaries, context)

  const stats = summaries.reduce(
    (acc, summary) => {
      acc.count += 1
      acc.totalRevenue += summary.totalOrderValue ?? 0
      acc.totalSent += summary.sendStatus?.totalCount ?? 0
      return acc
    },
    { count: 0, totalRevenue: 0, totalSent: 0 }
  )

  const fallbackMessage = stats.count
    ? [
        `Parece que o setor de dados está dormindo, mas encontrei ${stats.count} campanhas com resultados recentes somando ${formatCurrencyBRL(stats.totalRevenue)} em pedidos.`,
        `Essas campanhas enviaram ${stats.totalSent.toLocaleString('pt-BR')} mensagens. ${context ? 'Use o contexto citado para priorizar os segmentos mais aderentes e reative o assistente assim que possível.' : 'Compartilhe um contexto específico para receber sugestões direcionadas assim que o assistente voltar.'}`
      ].join(' ')
    : 'Ainda não há resultados de campanhas para analisar. Assim que houver dados de performance o assistente poderá sugerir próximos passos.'

  return {
    generatedAt: new Date().toISOString(),
    message: assistantMessage ?? fallbackMessage,
    source: assistantMessage ? 'llm' : 'fallback',
    usedContext: context
  }
})
