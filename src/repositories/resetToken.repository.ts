import { prisma } from "@/lib/prisma";

export const resetTokenRepository = {
  create(userId: string, token: string, expiresAt: Date) {
    return prisma.resetPasswordToken.create({
      data: { userId, token, expiresAt },
    });
  },

  findByToken(token: string) {
    return prisma.resetPasswordToken.findUnique({ where: { token } });
  },

  markUsed(id: string) {
    return prisma.resetPasswordToken.update({ where: { id }, data: { used: true } });
  },

  deleteByUserId(userId: string) {
    return prisma.resetPasswordToken.deleteMany({ where: { userId } });
  },
};
