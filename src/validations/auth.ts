import { z } from "zod"

export const WorkspaceTypeEnum = z.enum(["INDIVIDUAL", "SMALL_OFFICE", "GROWING_OFFICE", "LARGE_OFFICE"])
export const TeamSizeEnum      = z.enum(["SOLO", "TWO_TO_FIVE", "FIVE_TO_FIFTEEN", "FIFTEEN_PLUS"])
export const PrimaryGoalEnum   = z.enum(["PROPOSAL_GENERATION", "CLIENT_PRESENTATION", "BRIEFING_ORGANIZATION", "PRICING_WORKFLOW", "VISUAL_REFERENCES"])

const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .regex(/[A-Za-z]/, "Password must contain at least one letter")
  .regex(/[0-9]/,   "Password must contain at least one number")

export const credentialsRegisterSchema = z.object({
  name:          z.string().min(2).max(100),
  email:         z.string().email(),
  password:      passwordSchema,
  workspaceType: WorkspaceTypeEnum.optional(),
  teamSize:      TeamSizeEnum.optional(),
  primaryGoal:   PrimaryGoalEnum.optional(),
})

export const credentialsSigninSchema = z.object({
  email:    z.string().email(),
  password: z.string().min(1),
})

export const onboardingSchema = z.object({
  workspaceType:  WorkspaceTypeEnum.optional(),
  teamSize:       TeamSizeEnum.optional(),
  primaryGoal:    PrimaryGoalEnum.optional(),
  onboardingStep: z.number().int().min(1).max(10).optional(),
  complete:       z.boolean().optional(),
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

export const loginSchema = z.object({
  email:    z.string().email(),
  password: z.string().min(1),
})

export const googleAuthSchema = z.object({
  idToken: z.string().min(1, "Google ID token is required"),
})

export type CredentialsRegisterInput = z.infer<typeof credentialsRegisterSchema>
export type CredentialsSigninInput   = z.infer<typeof credentialsSigninSchema>
export type OnboardingInput          = z.infer<typeof onboardingSchema>
export type ResetPasswordInput       = z.infer<typeof resetPasswordSchema>
export type LoginInput               = z.infer<typeof loginSchema>
export type GoogleAuthInput          = z.infer<typeof googleAuthSchema>
