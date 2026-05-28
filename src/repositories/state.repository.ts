import { prisma } from '@/lib/prisma'

export const stateRepository = {
  findAll() {
    return prisma.state.findMany({
      orderBy: { name: 'asc' },
      select: { id: true, name: true, uf: true },
    })
  },

  findByUf(uf: string) {
    return prisma.state.findUnique({
      where: { uf: uf.toUpperCase() },
      select: { id: true, name: true, uf: true },
    })
  },
}
