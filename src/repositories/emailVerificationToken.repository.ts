import { prisma } from "@/lib/prisma";

export const emailVerificationTokenRepository = {
  create(userId: string, token: string, expiresAt: Date) {
    return prisma.emailVerificationToken.create({
      data: { userId, token, expiresAt },
    });
  },

  findByToken(token: string) {
    return prisma.emailVerificationToken.findUnique({ where: { token } });
  },

  markUsed(id: string) {
    return prisma.emailVerificationToken.update({ where: { id }, data: { used: true } });
  },

  deleteByUserId(userId: string) {
    return prisma.emailVerificationToken.deleteMany({ where: { userId } });
  },
};
