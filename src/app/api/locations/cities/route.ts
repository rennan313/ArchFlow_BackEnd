import { type NextRequest } from 'next/server'
import { locationService } from '@/services/location.service'
import { ok, badRequest } from '@/lib/response'
import { handleServiceError } from '@/utils/serviceError'

export async function GET(req: NextRequest) {
  try {
    const params = req.nextUrl.searchParams
    const state  = params.get('state') ?? ''
    const search = params.get('search') ?? ''
    const page   = Math.max(1, Number(params.get('page') ?? '1'))
    const limit  = Math.min(100, Math.max(1, Number(params.get('limit') ?? '20')))

    if (!state) {
      return badRequest('Query param "state" (UF) is required')
    }

    if (search.length > 0 && search.length < 2) {
      return badRequest('Search must be at least 2 characters')
    }

    const { data, pagination } = await locationService.listCities(state, search, page, limit)

    const cities = data.map((c) => ({
      ibgeCode: c.ibgeCode,
      name:     c.name,
      state:    c.stateUf,
      label:    `${c.name} - ${c.stateUf}`,
    }))

    return ok(cities, undefined, pagination)
  } catch (error) {
    return handleServiceError(error)
  }
}
