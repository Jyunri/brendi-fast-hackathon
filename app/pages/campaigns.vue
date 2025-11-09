<script setup lang="ts">
import type { Campaign } from '~/types'
import CampaignInsight from '~/components/campaings/CampaignInsight.vue'

const { data, pending, error, refresh } = await useFetch<Campaign[]>('/api/campagins', {
  default: () => [],
  lazy: false
})

const getTimestamp = (campaign: Campaign) => {
  const date = campaign.updatedAt || campaign.createdAt || campaign.date
  return date ? new Date(date).getTime() : 0
}

const campaigns = computed(() =>
  [...(data.value || [])].sort((a, b) => getTimestamp(b) - getTimestamp(a))
)

const formatDate = (date: string | null) => {
  if (!date) return 'Data indefinida'
  return new Date(date).toLocaleString('pt-BR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit'
  })
}

const statusColor = (status: string) => {
  const normalized = status?.toLowerCase()
  if (normalized === 'completed') return 'success'
  if (['scheduled', 'processing', 'running'].includes(normalized)) return 'warning'
  if (['failed', 'cancelled', 'paused'].includes(normalized)) return 'error'
  return 'neutral'
}

const capitalize = (value: string | null | undefined) => {
  if (!value) return ''
  return value.charAt(0).toUpperCase() + value.slice(1)
}

const statusLabels: Record<string, string> = {
  scheduled: 'Agendadas',
  processing: 'Processando',
  running: 'Ativas',
  completed: 'Concluídas',
  paused: 'Pausadas',
  cancelled: 'Canceladas',
  failed: 'Com erro'
}

const statusOrder = ['pending', 'running', 'scheduled', 'processing', 'completed', 'paused', 'cancelled', 'failed']

const targetingBadges: Record<string, { label: string, color: string, icon: string }> = {
  recurrent: { label: 'Recorrentes', color: 'primary', icon: 'i-lucide-rotate-cw' },
  loyal: { label: 'Fiéis', color: 'success', icon: 'i-lucide-heart' },
  curious: { label: 'Curiosos', color: 'warning', icon: 'i-lucide-sparkles' },
  beginner: { label: 'Novatos', color: 'info', icon: 'i-lucide-rocket' },
  enthusiast: { label: 'Entusiastas', color: 'error', icon: 'i-lucide-fire' }
}

const normalizedStatus = (status: string) => status?.toLowerCase?.() || 'unknown'

const kanbanColumns = computed(() => {
  const grouped: Record<string, Campaign[]> = {}
  campaigns.value.forEach((campaign) => {
    const status = normalizedStatus(campaign.status)
    grouped[status] = grouped[status] || []
    grouped[status].push(campaign)
  })

  const ordered = statusOrder.map(status => ({
    status,
    label: statusLabels[status] || capitalize(status),
    items: grouped[status] || []
  }))

  const extraStatuses = Object.keys(grouped).filter(status => !statusOrder.includes(status))
  const extras = extraStatuses.map(status => ({
    status,
    label: statusLabels[status] || capitalize(status),
    items: grouped[status]
  }))

  return [...ordered, ...extras].filter(column => column.items.length || campaigns.value.length === 0)
})

const selectedCampaign = ref<Campaign | null>(null)
const isDetailOpen = ref(false)

const openCampaignDetails = (campaign: Campaign) => {
  selectedCampaign.value = campaign
  isDetailOpen.value = true
}

watch(isDetailOpen, (open) => {
  if (!open) {
    selectedCampaign.value = null
  }
})

const campaignSummary = computed(() => {
  const list = campaigns.value
  const lastUpdated = list.length ? new Date(Math.max(...list.map(getTimestamp))).toISOString() : null

  return {
    total: list.length,
    withVoucher: list.filter(campaign => campaign.useVoucher && campaign.voucher).length,
    withMedia: list.filter(campaign => !!campaign.media).length,
    lastUpdated
  }
})

const getTargetingBadge = (targeting: string) => {
  const key = targeting?.toLowerCase?.() || 'default'
  return targetingBadges[key] || {
    label: capitalize(targeting) || 'Segmento',
    color: 'neutral',
    icon: 'i-lucide-tag'
  }
}

const messagePreview = (campaign: Campaign) => {
  const message = campaign.payload[0] || campaign.results?.payload?.[0]
  if (!message) return 'Sem mensagem configurada.'
  return message.length > 160 ? `${message.slice(0, 157)}...` : message
}

const formatPercentage = (value: number | null | undefined) => {
  if (value === null || value === undefined) return '—'
  return `${(value * 100).toFixed(1).replace('.', ',')}%`
}

const formatInteger = (value: number | null | undefined) => {
  if (value === null || value === undefined) return '—'
  return value.toLocaleString('pt-BR')
}

const formatCurrencyValue = (value: number | null | undefined) => {
  if (value === null || value === undefined) return '—'
  return (value / 100).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 2
  })
}

const selectedResult = computed(() => selectedCampaign.value?.results ?? null)
const selectedMessage = computed(() =>
  selectedCampaign.value?.payload[0] || selectedResult.value?.payload?.[0] || ''
)
</script>

<template>
  <UDashboardPanel id="campaigns">
    <template #header>
      <UDashboardNavbar title="Campanhas">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>

        <template #right>
          <UButton
            icon="i-lucide-refresh-ccw"
            color="neutral"
            :loading="pending"
            @click="refresh"
          >
            Atualizar
          </UButton>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="grid gap-6 xl:grid-cols-[3fr_1fr]">
        <section class="space-y-4">
          <UCard>
            <div class="flex flex-wrap gap-6 justify-between items-center">
              <div>
                <p class="text-xs uppercase text-muted">
                  Visão geral
                </p>
                <p class="text-2xl font-semibold">
                  {{ campaignSummary.total }} campanhas
                </p>
                <p v-if="campaignSummary.lastUpdated" class="text-xs text-muted">
                  Última atualização {{ formatDate(campaignSummary.lastUpdated) }}
                </p>
              </div>
              <div class="flex gap-6 text-sm">
                <div>
                  <p class="text-xs text-muted">
                    Com voucher
                  </p>
                  <p class="text-lg font-semibold text-highlighted">
                    {{ campaignSummary.withVoucher }}
                  </p>
                </div>
                <div>
                  <p class="text-xs text-muted">
                    Com mídia
                  </p>
                  <p class="text-lg font-semibold text-highlighted">
                    {{ campaignSummary.withMedia }}
                  </p>
                </div>
              </div>
            </div>
          </UCard>

          <UAlert
            v-if="error"
            title="Não foi possível carregar as campanhas"
            icon="i-lucide-triangle-alert"
            color="error"
            variant="soft"
          >
            {{ error?.message ?? 'Tente atualizar novamente em instantes.' }}
          </UAlert>

          <div v-if="pending && !campaigns.length" class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <USkeleton v-for="index in 6" :key="index" class="h-48 rounded-2xl" />
          </div>

          <div v-else-if="campaigns.length" class="space-y-4">
            <div class="overflow-x-auto pb-2">
              <div class="flex gap-4 min-w-full">
                <UCard
                  v-for="column in kanbanColumns"
                  :key="column.status"
                  class="w-72 sm:w-80 flex-shrink-0 bg-elevated/40 border border-default/60"
                  :ui="{ body: 'space-y-3' }"
                >
                  <template #header>
                    <div class="flex items-center justify-between gap-3">
                      <p class="text-sm font-semibold">
                        {{ column.label }}
                      </p>
                      <UBadge
                        color="neutral"
                        variant="subtle"
                        :label="column.items.length"
                      />
                    </div>
                  </template>

                  <template v-if="column.items.length">
                    <UCard
                      v-for="campaign in column.items"
                      :key="campaign.id"
                      class="cursor-pointer transition hover:border-highlighted flex flex-col gap-2"
                      :ui="{ body: 'space-y-2' }"
                      @click="openCampaignDetails(campaign)"
                    >
                      <div class="flex items-center justify-between gap-2">
                        <UBadge
                          v-bind="getTargetingBadge(campaign.targeting)"
                          variant="soft"
                          size="xs"
                        >
                          {{ getTargetingBadge(campaign.targeting).label }}
                        </UBadge>
                      </div>
                      <p class="text-sm font-medium text-highlighted">
                        {{ campaign.campaignId }}
                      </p>
                      <p class="text-xs text-muted leading-snug">
                        {{ messagePreview(campaign) }}
                      </p>
                      <div
                        v-if="campaign.results?.sendStatus"
                        class="flex items-center justify-between text-xs text-muted"
                      >
                        <span class="font-semibold text-highlighted">
                          {{ formatInteger(campaign.results.sendStatus.successCount) }}
                        </span>
                        <span>
                          de {{ formatInteger(campaign.results.sendStatus.totalCount) }} enviados
                        </span>
                      </div>
                      <div
                        v-if="campaign.results?.conversionRate !== null && campaign.results?.conversionRate !== undefined"
                        class="text-xs text-muted"
                      >
                        Conversão {{ formatPercentage(campaign.results.conversionRate) }}
                      </div>
                      <div class="flex items-center justify-between text-xs text-muted">
                        <span>
                          {{ campaign.useVoucher && campaign.voucher ? campaign.voucher.code : 'Sem voucher' }}
                        </span>
                        <span>
                          {{ formatDate(campaign.updatedAt || campaign.createdAt || campaign.date) }}
                        </span>
                      </div>
                    </UCard>
                  </template>

                  <template v-else>
                    <div class="py-6 text-center text-xs text-muted">
                      Sem campanhas neste status.
                    </div>
                  </template>
                </UCard>
              </div>
            </div>
          </div>

          <UCard v-else>
            <div class="py-10 text-center space-y-3">
              <UIcon name="i-lucide-target" class="size-10 mx-auto text-muted" />
              <p class="text-lg font-semibold">
                Nenhuma campanha encontrada
              </p>
              <p class="text-sm text-muted">
                Quando criar suas primeiras campanhas elas aparecerão aqui automaticamente.
              </p>
              <UButton
                color="primary"
                variant="soft"
                icon="i-lucide-refresh-ccw"
                @click="refresh"
              >
                Recarregar
              </UButton>
            </div>
          </UCard>
        </section>

        <section>
          <CampaignInsight />
        </section>
      </div>

      <UModal
        v-model:open="isDetailOpen"
        :title="selectedCampaign?.campaignId || 'Detalhes da Campanha'"
        :description="selectedCampaign?.storeId"
        :ui="{ content: 'w-full max-w-2xl max-h-[90vh] flex flex-col', body: 'flex-1 overflow-y-auto' }"
      >
        <template #body>
          <div v-if="selectedCampaign" class="space-y-4">
            <div class="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p class="text-xs uppercase text-muted">
                  Campanha
                </p>
                <p class="text-xl font-semibold">
                  {{ selectedCampaign.campaignId }}
                </p>
                <p class="text-sm text-muted">
                  {{ selectedCampaign.storeId }}
                </p>
              </div>
              <div class="text-right space-y-2">
                <UBadge :color="statusColor(selectedCampaign.status)" variant="soft" class="capitalize">
                  {{ selectedCampaign.status }}
                </UBadge>
                <div class="text-xs text-muted">
                  Atualizada {{ formatDate(selectedCampaign.updatedAt || selectedCampaign.createdAt) }}
                </div>
              </div>
            </div>

            <div class="flex flex-wrap gap-2">
              <UBadge v-bind="getTargetingBadge(selectedCampaign.targeting)" variant="soft" />
              <UBadge color="neutral" variant="subtle">
                Tipo: {{ selectedCampaign.type }}
              </UBadge>
              <UBadge color="neutral" variant="subtle">
                Limite: {{ selectedCampaign.limit ?? '—' }}
              </UBadge>
              <UBadge color="neutral" variant="subtle">
                Voucher: {{ selectedCampaign.useVoucher && selectedCampaign.voucher ? selectedCampaign.voucher.code : '—' }}
              </UBadge>
            </div>

            <div v-if="selectedResult" class="space-y-4">
              <div class="grid gap-3 sm:grid-cols-2">
                <div class="rounded-2xl border border-default/60 p-4 space-y-2">
                  <p class="text-xs uppercase text-muted">
                    Envios
                  </p>
                  <p class="text-3xl font-semibold text-highlighted">
                    {{ formatInteger(selectedResult.sendStatus?.totalCount ?? null) }}
                  </p>
                  <div class="text-xs text-muted space-y-1">
                    <p>Sucesso: {{ formatInteger(selectedResult.sendStatus?.successCount ?? null) }}</p>
                    <p>Falhas: {{ formatInteger(selectedResult.sendStatus?.errorCount ?? null) }}</p>
                    <p>Parciais: {{ formatInteger(selectedResult.sendStatus?.partialCount ?? null) }}</p>
                  </div>
                </div>
                <div class="rounded-2xl border border-default/60 p-4 space-y-2">
                  <p class="text-xs uppercase text-muted">
                    Performance
                  </p>
                  <div class="text-sm text-muted space-y-1">
                    <p>Conversão: <span class="font-semibold text-highlighted">{{ formatPercentage(selectedResult.conversionRate) }}</span></p>
                    <p>Evasão: <span class="font-semibold text-highlighted">{{ formatPercentage(selectedResult.evasionRate) }}</span></p>
                    <p>Pedidos entregues: <span class="font-semibold text-highlighted">{{ formatInteger(selectedResult.ordersDelivered) }}</span></p>
                  </div>
                </div>
              </div>
              <div class="rounded-2xl border border-default/60 p-4 space-y-2">
                <p class="text-xs uppercase text-muted">
                  Resultado financeiro
                </p>
                <p class="text-2xl font-semibold text-highlighted">
                  {{ formatCurrencyValue(selectedResult.totalOrderValue) }}
                </p>
                <p class="text-xs text-muted">
                  Atualizado {{ formatDate(selectedResult.updatedAt || selectedResult.endTimestamp || selectedResult.timestamp) }}
                </p>
              </div>
            </div>

            <div
              v-else
              class="rounded-2xl border border-dashed border-default/60 p-4 text-center text-sm text-muted"
            >
              Nenhum resultado disponível para esta campanha ainda.
            </div>

            <div v-if="selectedCampaign.media" class="rounded-lg overflow-hidden bg-muted/30">
              <img
                :src="selectedCampaign.media.url"
                :alt="`Criativo da campanha ${selectedCampaign.campaignId}`"
                class="object-cover w-full h-48"
              >
            </div>

            <div class="space-y-3 text-sm text-muted leading-relaxed">
              <div v-if="selectedCampaign.description">
                <p class="text-xs uppercase font-semibold text-muted/70">
                  Descrição
                </p>
                <p>{{ selectedCampaign.description }}</p>
              </div>
              <div>
                <p class="text-xs uppercase font-semibold text-muted/70">
                  Mensagem
                </p>
                <p class="whitespace-pre-line">
                  {{ selectedMessage || 'Sem mensagem configurada.' }}
                </p>
              </div>
            </div>

            <div class="text-xs text-muted border-t border-default pt-3 flex flex-wrap gap-3">
              <span>ID interno: {{ selectedCampaign.id }}</span>
              <span>Segmento: {{ capitalize(selectedCampaign.targeting) }}</span>
              <span>Data programada: {{ formatDate(selectedCampaign.date) }}</span>
            </div>
          </div>
        </template>
      </UModal>
    </template>
  </UDashboardPanel>
</template>
