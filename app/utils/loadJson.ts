import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

export default async function loadJson<T>(path: string): Promise<T> {
  const fullPath = join(process.cwd(), path)
  const content = await readFile(fullPath, 'utf-8')
  return JSON.parse(content) as T
}
