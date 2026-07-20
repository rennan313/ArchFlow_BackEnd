import { prisma } from "@/lib/prisma"
import { randomBytes } from "crypto"
import { AppError, ErrorCode } from "@/lib/errors"
import { withTransactionRetry } from "@/lib/transactionRetry"
import { auditLog } from "@/lib/auditLog"
import { automationService } from "@/services/automation.service"
import { subscriptionService } from "@/services/subscription.service"
import type { WorkspaceRole } from "@prisma/client"

function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40)
}

async function uniqueSlug(base: string): Promise<string> {
  let slug = slugify(base)
  let attempt = 0
  while (true) {
    const candidate = attempt === 0 ? slug : `${slug}-${attempt}`
    const exists    = await prisma.workspace.findUnique({ where: { slug: candidate } })
    if (!exists) return candidate
    attempt++
  }
}

export const workspaceService = {
  // Called automatically on first sign-up
  async createForUser(userId: string, ownerName: string): Promise<string> {
    const slug = await uniqueSlug(`${ownerName}-office`)

    const workspace = await prisma.workspace.create({
      data: { name: `${ownerName}'s Office`, slug },
    })

    await prisma.user.update({
      where: { id: userId },
      data:  { workspaceId: workspace.id, workspaceRole: "OWNER" },
    })

    // Materialize Automation rows immediately so the fail-open default in
    // automationService.isEnabled() (used before the admin ever opens the
    // Automações screen) never has a window where it's silently relying on
    // the in-memory default instead of the workspace's actual saved config.
    await automationService.ensureDefaults(workspace.id)

    // No free tier — every workspace must start with an explicit 30-day
    // trial, created eagerly here rather than lazily on first limit check
    // (subscriptionService.ensureSubscription remains a safety net for any
    // legacy workspace that predates this).
    await subscriptionService.createTrialSubscription(workspace.id)

    return workspace.id
  },

  async get(workspaceId: string) {
    return prisma.workspace.findUnique({
      where:  { id: workspaceId },
      select: { id: true, name: true, slug: true, plan: true, active: true, dashboardLayout: true, timezone: true, createdAt: true },
    })
  },

  // Worklog Sprint V2, MEL-01 — the only mutable field today is timezone;
  // shaped as a settings bag (not updateTimezone(workspaceId, tz)) so future
  // workspace-level settings can join the same schema/endpoint instead of
  // spawning a new PATCH route each time, same reasoning as
  // updateDashboardLayout being its own dedicated method rather than an
  // ad-hoc prisma.workspace.update() call at the route layer.
  async updateSettings(workspaceId: string, input: { timezone?: string | null }) {
    return prisma.workspace.update({
      where: { id: workspaceId },
      data:  { ...(input.timezone !== undefined && { timezone: input.timezone }) },
      select: { id: true, name: true, slug: true, plan: true, active: true, dashboardLayout: true, timezone: true, createdAt: true },
    })
  },

  async getDashboardLayout(workspaceId: string) {
    const ws = await prisma.workspace.findUnique({
      where:  { id: workspaceId },
      select: { dashboardLayout: true },
    })
    if (!ws?.dashboardLayout) return null
    try { return JSON.parse(ws.dashboardLayout) as { order: string[]; hidden: string[] } } catch { return null }
  },

  async updateDashboardLayout(workspaceId: string, layout: { order: string[]; hidden: string[] }) {
    await prisma.workspace.update({
      where: { id: workspaceId },
      data:  { dashboardLayout: JSON.stringify(layout) },
    })
    return layout
  },

  async listUsers(workspaceId: string) {
    return prisma.user.findMany({
      where:  { workspaceId },
      select: { id: true, name: true, email: true, image: true, workspaceRole: true, lastLogin: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    })
  },

  async invite(workspaceId: string, email: string, role: WorkspaceRole) {
    // Prevent duplicate pending invite
    await prisma.workspaceInvite.deleteMany({ where: { workspaceId, email, accepted: false } })

    const token     = randomBytes(32).toString("hex")
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days

    return prisma.workspaceInvite.create({
      data: { workspaceId, email, role, token, expiresAt },
    })
  },

  async acceptInvite(token: string, userId: string) {
    const [invite, user] = await Promise.all([
      prisma.workspaceInvite.findUnique({ where: { token } }),
      prisma.user.findUnique({ where: { id: userId }, select: { id: true, email: true, workspaceId: true } }),
    ])

    if (!user)  throw new AppError(ErrorCode.USER_NOT_FOUND)
    if (!invite)           throw new AppError(ErrorCode.NOT_FOUND, "Invite not found")
    if (invite.accepted)   throw new AppError(ErrorCode.NOT_FOUND, "Invite already used")
    if (invite.expiresAt < new Date()) throw new AppError(ErrorCode.NOT_FOUND, "Invite expired")

    // Token must be bound to the invited email — prevents link-sharing attacks
    if (invite.email.toLowerCase() !== user.email.toLowerCase()) {
      throw new AppError(ErrorCode.INVITE_EMAIL_MISMATCH, "This invite was not sent to your email address")
    }

    // Prevent double workspace membership
    if (user.workspaceId) {
      throw new AppError(ErrorCode.ALREADY_IN_WORKSPACE, "You are already a member of a workspace")
    }

    // CORE-6 (Sprint 0) — was array-form $transaction([...]) with no retry
    // hook, same class of gap CORE-1 fixed in subscription.service.ts: a
    // 2-collection write (user + workspaceInvite) with no protection against
    // MongoDB's WriteConflict/TransientTransactionError under concurrent
    // writes (e.g. the same invite link opened in two tabs at once).
    const base = { workspaceId: invite.workspaceId, userId, entity: "WorkspaceInvite", entityId: invite.id, op: "acceptInvite" }
    await withTransactionRetry(() => prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data:  { workspaceId: invite.workspaceId, workspaceRole: invite.role },
      })
      await tx.workspaceInvite.updateMany({
        where: { id: invite.id, accepted: false },
        data:  { accepted: true },
      })
    }), { context: base })

    auditLog({ ...base, event: "workspace_invite_accepted" })
    return invite.workspaceId
  },

  async updateUserRole(workspaceId: string, targetUserId: string, role: WorkspaceRole) {
    const target = await prisma.user.findFirst({ where: { id: targetUserId, workspaceId } })
    if (!target)              throw new AppError(ErrorCode.USER_NOT_FOUND)
    if (target.workspaceRole === "OWNER") throw new AppError(ErrorCode.CANNOT_CHANGE_OWNER_ROLE)

    return prisma.user.update({ where: { id: targetUserId }, data: { workspaceRole: role } })
  },

  async listPendingInvites(workspaceId: string) {
    return prisma.workspaceInvite.findMany({
      where:  { workspaceId, accepted: false },
      select: { id: true, email: true, role: true, expiresAt: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    })
  },

  async cancelInvite(workspaceId: string, inviteId: string) {
    const invite = await prisma.workspaceInvite.findFirst({ where: { id: inviteId, workspaceId } })
    if (!invite) throw new AppError(ErrorCode.NOT_FOUND, "Invite not found")

    await prisma.workspaceInvite.delete({ where: { id: inviteId } })
  },

  async removeUser(workspaceId: string, targetUserId: string) {
    const target = await prisma.user.findFirst({ where: { id: targetUserId, workspaceId } })
    if (!target)              throw new AppError(ErrorCode.USER_NOT_FOUND)
    if (target.workspaceRole === "OWNER") throw new AppError(ErrorCode.CANNOT_REMOVE_OWNER)

    await prisma.user.update({
      where: { id: targetUserId },
      data:  { workspaceId: null },
    })
  },
}
