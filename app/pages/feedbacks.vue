<script setup lang="ts">
import { upperFirst } from 'scule'
import type { Feedback } from '~/types'
import AssistantChat from '~/components/assistant/AssistantChat.vue'

type RatingFilter = 'all' | 'positive' | 'neutral' | 'negative'

const search = ref('')
const categoryFilter = ref<string>('all')
const ratingFilter = ref<RatingFilter>('all')

const { data, pending, error, refresh } = await useFetch<Feedback[]>('/api/feedbacks', {
  default: () => [],
  lazy: true
})

const sortedFeedbacks = computed(() => {
  const list = data.value || []
  return [...list].sort((a, b) => getTimestamp(b) - getTimestamp(a))
})

const normalizedSearch = computed(() => search.value.trim().toLowerCase())

const filteredFeedbacks = computed(() =>
  sortedFeedbacks.value.filter((feedback) => {
    if (categoryFilter.value !== 'all' && feedback.category !== categoryFilter.value) {
      return false
    }

    if (!matchesRatingFilter(feedback.rating, ratingFilter.value)) {
      return false
    }

    if (normalizedSearch.value) {
      const haystack = [
        feedback.comment,
        feedback.orderId,
        feedback.storeConsumerId,
        feedback.storeId
      ].filter(Boolean).join(' ').toLowerCase()

      return haystack.includes(normalizedSearch.value)
    }

    return true
  })
)

const latestFeedbackLabel = computed(() => {
  const feedback = sortedFeedbacks.value[0]
  if (!feedback) return null
  return formatDateTime(feedback.createdAt || feedback.updatedAt)
})

const _categoryOptions = computed(() => {
  const unique = new Set(sortedFeedbacks.value.map(item => item.category).filter(Boolean))
  return [
    { label: 'Todas categorias', value: 'all' },
    ...Array.from(unique).map(category => ({
      label: formatCategory(category),
      value: category
    }))
  ]
})

const metrics = computed(() => {
  const list = sortedFeedbacks.value
  const total = list.length
  const average = total ? list.reduce((sum, item) => sum + (item.rating || 0), 0) / total : 0
  const positive = list.filter(item => item.rating >= 4).length
  const negative = list.filter(item => item.rating <= 2).length

  return {
    total,
    average,
    positive,
    negative,
    positiveRate: total ? (positive / total) * 100 : 0
  }
})

const summaryCards = computed(() => {
  const stats = metrics.value
  return [{
    label: 'Feedbacks recebidos',
    value: stats.total.toLocaleString('pt-BR'),
    icon: 'i-lucide-message-circle',
    description: latestFeedbackLabel.value ? `Último em ${latestFeedbackLabel.value}` : 'Nenhum feedback encontrado'
  }, {
    label: 'Nota média',
    value: stats.total ? stats.average.toFixed(1).replace('.', ',') : '—',
    icon: 'i-lucide-star',
    description: stats.total ? `Base ${stats.total} avaliações` : 'Sem avaliações registradas'
  }, {
    label: 'Positividade',
    value: `${Math.round(stats.positiveRate)}%`,
    icon: 'i-lucide-smile',
    description: `${stats.positive} elogios · ${stats.negative} críticas`
  }]
})

const hasFiltersApplied = computed(() =>
  categoryFilter.value !== 'all'
  || ratingFilter.value !== 'all'
  || Boolean(normalizedSearch.value)
)

const emptyStateMessage = computed(() => {
  if (!sortedFeedbacks.value.length) {
    return 'Ainda não existem feedbacks disponíveis no arquivo compartilhado.'
  }

  if (hasFiltersApplied.value) {
    return 'Nenhum feedback corresponde aos filtros selecionados.'
  }

  return 'Nenhum feedback disponível no momento.'
})

function matchesRatingFilter(rating: number, filter: RatingFilter) {
  if (filter === 'all') return true
  if (filter === 'positive') return rating >= 4
  if (filter === 'neutral') return rating === 3
  if (filter === 'negative') return rating <= 2
  return true
}

function getTimestamp(feedback: Feedback) {
  const date = feedback.createdAt || feedback.updatedAt
  return date ? new Date(date).getTime() : 0
}

function formatCategory(category: string) {
  if (!category) return 'Sem categoria'
  return upperFirst(category.replace(/[-_]/g, ' '))
}

function formatDateTime(date: string | null | undefined) {
  if (!date) return 'Data não informada'
  return new Date(date).toLocaleString('pt-BR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit'
  })
}
</script>

<template>
  <div class="relative">
    <UDashboardPanel id="feedbacks">
    <template #header>
      <UDashboardNavbar title="Feedbacks">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>

        <template #right>
          <UButton
            icon="i-lucide-refresh-ccw"
            color="neutral"
            variant="ghost"
            :loading="pending"
            @click="() => refresh()"
          >
            Atualizar
          </UButton>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="grid gap-4 md:grid-cols-3">
        <UCard
          v-for="card in summaryCards"
          :key="card.label"
          class="flex flex-col gap-3"
        >
          <div class="flex items-start justify-between gap-4">
            <div>
              <p class="text-xs uppercase text-muted tracking-wide">
                {{ card.label }}
              </p>
              <p class="text-2xl font-semibold text-highlighted">
                {{ card.value }}
              </p>
            </div>
            <div class="p-2.5 rounded-full bg-primary/10 ring ring-inset ring-primary/25">
              <UIcon :name="card.icon" class="size-5 text-primary" />
            </div>
          </div>
          <p class="text-xs text-muted leading-snug">
            {{ card.description }}
          </p>
        </UCard>
      </div>

      <UAlert
        v-if="error"
        icon="i-lucide-triangle-alert"
        color="error"
        variant="soft"
        title="Não foi possível carregar os feedbacks"
        class="mt-6"
      >
        {{ error.message || 'Tente novamente em instantes.' }}
      </UAlert>

      <section class="mt-6 space-y-4">
        <div v-if="pending">
          <UCard v-for="n in 4" :key="n" class="space-y-4 mb-4">
            <USkeleton class="h-4 w-1/3" />
            <USkeleton class="h-6 w-1/2" />
            <USkeleton class="h-4 w-full" />
            <USkeleton class="h-4 w-2/3" />
          </UCard>
        </div>

        <div v-else-if="filteredFeedbacks.length">
          <UCard
            v-for="feedback in filteredFeedbacks"
            :key="feedback.id"
            class="space-y-4 mb-4"
          >
            <div class="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p class="text-xs text-muted uppercase tracking-wide">
                  Pedido {{ feedback.orderId }}
                </p>
                <p class="text-xl font-semibold text-highlighted">
                  Nota {{ feedback.rating }} / 5
                </p>
                <p class="text-xs text-muted">
                  Cliente #{{ feedback.storeConsumerId }}
                </p>
              </div>

              <div class="flex flex-wrap gap-2">
                <UBadge color="primary" variant="soft">
                  {{ formatCategory(feedback.category) }}
                </UBadge>
                <UBadge color="warning" variant="soft">
                  {{ feedback.rating >= 4 ? 'Positivo' : feedback.rating <= 2 ? 'Crítico' : 'Neutro' }}
                </UBadge>
              </div>
            </div>

            <p class="text-sm text-muted leading-relaxed">
              {{ feedback.comment || 'Cliente não deixou comentário.' }}
            </p>

            <div class="flex flex-wrap gap-4 text-xs text-muted pt-4 border-t">
              <span class="flex items-center gap-1">
                <UIcon name="i-lucide-clock-3" class="size-4" />
                {{ formatDateTime(feedback.createdAt || feedback.updatedAt) }}
              </span>
              <span class="flex items-center gap-1">
                <UIcon name="i-lucide-hash" class="size-4" />
                ID {{ feedback.id }}
              </span>
              <span class="flex items-center gap-1">
                <UIcon name="i-lucide-store" class="size-4" />
                Loja {{ feedback.storeId }}
              </span>
            </div>
          </UCard>
        </div>

        <div v-else>
          <UAlert
            icon="i-lucide-message-square"
            color="neutral"
            variant="soft"
            title="Sem resultados"
          >
            {{ emptyStateMessage }}
          </UAlert>
        </div>
      </section>
    </template>
    </UDashboardPanel>

    <AssistantChat
      endpoint="/api/feedback-assistant"
      title="Copiloto de Feedbacks"
      subtitle="Traduza avaliações em ações"
      welcome-message="Oi! Estou de olho nos feedbacks mais recentes. Conte o contexto (categoria, problema ou meta) e eu te mostro onde agir."
      placeholder="Ex.: muitos clientes reclamando da temperatura do item"
      button-label="Analisar feedbacks"
      tooltip="Copiloto de feedbacks"
    />
  </div>
</template>
