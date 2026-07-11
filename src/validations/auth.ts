import { z } from "zod"

const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .regex(/[A-Za-z]/, "Password must contain at least one letter")
  .regex(/[0-9]/,   "Password must contain at least one number")

export const credentialsRegisterSchema = z.object({
  name:     z.string().min(2).max(100),
  email:    z.string().email(),
  password: passwordSchema,
})

export const credentialsSigninSchema = z.object({
  email:    z.string().email(),
  password: z.string().min(1),
})

export const forgotPasswordSchema = z.object({
  email: z.string().email(),
})

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1),
})

export const resetPasswordSchema = z.object({
  token:    z.string().min(1, "Token is required"),
  password: passwordSchema,
})

export const verifyEmailSchema = z.object({
  token: z.string().min(1, "Token is required"),
})

export const resendVerificationSchema = z.object({
  email: z.string().email(),
})

export const loginSchema = z.object({
  email:    z.string().email(),
  password: z.string().min(1),
})

export const googleAuthSchema = z.object({
  idToken: z.string().min(1, "Google ID token is required"),
})

export type CredentialsRegisterInput = z.infer<typeof credentialsRegisterSchema>
export type CredentialsSigninInput   = z.infer<typeof credentialsSigninSchema>
export type ResetPasswordInput       = z.infer<typeof resetPasswordSchema>
export type VerifyEmailInput         = z.infer<typeof verifyEmailSchema>
export type ResendVerificationInput  = z.infer<typeof resendVerificationSchema>
export type LoginInput               = z.infer<typeof loginSchema>
export type GoogleAuthInput          = z.infer<typeof googleAuthSchema>
