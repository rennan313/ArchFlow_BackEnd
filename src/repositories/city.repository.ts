import { prisma } from '@/lib/prisma'

export const cityRepository = {
  search(q: string, limit: number) {
    return prisma.city.findMany({
      where: q.length >= 2
        ? { name: { contains: q, mode: 'insensitive' } }
        : {},
      orderBy: [{ stateUf: 'asc' }, { name: 'asc' }],
      take: limit,
      select: { ibgeCode: true, name: true, stateUf: true },
    })
  },

  searchByState(stateUf: string, q: string, page: number, limit: number) {
    const skip  = (page - 1) * limit
    const where = {
      stateUf: stateUf.toUpperCase(),
      ...(q.length >= 2 && { name: { contains: q, mode: 'insensitive' as const } }),
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
