import { type NextRequest } from "next/server"
import { withAuth } from "@/middlewares/auth"
import { prisma } from "@/lib/prisma"
import { PLAN_LIMITS, PLAN_LABELS } from "@/config/plans"
import { ok, badRequest, forbidden } from "@/lib/response"
import { handleServiceError } from "@/utils/serviceError"
import { withRole } from "@/middlewares/rbac"
import type { JwtPayload } from "@/lib/jwt"
import { z } from "zod"

const upgradeSchema = z.object({
  plan: z.enum(["STARTER", "PROFESSIONAL", "STUDIO", "ENTERPRISE"]),
})

// GET — list all plans with limits for comparison
export const GET = withAuth(async (_req: NextRequest, _ctx: { params: Promise<Record<string, string>> }, _user: JwtPayload) => {
  try {
    const plans = Object.entries(PLAN_LIMITS).map(([key, limits]) => ({
      id:    key,
      label: PLAN_LABELS[key as keyof typeof PLAN_LABELS],
      limits: {
        users:             limits.maxUsers             === -1 ? "Unlimited" : limits.maxUsers,
        proposalsPerMonth: limits.maxProposalsPerMonth === -1 ? "Unlimited" : limits.maxProposalsPerMonth,
        storageMb:         limits.maxStorageMb         === -1 ? "Unlimited" : limits.maxStorageMb,
      },
      features: {
        customBranding: limits.canCustomBranding,
        exportPdf:      limits.canExportPdf,
        apiAccess:      limits.canApiAccess,
      },
    }))
    return ok(plans)
  } catch (error) {
    return handleServiceError(error)
  }
})

// PATCH — upgrade/downgrade plan (OWNER only)
export const PATCH = withRole("OWNER", async (req: NextRequest, _ctx: { params: Promise<Record<string, string>> }, user: JwtPayload) => {
  try {
    if (!user.workspaceId) return forbidden("No workspace")

    const body   = await req.json()
    const { plan } = upgradeSchema.parse(body)

    const workspace = await prisma.workspace.update({
      where: { id: user.workspaceId },
      data:  { plan },
      select: { id: true, name: true, plan: true },
    })

    return ok(workspace, `Plan updated to ${PLAN_LABELS[plan]}`)
  } catch (error) {
    return handleServiceError(error)
  }
})
