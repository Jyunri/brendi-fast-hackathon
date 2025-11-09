<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import type { CampaignAssistantResponse } from '~/types'

type ChatRole = 'assistant' | 'user'

interface ChatMessage {
  id: string
  role: ChatRole
  content: string
  timestamp: string
}

const isOpen = ref(false)
const contextInput = ref('')
const isSending = ref(false)
const errorMessage = ref<string | null>(null)
const chatBody = ref<HTMLElement | null>(null)

const messages = ref<ChatMessage[]>([{
  id: 'welcome',
  role: 'assistant',
  content: 'Oi! Posso analisar suas campanhas recentes. Me conte o contexto ou objetivo e eu compartilho próximos passos rápidos.',
  timestamp: new Date().toISOString()
}])

watch(messages, async () => {
  await nextTick()
  const container = chatBody.value
  if (container) {
    container.scrollTop = container.scrollHeight
  }
})

const canSend = computed(() => contextInput.value.trim().length >= 3 && !isSending.value)

const handleToggle = () => {
  isOpen.value = !isOpen.value
  if (isOpen.value) {
    errorMessage.value = null
  }
}

const sendMessage = async () => {
  const context = contextInput.value.trim()
  if (!context || isSending.value) {
    errorMessage.value = 'Descreva o contexto antes de enviar.'
    return
  }

  isSending.value = true
  errorMessage.value = null

  messages.value.push({
    id: `user-${Date.now()}`,
    role: 'user',
    content: context,
    timestamp: new Date().toISOString()
  })

  try {
    const response = await $fetch<CampaignAssistantResponse>('/api/campaign-assistant', {
      method: 'POST',
      body: { context }
    })

    messages.value.push({
      id: `assistant-${Date.now()}`,
      role: 'assistant',
      content: response.message,
      timestamp: response.generatedAt
    })

    contextInput.value = ''
  } catch (error) {
    errorMessage.value = 'Não consegui falar com o assistente agora. Tente novamente em instantes.'
  } finally {
    isSending.value = false
  }
}

const onKeydown = (event: KeyboardEvent) => {
  if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
    event.preventDefault()
    sendMessage()
  }
}
</script>

<template>
  <div class="fixed bottom-6 right-6 z-40 flex flex-col items-end gap-3">
    <Transition name="fade">
      <UCard
        v-if="isOpen"
        class="w-80 sm:w-96 shadow-2xl border border-default/40"
        :ui="{
          body: 'space-y-3 p-4',
          header: 'pb-2',
          footer: 'pt-2'
        }"
      >
        <template #header>
          <div class="flex items-center justify-between gap-2">
            <div>
              <p class="text-xs uppercase text-muted">
                @Jimy
              </p>
              <p class="text-sm font-semibold">
                Como posso ajudar?
              </p>
            </div>
            <UButton
              icon="i-lucide-x"
              color="neutral"
              variant="ghost"
              size="xs"
              @click="handleToggle"
            />
          </div>
        </template>

        <div ref="chatBody" class="max-h-80 overflow-y-auto space-y-3 pr-1">
          <div
            v-for="message in messages"
            :key="message.id"
            class="flex"
            :class="message.role === 'user' ? 'justify-end' : 'justify-start'"
          >
            <div
              class="rounded-2xl px-3 py-2 text-sm leading-snug max-w-[90%]"
              :class="message.role === 'user'
                ? 'bg-primary text-white'
                : 'bg-muted/30 text-foreground border border-default/40'"
            >
              {{ message.content }}
            </div>
          </div>
        </div>

        <div class="space-y-2">
          <UTextarea
            v-model="contextInput"
            :rows="3"
            placeholder="Conte o objetivo, desafio ou resultado desejado..."
            :maxlength="600"
            @keydown="onKeydown"
          />
          <UButton
            block
            icon="i-lucide-sparkles"
            :loading="isSending"
            :disabled="!canSend"
            @click="sendMessage"
          >
            Pedir análise
          </UButton>
          <UAlert
            v-if="errorMessage"
            icon="i-lucide-info"
            color="warning"
            variant="soft"
          >
            {{ errorMessage }}
          </UAlert>
          <p class="text-[11px] leading-tight text-muted text-center">
            Use ⌘+Enter (ou Ctrl+Enter) para enviar rapidamente.
          </p>
        </div>
      </UCard>
    </Transition>

    <UTooltip text="Falar com o copiloto">
      <UButton
        icon="i-lucide-message-circle"
        size="lg"
        color="primary"
        class="rounded-full shadow-xl"
        @click="handleToggle"
      >
        Como posso te ajudar?
      </UButton>
    </UTooltip>
  </div>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
  transform: translateY(10px);
}
</style>
