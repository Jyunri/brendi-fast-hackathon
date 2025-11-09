import { createError } from 'h3'
import { z } from 'zod'
import type { CustomerSegmentationResponse } from '~/types'
import { getFeedbacks } from '../utils/feedbacks'
import {
  buildCustomerFeedbackProfiles,
  buildFallbackSegmentation,
  requestCustomerSegmentationFromLLM
} from '../utils/customerSegmentation'

const requestSchema = z.object({
  context: z
    .string()
    .trim()
    .max(600)
    .optional()
    .nullable()
})

export default defineEventHandler(async (event): Promise<CustomerSegmentationResponse> => {
  const body = await readBody(event).catch(() => ({}))
  const parsed = requestSchema.safeParse(body || {})

  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Contexto inválido. Use no máximo 600 caracteres.'
    })
  }

  const context = parsed.data.context?.trim() || null

  const feedbacks = await getFeedbacks()
  const profiles = buildCustomerFeedbackProfiles(feedbacks, 160)

  const llmResult = await requestCustomerSegmentationFromLLM(profiles, context)
  const payload = llmResult ?? buildFallbackSegmentation(profiles)

  return {
    generatedAt: new Date().toISOString(),
    usedContext: context,
    source: llmResult ? 'llm' : 'fallback',
    ...payload
  }
})
