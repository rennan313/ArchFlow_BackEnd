import { prisma } from "@/lib/prisma"
import { AppError, ErrorCode } from "@/lib/errors"
import { auditLog } from "@/lib/auditLog"
import type { EntitlementOverride } from "@prisma/client"

// Entitlements Sprint (2026-07) — Enterprise custom deals ("storage
// personalizado, acordos sob medida"). Admin/internal-only writer — no
// self-serve UI in this sprint (Enterprise deals are sales-negotiated and
// applied by an internal tool, not exposed to customers). Reads go through
// plan.service.ts#getEntitlements, which merges these in; nothing else
// reads EntitlementOverride directly.

export type OverrideValue = { numeric: bigint } | { boolean: boolean }

export const entitlementOverrideService = {
  async set(
    workspaceId: string,
    key: string,
    value: OverrideValue,
    opts: { reason?: string; expiresAt?: Date; createdByUserId?: string } = {},
  ): Promise<EntitlementOverride> {
    const data = {
      numericValue: "numeric" in value ? value.numeric : null,
      booleanValue: "boolean" in value ? value.boolean : null,
      reason: opts.reason,
      expiresAt: opts.expiresAt,
      createdByUserId: opts.createdByUserId,
    }

    const override = await prisma.entitlementOverride.upsert({
      where: { workspaceId_key: { workspaceId, key } },
      create: { workspaceId, key, ...data },
      update: data,
    })

    auditLog({
      event: "entitlement_override_set", entity: "EntitlementOverride", entityId: override.id,
      workspaceId, key, reason: opts.reason, userId: opts.createdByUserId,
    })
    return override
  },

  async remove(workspaceId: string, key: string): Promise<void> {
    const existing = await prisma.entitlementOverride.findUnique({ where: { workspaceId_key: { workspaceId, key } } })
    if (!existing) throw new AppError(ErrorCode.ENTITLEMENT_OVERRIDE_NOT_FOUND)

    await prisma.entitlementOverride.delete({ where: { workspaceId_key: { workspaceId, key } } })
    auditLog({ event: "entitlement_override_removed", entity: "EntitlementOverride", entityId: existing.id, workspaceId, key })
  },

  listForWorkspace(workspaceId: string): Promise<EntitlementOverride[]> {
    return prisma.entitlementOverride.findMany({ where: { workspaceId }, orderBy: { createdAt: "desc" } })
  },
}
