import { getCampaignsWithResults } from '../utils/campaigns'

export default eventHandler(async () => {
  try {
    return await getCampaignsWithResults()
  } catch (error) {
    console.error('Error loading campaigns:', error)
    return []
  }
})
