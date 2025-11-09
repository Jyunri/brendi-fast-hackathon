import type { User } from '~/types'
import { loadSeedsData } from '../utils/loadSeedsData'

export default eventHandler(async () => {
  try {
    const consumers = await loadSeedsData<User[]>(
      'store_consumers.json',
      'tmp/Hackathon 2025-11-09/store_consumers.json'
    )

    const customers = consumers.map(consumer => ({
      id: consumer.id,
      name: consumer.name,
      email: `${consumer.name.toLowerCase().replace(' ', '.')}@example.com`,
      avatar: {
        src: `https://i.pravatar.cc/128?u=${consumer.id}`
      },
      status: consumer.type
    }))

    return customers
  } catch (error) {
    console.error('Error loading customers:', error)
    return []
  }
})
