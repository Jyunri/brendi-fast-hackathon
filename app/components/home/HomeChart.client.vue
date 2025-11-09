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

// Computed para garantir reatividade dos props
const rangeComputed = computed(() => props.range)
const periodComputed = computed(() => props.period)

// Busca dados reais da API
const { data: sales } = await useAsyncData<Sale[]>('chart-sales', async () => {
  // Verifica se o range está válido
  if (!rangeComputed.value?.start || !rangeComputed.value?.end) {
    return []
  }

  const query = {
    period: periodComputed.value,
    rangeStart: rangeComputed.value.start.toISOString(),
    rangeEnd: rangeComputed.value.end.toISOString()
  }

  return await $fetch<Sale[]>('/api/sales', { query })
}, {
  watch: [periodComputed, rangeComputed],
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

const chartData = computed<DataRecord[]>(() => {
  if (!rangeComputed.value?.start || !rangeComputed.value?.end) {
    return []
  }

  const range = rangeComputed.value
  const period = periodComputed.value
  const salesData = sales.value ?? []

  const intervalFactory = ({
    daily: eachDayOfInterval,
    weekly: eachWeekOfInterval,
    monthly: eachMonthOfInterval
  } as Record<Period, typeof eachDayOfInterval>)

  const dates = intervalFactory[period](range)

  if (salesData.length === 0) {
    return dates.map(date => ({ date, amount: 0 }))
  }

  const paidSales = salesData.filter(sale => sale.status === 'paid')
  const groupedData = new Map<string, number>()

  dates.forEach((date) => {
    const normalized = normalizeDate(date, period)
    groupedData.set(normalized.toISOString(), 0)
  })

  paidSales.forEach((sale) => {
    const normalized = normalizeDate(new Date(sale.date), period)
    const key = normalized.toISOString()
    if (groupedData.has(key)) {
      groupedData.set(key, (groupedData.get(key) || 0) + sale.amount)
    }
  })

  return dates.map((date) => {
    const normalized = normalizeDate(date, period)
    const key = normalized.toISOString()
    return {
      date: normalized,
      amount: groupedData.get(key) || 0
    }
  })
})

const x = (_: DataRecord, i: number) => i
const y = (d: DataRecord) => d.amount

const total = computed(() => chartData.value.reduce((acc: number, { amount }) => acc + amount, 0))

// Formatação em BRL para bater com a barra de stats
const formatNumber = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format

const formatDate = (date: Date): string => {
  return ({
    daily: format(date, 'd MMM'),
    weekly: format(date, 'd MMM'),
    monthly: format(date, 'MMM yyy')
  })[periodComputed.value]
}

const xTicks = (i: number) => {
  if (i === 0 || i === chartData.value.length - 1 || !chartData.value[i]) {
    return ''
  }

  return formatDate(chartData.value[i].date)
}

const template = (d: DataRecord) => `${formatDate(d.date)}: ${formatNumber(d.amount)}`
</script>

<template>
  <UCard ref="cardRef" :ui="{ root: 'overflow-visible', body: '!px-0 !pt-0 !pb-3' }">
    <template #header>
      <div>
        <p class="text-xs text-muted uppercase mb-1.5">
          Revenue (includes all status)
        </p>
        <p class="text-3xl text-highlighted font-semibold">
          {{ formatNumber(total) }}
        </p>
      </div>
    </template>

    <VisXYContainer
      :data="chartData"
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
