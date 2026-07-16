import { stateRepository } from '@/repositories/state.repository'
import { cityRepository } from '@/repositories/city.repository'
import { buildMeta } from '@/lib/pagination'
import { AppError, ErrorCode } from '@/lib/errors'

export const locationService = {
  async listStates() {
    return stateRepository.findAll()
  },

  async listCities(stateUf: string, q: string, page: number, limit: number) {
    const state = await stateRepository.findByUf(stateUf)
    if (!state) throw new AppError(ErrorCode.STATE_NOT_FOUND)

    const [data, total] = await cityRepository.searchByState(stateUf, q, page, limit)
    const pagination    = buildMeta(total, page, limit)

    return { data, pagination }
  },

  async searchCities(q: string, limit: number) {
    return cityRepository.search(q, limit)
  },
}
