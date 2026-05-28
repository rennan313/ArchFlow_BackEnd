import { type NextRequest } from 'next/server'
import { cityRepository } from '@/repositories/city.repository'
import { ok, badRequest } from '@/lib/response'
import { handleServiceError } from '@/utils/serviceError'

export async function GET(req: NextRequest) {
  try {
    const q     = req.nextUrl.searchParams.get('q') ?? ''
    const limit = Math.min(Number(req.nextUrl.searchParams.get('limit') ?? '10'), 50)

    if (q.length > 0 && q.length < 2) {
      return badRequest('Query must be at least 2 characters')
    }

    const cities = await cityRepository.search(q, limit)

    const data = cities.map((c) => ({
      ibgeCode: c.ibgeCode,
      name:     c.name,
      state:    c.stateUf,
      label:    `${c.name} - ${c.stateUf}`,
    }))

    return ok(data)
  } catch (error) {
    return handleServiceError(error)
  }
}
