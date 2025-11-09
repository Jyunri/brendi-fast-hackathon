import { z } from 'zod'
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

const SYSTEM_PROMPT = `Você é um especialista em CRM e marketing de retenção.
Receberá dados resumidos de campanhas (em português) contendo métricas de envio e performance.
Com base nesses dados, gere um insight único e acionável que ajude um time de marketing a melhorar resultados.

Regras:
- Sempre escreva em português.
- Traga oportunidades ou riscos claros e proponha uma ação específica.
- Considere a qualidade dos dados (taxas de conversão, envios, erros, pedidos entregues e receita).
- Para os pendings, verifique o que vale a pena manter e o que vale a pena cancelar.
- Responda apenas com JSON no formato especificado (sem blocos de markdown ou texto adicional).`

function buildPrompt(summaries: CampaignResultSummary[]): string {
  return [
    'Dados recentes das campanhas (ordenados por atualização mais recente):',
    JSON.stringify(summaries, null, 2),
    'Retorne apenas um JSON com o formato:',
    '{ "id": string, "title": string, "metric": string, "summary": string, "recommendation": string, "evidence": string, "severity": "low" | "medium" | "high" }'
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

export async function requestCampaignInsightFromLLM(
  summaries: CampaignResultSummary[]
): Promise<Insight | null> {
  console.log('summaries', buildPrompt(summaries))

  if (!summaries.length) return null

  const config = useRuntimeConfig()

  const llmConfig = config.llm || {}

  if (!llmConfig.apiUrl || !llmConfig.apiKey) {
    console.error('LLM API URL or API KEY is not set')
    return null
  }

  try {
    const response = await $fetch<any>(llmConfig.apiUrl, {
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
    if (!content) return null

    const parsed = JSON.parse(sanitizeLLMContent(content))
    const insight = insightSchema.parse(parsed)
    return insight
  } catch (error) {
    console.error('LLM insight generation failed:', error)
    return null
  }
}
