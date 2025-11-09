import { createError } from 'h3'
import { z } from 'zod'
import type { FeedbackAssistantResponse } from '~/types'
import { buildFeedbackSummaries, getFeedbacks } from '../utils/feedbacks'
import { requestFeedbackAssistantResponse } from '../utils/useFeedbackAssistantLLM'

const requestSchema = z.object({
  context: z.string().trim().min(3).max(600)
})

const formatAverage = (value: number) => value.toFixed(1).replace('.', ',')

export default defineEventHandler(async (event): Promise<FeedbackAssistantResponse> => {
  const body = await readBody(event).catch(() => ({}))
  const parsed = requestSchema.safeParse(body || {})

  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Descreva o contexto com pelo menos 3 caracteres.'
    })
  }

  const context = parsed.data.context.trim()
  const feedbacks = await getFeedbacks()
  const summaries = buildFeedbackSummaries(feedbacks)

  const assistantMessage = await requestFeedbackAssistantResponse(summaries, context)

  const stats = summaries.reduce(
    (acc, summary) => {
      acc.count += 1
      acc.totalRating += summary.rating
      acc.positive += summary.rating >= 4 ? 1 : 0
      acc.negative += summary.rating <= 2 ? 1 : 0
      return acc
    },
    { count: 0, totalRating: 0, positive: 0, negative: 0 }
  )

  const average = stats.count ? stats.totalRating / stats.count : 0

  const fallbackMessage = stats.count
    ? [
      `Ainda não consegui falar com o modelo, mas revisei ${stats.count} feedbacks recentes com nota média ${formatAverage(average)}.`,
      `${stats.positive} elogios e ${stats.negative} críticas apareceram nas últimas leituras.`,
      context
        ? 'Use o contexto informado para priorizar as respostas e tente novamente quando o assistente estiver disponível.'
        : 'Envie um contexto específico (ex: categoria, período ou problema) para receber um plano mais direcionado assim que o assistente voltar.'
    ].join(' ')
    : 'Ainda não existem feedbacks suficientes para gerar recomendações. Assim que recebermos avaliações, preparo um plano para você.'

  return {
    generatedAt: new Date().toISOString(),
    message: assistantMessage ?? fallbackMessage,
    source: assistantMessage ? 'llm' : 'fallback',
    usedContext: context
  }
})
