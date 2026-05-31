import { prisma } from "@/lib/prisma"
import { AppError, ErrorCode } from "@/lib/errors"
import type { UpdateOnboardingInput } from "@/validations/onboarding"

export interface OnboardingStatus {
  onboardingCompleted: boolean
  onboardingStep:      number
  workspaceType:       string | null
  teamSize:            string | null
  primaryGoal:         string | null
}

export const onboardingService = {
  async getStatus(userId: string): Promise<OnboardingStatus> {
    const user = await prisma.user.findUnique({
      where:  { id: userId },
      select: {
        onboardingCompleted: true,
        onboardingStep:      true,
        workspaceType:       true,
        teamSize:            true,
        primaryGoal:         true,
      },
    })

    if (!user) throw new AppError(ErrorCode.USER_NOT_FOUND)

    return {
      onboardingCompleted: user.onboardingCompleted,
      onboardingStep:      user.onboardingStep,
      workspaceType:       user.workspaceType ?? null,
      teamSize:            user.teamSize      ?? null,
      primaryGoal:         user.primaryGoal   ?? null,
    }
  },

  async update(userId: string, input: UpdateOnboardingInput): Promise<OnboardingStatus> {
    const isComplete = input.complete === true

    const updated = await prisma.user.update({
      where: { id: userId },
      data:  {
        ...(input.workspaceType  && { workspaceType:  input.workspaceType }),
        ...(input.teamSize       && { teamSize:        input.teamSize }),
        ...(input.primaryGoal    && { primaryGoal:     input.primaryGoal }),
        ...(input.onboardingStep && { onboardingStep:  input.onboardingStep }),
        ...(isComplete           && { onboardingCompleted: true }),
      },
      select: {
        onboardingCompleted: true,
        onboardingStep:      true,
        workspaceType:       true,
        teamSize:            true,
        primaryGoal:         true,
      },
    })

    return {
      onboardingCompleted: updated.onboardingCompleted,
      onboardingStep:      updated.onboardingStep,
      workspaceType:       updated.workspaceType ?? null,
      teamSize:            updated.teamSize      ?? null,
      primaryGoal:         updated.primaryGoal   ?? null,
    }
  },

  async complete(userId: string): Promise<OnboardingStatus> {
    const updated = await prisma.user.update({
      where: { id: userId },
      data:  { onboardingCompleted: true },
      select: {
        onboardingCompleted: true,
        onboardingStep:      true,
        workspaceType:       true,
        teamSize:            true,
        primaryGoal:         true,
      },
    })

    return {
      onboardingCompleted: updated.onboardingCompleted,
      onboardingStep:      updated.onboardingStep,
      workspaceType:       updated.workspaceType ?? null,
      teamSize:            updated.teamSize      ?? null,
      primaryGoal:         updated.primaryGoal   ?? null,
    }
  },
}
