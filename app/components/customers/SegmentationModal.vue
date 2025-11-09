<script setup lang="ts">
import { computed, ref } from 'vue'
import type {
  CustomerSegmentationResponse,
  CustomerSegmentPriority
} from '~/types'

const open = ref(false)
const contextInput = ref('')
const isLoading = ref(false)
const errorMessage = ref<string | null>(null)
const result = ref<CustomerSegmentationResponse | null>(null)

const priorityMeta: Record<CustomerSegmentPriority, { label: string, color: string, icon: string }> = {
  alta: { label: 'Alta', color: 'error', icon: 'i-lucide-alert-triangle' },
  media: { label: 'Média', color: 'warning', icon: 'i-lucide-activity' },
  baixa: { label: 'Baixa', color: 'success', icon: 'i-lucide-trending-down' }
}

const sourceLabel = computed(() => {
  if (!result.value) return ''
  return result.value.source === 'llm'
    ? 'Segmentação sugerida pelo copiloto'
    : 'Segmentação base gerada localmente'
})

const canGenerate = computed(() => !isLoading.value)

const resetFeedback = () => {
  errorMessage.value = null
}

const parseErrorMessage = (error: unknown) => {
  if (error && typeof error === 'object') {
    if ('statusMessage' in error && typeof error.statusMessage === 'string') {
      return error.statusMessage
    }
    if ('message' in error && typeof error.message === 'string') {
      return error.message
    }
    if ('data' in error && error.data && typeof error.data === 'object' && 'message' in error.data && typeof error.data.message === 'string') {
      return error.data.message
    }
  }
  return 'Não consegui gerar a segmentação agora. Tente novamente em instantes.'
}

const generateSegmentation = async () => {
  if (isLoading.value) return

  isLoading.value = true
  errorMessage.value = null

  try {
    const payload = await $fetch<CustomerSegmentationResponse>('/api/customer-segmentation', {
      method: 'POST',
      body: {
        context: contextInput.value?.trim() || undefined
      }
    })
    result.value = payload
  } catch (error) {
    errorMessage.value = parseErrorMessage(error)
  } finally {
    isLoading.value = false
  }
}

const openModal = () => {
  open.value = true
  resetFeedback()
}
</script>

<template>
  <UModal
    v-model:open="open"
    title="Segmentação inteligente"
    description="Gere clusters acionáveis usando os feedbacks recentes."
  >
    <UButton
      label="Segmentação inteligente"
      icon="i-lucide-sparkles"
      color="primary"
      variant="soft"
      @click="openModal"
    />

    <template #body>
      <div class="space-y-5">
        <div class="space-y-2">
          <UFormField
            label="Contexto (opcional)"
            description="Ex: foco em clientes churnados, delivery atrasado ou região específica."
          >
            <UTextarea
              v-model="contextInput"
              :rows="3"
              :maxlength="600"
              placeholder="Explique o objetivo da segmentação ou deixe em branco para analisar todos os feedbacks."
              class="w-full resize-none"
              @focus="resetFeedback"
            />
          </UFormField>
          <div class="flex flex-wrap items-center gap-2">
            <UButton
              icon="i-lucide-sparkles"
              :loading="isLoading"
              :disabled="!canGenerate"
              @click="generateSegmentation"
            >
              Gerar segmentação
            </UButton>
            <span class="text-xs text-muted">
              A consulta usa feedbacks reais e pode levar alguns segundos.
            </span>
          </div>
        </div>

        <UAlert
          v-if="result"
          :title="sourceLabel"
          icon="i-lucide-bot"
          color="primary"
          variant="soft"
        >
          <template #description>
            <p class="text-sm text-foreground">
              {{ result.summary }}
            </p>
            <p v-if="result.usedContext" class="text-xs text-muted mt-1">
              Contexto aplicado: {{ result.usedContext }}
            </p>
          </template>
        </UAlert>

        <UAlert
          v-else-if="!isLoading && !result"
          title="Pronto para segmentar"
          description="Informe um objetivo (ou deixe em branco) e clique em gerar para receber recomendações de clusters."
          icon="i-lucide-layers"
          color="neutral"
          variant="soft"
        />

        <UAlert
          v-if="errorMessage"
          :title="errorMessage"
          icon="i-lucide-info"
          color="warning"
          variant="subtle"
        />

        <div v-if="isLoading" class="space-y-3">
          <USkeleton class="h-6 w-1/2" />
          <USkeleton class="h-24 w-full" />
          <USkeleton class="h-24 w-full" />
        </div>

        <div v-else-if="result" class="space-y-4">
          <UCard
            v-for="segment in result.segments"
            :key="segment.id"
            :ui="{ body: 'space-y-3' }"
          >
            <div class="flex items-start justify-between gap-3">
              <div>
                <p class="text-xs uppercase text-muted">
                  {{ segment.coverage }}
                </p>
                <h3 class="text-lg font-semibold">
                  {{ segment.name }}
                </h3>
                <p class="text-sm text-muted">
                  {{ segment.description }}
                </p>
              </div>
              <UBadge
                :color="priorityMeta[segment.priority].color"
                variant="soft"
                size="sm"
                :icon="priorityMeta[segment.priority].icon"
              >
                {{ priorityMeta[segment.priority].label }}
              </UBadge>
            </div>

            <div class="grid gap-3 sm:grid-cols-2">
              <div class="space-y-1.5">
                <p class="text-xs font-semibold uppercase text-muted">
                  Sinais do feedback
                </p>
                <ul class="space-y-1.5 text-sm text-foreground/80">
                  <li v-for="signal in segment.signals" :key="signal">
                    • {{ signal }}
                  </li>
                </ul>
              </div>
              <div class="space-y-1.5">
                <p class="text-xs font-semibold uppercase text-muted">
                  Próximos passos
                </p>
                <ul class="space-y-1.5 text-sm text-foreground/80">
                  <li v-for="action in segment.recommendedActions" :key="action">
                    • {{ action }}
                  </li>
                </ul>
              </div>
            </div>
          </UCard>
        </div>
      </div>
    </template>
  </UModal>
</template>
