import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

/**
 * Tenta carregar dados do S3 (via config.seeds.apiUrl) primeiro,
 * e se falhar, carrega do arquivo local como fallback.
 *
 * @param filename - Nome do arquivo (ex: 'orders-2.json')
 * @param localPath - Caminho local do arquivo (ex: 'tmp/Hackathon 2025-11-09/orders-2.json')
 * @param transform - Função opcional para transformar os dados do S3 (ex: (data) => data.orders)
 * @returns Dados parseados do tipo T
 */
export async function loadSeedsData<T>(
  filename: string,
  localPath: string,
  transform?: (data: unknown) => T
): Promise<T> {
  const config = useRuntimeConfig()
  const baseUrl = config.seeds?.apiUrl

  // Tenta buscar do S3 primeiro
  if (baseUrl) {
    try {
      const url = `${baseUrl}/${filename}`
      const response = await fetch(url)

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      const data = await response.json()

      // Aplica transformação se fornecida, senão retorna os dados diretamente
      const result = transform ? transform(data) : data

      if (result !== undefined && result !== null) {
        console.log(`✓ Loaded ${filename} from S3 (${baseUrl})`)
        return result as T
      }
    } catch (error) {
      console.warn(`⚠ Failed to load ${filename} from S3, falling back to local file:`, error instanceof Error ? error.message : error)
    }
  }

  // Fallback para arquivo local
  try {
    const fullPath = join(process.cwd(), localPath)
    const content = await readFile(fullPath, 'utf-8')
    const data = JSON.parse(content) as T
    console.log(`✓ Loaded ${localPath} from local file system`)
    return data
  } catch (error) {
    console.error(`✗ Failed to load ${localPath} from local file:`, error)
    throw error
  }
}
