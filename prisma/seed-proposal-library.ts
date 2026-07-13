/**
 * seed-proposal-library.ts
 *
 * Creates the platform-default Proposal Builder content library
 * (workspaceId: null rows) so new workspaces aren't empty on day one.
 *
 * Sections/templates/narratives are create-if-missing (matched by key/name).
 * Blocks are upserted (matched by sectionKey+name) — content and scoring tags
 * get refreshed on every run, so re-running after editing the BLOCKS array
 * below propagates the changes instead of being silently skipped.
 *
 * Usage:
 *   npx tsx prisma/seed-proposal-library.ts
 */

import { PrismaClient } from "@prisma/client"
import type { ProjectTypeCategory, InvestmentTier, NarrativeProfile } from "@/types/proposal-advisor"

const prisma = new PrismaClient()

const SYSTEM_USER_EMAIL = "system-library@archflow.internal"

const SECTIONS = [
  { key: "executive-summary", name: "Resumo Executivo", order: 0 },
  { key: "diagnosis",         name: "Diagnóstico",       order: 1 },
  { key: "opportunities",     name: "Oportunidades",     order: 2 },
  { key: "strategy",          name: "Estratégia",        order: 3 },
  { key: "closing",           name: "Fechamento",        order: 4 },
]

// Fase 2.0 — Etapa 6: sections that exist ONLY to receive migrated content
// from legacy generatedProposalJson proposals (fields like "objectives" or
// "investment" that don't map cleanly onto the 5 curated sections above).
// Deliberately excluded from SECTION_FLOW below — the AI advisor must never
// recommend these for a NEW proposal, only the legacy migrator creates
// instances against them.
const MIGRATION_ONLY_SECTIONS = [
  { key: "client-understanding",   name: "Entendimento das Necessidades", order: 5 },
  { key: "architectural-direction", name: "Direção Arquitetônica",         order: 6 },
  { key: "objectives",             name: "Objetivos do Projeto",          order: 7 },
  { key: "scope",                  name: "Escopo do Projeto",             order: 8 },
  { key: "stages-timeline",        name: "Etapas e Cronograma",           order: 9 },
  { key: "investment",             name: "Investimento",                  order: 10 },
  { key: "differentials",          name: "Diferenciais",                  order: 11 },
  { key: "risks",                  name: "Pontos de Atenção",             order: 12 },
]

// Proposal Experience v2 (Fase A): the fixed 12-page premium sales narrative.
// Keys are prefixed "premium-" because "closing"/"client-understanding"/
// "scope"/"investment" already exist above as curated/migration-only rows —
// the @@unique([workspaceId, key]) constraint would otherwise silently point
// the new flow at the wrong catalog rows. isPremiumFlowOnly keeps them out of
// the advisor and the manual "Adicionar seção" picker — only the premium
// initialize() path creates instances against them, always all 12 at once.
const PREMIUM_NARRATIVE_SECTIONS = [
  { key: "premium-cover",                name: "Capa",                            order: 20 },
  { key: "premium-welcome",              name: "Mensagem de Boas-Vindas",         order: 21 },
  { key: "premium-client-understanding", name: "O Que Entendemos do Seu Projeto", order: 22 },
  { key: "premium-solution",             name: "Nossa Solução",                   order: 23 },
  { key: "premium-scope",                name: "Escopo de Serviços",              order: 24 },
  { key: "premium-process",              name: "Como Funciona Nosso Processo",    order: 25 },
  { key: "premium-schedule",             name: "Cronograma",                      order: 26 },
  { key: "premium-deliverables",         name: "Entregáveis",                     order: 27 },
  { key: "premium-investment",           name: "Investimento",                    order: 28 },
  { key: "premium-exclusions",           name: "O Que Não Está Incluído",         order: 29 },
  { key: "premium-next-steps",           name: "Próximos Passos",                 order: 30 },
  { key: "premium-closing",              name: "Encerramento",                    order: 31 },
]

interface SeedBlock {
  sectionKey: string
  name: string
  variantLabel: string
  content: string
  toneTags: string[]
  projectTypeTags: ProjectTypeCategory[]
  investmentTags: InvestmentTier[]
  narrativeProfileTags: NarrativeProfile[]
  keywords: string[]
}

const BLOCKS: SeedBlock[] = [
  // ─── Resumo Executivo ───────────────────────────────────────────────────
  {
    sectionKey: "executive-summary", name: "Executive Compact", variantLabel: "Compact",
    content: "Este projeto consolida, em poucas páginas, o essencial: objetivo, escopo e investimento. Direto ao ponto, para clientes que valorizam clareza e agilidade na decisão.",
    toneTags: ["commercial", "residential"],
    projectTypeTags: ["RESIDENTIAL_COMPACT", "RETROFIT"], investmentTags: ["LOW", "MID"],
    narrativeProfileTags: ["CONSULTIVE"], keywords: ["rápido", "direto", "objetivo", "clareza"],
  },
  {
    sectionKey: "executive-summary", name: "Executive Premium", variantLabel: "Premium",
    content: "Apresentamos uma proposta pensada para traduzir, com precisão, a visão deste projeto em um caminho claro de execução — unindo identidade, funcionalidade e investimento em uma única narrativa coerente.",
    toneTags: ["residential", "interiors"],
    projectTypeTags: ["RESIDENTIAL_PREMIUM", "RESIDENTIAL_STANDARD"], investmentTags: ["HIGH", "PREMIUM"],
    narrativeProfileTags: ["PREMIUM", "CONSULTIVE"], keywords: ["identidade", "sofisticação"],
  },
  {
    sectionKey: "executive-summary", name: "Executive Luxury", variantLabel: "Luxury",
    content: "Cada projeto que assinamos nasce de uma escuta atenta e de uma curadoria rigorosa. Esta proposta é o primeiro gesto de um processo autoral, pensado exclusivamente para este cliente e para este lugar.",
    toneTags: ["luxury"],
    projectTypeTags: ["RESIDENTIAL_PREMIUM"], investmentTags: ["PREMIUM"],
    narrativeProfileTags: ["PREMIUM"], keywords: ["exclusivo", "autoral", "curadoria"],
  },
  {
    sectionKey: "executive-summary", name: "Executive Corporate", variantLabel: "Corporate",
    content: "Esta proposta apresenta o escopo, os entregáveis e o cronograma de execução, com foco em retorno sobre o investimento, eficiência operacional e fortalecimento da imagem institucional.",
    toneTags: ["commercial"],
    projectTypeTags: ["CORPORATE", "COMMERCIAL"], investmentTags: ["MID", "HIGH", "PREMIUM"],
    narrativeProfileTags: ["CORPORATE"], keywords: ["roi", "institucional", "eficiência operacional"],
  },
  {
    sectionKey: "executive-summary", name: "Executive Consultive", variantLabel: "Consultive",
    content: "Com base no que foi levantado em nossa conversa, organizamos esta proposta como um plano de trabalho conjunto — destacando onde podemos agregar mais valor e como pretendemos conduzir cada etapa.",
    toneTags: ["residential", "commercial"],
    projectTypeTags: ["RESIDENTIAL_STANDARD", "RESIDENTIAL_COMPACT", "RETROFIT", "CUSTOM"], investmentTags: ["LOW", "MID"],
    narrativeProfileTags: ["CONSULTIVE"], keywords: ["conjunto", "plano de trabalho"],
  },

  // ─── Diagnóstico ────────────────────────────────────────────────────────
  {
    sectionKey: "diagnosis", name: "Integração de Ambientes", variantLabel: "Integração",
    content: "Identificamos oportunidades claras de integração entre os ambientes, eliminando barreiras visuais e físicas que hoje fragmentam a experiência de uso do espaço.",
    toneTags: ["residential", "interiors"],
    projectTypeTags: ["RESIDENTIAL_STANDARD", "RESIDENTIAL_PREMIUM"], investmentTags: ["MID", "HIGH"],
    narrativeProfileTags: ["CONSULTIVE", "EMOTIONAL"], keywords: ["integração", "ambientes integrados", "unir espaços"],
  },
  {
    sectionKey: "diagnosis", name: "Iluminação Natural", variantLabel: "Iluminação",
    content: "O aproveitamento atual da luz natural está abaixo do potencial do espaço — há janelas e aberturas subutilizadas que podem transformar a percepção de amplitude e bem-estar.",
    toneTags: ["residential", "interiors", "landscape"],
    projectTypeTags: ["RESIDENTIAL_COMPACT", "RESIDENTIAL_STANDARD", "INTERIOR_DESIGN"], investmentTags: ["LOW", "MID", "HIGH"],
    narrativeProfileTags: ["EMOTIONAL", "CONSULTIVE"], keywords: ["luz natural", "iluminação", "amplitude", "amplo", "claridade"],
  },
  {
    sectionKey: "diagnosis", name: "Fluxos de Circulação", variantLabel: "Circulação",
    content: "Os fluxos de circulação atuais geram cruzamentos e gargalos que afetam a fluidez do dia a dia — um ponto central a ser resolvido nesta nova proposta espacial.",
    toneTags: ["commercial", "residential"],
    projectTypeTags: ["COMMERCIAL", "CORPORATE", "RETAIL", "RESIDENTIAL_STANDARD"], investmentTags: ["MID", "HIGH"],
    narrativeProfileTags: ["CORPORATE", "CONSULTIVE"], keywords: ["circulação", "fluxo", "cruzamento", "gargalo"],
  },
  {
    sectionKey: "diagnosis", name: "Armazenamento", variantLabel: "Armazenamento",
    content: "A capacidade de armazenamento hoje não acompanha a rotina real de uso do espaço, gerando acúmulo visual e perda de funcionalidade nos ambientes principais.",
    toneTags: ["residential"],
    projectTypeTags: ["RESIDENTIAL_COMPACT", "RESIDENTIAL_STANDARD"], investmentTags: ["LOW", "MID"],
    narrativeProfileTags: ["CONSULTIVE"], keywords: ["armazenamento", "armário", "organização"],
  },
  {
    sectionKey: "diagnosis", name: "Home Office", variantLabel: "Home Office",
    content: "O espaço dedicado ao trabalho remoto ainda não possui a ergonomia, a acústica e a separação visual necessárias para sustentar produtividade e foco no dia a dia.",
    toneTags: ["residential"],
    projectTypeTags: ["RESIDENTIAL_STANDARD", "RESIDENTIAL_PREMIUM", "INTERIOR_DESIGN"], investmentTags: ["MID", "HIGH"],
    narrativeProfileTags: ["CONSULTIVE", "EMOTIONAL"], keywords: ["home office", "trabalho remoto", "escritório em casa"],
  },
  {
    sectionKey: "diagnosis", name: "Valorização Imobiliária", variantLabel: "Valorização",
    content: "As intervenções propostas têm potencial direto de valorização do imóvel, ao corrigir os pontos que hoje mais pesam negativamente na percepção de qualidade do espaço.",
    toneTags: ["commercial", "residential"],
    projectTypeTags: ["RESIDENTIAL_STANDARD", "RESIDENTIAL_PREMIUM", "RETROFIT"], investmentTags: ["MID", "HIGH", "PREMIUM"],
    narrativeProfileTags: ["CONSULTIVE", "CORPORATE"], keywords: ["valorização", "investimento imobiliário", "retorno"],
  },
  {
    sectionKey: "diagnosis", name: "Experiência do Usuário", variantLabel: "Experiência",
    content: "Observamos que a experiência cotidiana de quem usa o espaço é hoje limitada por decisões de layout que não acompanharam a evolução da rotina dos moradores/usuários.",
    toneTags: ["residential", "interiors"],
    projectTypeTags: ["INTERIOR_DESIGN", "RESIDENTIAL_PREMIUM"], investmentTags: ["MID", "HIGH"],
    narrativeProfileTags: ["EMOTIONAL"], keywords: ["experiência", "rotina", "cotidiano"],
  },
  {
    sectionKey: "diagnosis", name: "Conforto Ambiental", variantLabel: "Conforto",
    content: "Conforto térmico e acústico aparecem como pontos de atenção recorrentes — fatores que impactam diretamente a qualidade de vida e o bem-estar no espaço.",
    toneTags: ["residential", "landscape"],
    projectTypeTags: ["RESIDENTIAL_STANDARD", "RESIDENTIAL_PREMIUM"], investmentTags: ["MID", "HIGH", "PREMIUM"],
    narrativeProfileTags: ["EMOTIONAL", "CONSULTIVE"], keywords: ["conforto térmico", "conforto acústico", "bem-estar"],
  },

  // ─── Oportunidades ──────────────────────────────────────────────────────
  {
    sectionKey: "opportunities", name: "Ampliação Visual", variantLabel: "Ampliação Visual",
    content: "Há uma oportunidade concreta de ampliar a percepção de espaço através de aberturas estratégicas, espelhos e continuidade visual entre ambientes.",
    toneTags: ["residential", "interiors"],
    projectTypeTags: ["RESIDENTIAL_COMPACT", "INTERIOR_DESIGN"], investmentTags: ["LOW", "MID"],
    narrativeProfileTags: ["EMOTIONAL", "CONSULTIVE"], keywords: ["amplitude visual", "amplo", "sensação de espaço"],
  },
  {
    sectionKey: "opportunities", name: "Integração Social", variantLabel: "Integração Social",
    content: "A reconfiguração proposta favorece momentos de convívio, aproximando cozinha, sala e área externa em um único fluxo social contínuo.",
    toneTags: ["residential"],
    projectTypeTags: ["RESIDENTIAL_STANDARD", "RESIDENTIAL_PREMIUM"], investmentTags: ["MID", "HIGH"],
    narrativeProfileTags: ["EMOTIONAL"], keywords: ["convívio", "social", "família"],
  },
  {
    sectionKey: "opportunities", name: "Eficiência Funcional", variantLabel: "Eficiência",
    content: "Cada metro quadrado pode ganhar mais função com pequenos ajustes de layout — uma oportunidade de eficiência sem necessidade de grandes intervenções estruturais.",
    toneTags: ["commercial", "residential"],
    projectTypeTags: ["COMMERCIAL", "CORPORATE", "RETAIL", "RESIDENTIAL_COMPACT"], investmentTags: ["LOW", "MID"],
    narrativeProfileTags: ["CORPORATE", "CONSULTIVE"], keywords: ["eficiência", "funcional", "produtividade"],
  },
  {
    sectionKey: "opportunities", name: "Flexibilidade dos Espaços", variantLabel: "Flexibilidade",
    content: "Existe espaço para criar ambientes mais flexíveis, capazes de se adaptar a diferentes usos ao longo do dia e das fases de vida de quem ocupa o imóvel.",
    toneTags: ["residential", "commercial"],
    projectTypeTags: ["RESIDENTIAL_STANDARD", "COMMERCIAL", "CORPORATE"], investmentTags: ["MID", "HIGH"],
    narrativeProfileTags: ["CONSULTIVE", "CORPORATE"], keywords: ["flexível", "adaptável", "multiuso"],
  },
  {
    sectionKey: "opportunities", name: "Aproveitamento de Luz Natural", variantLabel: "Luz Natural",
    content: "O reposicionamento de aberturas e a escolha de materiais translúcidos podem multiplicar o aproveitamento de luz natural ao longo do dia.",
    toneTags: ["residential", "landscape"],
    projectTypeTags: ["RESIDENTIAL_COMPACT", "RESIDENTIAL_STANDARD", "INTERIOR_DESIGN"], investmentTags: ["LOW", "MID", "HIGH"],
    narrativeProfileTags: ["EMOTIONAL"], keywords: ["luz natural", "janelas", "translúcido"],
  },
  {
    sectionKey: "opportunities", name: "Otimização de Layout", variantLabel: "Layout",
    content: "Uma reorganização pontual do layout resolve os principais atritos de uso identificados, sem comprometer o orçamento ou o cronograma da obra.",
    toneTags: ["commercial", "residential"],
    projectTypeTags: ["RESIDENTIAL_COMPACT", "COMMERCIAL", "RETROFIT"], investmentTags: ["LOW", "MID"],
    narrativeProfileTags: ["CONSULTIVE", "CORPORATE"], keywords: ["layout", "reorganização", "otimização"],
  },

  // ─── Estratégia ─────────────────────────────────────────────────────────
  {
    sectionKey: "strategy", name: "Minimalista", variantLabel: "Minimalista",
    content: "A estratégia projetual parte do princípio de que menos é mais: poucos materiais, paleta neutra e cada elemento justificado por sua função.",
    toneTags: ["residential", "interiors"],
    projectTypeTags: ["RESIDENTIAL_STANDARD", "INTERIOR_DESIGN"], investmentTags: ["MID", "HIGH"],
    narrativeProfileTags: ["CONSULTIVE"], keywords: ["minimalista", "clean", "simplicidade"],
  },
  {
    sectionKey: "strategy", name: "Contemporânea", variantLabel: "Contemporânea",
    content: "Propomos uma linguagem contemporânea, que dialoga com referências atuais sem abandonar a identidade já existente do espaço.",
    toneTags: ["residential", "interiors"],
    projectTypeTags: ["RESIDENTIAL_STANDARD", "RESIDENTIAL_PREMIUM", "INTERIOR_DESIGN"], investmentTags: ["MID", "HIGH"],
    narrativeProfileTags: ["CONSULTIVE", "EMOTIONAL"], keywords: ["contemporâneo", "atual", "moderno"],
  },
  {
    sectionKey: "strategy", name: "Funcional", variantLabel: "Funcional",
    content: "A estratégia prioriza a funcionalidade acima de tudo: cada decisão de projeto resolve um problema real identificado no diagnóstico.",
    toneTags: ["commercial", "residential"],
    projectTypeTags: ["COMMERCIAL", "CORPORATE", "RETAIL", "RESIDENTIAL_COMPACT"], investmentTags: ["LOW", "MID"],
    narrativeProfileTags: ["CORPORATE", "CONSULTIVE"], keywords: ["funcional", "prático"],
  },
  {
    sectionKey: "strategy", name: "Biofílica", variantLabel: "Biofílica",
    content: "Trazemos elementos naturais — vegetação, materiais brutos e luz natural — para o centro da estratégia, reconectando o espaço construído ao ambiente natural.",
    toneTags: ["landscape", "residential"],
    projectTypeTags: ["RESIDENTIAL_PREMIUM", "RETROFIT", "CUSTOM"], investmentTags: ["MID", "HIGH", "PREMIUM"],
    narrativeProfileTags: ["EMOTIONAL"], keywords: ["biofilia", "natureza", "vegetação", "sustentável"],
  },
  {
    sectionKey: "strategy", name: "Premium", variantLabel: "Premium",
    content: "A estratégia combina materiais de alta qualidade e acabamentos refinados, elevando a percepção de valor do espaço sem perder coerência com seu uso real.",
    toneTags: ["residential", "luxury"],
    projectTypeTags: ["RESIDENTIAL_PREMIUM", "INTERIOR_DESIGN"], investmentTags: ["HIGH", "PREMIUM"],
    narrativeProfileTags: ["PREMIUM"], keywords: ["premium", "refinado", "materiais nobres"],
  },
  {
    sectionKey: "strategy", name: "Corporativa", variantLabel: "Corporativa",
    content: "A estratégia projetual reforça a identidade institucional da marca, criando ambientes que comunicam solidez, profissionalismo e atenção ao detalhe.",
    toneTags: ["commercial"],
    projectTypeTags: ["CORPORATE", "COMMERCIAL"], investmentTags: ["MID", "HIGH", "PREMIUM"],
    narrativeProfileTags: ["CORPORATE", "INSTITUTIONAL"], keywords: ["institucional", "marca", "solidez"],
  },
  {
    sectionKey: "strategy", name: "Compact Living", variantLabel: "Compact Living",
    content: "Para espaços compactos, a estratégia foca em mobiliário multifuncional, soluções embutidas e uso inteligente de cada centímetro disponível.",
    toneTags: ["residential"],
    projectTypeTags: ["RESIDENTIAL_COMPACT"], investmentTags: ["LOW", "MID"],
    narrativeProfileTags: ["CONSULTIVE"], keywords: ["compacto", "multifuncional", "pequenos espaços"],
  },
  {
    sectionKey: "strategy", name: "Alto Padrão", variantLabel: "Alto Padrão",
    content: "A estratégia é construída sob medida, com curadoria de materiais nobres e atenção artesanal a cada detalhe — um projeto autoral, pensado para durar.",
    toneTags: ["luxury"],
    projectTypeTags: ["RESIDENTIAL_PREMIUM"], investmentTags: ["PREMIUM"],
    narrativeProfileTags: ["PREMIUM"], keywords: ["alto padrão", "sob medida", "autoral"],
  },

  // ─── Fechamento ─────────────────────────────────────────────────────────
  {
    sectionKey: "closing", name: "Consultivo", variantLabel: "Consultivo",
    content: "Estamos à disposição para esclarecer qualquer ponto desta proposta e ajustar o que for necessário para que o projeto reflita exatamente o que você precisa.",
    toneTags: ["residential", "commercial"],
    projectTypeTags: ["RESIDENTIAL_COMPACT", "RESIDENTIAL_STANDARD", "RETROFIT", "CUSTOM"], investmentTags: ["LOW", "MID", "HIGH"],
    narrativeProfileTags: ["CONSULTIVE"], keywords: [],
  },
  {
    sectionKey: "closing", name: "Premium", variantLabel: "Premium",
    content: "Seguimos confiantes de que este é o início de um projeto que vai muito além da reforma ou construção — é a criação de um espaço que conta a sua história.",
    toneTags: ["residential", "interiors"],
    projectTypeTags: ["RESIDENTIAL_PREMIUM", "INTERIOR_DESIGN"], investmentTags: ["HIGH", "PREMIUM"],
    narrativeProfileTags: ["PREMIUM"], keywords: [],
  },
  {
    sectionKey: "closing", name: "Emocional", variantLabel: "Emocional",
    content: "Mais do que metros quadrados, este projeto é sobre o lugar onde você vai viver os próximos capítulos da sua vida — e é com esse cuidado que vamos conduzi-lo.",
    toneTags: ["residential"],
    projectTypeTags: ["RESIDENTIAL_STANDARD", "RESIDENTIAL_PREMIUM", "INTERIOR_DESIGN"], investmentTags: ["MID", "HIGH"],
    narrativeProfileTags: ["EMOTIONAL"], keywords: [],
  },
  {
    sectionKey: "closing", name: "Corporativo", variantLabel: "Corporativo",
    content: "Reforçamos nosso compromisso com prazo, qualidade e transparência ao longo de toda a execução, e seguimos disponíveis para avançar com os próximos passos.",
    toneTags: ["commercial"],
    projectTypeTags: ["COMMERCIAL", "CORPORATE", "RETAIL"], investmentTags: ["MID", "HIGH", "PREMIUM"],
    narrativeProfileTags: ["CORPORATE"], keywords: [],
  },
  {
    sectionKey: "closing", name: "Institucional", variantLabel: "Institucional",
    content: "Agradecemos a confiança em nosso escritório para este projeto e reiteramos nosso compromisso com excelência técnica e atendimento próximo em cada etapa.",
    toneTags: ["commercial", "residential"],
    projectTypeTags: ["COMMERCIAL", "CORPORATE", "RETAIL"], investmentTags: ["MID", "HIGH", "PREMIUM"],
    narrativeProfileTags: ["INSTITUTIONAL"], keywords: [],
  },
]

const TEMPLATES = [
  { name: "Editorial", skin: "EDITORIAL", description: "Muito espaço em branco, tipografia elegante, foco em narrativa. Inspirado em Kinfolk, Monocle, Dezeen." },
  { name: "Minimal",   skin: "MINIMAL",   description: "Grids limpos, preto e branco, sofisticação. Inspirado em Foster + Partners." },
  { name: "Premium",   skin: "PREMIUM",   description: "Destaque para valor percebido, forte hierarquia visual. Inspirado em Studio MK27, Triptyque." },
  { name: "Corporate", skin: "CORPORATE", description: "Foco estratégico e executivo. Inspirado em Gensler, SOM." },
  { name: "Luxury",    skin: "LUXURY",    description: "Visual aspiracional, narrativa emocional, para escritórios de alto padrão." },
] as const

const NARRATIVES = [
  { name: "Residencial",  toneKey: "residential", description: "Tom caloroso, humano e inspirador — para projetos residenciais." },
  { name: "Comercial",    toneKey: "commercial",  description: "Tom estratégico, objetivo e orientado a resultados — para projetos comerciais/corporativos." },
  { name: "Alto Padrão",  toneKey: "luxury",       description: "Tom sofisticado, aspiracional e exclusivo — para projetos de alto padrão." },
  { name: "Interiores",   toneKey: "interiors",   description: "Tom pessoal e sensorial — para projetos de design de interiores." },
  { name: "Paisagismo",   toneKey: "landscape",   description: "Tom que conecta arquitetura e natureza — para projetos de paisagismo." },
] as const

const SECTION_FLOW = SECTIONS.map((s) => s.key)

async function getOrCreateSystemUser() {
  const existing = await prisma.user.findUnique({ where: { email: SYSTEM_USER_EMAIL } })
  if (existing) return existing
  return prisma.user.create({
    data: {
      name:     "ArchFlow Library",
      email:    SYSTEM_USER_EMAIL,
      provider: "system",
      role:     "ADMIN",
    },
  })
}

async function main() {
  const systemUser = await getOrCreateSystemUser()
  console.log(`System library user: ${systemUser.id}`)

  let sectionsCreated = 0
  for (const section of SECTIONS) {
    const existing = await prisma.proposalSection.findFirst({ where: { workspaceId: null, key: section.key } })
    if (existing) continue
    await prisma.proposalSection.create({ data: { ...section, userId: systemUser.id, workspaceId: null } })
    sectionsCreated++
  }
  for (const section of MIGRATION_ONLY_SECTIONS) {
    const existing = await prisma.proposalSection.findFirst({ where: { workspaceId: null, key: section.key } })
    if (existing) {
      if (!existing.isMigrationOnly) await prisma.proposalSection.update({ where: { id: existing.id }, data: { isMigrationOnly: true } })
      continue
    }
    await prisma.proposalSection.create({ data: { ...section, userId: systemUser.id, workspaceId: null, isMigrationOnly: true } })
    sectionsCreated++
  }
  for (const section of PREMIUM_NARRATIVE_SECTIONS) {
    const existing = await prisma.proposalSection.findFirst({ where: { workspaceId: null, key: section.key } })
    if (existing) {
      if (!existing.isPremiumFlowOnly) await prisma.proposalSection.update({ where: { id: existing.id }, data: { isPremiumFlowOnly: true } })
      continue
    }
    await prisma.proposalSection.create({ data: { ...section, userId: systemUser.id, workspaceId: null, isPremiumFlowOnly: true } })
    sectionsCreated++
  }

  let blocksCreated = 0
  let blocksUpdated = 0
  for (const block of BLOCKS) {
    const existing = await prisma.proposalBlock.findFirst({
      where: { workspaceId: null, sectionKey: block.sectionKey, name: block.name },
    })
    if (existing) {
      await prisma.proposalBlock.update({
        where: { id: existing.id },
        data: {
          content:              block.content,
          variantLabel:         block.variantLabel,
          toneTags:             block.toneTags,
          projectTypeTags:      block.projectTypeTags,
          investmentTags:       block.investmentTags,
          narrativeProfileTags: block.narrativeProfileTags,
          keywords:             block.keywords,
        },
      })
      blocksUpdated++
      continue
    }
    await prisma.proposalBlock.create({ data: { ...block, userId: systemUser.id, workspaceId: null } })
    blocksCreated++
  }

  let templatesCreated = 0
  for (const template of TEMPLATES) {
    const existing = await prisma.proposalTemplate.findFirst({ where: { workspaceId: null, name: template.name } })
    if (existing) continue
    await prisma.proposalTemplate.create({
      data: {
        name:              template.name,
        description:       template.description,
        skin:              template.skin,
        sectionOrder:      SECTION_FLOW,
        userId:            systemUser.id,
        workspaceId:       null,
        isPlatformDefault: true,
      },
    })
    templatesCreated++
  }

  let narrativesCreated = 0
  for (const narrative of NARRATIVES) {
    const existing = await prisma.proposalNarrative.findFirst({ where: { workspaceId: null, name: narrative.name } })
    if (existing) continue
    await prisma.proposalNarrative.create({
      data: {
        name:        narrative.name,
        description: narrative.description,
        toneKey:     narrative.toneKey,
        sectionFlow: SECTION_FLOW,
        userId:      systemUser.id,
        workspaceId: null,
      },
    })
    narrativesCreated++
  }

  // Documentational only — the premium initialize() path hardcodes the fixed
  // 12-section order in code (types/proposal-premium-narrative.ts); editing
  // this row does NOT change generation. It exists so the catalog is
  // self-documenting and a future template picker has something to point at.
  const premiumNarrativeName = "Premium Narrativo (12 páginas)"
  const existingPremiumNarrative = await prisma.proposalNarrative.findFirst({
    where: { workspaceId: null, name: premiumNarrativeName },
  })
  if (!existingPremiumNarrative) {
    await prisma.proposalNarrative.create({
      data: {
        name:        premiumNarrativeName,
        description: "Fluxo fixo de 12 páginas — sempre completo, sem seleção manual de seções.",
        toneKey:     "residential",
        sectionFlow: PREMIUM_NARRATIVE_SECTIONS.map((s) => s.key),
        userId:      systemUser.id,
        workspaceId: null,
      },
    })
    narrativesCreated++
  }

  console.log(`Sections created:   ${sectionsCreated}/${SECTIONS.length + MIGRATION_ONLY_SECTIONS.length + PREMIUM_NARRATIVE_SECTIONS.length}`)
  console.log(`Blocks created:     ${blocksCreated}, updated: ${blocksUpdated} (of ${BLOCKS.length})`)
  console.log(`Templates created:  ${templatesCreated}/${TEMPLATES.length}`)
  console.log(`Narratives created: ${narrativesCreated}/${NARRATIVES.length}`)
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
