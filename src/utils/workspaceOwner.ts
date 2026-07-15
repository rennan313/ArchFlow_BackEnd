import { prisma } from "@/lib/prisma"

export interface OwnerContact {
  name:  string
  email: string
}

// Resolves the workspace OWNER's name+email — the billing notification
// recipient. Neutral location so both the billing module (checkout/webhook) and
// subscription.service (trial emails) can share it without a module cycle.
// Falls back to any member if no explicit OWNER row exists (legacy data).
export async function resolveOwnerContact(workspaceId: string): Promise<OwnerContact | null> {
  const owner = await prisma.user.findFirst({
    where:   { workspaceId, workspaceRole: "OWNER" },
    select:  { name: true, email: true },
    orderBy: { createdAt: "asc" },
  })
  if (owner?.email) return { name: owner.name, email: owner.email }

  const any = await prisma.user.findFirst({
    where:  { workspaceId },
    select: { name: true, email: true },
  })
  return any?.email ? { name: any.name, email: any.email } : null
}
