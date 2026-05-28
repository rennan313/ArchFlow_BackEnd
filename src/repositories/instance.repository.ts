import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import type { InstanceQueryInput } from "@/validations/instance";

export const instanceRepository = {
  findById(id: string) {
    return prisma.instance.findUnique({ where: { id } });
  },

  async findMany(query: InstanceQueryInput) {
    const { page, limit, search, status, environment, sortBy, sortOrder } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.InstanceWhereInput = {
      ...(status && { status }),
      ...(environment && { environment }),
      ...(search && {
        OR: [
          { name: { contains: search, mode: "insensitive" } },
          { ip: { contains: search, mode: "insensitive" } },
        ],
      }),
    };

    const [data, total] = await Promise.all([
      prisma.instance.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sortBy]: sortOrder },
      }),
      prisma.instance.count({ where }),
    ]);

    return { data, total };
  },
};
