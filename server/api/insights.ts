import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { Insight, InsightResponse } from '~/types'

interface DateObject {
  iso?: string
  _date?: boolean
  _timestamp?: boolean
}

interface Order {
  id?: string
  status?: string
  totalPrice?: number
  createdAt?: string | DateObject
}

type NormalizedOrder = Order & { createdAtDate: Date }

const DATA_PATH = 'tmp/Hackathon 2025-11-09/orders-short.json'
const CANCELLED_STATUSES = new Set(['cancelled', 'canceled', 'rejected'])

function parseDate(dateStr: string | DateObject | null | undefined): Date | null {
  if (!dateStr) return null

  if (typeof dateStr === 'string') {
    return new Date(dateStr)
  }

  if (dateStr._date && dateStr.iso) {
    return new Date(dateStr.iso)
  }

  if (dateStr._timestamp && dateStr.iso) {
    return new Date(dateStr.iso)
  }

  return null
}

async function loadJSON<T>(filePath: string): Promise<T> {
  const fullPath = join(process.cwd(), filePath)
  const content = await readFile(fullPath, 'utf-8')
  return JSON.parse(content) as T
}

function subtractDays(date: Date, days: number): Date {
  return new Date(date.getTime() - days * 24 * 60 * 60 * 1000)
}

function formatCurrency(value: number): string {
  return value.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 0
  })
}

function percent(value: number): string {
  return `${(value * 100).toFixed(1)}%`
}

const deliveredRevenue = (orders: NormalizedOrder[]): number => {
  return orders.reduce((total, order) => {
    if (order.status === 'delivered') {
      return total + (order.totalPrice || 0)
    }
    return total
  }, 0)
}

const deliveredCount = (orders: NormalizedOrder[]): number => {
  return orders.filter(order => order.status === 'delivered').length
}

const cancellationCount = (orders: NormalizedOrder[]): number => {
  return orders.filter(order => CANCELLED_STATUSES.has((order.status || '').toLowerCase())).length
}

type InsightCandidate = Insight & { score: number }

export default eventHandler(async (): Promise<InsightResponse> => {
  try {
    const rawOrders = await loadJSON<Order[]>(DATA_PATH)

    const normalizedOrders: NormalizedOrder[] = rawOrders
      .map((order) => {
        const createdAtDate = parseDate(order.createdAt)
        if (!createdAtDate) return null
        return { ...order, createdAtDate }
      })
      .filter((order): order is NormalizedOrder => Boolean(order))

    const referenceDate = normalizedOrders.reduce<Date>((latest, order) => {
      return order.createdAtDate > latest ? order.createdAtDate : latest
    }, new Date(0))
    const effectiveNow = referenceDate.getTime() ? referenceDate : new Date()

    const last7Start = subtractDays(effectiveNow, 7)
    const prev7Start = subtractDays(effectiveNow, 14)
    const last30Start = subtractDays(effectiveNow, 30)

    const last7Orders = normalizedOrders.filter(order => order.createdAtDate >= last7Start && order.createdAtDate <= effectiveNow)
    const previous7Orders = normalizedOrders.filter(order => order.createdAtDate >= prev7Start && order.createdAtDate < last7Start)
    const last30Orders = normalizedOrders.filter(order => order.createdAtDate >= last30Start && order.createdAtDate <= effectiveNow)

    const revenueLast7 = deliveredRevenue(last7Orders)
    const revenuePrevious7 = deliveredRevenue(previous7Orders)
    const deliveredLast30 = deliveredCount(last30Orders)
    const revenueLast30 = deliveredRevenue(last30Orders)
    const cancelledLast30 = cancellationCount(last30Orders)
    const cancelRate = last30Orders.length ? cancelledLast30 / last30Orders.length : 0
    const avgTicket = deliveredLast30 ? revenueLast30 / deliveredLast30 : 0

    const candidates: InsightCandidate[] = []

    if (revenuePrevious7 > 0) {
      const weeklyDelta = (revenueLast7 - revenuePrevious7) / revenuePrevious7
      if (weeklyDelta <= -0.1) {
        const dropPercent = Math.round(Math.abs(weeklyDelta) * 100)
        candidates.push({
          id: 'weekly-revenue-drop',
          title: 'Receita desacelerando',
          metric: `${formatCurrency(revenueLast7 / 100)} na última semana`,
          summary: `A receita caiu ${dropPercent}% em comparação à semana anterior.`,
          recommendation: 'Ressuscite clientes pouco ativos com uma campanha relâmpago e destaque combos de maior ticket para recuperar o volume.',
          evidence: `Semana atual: ${formatCurrency(revenueLast7 / 100)} • Semana anterior: ${formatCurrency(revenuePrevious7 / 100)}`,
          severity: dropPercent > 20 ? 'high' : 'medium',
          score: Math.abs(weeklyDelta)
        })
      }
    }

    if (cancelRate >= 0.15) {
      candidates.push({
        id: 'high-cancel-rate',
        title: 'Taxa de cancelamento alta',
        metric: `${percent(cancelRate)} de cancelamentos`,
        summary: 'Os pedidos cancelados estão acima do saudável para o período.',
        recommendation: 'Revise o SLA de preparo/entrega e alinhe expectativas no checkout (tempo estimado, estoque e canais de suporte).',
        evidence: `${cancelledLast30} de ${last30Orders.length || normalizedOrders.length} pedidos foram cancelados nos últimos 30 dias.`,
        severity: cancelRate > 0.25 ? 'high' : 'medium',
        score: cancelRate
      })
    }

    if (avgTicket > 0 && avgTicket < 7000) {
      candidates.push({
        id: 'low-ticket',
        title: 'Ticket médio baixo',
        metric: `${formatCurrency(avgTicket / 100)} de ticket médio`,
        summary: 'Os pedidos entregues têm valor médio abaixo do esperado.',
        recommendation: 'Monte combos com margem alta ou ofereça upsell (bordas, sobremesas) no fluxo de checkout para elevar o ticket.',
        evidence: `${deliveredLast30} pedidos entregues somaram ${formatCurrency(revenueLast30 / 100)} nos últimos 30 dias.`,
        severity: 'medium',
        score: 0.4
      })
    }

    if (last30Orders.length > 0) {
      const ordersByWeekday = last30Orders.reduce<Record<number, number>>((acc, order) => {
        const weekday = order.createdAtDate.getUTCDay()
        acc[weekday] = (acc[weekday] || 0) + (order.status === 'delivered' ? 1 : 0)
        return acc
      }, {})

      const weekdays = Object.entries(ordersByWeekday)
      if (weekdays.length > 1) {
        weekdays.sort((a, b) => b[1] - a[1])
        const [bestDay, bestValue] = weekdays[0]
        const [worstDay, worstValue] = weekdays[weekdays.length - 1]

        if (bestValue > (worstValue || 0) * 1.4) {
          const weekdayNames = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']
          candidates.push({
            id: 'weekday-gap',
            title: 'Oportunidade em dia fraco',
            metric: `${worstValue || 0} pedidos em ${weekdayNames[Number(worstDay)]}`,
            summary: `${weekdayNames[Number(worstDay)]} recebe bem menos pedidos que ${weekdayNames[Number(bestDay)]}.`,
            recommendation: `Teste um cupom exclusivo ou push segmentado para ${weekdayNames[Number(worstDay)]} e redistribua o fluxo da semana.`,
            evidence: `${weekdayNames[Number(bestDay)]}: ${bestValue} pedidos • ${weekdayNames[Number(worstDay)]}: ${worstValue || 0}.`,
            severity: 'low',
            score: 0.3
          })
        }
      }
    }

    const fallbackInsight: InsightCandidate = {
      id: 'consistent-growth',
      title: 'Mantenha o ritmo',
      metric: `${normalizedOrders.length} pedidos analisados`,
      summary: 'Os pedidos recentes estão estáveis, mas ainda há espaço para experimentos rápidos.',
      recommendation: 'Aproveite clientes ativos para testar ofertas limitadas e capturar feedback antes de escalar.',
      evidence: 'Use este painel para medir o impacto das próximas ações.',
      severity: 'low',
      score: 0
    }

    const winningInsight = candidates.length
      ? candidates.sort((a, b) => b.score - a.score)[0]
      : fallbackInsight

    return {
      generatedAt: new Date().toISOString(),
      insight: {
        id: winningInsight.id,
        title: winningInsight.title,
        metric: winningInsight.metric,
        summary: winningInsight.summary,
        recommendation: winningInsight.recommendation,
        evidence: winningInsight.evidence,
        severity: winningInsight.severity
      }
    }
  } catch (error) {
    console.error('Error generating insights:', error)
    return {
      generatedAt: new Date().toISOString(),
      insight: {
        id: 'insight-unavailable',
        title: 'Não foi possível gerar a dica',
        metric: 'Dados indisponíveis',
        summary: 'Ocorreu um problema ao ler os dados de pedidos.',
        recommendation: 'Tente novamente em instantes ou valide se os arquivos de pedidos estão acessíveis.',
        evidence: 'Verifique se tmp/Hackathon 2025-11-09/orders-short.json existe e possui conteúdo.',
        severity: 'low'
      }
    }
  }
})
