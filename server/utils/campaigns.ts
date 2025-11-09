import type {
  Campaign,
  CampaignDateValue,
  CampaignMedia,
  CampaignResult,
  CampaignSendStatus,
  CampaignVoucher
} from '~/types'
import { loadSeedsData } from './loadSeedsData'

type DateLike = string | CampaignDateValue | null | undefined
type NumberLike = number | string | null | undefined

interface RawCampaign {
  id: string
  campaign_id: string
  store_id: string
  created_at?: DateLike
  updated_at?: DateLike
  date?: DateLike
  description?: string | null
  limit?: number | string | null
  media?: RawCampaignMedia | null
  message_content_risk?: string | null
  message_volume_risk?: string | null
  payload?: string | string[] | null
  status: string
  targeting: string
  type: string
  use_voucher?: boolean
  voucher?: RawCampaignVoucher | null
}

interface RawCampaignMedia {
  url?: string
  type?: string
}

interface RawCampaignVoucher extends Partial<CampaignVoucher> {}

interface RawSendStatus {
  errorCount?: NumberLike
  totalCount?: NumberLike
  partialCount?: NumberLike
  successCount?: NumberLike
}

interface RawCampaignResult {
  id: string
  campaign_id: string
  store_id: string
  menu_slug?: string | null
  store_phone?: string | null
  targeting: string
  is_custom?: boolean
  payload?: string | string[] | null
  media?: RawCampaignMedia | null
  voucher?: RawCampaignVoucher | null
  send_status?: RawSendStatus | null
  conversion_rate?: NumberLike
  evasion_rate?: NumberLike
  order_ids?: string[] | null
  orders_delivered?: NumberLike
  total_order_value?: NumberLike
  timestamp?: DateLike
  end_timestamp?: DateLike
  created_at?: DateLike
  updated_at?: DateLike
}

function normalizeDate(date: DateLike): string | null {
  if (!date) return null
  if (typeof date === 'string') return date
  if (date.iso) return date.iso
  return null
}

function parseNumber(value: NumberLike): number | null {
  if (value === null || value === undefined) return null
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function normalizeLimit(limit: RawCampaign['limit']): number | null {
  if (limit === null || limit === undefined) return null
  if (typeof limit === 'number') return limit
  const parsed = Number(limit)
  return Number.isFinite(parsed) ? parsed : null
}

function parsePayload(payload: RawCampaign['payload']): string[] {
  if (!payload) return []
  if (Array.isArray(payload)) {
    return payload.map(item => (typeof item === 'string' ? item : JSON.stringify(item)))
  }
  if (typeof payload === 'string') {
    try {
      const parsed = JSON.parse(payload)
      if (Array.isArray(parsed)) {
        return parsed.map(item => (typeof item === 'string' ? item : JSON.stringify(item)))
      }
      if (typeof parsed === 'string') return [parsed]
    } catch {
      // Ignore JSON.parse errors and fall back to wrapping string below
    }
    return [payload]
  }
  return [JSON.stringify(payload)]
}

function normalizeMedia(media: RawCampaignMedia | null | undefined): CampaignMedia | null {
  if (!media || !media.url || !media.type) return null
  return {
    url: media.url,
    type: media.type
  }
}

function normalizeVoucher(voucher: RawCampaignVoucher | null | undefined): CampaignVoucher | null {
  if (!voucher) return null

  return {
    code: voucher.code ?? '',
    type: voucher.type ?? '',
    active: Boolean(voucher.active),
    reward: voucher.reward ?? null,
    isDeleted: Boolean(voucher.isDeleted),
    campaignId: voucher.campaignId ?? '',
    usesPerUser: voucher.usesPerUser ?? 0,
    minimumOrder: voucher.minimumOrder ?? 0,
    fixedDiscount: voucher.fixedDiscount ?? 0,
    firstOrderOnly: Boolean(voucher.firstOrderOnly),
    percentageDiscount: voucher.percentageDiscount ?? 0
  }
}

function normalizeSendStatus(status: RawSendStatus | null | undefined): CampaignSendStatus | null {
  if (!status) return null
  return {
    errorCount: parseNumber(status.errorCount) ?? 0,
    totalCount: parseNumber(status.totalCount) ?? 0,
    partialCount: parseNumber(status.partialCount) ?? 0,
    successCount: parseNumber(status.successCount) ?? 0
  }
}

function mapResult(raw: RawCampaignResult): CampaignResult {
  return {
    id: raw.id,
    campaignId: raw.campaign_id,
    storeId: raw.store_id,
    targeting: raw.targeting,
    menuSlug: raw.menu_slug ?? null,
    storePhone: raw.store_phone ?? null,
    isCustom: Boolean(raw.is_custom),
    payload: parsePayload(raw.payload),
    media: normalizeMedia(raw.media),
    voucher: normalizeVoucher(raw.voucher),
    sendStatus: normalizeSendStatus(raw.send_status),
    conversionRate: parseNumber(raw.conversion_rate),
    evasionRate: parseNumber(raw.evasion_rate),
    orderIds: raw.order_ids ?? null,
    ordersDelivered: parseNumber(raw.orders_delivered),
    totalOrderValue: parseNumber(raw.total_order_value),
    timestamp: normalizeDate(raw.timestamp),
    endTimestamp: normalizeDate(raw.end_timestamp),
    createdAt: normalizeDate(raw.created_at),
    updatedAt: normalizeDate(raw.updated_at)
  }
}

function getResultTimestamp(result: CampaignResult | null | undefined): number {
  if (!result) return 0
  const reference = result.updatedAt || result.endTimestamp || result.timestamp || result.createdAt
  return reference ? new Date(reference).getTime() : 0
}

function mapCampaign(raw: RawCampaign, result?: CampaignResult | null): Campaign {
  return {
    id: raw.id,
    campaignId: raw.campaign_id,
    storeId: raw.store_id,
    createdAt: normalizeDate(raw.created_at),
    updatedAt: normalizeDate(raw.updated_at),
    date: normalizeDate(raw.date),
    description: raw.description ?? null,
    limit: normalizeLimit(raw.limit),
    media: normalizeMedia(raw.media),
    messageContentRisk: raw.message_content_risk ?? null,
    messageVolumeRisk: raw.message_volume_risk ?? null,
    payload: parsePayload(raw.payload),
    status: raw.status,
    targeting: raw.targeting,
    type: raw.type,
    useVoucher: raw.use_voucher ?? false,
    voucher: normalizeVoucher(raw.voucher),
    results: result ?? null
  }
}

export interface CampaignResultSummary {
  campaignId: string
  status: string
  targeting: string
  type: string
  updatedAt: string | null
  sendStatus: CampaignSendStatus | null
  conversionRate: number | null
  evasionRate: number | null
  ordersDelivered: number | null
  totalOrderValue: number | null
  orderIds: string[] | null
}

export async function getCampaignsWithResults(): Promise<Campaign[]> {
  const [campaigns, results] = await Promise.all([
    loadSeedsData<RawCampaign[]>(
      'campaigns.json',
      'tmp/Hackathon 2025-11-09/campaigns.json'
    ),
    loadSeedsData<RawCampaignResult[]>(
      'campaigns_results.json',
      'tmp/Hackathon 2025-11-09/campaigns_results.json'
    )
  ])

  const resultMap = new Map<string, CampaignResult>()

  results.forEach((rawResult) => {
    const mapped = mapResult(rawResult)
    const existing = resultMap.get(mapped.campaignId)
    if (!existing || getResultTimestamp(mapped) >= getResultTimestamp(existing)) {
      resultMap.set(mapped.campaignId, mapped)
    }
  })

  return campaigns.map(raw => mapCampaign(raw, resultMap.get(raw.campaign_id)))
}

export function buildCampaignResultSummaries(
  campaigns: Campaign[],
  limit = 300
): CampaignResultSummary[] {
  const enriched = campaigns
    .filter(campaign => campaign.results)
    .sort((a, b) => {
      return getResultTimestamp(b.results) - getResultTimestamp(a.results)
    })
    .slice(0, limit)

  return enriched.map(campaign => ({
    campaignId: campaign.campaignId,
    status: campaign.status,
    targeting: campaign.targeting,
    type: campaign.type,
    updatedAt: campaign.results?.updatedAt || campaign.results?.timestamp || campaign.updatedAt,
    sendStatus: campaign.results?.sendStatus ?? null,
    conversionRate: campaign.results?.conversionRate ?? null,
    evasionRate: campaign.results?.evasionRate ?? null,
    ordersDelivered: campaign.results?.ordersDelivered ?? null,
    totalOrderValue: campaign.results?.totalOrderValue ?? null
    // orderIds: campaign.results?.orderIds ?? null
  })).filter(summary => summary.totalOrderValue !== null)
}
