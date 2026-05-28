import crypto from "crypto";
import { userRepository } from "@/repositories/user.repository";
import { resetTokenRepository } from "@/repositories/resetToken.repository";
import { hashPassword, comparePassword } from "@/lib/hash";
import { signAccessToken, signRefreshToken, verifyRefreshToken } from "@/lib/jwt";
import type { RegisterInput, LoginInput, ForgotPasswordInput, ResetPasswordInput } from "@/validations/auth";

const RESET_TOKEN_EXPIRES_MINUTES = Number(process.env.RESET_PASSWORD_EXPIRES_IN_MINUTES ?? 30);

export const authService = {
  async register(input: RegisterInput) {
    const existing = await userRepository.findByEmail(input.email);
    if (existing) {
      throw new Error("EMAIL_TAKEN");
    }

    const password = await hashPassword(input.password);
    const user = await userRepository.create({
      name: input.name,
      email: input.email,
      password,
    });

    return sanitizeUser(user);
  },

  async login(input: LoginInput) {
    const user = await userRepository.findByEmail(input.email);
    if (!user) throw new Error("INVALID_CREDENTIALS");

    const valid = await comparePassword(input.password, user.password);
    if (!valid) throw new Error("INVALID_CREDENTIALS");

    const payload = { sub: user.id, email: user.email, role: user.role };
    const accessToken = signAccessToken(payload);
    const refreshToken = signRefreshToken(payload);

    return { user: sanitizeUser(user), accessToken, refreshToken };
  },

  async refresh(refreshToken: string) {
    try {
      const payload = verifyRefreshToken(refreshToken);
      const user = await userRepository.findById(payload.sub);
      if (!user) throw new Error("USER_NOT_FOUND");

      const newPayload = { sub: user.id, email: user.email, role: user.role };
      const accessToken = signAccessToken(newPayload);
      const newRefreshToken = signRefreshToken(newPayload);

      return { accessToken, refreshToken: newRefreshToken };
    } catch {
      throw new Error("INVALID_REFRESH_TOKEN");
    }
  },

  async forgotPassword(input: ForgotPasswordInput) {
    const user = await userRepository.findByEmail(input.email);
    // Always succeed to prevent email enumeration
    if (!user) return null;

    await resetTokenRepository.deleteByUserId(user.id);

    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + RESET_TOKEN_EXPIRES_MINUTES * 60 * 1000);

    await resetTokenRepository.create(user.id, token, expiresAt);

    return { token, user: sanitizeUser(user) };
  },

  async resetPassword(input: ResetPasswordInput) {
    const record = await resetTokenRepository.findByToken(input.token);

    if (!record) throw new Error("INVALID_TOKEN");
    if (record.used) throw new Error("TOKEN_ALREADY_USED");
    if (record.expiresAt < new Date()) throw new Error("TOKEN_EXPIRED");

    const password = await hashPassword(input.password);
    await userRepository.update(record.userId, { password });
    await resetTokenRepository.markUsed(record.id);
  },

  async me(userId: string) {
    const user = await userRepository.findById(userId);
    if (!user) throw new Error("USER_NOT_FOUND");
    return sanitizeUser(user);
  },
};

function sanitizeUser(user: { id: string; name: string; email: string; role: string; createdAt: Date; updatedAt: Date }) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}
