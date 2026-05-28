import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

interface IbgeMunicipio {
  id: number
  nome: string
  microrregiao: {
    mesorregiao: {
      UF: {
        sigla: string
      }
    }
  }
}

async function main() {
  console.log('Fetching cities from IBGE...')

  const res = await fetch(
    'https://servicodados.ibge.gov.br/api/v1/localidades/municipios?orderBy=nome',
  )

  if (!res.ok) throw new Error(`IBGE API error: ${res.status}`)

  const municipios: IbgeMunicipio[] = await res.json()
  console.log(`${municipios.length} cities fetched.`)

  const cities = municipios
    .map((m) => ({
      ibgeCode: m.id,
      name: m.nome,
      state: m.microrregiao?.mesorregiao?.UF?.sigla ?? null,
    }))
    .filter((c): c is { ibgeCode: number; name: string; state: string } => c.state !== null)

  console.log('Clearing existing cities...')
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
