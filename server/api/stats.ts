import type { Stat } from '~/types'
import { loadSeedsData } from '../utils/loadSeedsData'

function formatCurrency(value: number): string {
  return value.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 0
  })
}

interface DateObject {
  iso?: string
  _date?: boolean
  _timestamp?: boolean
}

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

function isDateInRange(date: Date | null, start: Date, end: Date): boolean {
  if (!date) return false
  return date >= start && date <= end
}


interface Order {
  id?: string
  code?: string
  createdAt?: string | DateObject
  status?: string
  totalPrice?: number
}

interface Consumer {
  id: string
}

interface MenuEvent {
  event_type?: string
}

export default eventHandler(async (event) => {
  const query = getQuery(event)
  const rangeStart = query.rangeStart ? new Date(query.rangeStart as string) : null
  const rangeEnd = query.rangeEnd ? new Date(query.rangeEnd as string) : null

  try {
    // Carrega os dados (tenta S3 primeiro, depois local)
    const [orders, consumers, menuEvents] = await Promise.all([
      loadSeedsData<Order[]>(
        'orders-2.json',
        'tmp/Hackathon 2025-11-09/orders-2.json',
        (data: unknown) => {
          const obj = data as { orders?: Order[] } | Order[]
          return Array.isArray(obj) ? obj : (obj.orders || [])
        }
      ),
      loadSeedsData<Consumer[]>(
        'store_consumers.json',
        'tmp/Hackathon 2025-11-09/store_consumers.json'
      ),
      loadSeedsData<MenuEvent[]>(
        'menu_events_last_30_days.json',
        'tmp/Hackathon 2025-11-09/menu_events_last_30_days.json'
      )
    ])

    // Filtra por período se fornecido
    let filteredOrders = orders
    if (rangeStart && rangeEnd) {
      filteredOrders = orders.filter((order) => {
        const orderDate = parseDate(order.createdAt)
        return isDateInRange(orderDate, rangeStart, rangeEnd)
      })
    }

    // Calcula Customers (total de consumidores únicos)
    const uniqueCustomers = new Set(consumers.map(c => c.id))
    const customersCount = uniqueCustomers.size

    // Calcula Conversions (eventos de purchase no menu_events)
    const conversions = menuEvents.filter(e => e.event_type === 'purchase').length

    // Calcula Revenue (soma de totalPrice dos pedidos entregues)
    const revenue = filteredOrders
      .filter(o => o.status === 'delivered')
      .reduce((sum: number, o) => sum + (o.totalPrice || 0), 0)

    // Calcula Orders (total de pedidos)
    const ordersCount = filteredOrders.length

    // Calcula variações (comparando com período anterior)
    // Por simplicidade, vamos calcular baseado em uma janela anterior do mesmo tamanho
    const previousCustomers = customersCount
    const previousConversions = conversions
    let previousRevenue = revenue
    let previousOrders = ordersCount

    if (rangeStart && rangeEnd) {
      const rangeSize = rangeEnd.getTime() - rangeStart.getTime()
      const previousRangeStart = new Date(rangeStart.getTime() - rangeSize)
      const previousRangeEnd = rangeStart

      const previousFilteredOrders = orders.filter((order) => {
        const orderDate = parseDate(order.createdAt)
        return isDateInRange(orderDate, previousRangeStart, previousRangeEnd)
      })

      previousOrders = previousFilteredOrders.length
      previousRevenue = previousFilteredOrders
        .filter(o => o.status === 'delivered')
        .reduce((sum: number, o) => sum + (o.totalPrice || 0), 0)
    }

    const calculateVariation = (current: number, previous: number): number => {
      if (previous === 0) return current > 0 ? 100 : 0
      return Math.round(((current - previous) / previous) * 100)
    }

    const stats: Stat[] = [{
      title: 'Customers',
      icon: 'i-lucide-users',
      value: customersCount,
      variation: calculateVariation(customersCount, previousCustomers)
    }, {
      title: 'Conversions',
      icon: 'i-lucide-chart-pie',
      value: conversions,
      variation: calculateVariation(conversions, previousConversions)
    }, {
      title: 'Revenue',
      icon: 'i-lucide-circle-dollar-sign',
      value: formatCurrency(revenue / 100), // Convertendo centavos para reais
      variation: calculateVariation(revenue, previousRevenue)
    }, {
      title: 'Orders',
      icon: 'i-lucide-shopping-cart',
      value: ordersCount,
      variation: calculateVariation(ordersCount, previousOrders)
    }]

    return stats
  } catch (error) {
    console.error('Error calculating stats:', error)
    // Retorna valores padrão em caso de erro
    return [{
      title: 'Customers',
      icon: 'i-lucide-users',
      value: 0,
      variation: 0
    }, {
      title: 'Conversions',
      icon: 'i-lucide-chart-pie',
      value: 0,
      variation: 0
    }, {
      title: 'Revenue',
      icon: 'i-lucide-circle-dollar-sign',
      value: formatCurrency(0),
      variation: 0
    }, {
      title: 'Orders',
      icon: 'i-lucide-shopping-cart',
      value: 0,
      variation: 0
    }]
  }
})
