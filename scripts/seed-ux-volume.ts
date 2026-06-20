/**
 * One-off seed for UX volume validation (50 clients / 30 projects / 100 proposals /
 * 20 meetings / 10 users) inside the current dev workspace. Not wired into
 * `db:seed` — run manually with `npx tsx scripts/seed-ux-volume.ts` and remove
 * the data afterwards with `npx tsx scripts/seed-ux-volume.ts --undo`.
 */
import { PrismaClient, ClientStatus, ProjectStatus, ProjectType, ProposalStatus, WorkspaceRole, MeetingPurpose, MeetingEntryStatus } from '@prisma/client'

const prisma = new PrismaClient()
const OWNER_EMAIL = process.argv[2] ?? 'rennanxt300@gmail.com'
const TAG = 'UXVOL-' // marker prefix so seeded rows can be found/removed later

const FIRST_NAMES = ['Ana', 'Bruno', 'Carla', 'Diego', 'Elaine', 'Fábio', 'Gabriela', 'Henrique', 'Isabela', 'João', 'Karina', 'Lucas', 'Marina', 'Nuno', 'Olívia', 'Paulo', 'Quésia', 'Rafael', 'Sofia', 'Tiago', 'Úrsula', 'Vitor', 'Wesley', 'Ximena', 'Yara', 'Zeca']
const LAST_NAMES  = ['Almeida', 'Barros', 'Castro', 'Duarte', 'Esteves', 'Farias', 'Gomes', 'Henriques', 'Ibrahim', 'Junqueira', 'Kogut', 'Lacerda', 'Maciel', 'Nogueira', 'Oliveira', 'Pereira', 'Quaresma', 'Ramos', 'Siqueira', 'Teixeira']
const COMPANIES   = ['', '', '', 'Studio Vértice', 'Construtora Bravim', 'Grupo Altana', 'Incorporadora Lumiar', 'Atelier Cedro', 'RM Empreendimentos', 'Casa Nova Arquitetura']
const CITIES: { city: string; state: string }[] = [
  { city: 'São Paulo', state: 'SP' }, { city: 'Campinas', state: 'SP' }, { city: 'Rio de Janeiro', state: 'RJ' },
  { city: 'Niterói', state: 'RJ' }, { city: 'Belo Horizonte', state: 'MG' }, { city: 'Curitiba', state: 'PR' },
  { city: 'Porto Alegre', state: 'RS' }, { city: 'Florianópolis', state: 'SC' }, { city: 'Salvador', state: 'BA' },
  { city: 'Brasília', state: 'DF' }, { city: 'Recife', state: 'PE' }, { city: 'Goiânia', state: 'GO' },
]
const PROJECT_TYPES: ProjectType[]    = ['RESIDENTIAL', 'COMMERCIAL', 'RENOVATION', 'INTERIOR', 'URBAN', 'LANDSCAPE']
const PROJECT_TYPE_LABEL: Record<ProjectType, string> = {
  RESIDENTIAL: 'Residencial', COMMERCIAL: 'Comercial', RENOVATION: 'Reforma',
  INTERIOR: 'Interiores', URBAN: 'Urbanismo', LANDSCAPE: 'Paisagismo',
}
const STYLES = ['Minimalista', 'Contemporâneo', 'Industrial', 'Clássico', 'Biofílico', 'Brutalista']
const CLIENT_STATUSES: ClientStatus[]   = ['LEAD', 'NEGOTIATION', 'ACTIVE', 'INACTIVE']
const PROJECT_STATUSES: ProjectStatus[] = ['BRIEFING', 'IN_PROGRESS', 'REVIEW', 'COMPLETED', 'ON_HOLD', 'CANCELLED']
const PROPOSAL_STATUSES: ProposalStatus[] = ['DRAFT', 'REVIEW', 'SENT', 'NEGOTIATION', 'APPROVED', 'REJECTED']
const WORKSPACE_ROLES: WorkspaceRole[]  = ['ADMIN', 'ARCHITECT', 'ARCHITECT', 'DESIGNER', 'ASSISTANT', 'VIEWER']
const MEETING_PURPOSES: MeetingPurpose[] = ['INITIAL_CONTACT', 'DISCOVERY', 'BRIEFING', 'PROPOSAL_REVIEW', 'FOLLOW_UP']
const MEETING_STATUSES: MeetingEntryStatus[] = ['SCHEDULED', 'CONFIRMED', 'COMPLETED', 'CANCELLED', 'NO_SHOW']

function pick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)] }
function int(min: number, max: number) { return Math.floor(Math.random() * (max - min + 1)) + min }
function daysFromNow(min: number, max: number) { return new Date(Date.now() + int(min, max) * 86400000) }

async function undo() {
  console.log('Removing seeded UX-volume data...')
  const ws = await prisma.workspace.findFirst({ where: { users: { some: { email: OWNER_EMAIL } } } })
  if (!ws) { console.log('Workspace not found, nothing to remove.'); return }

  await prisma.meeting.deleteMany({ where: { workspaceId: ws.id, title: { startsWith: TAG } } })
  await prisma.project.deleteMany({ where: { workspaceId: ws.id, name: { startsWith: TAG } } })
  await prisma.proposal.deleteMany({ where: { workspaceId: ws.id, clientName: { startsWith: TAG } } })
  await prisma.client.deleteMany({ where: { workspaceId: ws.id, name: { startsWith: TAG } } })
  await prisma.user.deleteMany({ where: { workspaceId: ws.id, email: { startsWith: 'uxvol-' } } })
  console.log('Done.')
}

async function main() {
  if (process.argv.includes('--undo')) return undo()

  const owner = await prisma.user.findUnique({ where: { email: OWNER_EMAIL } })
  if (!owner) throw new Error(`Owner user ${OWNER_EMAIL} not found — log in once via the app first.`)
  if (!owner.workspaceId) throw new Error('Owner has no workspaceId — complete onboarding first.')
  const workspaceId = owner.workspaceId
  console.log(`Seeding into workspace ${workspaceId} (owner: ${owner.name})`)

  // ── 9 extra users (10 total incl. owner) ──────────────────────────────────
  console.log('Creating 9 users...')
  const userIds: string[] = [owner.id]
  for (let i = 0; i < 9; i++) {
    const first = pick(FIRST_NAMES), last = pick(LAST_NAMES)
    const u = await prisma.user.create({
      data: {
        name: `${first} ${last}`,
        email: `uxvol-${i}-${Date.now()}@archflow.test`,
        provider: 'credentials',
        workspaceId,
        workspaceRole: WORKSPACE_ROLES[i % WORKSPACE_ROLES.length],
        onboardingCompleted: true,
        onboardingStep: 5,
      },
    })
    userIds.push(u.id)
  }

  // ── 50 clients ──────────────────────────────────────────────────────────
  console.log('Creating 50 clients...')
  const clientIds: string[] = []
  for (let i = 0; i < 50; i++) {
    const first = pick(FIRST_NAMES), last = pick(LAST_NAMES)
    const loc = pick(CITIES)
    const c = await prisma.client.create({
      data: {
        userId: pick(userIds),
        workspaceId,
        name: `${TAG}${first} ${last}`,
        email: `${first}.${last}.${i}@cliente.test`.toLowerCase(),
        phone: `(${int(11, 99)}) 9${int(1000, 9999)}-${int(1000, 9999)}`,
        company: pick(COMPANIES) || null,
        city: loc.city,
        state: loc.state,
        status: CLIENT_STATUSES[i % CLIENT_STATUSES.length],
        createdAt: daysFromNow(-180, -1),
      },
    })
    clientIds.push(c.id)
  }

  // ── 100 proposals ───────────────────────────────────────────────────────
  // NOTE: Project.proposalId is an optional @unique field on a non-sparse
  // Mongo index (same documented pitfall as User.supabaseId in this schema —
  // see docs/indexes.md). In practice this means AT MOST ONE Project in the
  // whole collection may have proposalId unset — every project beyond the
  // first would throw P2002 in production too. Worked around here by giving
  // every seeded project its own 1:1 proposal; flagged as a backend finding.
  console.log('Creating 100 proposals...')
  const proposalIds: string[] = []
  for (let i = 0; i < 100; i++) {
    const loc = pick(CITIES)
    const type = pick(PROJECT_TYPES)
    const p = await prisma.proposal.create({
      data: {
        userId: pick(userIds),
        workspaceId,
        clientId: pick(clientIds),
        clientName: `${TAG}Cliente ${i + 1}`,
        projectType: PROJECT_TYPE_LABEL[type],
        squareMeters: int(35, 500),
        city: `${loc.city} — ${loc.state}`,
        state: loc.state,
        style: pick(STYLES),
        scope: 'Projeto arquitetônico completo com acompanhamento de obra.',
        status: PROPOSAL_STATUSES[i % PROPOSAL_STATUSES.length],
        estimatedTotal: int(8000, 180000),
        createdAt: daysFromNow(-90, -1),
        updatedAt: daysFromNow(-30, -1),
      },
    })
    proposalIds.push(p.id)
  }

  // ── 30 projects (each linked 1:1 to a distinct proposal — see note above) ─
  console.log('Creating 30 projects...')
  for (let i = 0; i < 30; i++) {
    const type = pick(PROJECT_TYPES)
    const loc = pick(CITIES)
    await prisma.project.create({
      data: {
        userId: pick(userIds),
        workspaceId,
        clientId: pick(clientIds),
        proposalId: proposalIds[i],
        name: `${TAG}Projeto ${PROJECT_TYPE_LABEL[type]} ${i + 1}`,
        code: `PRJ-${String(i + 1).padStart(3, '0')}`,
        type,
        status: PROJECT_STATUSES[i % PROJECT_STATUSES.length],
        squareMeters: int(40, 600),
        city: loc.city,
        state: loc.state,
        contractValue: int(15000, 450000),
        startDate: daysFromNow(-120, -1),
        estimatedEndDate: daysFromNow(30, 365),
        createdAt: daysFromNow(-120, -1),
      },
    })
  }

  // ── 20 meetings ──────────────────────────────────────────────────────────
  console.log('Creating 20 meetings...')
  for (let i = 0; i < 20; i++) {
    await prisma.meeting.create({
      data: {
        userId: pick(userIds),
        workspaceId,
        clientId: pick(clientIds),
        title: `${TAG}Reunião ${i + 1}`,
        type: pick(MEETING_PURPOSES),
        status: MEETING_STATUSES[i % MEETING_STATUSES.length],
        scheduledAt: daysFromNow(-10, 30),
        duration: pick([30, 45, 60, 90]),
        location: pick(['Escritório', 'Google Meet', 'Obra', 'Cliente']),
      },
    })
  }

  console.log('\nSeed completed: 9 users, 50 clients, 30 projects, 100 proposals, 20 meetings.')
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
