<script setup lang="ts">
import { eachDayOfInterval, eachWeekOfInterval, eachMonthOfInterval, format, startOfDay, startOfWeek, startOfMonth } from 'date-fns'
import { VisXYContainer, VisLine, VisAxis, VisArea, VisCrosshair, VisTooltip } from '@unovis/vue'
import type { Period, Range, Sale } from '~/types'

const cardRef = useTemplateRef<HTMLElement | null>('cardRef')

const props = defineProps<{
  period: Period
  range: Range
}>()

type DataRecord = {
  date: Date
  amount: number
}

const { width } = useElementSize(cardRef)

const data = ref<DataRecord[]>([])

// Busca dados reais da API
const { data: sales } = await useAsyncData<Sale[]>('chart-sales', async () => {
  const query = {
    period: props.period,
    rangeStart: props.range.start.toISOString(),
    rangeEnd: props.range.end.toISOString()
  }

  return await $fetch<Sale[]>('/api/sales', { query })
}, {
  watch: [() => props.period, () => props.range],
  default: () => []
})

// Função para normalizar a data baseado no período
const normalizeDate = (date: Date, period: Period): Date => {
  switch (period) {
    case 'daily':
      return startOfDay(date)
    case 'weekly':
      return startOfWeek(date, { weekStartsOn: 1 }) // Segunda-feira como início da semana
    case 'monthly':
      return startOfMonth(date)
    default:
      return startOfDay(date)
  }
}

// Agrupa vendas por período e calcula o total
watch([() => sales.value, () => props.period, () => props.range], () => {
  if (!sales.value || sales.value.length === 0) {
    // Gera datas vazias para o período
    const dates = ({
      daily: eachDayOfInterval,
      weekly: eachWeekOfInterval,
      monthly: eachMonthOfInterval
    } as Record<Period, typeof eachDayOfInterval>)[props.period](props.range)

    data.value = dates.map(date => ({ date, amount: 0 }))
    return
  }

  // Filtra apenas vendas com status 'paid' (equivalente a 'delivered')
  const paidSales = sales.value.filter(sale => sale.status === 'paid')

  // Gera todas as datas do período
  const dates = ({
    daily: eachDayOfInterval,
    weekly: eachWeekOfInterval,
    monthly: eachMonthOfInterval
  } as Record<Period, typeof eachDayOfInterval>)[props.period](props.range)

  // Agrupa vendas por período
  const groupedData = new Map<string, number>()

  // Inicializa todos os períodos com 0
  dates.forEach((date) => {
    const normalized = normalizeDate(date, props.period)
    const key = normalized.toISOString()
    groupedData.set(key, 0)
  })

  // Soma os valores das vendas por período
  paidSales.forEach((sale) => {
    const saleDate = new Date(sale.date)
    const normalized = normalizeDate(saleDate, props.period)
    const key = normalized.toISOString()

    if (groupedData.has(key)) {
      groupedData.set(key, (groupedData.get(key) || 0) + sale.amount)
    }
  })

  // Converte para array de DataRecord ordenado por data
  data.value = dates.map((date) => {
    const normalized = normalizeDate(date, props.period)
    const key = normalized.toISOString()
    return {
      date: normalized,
      amount: groupedData.get(key) || 0
    }
  })
}, { immediate: true })

const x = (_: DataRecord, i: number) => i
const y = (d: DataRecord) => d.amount

const total = computed(() => data.value.reduce((acc: number, { amount }) => acc + amount, 0))

// Formatação em BRL para bater com a barra de stats
const formatNumber = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format

const formatDate = (date: Date): string => {
  return ({
    daily: format(date, 'd MMM'),
    weekly: format(date, 'd MMM'),
    monthly: format(date, 'MMM yyy')
  })[props.period]
}

const xTicks = (i: number) => {
  if (i === 0 || i === data.value.length - 1 || !data.value[i]) {
    return ''
  }

  return formatDate(data.value[i].date)
}

const template = (d: DataRecord) => `${formatDate(d.date)}: ${formatNumber(d.amount)}`
</script>

<template>
  <UCard ref="cardRef" :ui="{ root: 'overflow-visible', body: '!px-0 !pt-0 !pb-3' }">
    <template #header>
      <div>
        <p class="text-xs text-muted uppercase mb-1.5">
          Revenue
        </p>
        <p class="text-3xl text-highlighted font-semibold">
          {{ formatNumber(total) }}
        </p>
      </div>
    </template>

    <VisXYContainer
      :data="data"
      :padding="{ top: 40 }"
      class="h-96"
      :width="width"
    >
      <VisLine
        :x="x"
        :y="y"
        color="var(--ui-primary)"
      />
      <VisArea
        :x="x"
        :y="y"
        color="var(--ui-primary)"
        :opacity="0.1"
      />

      <VisAxis
        type="x"
        :x="x"
        :tick-format="xTicks"
      />

      <VisCrosshair
        color="var(--ui-primary)"
        :template="template"
      />

      <VisTooltip />
    </VisXYContainer>
  </UCard>
</template>

<style scoped>
.unovis-xy-container {
  --vis-crosshair-line-stroke-color: var(--ui-primary);
  --vis-crosshair-circle-stroke-color: var(--ui-bg);

  --vis-axis-grid-color: var(--ui-border);
  --vis-axis-tick-color: var(--ui-border);
  --vis-axis-tick-label-color: var(--ui-text-dimmed);

  --vis-tooltip-background-color: var(--ui-bg);
  --vis-tooltip-border-color: var(--ui-border);
  --vis-tooltip-text-color: var(--ui-text-highlighted);
}
</style>
