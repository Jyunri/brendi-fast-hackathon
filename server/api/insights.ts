import type { Campaign, Insight, InsightResponse } from '~/types'
import {
  buildCampaignResultSummaries,
  getCampaignsWithResults
} from '../utils/campaigns'
import { requestCampaignInsightFromLLM } from '../utils/useCampaignInsightLLM'

const ERROR_INSIGHT: Insight = {
  id: 'insight-unavailable',
  title: 'Não foi possível gerar a dica',
  metric: 'Dados indisponíveis',
  summary: 'Ocorreu um problema ao ler os dados das campanhas.',
  recommendation: 'Tente novamente em instantes ou valide se os arquivos de campanhas estão acessíveis.',
  evidence: 'Verifique se tmp/Hackathon 2025-11-09/campaigns*.json existem e possuem conteúdo.',
  severity: 'low'
}

const EMPTY_INSIGHT: Insight = {
  id: 'campaigns-missing-data',
  title: 'Configure suas primeiras campanhas',
  metric: 'Nenhum resultado disponível',
  summary: 'Ainda não encontramos resultados para campanhas recentes.',
  recommendation: 'Ative uma automação ou lance uma campanha manual para começar a medir a performance.',
  evidence: 'Sem envios, conversões ou receita registrada nas últimas leituras.',
  severity: 'low'
}

const formatCurrency = (value: number): string => {
  return (value / 100).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 2
  })
}

const formatPercent = (value: number | null | undefined): string => {
  if (value === null || value === undefined) return '0,0%'
  return `${(value * 100).toFixed(1).replace('.', ',')}%`
}

const formatInteger = (value: number): string => value.toLocaleString('pt-BR')

interface CampaignPerformance {
  campaignId: string
  targeting: string
  status: string
  totalSent: number
  success: number
  errors: number
  conversionRate: number | null
  ordersDelivered: number | null
  totalOrderValue: number | null
  updatedAt: string | null
}

function collectCampaignPerformance(campaigns: Campaign[]): CampaignPerformance[] {
  return campaigns
    .map<CampaignPerformance | null>((campaign) => {
      const sendStatus = campaign.results?.sendStatus
      const totalSent = sendStatus?.totalCount ?? 0
      const success = sendStatus?.successCount ?? 0
      const errors = sendStatus?.errorCount ?? 0
      const conversionRate = campaign.results?.conversionRate ?? (totalSent ? success / totalSent : null)
      const totalOrderValue = campaign.results?.totalOrderValue ?? null
      const ordersDelivered = campaign.results?.ordersDelivered ?? null

      if (
        !campaign.results
        && totalSent === 0
        && !totalOrderValue
        && conversionRate === null
      ) {
        return null
      }

      return {
        campaignId: campaign.campaignId,
        targeting: campaign.targeting,
        status: campaign.status,
        totalSent,
        success,
        errors,
        conversionRate,
        ordersDelivered,
        totalOrderValue,
        updatedAt: campaign.results?.updatedAt || campaign.updatedAt || campaign.createdAt || null
      }
    })
    .filter((performance): performance is CampaignPerformance => Boolean(performance))
}

function buildDeterministicCampaignInsight(campaigns: Campaign[]): Insight {
  const performances = collectCampaignPerformance(campaigns)
  if (!performances.length) {
    return EMPTY_INSIGHT
  }

  const bestRevenue = [...performances]
    .filter(perf => (perf.totalOrderValue ?? 0) > 0)
    .sort((a, b) => (b.totalOrderValue ?? 0) - (a.totalOrderValue ?? 0))[0]

  if (bestRevenue && (bestRevenue.conversionRate ?? 0) >= 0.04) {
    return {
      id: `campaign-${bestRevenue.campaignId}-winner`,
      title: 'Campanha campeã em receita',
      metric: `${formatCurrency(bestRevenue.totalOrderValue ?? 0)} gerados`,
      summary: `A campanha ${bestRevenue.campaignId} para o segmento ${bestRevenue.targeting} converteu acima de ${formatPercent(bestRevenue.conversionRate)}.`,
      recommendation: 'Replique a mensagem e gatilho dessa campanha para segmentos semelhantes ou aumente o orçamento de mídia para escalar o resultado.',
      evidence: `Envios: ${formatInteger(bestRevenue.totalSent)} • Sucesso: ${formatInteger(bestRevenue.success)} • Pedidos entregues: ${formatInteger(bestRevenue.ordersDelivered ?? 0)} • Conversão: ${formatPercent(bestRevenue.conversionRate)}.`,
      severity: (bestRevenue.totalOrderValue ?? 0) > 400000 ? 'high' : 'medium'
    }
  }

  const lowConversion = performances
    .filter(perf => perf.totalSent >= 80)
    .sort((a, b) => (a.conversionRate ?? 1) - (b.conversionRate ?? 1))[0]

  if (lowConversion && (lowConversion.conversionRate ?? 0) <= 0.02) {
    return {
      id: `campaign-${lowConversion.campaignId}-needs-optimization`,
      title: 'Campanha com baixa conversão',
      metric: `${formatPercent(lowConversion.conversionRate)} de conversão`,
      summary: `A campanha ${lowConversion.campaignId} enviou ${formatInteger(lowConversion.totalSent)} mensagens para ${lowConversion.targeting}, mas gerou poucos pedidos. Hora de testar outro incentivo ou ajustar o voucher para aumentar a urgência.`,
      recommendation: 'Revise a segmentação e o criativo: teste outro incentivo ou ajuste o voucher para aumentar a urgência.',
      evidence: `Sucesso: ${formatInteger(lowConversion.success)} • Erros: ${formatInteger(lowConversion.errors)} • Pedidos entregues: ${formatInteger(lowConversion.ordersDelivered ?? 0)}.`,
      severity: 'high'
    }
  }

  const stalledCampaign = performances.find((perf) => {
    const status = perf.status.toLowerCase()
    return perf.totalSent === 0 && ['running', 'scheduled', 'processing'].includes(status)
  })

  if (stalledCampaign) {
    return {
      id: `campaign-${stalledCampaign.campaignId}-inactive`,
      title: 'Campanha programada ainda não disparou',
      metric: `${stalledCampaign.status} sem envios`,
      summary: `A campanha ${stalledCampaign.campaignId} está ${stalledCampaign.status} porém nenhum envio foi realizado.`,
      recommendation: 'Valide se o disparo está habilitado e se o público-alvo possui contatos elegíveis antes da próxima janela.',
      evidence: `Envios: ${formatInteger(stalledCampaign.totalSent)} • Erros: ${formatInteger(stalledCampaign.errors)}.`,
      severity: 'medium'
    }
  }

  const totals = performances.reduce(
    (acc, perf) => {
      acc.totalSent += perf.totalSent
      acc.success += perf.success
      acc.revenue += perf.totalOrderValue ?? 0
      acc.orders += perf.ordersDelivered ?? 0
      return acc
    },
    { totalSent: 0, success: 0, revenue: 0, orders: 0 }
  )

  const avgConversion = totals.totalSent ? totals.success / totals.totalSent : 0

  return {
    id: 'campaign-keep-iterating',
    title: 'Campanhas estáveis, espaço para otimizar',
    metric: `${formatPercent(avgConversion)} de conversão média`,
    summary: `As últimas campanhas enviaram ${formatInteger(totals.totalSent)} mensagens e entregaram ${formatInteger(totals.orders)} pedidos.`,
    recommendation: 'Experimente variações de mensagem para os segmentos com maior base e aumente o uso de vouchers somente onde a conversão está abaixo da média.',
    evidence: `Receita total: ${formatCurrency(totals.revenue)} • Sucessos: ${formatInteger(totals.success)}.`,
    severity: avgConversion >= 0.05 ? 'medium' : 'low'
  }
}

export default eventHandler(async (): Promise<InsightResponse> => {
  try {
    const campaigns = await getCampaignsWithResults()
    const summaries = buildCampaignResultSummaries(campaigns)

    const llmInsight = await requestCampaignInsightFromLLM(summaries)
    const insight = llmInsight ?? buildDeterministicCampaignInsight(campaigns)

    return {
      generatedAt: new Date().toISOString(),
      insight
    }
  } catch (error) {
    console.error('Error generating insights:', error)
    return {
      generatedAt: new Date().toISOString(),
      insight: ERROR_INSIGHT
    }
  }
})
