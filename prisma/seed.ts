import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

function normalize(str: string) {
  return str.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

const STATES = [
  { uf: 'AC', name: 'Acre' },
  { uf: 'AL', name: 'Alagoas' },
  { uf: 'AP', name: 'Amapá' },
  { uf: 'AM', name: 'Amazonas' },
  { uf: 'BA', name: 'Bahia' },
  { uf: 'CE', name: 'Ceará' },
  { uf: 'DF', name: 'Distrito Federal' },
  { uf: 'ES', name: 'Espírito Santo' },
  { uf: 'GO', name: 'Goiás' },
  { uf: 'MA', name: 'Maranhão' },
  { uf: 'MT', name: 'Mato Grosso' },
  { uf: 'MS', name: 'Mato Grosso do Sul' },
  { uf: 'MG', name: 'Minas Gerais' },
  { uf: 'PA', name: 'Pará' },
  { uf: 'PB', name: 'Paraíba' },
  { uf: 'PR', name: 'Paraná' },
  { uf: 'PE', name: 'Pernambuco' },
  { uf: 'PI', name: 'Piauí' },
  { uf: 'RJ', name: 'Rio de Janeiro' },
  { uf: 'RN', name: 'Rio Grande do Norte' },
  { uf: 'RS', name: 'Rio Grande do Sul' },
  { uf: 'RO', name: 'Rondônia' },
  { uf: 'RR', name: 'Roraima' },
  { uf: 'SC', name: 'Santa Catarina' },
  { uf: 'SP', name: 'São Paulo' },
  { uf: 'SE', name: 'Sergipe' },
  { uf: 'TO', name: 'Tocantins' },
]

const PROJECT_TYPES = [
  'Residencial', 'Comercial', 'Industrial', 'Interiores', 'Paisagismo', 'Urbanismo',
]

// Regional pricing baselines (R$/h for HOURLY, R$/m² for SQUARE_METER)
// Grouped by economic tier
const PRICING_TIERS: Record<string, {
  hourly:  { min: number; max: number; avg: number }
  sqm:     { min: number; max: number; avg: number }
}> = {
  // Tier 1 — highest purchasing power
  SP: { hourly: { min: 180, max: 450, avg: 280 }, sqm: { min: 30, max: 90,  avg: 55  } },
  RJ: { hourly: { min: 160, max: 400, avg: 250 }, sqm: { min: 28, max: 85,  avg: 50  } },
  DF: { hourly: { min: 170, max: 420, avg: 270 }, sqm: { min: 30, max: 88,  avg: 52  } },
  // Tier 2 — strong regional markets
  MG: { hourly: { min: 130, max: 320, avg: 200 }, sqm: { min: 22, max: 65,  avg: 40  } },
  RS: { hourly: { min: 130, max: 310, avg: 195 }, sqm: { min: 22, max: 62,  avg: 38  } },
  PR: { hourly: { min: 125, max: 300, avg: 190 }, sqm: { min: 20, max: 60,  avg: 36  } },
  SC: { hourly: { min: 125, max: 300, avg: 188 }, sqm: { min: 20, max: 60,  avg: 36  } },
  ES: { hourly: { min: 120, max: 290, avg: 180 }, sqm: { min: 20, max: 58,  avg: 35  } },
  // Tier 3 — growing regional markets
  BA: { hourly: { min: 100, max: 250, avg: 155 }, sqm: { min: 16, max: 48,  avg: 30  } },
  GO: { hourly: { min: 100, max: 240, avg: 150 }, sqm: { min: 16, max: 46,  avg: 28  } },
  PE: { hourly: { min: 100, max: 240, avg: 150 }, sqm: { min: 16, max: 46,  avg: 28  } },
  CE: { hourly: { min: 95,  max: 230, avg: 145 }, sqm: { min: 15, max: 44,  avg: 27  } },
  AM: { hourly: { min: 95,  max: 230, avg: 145 }, sqm: { min: 15, max: 44,  avg: 27  } },
  MT: { hourly: { min: 95,  max: 230, avg: 142 }, sqm: { min: 15, max: 43,  avg: 26  } },
  MS: { hourly: { min: 95,  max: 225, avg: 140 }, sqm: { min: 15, max: 42,  avg: 26  } },
  // Tier 4 — emerging markets
  RN: { hourly: { min: 85,  max: 200, avg: 125 }, sqm: { min: 13, max: 38,  avg: 23  } },
  PB: { hourly: { min: 85,  max: 200, avg: 125 }, sqm: { min: 13, max: 38,  avg: 23  } },
  AL: { hourly: { min: 80,  max: 190, avg: 120 }, sqm: { min: 12, max: 36,  avg: 22  } },
  SE: { hourly: { min: 80,  max: 190, avg: 120 }, sqm: { min: 12, max: 36,  avg: 22  } },
  PA: { hourly: { min: 80,  max: 190, avg: 118 }, sqm: { min: 12, max: 35,  avg: 21  } },
  MA: { hourly: { min: 75,  max: 180, avg: 112 }, sqm: { min: 11, max: 34,  avg: 20  } },
  PI: { hourly: { min: 75,  max: 180, avg: 112 }, sqm: { min: 11, max: 34,  avg: 20  } },
  TO: { hourly: { min: 75,  max: 175, avg: 110 }, sqm: { min: 11, max: 33,  avg: 20  } },
  RO: { hourly: { min: 75,  max: 175, avg: 108 }, sqm: { min: 11, max: 32,  avg: 19  } },
  // Tier 5 — lower market activity
  AC: { hourly: { min: 65,  max: 160, avg: 100 }, sqm: { min: 10, max: 30,  avg: 18  } },
  AP: { hourly: { min: 65,  max: 160, avg: 100 }, sqm: { min: 10, max: 30,  avg: 18  } },
  RR: { hourly: { min: 65,  max: 155, avg: 98  }, sqm: { min: 10, max: 28,  avg: 17  } },
}

// Project type multipliers on top of the base tier
const PROJECT_MULTIPLIERS: Record<string, number> = {
  Residencial: 1.0,
  Interiores:  1.0,
  Comercial:   1.15,
  Paisagismo:  0.9,
  Industrial:  1.25,
  Urbanismo:   1.4,
}

interface IbgeMunicipio {
  id: number
  nome: string
  microrregiao: { mesorregiao: { UF: { sigla: string } } } | null
}

function applyMultiplier(base: number, mult: number) {
  return Math.round(base * mult * 100) / 100
}

async function seedRegionalPricing() {
  console.log('Seeding regional pricing...')
  await prisma.regionalPricing.deleteMany()

  const rows: {
    stateUf: string
    city: null
    projectType: string
    pricingMethod: 'HOURLY' | 'SQUARE_METER'
    minValue: number
    maxValue: number
    averageValue: number
  }[] = []

  for (const [uf, tier] of Object.entries(PRICING_TIERS)) {
    for (const projectType of PROJECT_TYPES) {
      const pm = PROJECT_MULTIPLIERS[projectType] ?? 1.0

      rows.push({
        stateUf: uf, city: null, projectType,
        pricingMethod: 'HOURLY',
        minValue:      applyMultiplier(tier.hourly.min, pm),
        maxValue:      applyMultiplier(tier.hourly.max, pm),
        averageValue:  applyMultiplier(tier.hourly.avg, pm),
      })

      rows.push({
        stateUf: uf, city: null, projectType,
        pricingMethod: 'SQUARE_METER',
        minValue:      applyMultiplier(tier.sqm.min, pm),
        maxValue:      applyMultiplier(tier.sqm.max, pm),
        averageValue:  applyMultiplier(tier.sqm.avg, pm),
      })
    }
  }

  await prisma.regionalPricing.createMany({ data: rows })
  console.log(`  ${rows.length} regional pricing records created.`)
}

async function main() {
  // ── 1. States ──────────────────────────────────────────────────────────────
  console.log('Seeding states...')
  await prisma.city.deleteMany()
  await prisma.state.deleteMany()
  await prisma.state.createMany({ data: STATES })

  const stateMap = new Map(
    (await prisma.state.findMany({ select: { id: true, uf: true } }))
      .map((s: { id: string; uf: string }) => [s.uf, s.id]),
  )
  console.log(`  ${stateMap.size} states created.`)

  // ── 2. Cities ─────────────────────────────────────────────────────────────
  console.log('Fetching municipalities from IBGE...')
  const res = await fetch(
    'https://servicodados.ibge.gov.br/api/v1/localidades/municipios?orderBy=nome',
  )
  if (!res.ok) throw new Error(`IBGE API error: ${res.status}`)

  const municipios: IbgeMunicipio[] = await res.json()
  console.log(`  ${municipios.length} municipalities fetched.`)

  const cities = municipios
    .map((m) => {
      const uf      = m.microrregiao?.mesorregiao?.UF?.sigla ?? null
      const stateId = uf ? (stateMap.get(uf) ?? null) : null
      return stateId && uf
        ? { ibgeCode: m.id, name: m.nome, nameNormalized: normalize(m.nome), stateUf: uf, stateId }
        : null
    })
    .filter((c): c is NonNullable<typeof c> => c !== null)

  console.log(`  ${cities.length} cities ready for import.`)
  await prisma.city.deleteMany()

  const BATCH = 500
  console.log('Inserting cities...')
  for (let i = 0; i < cities.length; i += BATCH) {
    await prisma.city.createMany({ data: cities.slice(i, i + BATCH) })
    process.stdout.write(`\r  ${Math.min(i + BATCH, cities.length)} / ${cities.length}`)
  }
  console.log()

  // ── 3. Regional Pricing ───────────────────────────────────────────────────
  await seedRegionalPricing()

  console.log('\nSeed completed successfully.')
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
