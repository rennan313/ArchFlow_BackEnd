import { prisma } from '@/lib/prisma'
import { toSkip } from '@/lib/pagination'

function normalize(str: string) {
  return str.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

export const cityRepository = {
  search(q: string, limit: number) {
    const norm = normalize(q)
    return prisma.city.findMany({
      where: q.length >= 2
        ? { nameNormalized: { contains: norm } }
        : {},
      orderBy: [{ stateUf: 'asc' }, { name: 'asc' }],
      take: limit,
      select: { ibgeCode: true, name: true, stateUf: true },
    })
  },

  searchByState(stateUf: string, q: string, page: number, limit: number) {
    const skip  = toSkip(page, limit)
    const norm  = normalize(q)
    const where = {
      stateUf: stateUf.toUpperCase(),
      ...(q.length >= 2 && { nameNormalized: { contains: norm } }),
    }

    return Promise.all([
      prisma.city.findMany({
        where,
        orderBy: { name: 'asc' },
        skip,
        take: limit,
        select: { ibgeCode: true, name: true, stateUf: true },
      }),
      prisma.city.count({ where }),
    ])
  },
}
