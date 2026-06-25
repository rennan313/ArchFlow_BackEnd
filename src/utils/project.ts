import type { ProjectPhase } from "@/validations/project"

/** A project is overdue once its estimated deadline has passed and it hasn't reached delivery. */
export function isProjectOverdue(project: { estimatedEndDate: Date | string | null; phase: ProjectPhase }): boolean {
  if (!project.estimatedEndDate || project.phase === "DELIVERY") return false
  return new Date(project.estimatedEndDate) < new Date()
}
