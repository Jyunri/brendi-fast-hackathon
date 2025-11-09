import { getFeedbacks } from '../utils/feedbacks'

export default eventHandler(async () => {
  try {
    return await getFeedbacks()
  } catch (error) {
    console.error('Error loading feedbacks:', error)
    return []
  }
})
