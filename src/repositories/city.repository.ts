import { prisma } from '@/lib/prisma'

export const cityRepository = {
  search(q: string, limit: number) {
    return prisma.city.findMany({
      where: q.length >= 2
        ? { name: { contains: q, mode: 'insensitive' } }
        : {},
      orderBy: [{ state: 'asc' }, { name: 'asc' }],
      take: limit,
      select: { ibgeCode: true, name: true, state: true },
    })
  },
}
