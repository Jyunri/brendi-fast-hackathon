# Gestão Web + Agent: Hackathon Brendi

## Stack

Vuejs/Nuxt 4
  * Devex e UI Kit pronta (Nuxt UI)
  * Simplificacao usando Nuxt Server BFF sem precisar de backend dedicado
  * Template pronto para dashboard (Nuxt UI Dashboard)
  * Ferramental de ecossistema front ja integrado (tailwind, typescript, pnpm)
  * Libs para graficos (Unovis)

Vercel
  * Facilidade de deploy plug and play


## Features

### Insights

- Utiliza LLM para gerar insights acionáveis baseados no desempenho recente das campanhas
- Para evitar que o LLM gere insights repetidos, o resultado é cacheado em memoria e atualizado a cada 1 hora
- O LLM gera entre 3 e 5 insights distintos, cada um com um foco diferente
- Caso nao seja possivel gerar insights usando LLM, o fallback é um insight deterministico


## Dados

- Seeds de dados em JSON no S3 (via supabase)

--
## Dificuldades

Tamanho do json nao processavel
- Workaround inicial: pegar somente o sample dos pedidos iniciais
- Workaround 2: script para sanitizar os pedidos salvando apenas campos necessarios nos analitycs
