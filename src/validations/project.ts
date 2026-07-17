import { z } from "zod"
import { booleanQueryParam } from "./common"

export const projectTypeSchema = z.enum([
  "RESIDENTIAL",
  "COMMERCIAL",
  "RENOVATION",
  "INTERIOR",
  "URBAN",
  "LANDSCAPE",
])

export const projectStatusSchema = z.enum([
  "BRIEFING",
  "IN_PROGRESS",
  "REVIEW",
  "COMPLETED",
  "ON_HOLD",
  "CANCELLED",
])

// AEC pipeline phase for the Kanban de Projetos board — independent from `status`
export const projectPhaseSchema = z.enum([
  "BRIEFING",
  "PRELIMINARY_DESIGN",
  "EXECUTIVE_DESIGN",
  "COMPATIBILIZATION",
  "APPROVAL",
  "DELIVERY",
])

export const createProjectSchema = z.object({
  clientId:         z.string().min(1),
  proposalId:       z.string().optional(),
  name:             z.string().min(2).max(200),
  code:             z.string().max(50).optional(),
  description:      z.string().max(5000).optional(),
  type:             projectTypeSchema,
  status:           projectStatusSchema.optional().default("BRIEFING"),
  phase:            projectPhaseSchema.optional().default("BRIEFING"),
  squareMeters:     z.coerce.number().positive().optional(),
  address:          z.string().max(300).optional(),
  city:             z.string().max(100).optional(),
  state:            z.string().length(2).toUpperCase().optional(),
  startDate:        z.coerce.date().optional(),
  estimatedEndDate: z.coerce.date().optional(),
  actualEndDate:    z.coerce.date().optional(),
  contractValue:    z.coerce.number().nonnegative().optional(),
  notes:            z.string().max(5000).optional(),
})

export const updateProjectSchema = createProjectSchema.partial().omit({ clientId: true })

export const projectQuerySchema = z.object({
  page:      z.coerce.number().int().min(1).optional().default(1),
  limit:     z.coerce.number().int().min(1).max(200).optional().default(20),
  search:    z.string().optional(),
  status:    projectStatusSchema.optional(),
  phase:     projectPhaseSchema.optional(),
  type:      projectTypeSchema.optional(),
  clientId:  z.string().optional(),
  sortBy:    z.enum(["name", "createdAt", "updatedAt", "status", "estimatedEndDate"]).optional().default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).optional().default("desc"),
  archived:  booleanQueryParam.optional(),
})

export type ProjectType        = z.infer<typeof projectTypeSchema>
export type ProjectStatus      = z.infer<typeof projectStatusSchema>
export type ProjectPhase       = z.infer<typeof projectPhaseSchema>
export type CreateProjectInput = z.infer<typeof createProjectSchema>
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>
export type ProjectQueryInput  = z.infer<typeof projectQuerySchema>
