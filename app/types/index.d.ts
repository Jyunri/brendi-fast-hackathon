import type { AvatarProps } from '@nuxt/ui'

export type UserStatus = 'subscribed' | 'unsubscribed' | 'bounced'
export type SaleStatus = 'paid' | 'failed' | 'refunded'

export interface User {
  id: number
  name: string
  email: string
  avatar?: AvatarProps
  status: UserStatus
  location: string
}

export interface Feedback {
  id: string
  orderId: string
  storeId: string
  storeConsumerId: string
  category: string
  rating: number
  comment: string
  createdAt: string | null
  updatedAt: string | null
}

export interface Mail {
  id: number
  unread?: boolean
  from: User
  subject: string
  body: string
  date: string
}

export interface Member {
  name: string
  username: string
  role: 'member' | 'owner'
  avatar: AvatarProps
}

export interface Stat {
  title: string
  icon: string
  value: number | string
  variation: number
  formatter?: (value: number) => string
}

export interface Sale {
  id: string
  date: string
  status: SaleStatus
  email: string
  amount: number
}

export interface Notification {
  id: number
  unread?: boolean
  sender: User
  body: string
  date: string
}

export type Period = 'daily' | 'weekly' | 'monthly'

export interface Range {
  start: Date
  end: Date
}

export type InsightSeverity = 'low' | 'medium' | 'high'

export interface Insight {
  id: string
  title: string
  metric: string
  summary: string
  recommendation: string
  evidence: string
  severity: InsightSeverity
}

export interface InsightResponse {
  generatedAt: string
  insight: Insight
}

export interface CampaignAssistantRequest {
  context: string
}

export interface CampaignAssistantResponse {
  generatedAt: string
  message: string
  usedContext: string | null
  source: 'llm' | 'fallback'
}

export interface CampaignDateValue {
  _date?: boolean
  _timestamp?: boolean
  iso?: string
}

export interface CampaignMedia {
  url: string
  type: string
}

export interface CampaignVoucher {
  code: string
  type: string
  active: boolean
  reward: string | null
  isDeleted: boolean
  campaignId: string
  usesPerUser: number
  minimumOrder: number
  fixedDiscount: number
  firstOrderOnly: boolean
  percentageDiscount: number
}

export interface Campaign {
  id: string
  campaignId: string
  storeId: string
  createdAt: string | null
  updatedAt: string | null
  date: string | null
  description: string | null
  limit: number | null
  media: CampaignMedia | null
  messageContentRisk: string | null
  messageVolumeRisk: string | null
  payload: string[]
  status: string
  targeting: string
  type: string
  useVoucher: boolean
  voucher: CampaignVoucher | null
  results: CampaignResult | null
}

export interface CampaignSendStatus {
  errorCount: number
  totalCount: number
  partialCount: number
  successCount: number
}

export interface CampaignResult {
  id: string
  campaignId: string
  storeId: string
  targeting: string
  menuSlug: string | null
  storePhone: string | null
  isCustom: boolean
  payload: string[]
  media: CampaignMedia | null
  voucher: CampaignVoucher | null
  sendStatus: CampaignSendStatus | null
  conversionRate: number | null
  evasionRate: number | null
  orderIds: string[] | null
  ordersDelivered: number | null
  totalOrderValue: number | null
  timestamp: string | null
  endTimestamp: string | null
  createdAt: string | null
  updatedAt: string | null
}
