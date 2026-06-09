import crypto from "crypto"
import { prisma } from "@/lib/prisma"

function hashJti(jti: string): string {
  return crypto.createHash("sha256").update(jti).digest("hex")
}

export const refreshTokenRepository = {
  create(data: {
    userId:    string
    jti:       string
    expiresAt: Date
    ipAddress?: string
    userAgent?: string
  }) {
    return prisma.refreshToken.create({
      data: {
        userId:    data.userId,
        jti:       data.jti,
        tokenHash: hashJti(data.jti),
        expiresAt: data.expiresAt,
        ipAddress: data.ipAddress,
        userAgent: data.userAgent,
      },
    })
  },

  findByJti(jti: string) {
    return prisma.refreshToken.findUnique({ where: { tokenHash: hashJti(jti) } })
  },

  revoke(id: string) {
    return prisma.refreshToken.update({
      where: { id },
      data: { revoked: true, revokedAt: new Date() },
    })
  },

  revokeAllForUser(userId: string) {
    return prisma.refreshToken.updateMany({
      where: { userId, revoked: false },
      data:  { revoked: true, revokedAt: new Date() },
    })
  },

  deleteExpired() {
    return prisma.refreshToken.deleteMany({ where: { expiresAt: { lt: new Date() } } })
  },
}
