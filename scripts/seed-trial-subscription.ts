import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
  const email = process.argv[2] ?? 'rennan313@yahoo.com'
  const user = await prisma.user.findUnique({ where: { email } })
  if (!user?.workspaceId) throw new Error('User/workspace not found')

  const now = new Date()
  const trialEndsAt = new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000)

  await prisma.subscription.upsert({
    where:  { workspaceId: user.workspaceId },
    update: { status: 'TRIALING', trialEndsAt },
    create: {
      workspaceId: user.workspaceId,
      plan: 'STARTER', status: 'TRIALING', billingCycle: 'MONTHLY',
      trialEndsAt, currentPeriodStart: now, currentPeriodEnd: trialEndsAt,
    },
  })
  console.log('Trial subscription set, ends', trialEndsAt.toISOString())
}
main().catch((e) => { console.error(e); process.exit(1) }).finally(() => prisma.$disconnect())
