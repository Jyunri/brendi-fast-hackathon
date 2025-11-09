<script setup lang="ts">
import type { InsightResponse, Insight, InsightSeverity } from '~/types'

const open = ref(false)

const { data, pending, error, refresh } = useLazyFetch<InsightResponse>('/api/insights', {
  server: false,
  immediate: false
})

const insight = computed<Insight | null>(() => data.value?.insight ?? null)

const severityLabel = (severity: InsightSeverity | undefined) => {
  if (!severity) return { label: 'Baixa prioridade', color: 'neutral' as const }
  const map: Record<InsightSeverity, { label: string, color: 'error' | 'warning' | 'success' }> = {
    high: { label: 'Impacto alto', color: 'error' },
    medium: { label: 'Impacto médio', color: 'warning' },
    low: { label: 'Impacto baixo', color: 'success' }
  }
  return map[severity]
}

const severityInfo = computed(() => severityLabel(insight.value?.severity))

const lastUpdated = computed(() => {
  if (!data.value?.generatedAt) return null
  return new Date(data.value.generatedAt).toLocaleString('pt-BR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit'
  })
})

const loadInsight = async () => {
  await refresh()
}

watch(open, (isOpen) => {
  if (isOpen && !insight.value) {
    loadInsight()
  }
})
</script>

<template>
  <UModal
    v-model:open="open"
    title="Dica do dia"
    description="Insights acionáveis baseados no desempenho recente"
    class="sm:max-w-2xl"
  >
    <UButton
      icon="i-lucide-sparkles"
      label="Dica do Dia"
    />

    <template #body>
      <div class="space-y-4">
        <div v-if="insight" class="flex justify-end">
          <UBadge :color="severityInfo.color" variant="soft">
            {{ severityInfo.label }}
          </UBadge>
        </div>

        <template v-if="pending">
          <USkeleton class="h-4 w-24" />
          <USkeleton class="h-7 w-3/4" />
          <USkeleton class="h-4 w-full" />
          <USkeleton class="h-20 w-full" />
        </template>

        <template v-else-if="insight">
          <div>
            <p class="text-sm text-muted mb-1">
              {{ insight.metric }}
            </p>
            <p class="text-xl font-semibold">
              {{ insight.title }}
            </p>
          </div>
          <p class="text-sm text-muted">
            {{ insight.summary }}
          </p>
          <UAlert
            icon="i-lucide-lightbulb"
            variant="soft"
            color="primary"
            title="Recomendação"
          >
            {{ insight.recommendation }}
          </UAlert>
          <p class="text-xs text-muted leading-snug">
            {{ insight.evidence }}
          </p>
          <p v-if="lastUpdated" class="text-xs text-muted pt-2 border-t">
            Atualizado {{ lastUpdated }}
          </p>
        </template>

        <template v-else>
          <p class="text-sm text-muted">
            Clique no botão para gerar uma dica personalizada com base no desempenho recente das vendas.
          </p>
        </template>

        <UAlert
          v-if="error"
          title="Não foi possível buscar o insight"
          icon="i-lucide-triangle-alert"
          color="error"
          variant="soft"
        >
          {{ error.message || 'Tente novamente em instantes.' }}
        </UAlert>
      </div>

      <div class="flex flex-wrap items-center justify-end gap-3 pt-4 mt-4 border-t">
        <UButton
          v-if="insight"
          icon="i-lucide-refresh-cw"
          :loading="pending"
          variant="subtle"
          @click="loadInsight"
        >
          Atualizar dica
        </UButton>
        <UButton
          label="Fechar"
          color="neutral"
          variant="subtle"
          @click="open = false"
        />
      </div>
    </template>
  </UModal>
</template>
