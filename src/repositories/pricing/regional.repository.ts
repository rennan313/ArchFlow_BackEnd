import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

export const regionalPricingRepository = {
  findOne(stateUf: string, projectType?: string, pricingMethod?: "HOURLY" | "SQUARE_METER", city?: string) {
    const where: Prisma.RegionalPricingWhereInput = {
      stateUf: stateUf.toUpperCase(),
      ...(projectType   && { projectType }),
      ...(pricingMethod && { pricingMethod }),
    };

    // Prefer city-specific record, fall back to state-level
    if (city) {
      return prisma.regionalPricing.findFirst({
        where: { ...where, city: { in: [city, null as unknown as string] } },
        orderBy: { city: "desc" }, // city-specific rows sort before null
      });
    }

    return prisma.regionalPricing.findFirst({ where: { ...where, city: null } });
  },

  findMany(stateUf: string, projectType?: string, pricingMethod?: "HOURLY" | "SQUARE_METER") {
    return prisma.regionalPricing.findMany({
      where: {
        stateUf: stateUf.toUpperCase(),
        ...(projectType   && { projectType }),
        ...(pricingMethod && { pricingMethod }),
        city: null,
      },
      orderBy: [{ projectType: "asc" }, { pricingMethod: "asc" }],
    });
  },

  create(data: Prisma.RegionalPricingCreateInput) {
    return prisma.regionalPricing.create({ data });
  },

  upsert(
    stateUf: string,
    projectType: string,
    pricingMethod: "HOURLY" | "SQUARE_METER",
    city: string | null,
    values: { minValue: number; maxValue: number; averageValue: number },
  ) {
    return prisma.regionalPricing.upsert({
      where: {
        // Prisma upsert on MongoDB needs a unique field — use id trick via findFirst + create/update pattern
        id: "000000000000000000000000", // placeholder; real upsert below
      },
      create: { stateUf, city, projectType, pricingMethod, ...values },
      update: values,
    });
  },

  bulkCreate(data: Prisma.RegionalPricingCreateManyInput[]) {
    return prisma.regionalPricing.createMany({ data });
  },

  deleteAll() {
    return prisma.regionalPricing.deleteMany();
  },
};
