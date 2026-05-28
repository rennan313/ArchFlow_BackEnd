import { locationService } from '@/services/location.service'
import { ok } from '@/lib/response'
import { handleServiceError } from '@/utils/serviceError'

export async function GET() {
  try {
    const states = await locationService.listStates()
    return ok(states)
  } catch (error) {
    return handleServiceError(error)
  }
}
