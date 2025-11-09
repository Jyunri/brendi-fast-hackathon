import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { Sale } from '~/types'

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

function mapOrderStatus(orderStatus: string): 'paid' | 'failed' | 'refunded' {
  // Mapeia os status dos pedidos para os status esperados pelo frontend
  if (orderStatus === 'delivered' || orderStatus === 'confirmed' || orderStatus === 'in_transit') {
    return 'paid'
  }
  if (orderStatus === 'rejected' || orderStatus === 'cancelled') {
    return 'failed'
  }
  if (orderStatus === 'refunded') {
    return 'refunded'
  }
  // Default para pedidos em outros status
  return 'paid'
}

interface Order {
  id?: string
  code?: string
  createdAt?: string | DateObject
  status?: string
  totalPrice?: number
  customer?: {
    phone?: string
    name?: string
  }
}

async function loadJSON<T>(filePath: string): Promise<T> {
  try {
    const fullPath = join(process.cwd(), filePath)
    const content = await readFile(fullPath, 'utf-8')
    return JSON.parse(content) as T
  } catch (error) {
    console.error(`Error loading ${filePath}:`, error)
    throw error
  }
}

export default eventHandler(async (event) => {
  const query = getQuery(event)
  const rangeStart = query.rangeStart ? new Date(query.rangeStart as string) : null
  const rangeEnd = query.rangeEnd ? new Date(query.rangeEnd as string) : null

  try {
    // Carrega os dados de pedidos
    const orders = await loadJSON<Order[]>('tmp/Hackathon 2025-11-09/orders-short.json')

    // Filtra por período se fornecido
    let filteredOrders = orders
    if (rangeStart && rangeEnd) {
      filteredOrders = orders.filter((order) => {
        const orderDate = parseDate(order.createdAt)
        return isDateInRange(orderDate, rangeStart, rangeEnd)
      })
    }

    // Converte os pedidos para o formato Sale
    const sales: Sale[] = filteredOrders
      .map((order) => {
        const orderDate = parseDate(order.createdAt)
        const customer = order.customer || {}

        // Gera email baseado no phone do cliente (formato: phone@example.com)
        // ou usa um email padrão se não houver phone
        const email = customer.phone
          ? `${customer.phone}@example.com`
          : `customer-${order.id || 'unknown'}@example.com`

        return {
          id: order.id || order.code || 'unknown',
          date: orderDate?.toISOString() || new Date().toISOString(),
          status: mapOrderStatus(order.status || 'created'),
          email,
          amount: (order.totalPrice || 0) / 100 // Convertendo centavos para reais
        }
      })
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

    return sales
  } catch (error) {
    console.error('Error loading sales:', error)
    // Retorna array vazio em caso de erro
    return []
  }
})
