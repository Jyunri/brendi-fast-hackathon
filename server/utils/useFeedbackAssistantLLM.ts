import { createError } from 'h3'
import type { FeedbackSummary } from './feedbacks'

const FEEDBACK_ASSISTANT_SYSTEM_PROMPT = `Você é um especialista em experiência do cliente.
Consegue ler feedbacks de clientes de restaurantes e sugerir ações rápidas.
Responda sempre em português, com empatia prática e foco em retenção.`

const TOKEN_CHAR_RATIO = 4
const DEFAULT_TOKEN_LIMIT = 25000

function ensureTokenLimit(
  text: string,
  maxTokens = DEFAULT_TOKEN_LIMIT,
  label = 'LLM prompt'
): string {
  const approxTokens = Math.ceil(text.length / TOKEN_CHAR_RATIO)
  if (approxTokens > maxTokens) {
    throw createError({
      statusCode: 400,
      statusMessage: `${label} excedeu o limite aproximado de ${approxTokens}/${maxTokens} tokens. Reduza o número de feedbacks selecionados e tente novamente.`
    })
  }
  return text
}

function buildFeedbackPrompt(summaries: FeedbackSummary[], context: string | null): string {
  const prompt = [
    'Você recebeu um resumo de feedbacks recentes dos clientes. Cada item contém: storeConsumerId, categoria, nota (1-5) e data.',
    JSON.stringify(summaries, null, 2),
    context
      ? `Contexto adicional do usuário: """${context}""" (leve isso em consideração).`
      : 'O usuário não informou contexto adicional. Sugira como você pode ajudar com base nos padrões dos feedbacks.',
    'Escreva dois parágrafos curtos: o primeiro destaca padrões (elogios/problemas), o segundo fala sobre impacto ou risco.',
    'Depois, liste até 3 próximos passos numerados para o time executar imediatamente.'
  ].join('\n\n')

  return ensureTokenLimit(prompt, DEFAULT_TOKEN_LIMIT, 'Resumo dos feedbacks')
}

function sanitize(content: string): string {
  return content
    .trim()
    .replace(/^```json/, '')
    .replace(/^```/, '')
    .replace(/```$/, '')
    .trim()
}

export async function requestFeedbackAssistantResponse(
  summaries: FeedbackSummary[],
  context: string | null
): Promise<string | null> {
  if (!summaries.length) return null

  const config = useRuntimeConfig()
  const llmConfig = config.llm || {}

  if (!llmConfig.apiUrl || !llmConfig.apiKey) {
    return null
  }

  interface LLMResponse {
    choices?: Array<{
      message?: {
        content?: string
      }
    }>
  }

  try {
    const response = await $fetch<LLMResponse>(llmConfig.apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${llmConfig.apiKey}`
      },
      body: {
        model: llmConfig.model || 'gpt-4o-mini',
        temperature: 0.35,
        messages: [
          {
            role: 'system',
            content: FEEDBACK_ASSISTANT_SYSTEM_PROMPT
          },
          {
            role: 'user',
            content: buildFeedbackPrompt(summaries, context)
          }
        ]
      }
    })

    const content = response?.choices?.[0]?.message?.content
    if (!content) return null

    return sanitize(content)
  } catch (error) {
    console.error('LLM feedback assistant generation failed:', error)
    if (error && typeof error === 'object' && 'statusCode' in error) {
      throw error
    }
    return null
  }
}
