import type { Feedback } from '~/types'
import loadJson from '~/utils/loadJson'

interface RawTimestamp {
  _date?: boolean
  iso?: string
}

interface RawFeedback {
  id: string
  store_consumer_id: string
  created_at?: RawTimestamp
  updated_at?: RawTimestamp
  category: string
  order_id: string
  rated_response?: string
  rating: number | null
  store_id: string
}

const parseDate = (value?: RawTimestamp) => value?.iso ?? null

const mapFeedback = (entry: RawFeedback): Feedback => ({
  id: entry.id,
  orderId: entry.order_id,
  storeId: entry.store_id,
  storeConsumerId: entry.store_consumer_id,
  category: entry.category || 'sem-categoria',
  rating: entry.rating ?? 0,
  comment: entry.rated_response?.trim?.() || '',
  createdAt: parseDate(entry.created_at),
  updatedAt: parseDate(entry.updated_at)
})

export default eventHandler(async () => {
  try {
    const feedbacks = await loadJson<RawFeedback[]>('tmp/Hackathon 2025-11-09/feedbacks.json')
    return feedbacks.map(mapFeedback)
  } catch (error) {
    console.error('Error loading feedbacks:', error)
    return [] satisfies Feedback[]
  }
})
