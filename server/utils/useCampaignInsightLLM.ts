import { z } from 'zod'
import { createHash } from 'node:crypto'
import type { Insight } from '~/types'
import type { CampaignResultSummary } from './campaigns'

const insightSchema = z.object({
  id: z.string(),
  title: z.string(),
  metric: z.string(),
  summary: z.string(),
  recommendation: z.string(),
  evidence: z.string(),
  severity: z.enum(['low', 'medium', 'high'])
})

const insightsArraySchema = z.object({
  insights: z.array(insightSchema).min(1).max(5)
})

const SYSTEM_PROMPT = `Você é um especialista em CRM e marketing de retenção.
Receberá dados resumidos de MÚLTIPLAS campanhas (em português) contendo métricas de envio e performance.
IMPORTANTE: Você deve analisar TODAS as campanhas juntas para identificar padrões, tendências e oportunidades agregadas.

Com base na análise agregada de todas as campanhas, gere MÚLTIPLOS insights (entre 3 e 5) acionáveis que ajudem um time de marketing a melhorar resultados.

Regras:
- Sempre escreva em português.
- Analise TODAS as campanhas em conjunto, não apenas uma campanha isolada.
- Identifique padrões, tendências e oportunidades que emergem da análise agregada.
- Compare performance entre diferentes campanhas, segmentos ou tipos.
- Gere entre 3 e 5 insights distintos, cada um focando em um aspecto diferente (ex: melhor campanha, campanha problemática, tendências gerais, oportunidades de otimização).
- Cada insight deve trazer oportunidades ou riscos claros e propor uma ação específica baseada no panorama geral.
- Considere a qualidade dos dados (taxas de conversão, envios, erros, pedidos entregues e receita).
- Para os pendings, verifique o que vale a pena manter e o que vale a pena cancelar.
- Responda apenas com JSON no formato especificado (sem blocos de markdown ou texto adicional).`

const ASSISTANT_SYSTEM_PROMPT = `Você é um estrategista de CRM e growth.
Ajude times de marketing a interpretar campanhas recentes e gere recomendações práticas e curtas.
Mostre empatia profissional, escreva sempre em português e encerre com próximos passos objetivos.`

function buildPrompt(summaries: CampaignResultSummary[]): string {
  return [
    'Dados recentes das campanhas (ordenados por atualização mais recente):',
    JSON.stringify(summaries, null, 2),
    'Retorne apenas um JSON com o formato:',
    '{ "insights": [{ "id": string, "title": string, "metric": string, "summary": string, "recommendation": string, "evidence": string, "severity": "low" | "medium" | "high" }, ...] }',
    'IMPORTANTE: Retorne entre 3 e 5 insights distintos, cada um com um foco diferente.'
  ].join('\n\n')
}

function buildAssistantPrompt(
  summaries: CampaignResultSummary[],
  context: string | null
): string {
  return [
    'Você está analisando campanhas recentes com os seguintes dados resumidos:',
    JSON.stringify(summaries.slice(0, 80), null, 2),
    context
      ? `Contexto extra fornecido pelo usuário: """${context}""". Considere esse objetivo ao responder.`
      : 'O usuário não forneceu contexto adicional. Sugira como você pode ajudar usando os dados das campanhas.',
    'Responda com dois parágrafos curtos explicando a oportunidade e possíveis riscos.',
    'Em seguida, inclua uma lista numerada com até 3 próximos passos acionáveis.'
  ].join('\n\n')
}

function sanitizeLLMContent(content: string): string {
  return content
    .trim()
    .replace(/^```json/, '')
    .replace(/^```/, '')
    .replace(/```$/, '')
    .trim()
}

interface CacheEntry {
  insights: Insight[]
  timestamp: number
}

const cache = new Map<string, CacheEntry>()

// TTL de 1 hora (3600000 ms)
const CACHE_TTL_MS = 60 * 60 * 1000

function generateCacheKey(summaries: CampaignResultSummary[]): string {
  // Gera um hash baseado nos IDs das campanhas e suas métricas principais
  const keyData = summaries
    .map(s => ({
      id: s.campaignId,
      status: s.status,
      conversionRate: s.conversionRate,
      totalOrderValue: s.totalOrderValue,
      ordersDelivered: s.ordersDelivered,
      updatedAt: s.updatedAt
    }))
    .sort((a, b) => a.id.localeCompare(b.id))

  const keyString = JSON.stringify(keyData)
  return createHash('sha256').update(keyString).digest('hex')
}

function getCachedInsights(cacheKey: string): Insight[] | null {
  const entry = cache.get(cacheKey)
  if (!entry) return null

  const now = Date.now()
  const age = now - entry.timestamp

  if (age > CACHE_TTL_MS) {
    // Cache expirado, remove e retorna null
    cache.delete(cacheKey)
    return null
  }

  return entry.insights
}

function setCachedInsights(cacheKey: string, insights: Insight[]): void {
  cache.set(cacheKey, {
    insights,
    timestamp: Date.now()
  })
}

export async function requestCampaignInsightFromLLM(
  summaries: CampaignResultSummary[]
): Promise<Insight[]> {
  if (!summaries.length) return []

  // Verifica cache primeiro
  const cacheKey = generateCacheKey(summaries)
  const cachedInsights = getCachedInsights(cacheKey)
  if (cachedInsights) {
    console.log('Returning cached insights for key:', cacheKey.substring(0, 8), `(${cachedInsights.length} insights)`)
    return cachedInsights
  }

  const config = useRuntimeConfig()

  const llmConfig = config.llm || {}

  if (!llmConfig.apiUrl || !llmConfig.apiKey) {
    return []
  }

  try {
    console.log('Requesting new insights from LLM for', summaries.length, 'campaigns')

    interface LLMResponse {
      choices?: Array<{
        message?: {
          content?: string
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
        temperature: 0.2,
        response_format: { type: 'json_object' },
        messages: [{
          role: 'system',
          content: SYSTEM_PROMPT
        }, {
          role: 'user',
          content: buildPrompt(summaries)
        }]
      }
    })

    const content = response?.choices?.[0]?.message?.content
    if (!content) return []

    const parsed = JSON.parse(sanitizeLLMContent(content))
    const result = insightsArraySchema.parse(parsed)
    const insights = result.insights

    // Armazena no cache
    setCachedInsights(cacheKey, insights)
    console.log('Insights cached with key:', cacheKey.substring(0, 8), `(${insights.length} insights)`)

    console.log('Insights generated:', insights)

    return insights
  } catch (error) {
    console.error('LLM insights generation failed:', error)
    return []
  }
}

export async function requestCampaignAssistantResponse(
  summaries: CampaignResultSummary[],
  context: string | null
): Promise<string | null> {
  if (!summaries.length) return null

  const config = useRuntimeConfig()
  const llmConfig = config.llm || {}

  if (!llmConfig.apiUrl || !llmConfig.apiKey) {
    console.error('LLM API URL or API Key is not configured')
    return null
  }

  try {
    interface LLMResponse {
      choices?: Array<{
        message?: {
          content?: string
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
        temperature: 0.35,
        messages: [
          {
            role: 'system',
            content: ASSISTANT_SYSTEM_PROMPT
          },
          {
            role: 'user',
            content: buildAssistantPrompt(summaries, context)
          }
        ]
      }
    })

    const content = response?.choices?.[0]?.message?.content
    if (!content) return null
    return sanitizeLLMContent(content)
  } catch (error) {
    console.error('LLM assistant generation failed:', error)
    return null
  }
}
