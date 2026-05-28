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

interface IbgeMunicipio {
  id: number
  nome: string
  microrregiao: { mesorregiao: { UF: { sigla: string } } } | null
}

async function main() {
  // ── 1. States ──────────────────────────────────────────────────────────────
  console.log('Seeding states...')
  await prisma.city.deleteMany()   // must delete cities first (relation)
  await prisma.state.deleteMany()
  await prisma.state.createMany({ data: STATES })

  const stateMap = new Map(
    (await prisma.state.findMany({ select: { id: true, uf: true } }))
      .map((s) => [s.uf, s.id]),
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

  console.log('Clearing existing cities (if any remain)...')
  await prisma.city.deleteMany()

  console.log('Inserting cities in batches...')
  const BATCH = 500
  for (let i = 0; i < cities.length; i += BATCH) {
    await prisma.city.createMany({ data: cities.slice(i, i + BATCH) })
    process.stdout.write(`\r  ${Math.min(i + BATCH, cities.length)} / ${cities.length}`)
  }

  console.log('\nDone.')
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
