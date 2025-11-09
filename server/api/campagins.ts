import type { Campaign, CampaignDateValue, CampaignVoucher, CampaignMedia } from '~/types'
import loadJson from '~/utils/loadJson'

type DateLike = string | CampaignDateValue | null | undefined

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

function normalizeDate(date: DateLike): string | null {
  if (!date) return null
  if (typeof date === 'string') return date
  if (date.iso) return date.iso
  return null
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
      // Ignored – fallback below
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

function mapCampaign(raw: RawCampaign): Campaign {
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
    voucher: normalizeVoucher(raw.voucher)
  }
}

export default eventHandler(async () => {
  try {
    const campaigns = await loadJson<RawCampaign[]>('tmp/Hackathon 2025-11-09/campaigns.json')
    return campaigns.map(mapCampaign)
  } catch (error) {
    console.error('Error loading campaigns:', error)
    return []
  }
})
