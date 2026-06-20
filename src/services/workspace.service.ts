import { prisma } from "@/lib/prisma"
import { randomBytes } from "crypto"
import { AppError, ErrorCode } from "@/lib/errors"
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

    return workspace.id
  },

  async get(workspaceId: string) {
    return prisma.workspace.findUnique({
      where:  { id: workspaceId },
      select: { id: true, name: true, slug: true, plan: true, active: true, dashboardLayout: true, createdAt: true },
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
    const invite = await prisma.workspaceInvite.findUnique({ where: { token } })

    if (!invite)           throw new AppError(ErrorCode.NOT_FOUND, "Invite not found")
    if (invite.accepted)   throw new AppError(ErrorCode.NOT_FOUND, "Invite already used")
    if (invite.expiresAt < new Date()) throw new AppError(ErrorCode.NOT_FOUND, "Invite expired")

    // Update user to join workspace
    await prisma.user.update({
      where: { id: userId },
      data:  { workspaceId: invite.workspaceId, workspaceRole: invite.role },
    })

    await prisma.workspaceInvite.update({
      where: { id: invite.id },
      data:  { accepted: true },
    })

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
