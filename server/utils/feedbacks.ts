import type { Feedback } from '~/types'
import { loadSeedsData } from './loadSeedsData'

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

const clampRating = (rating: number | null | undefined) => {
  if (typeof rating !== 'number' || Number.isNaN(rating)) return 0
  return Math.min(5, Math.max(1, rating))
}

const mapFeedback = (entry: RawFeedback): Feedback => ({
  id: entry.id,
  orderId: entry.order_id,
  storeId: entry.store_id,
  storeConsumerId: entry.store_consumer_id,
  category: entry.category || 'sem-categoria',
  rating: clampRating(entry.rating),
  comment: entry.rated_response?.trim?.() || '',
  createdAt: parseDate(entry.created_at),
  updatedAt: parseDate(entry.updated_at)
})

export async function getFeedbacks(): Promise<Feedback[]> {
  const feedbacks = await loadSeedsData<RawFeedback[]>(
    'feedbacks.json',
    'tmp/Hackathon 2025-11-09/feedbacks.json'
  )
  return feedbacks.map(mapFeedback)
}

export interface FeedbackSummary {
  storeConsumerId: string
  category: string
  rating: number
  createdAt: string | null
}

export function buildFeedbackSummaries(
  feedbacks: Feedback[],
  limit = 400
): FeedbackSummary[] {
  return [...feedbacks]
    .sort((a, b) => {
      const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0
      const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0
      return bTime - aTime
    })
    .slice(0, limit)
    .map(item => ({
      storeConsumerId: item.storeConsumerId,
      category: item.category,
      rating: clampRating(item.rating),
      createdAt: item.createdAt
    }))
}
