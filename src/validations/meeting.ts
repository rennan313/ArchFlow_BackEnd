import { z } from "zod"
import { booleanQueryParam } from "./common"

export const meetingStatusSchema = z.enum([
  "SCHEDULED",
  "CONFIRMED",
  "COMPLETED",
  "CANCELLED",
  "NO_SHOW",
])

export const meetingTypeSchema = z.enum([
  "INITIAL_CONTACT",
  "DISCOVERY",
  "BRIEFING",
  "PROPOSAL_REVIEW",
  "FOLLOW_UP",
  "OTHER",
])

export const createMeetingSchema = z.object({
  clientId:    z.string().min(1),
  title:       z.string().min(2).max(200),
  type:        meetingTypeSchema,
  status:      meetingStatusSchema.optional().default("SCHEDULED"),
  scheduledAt: z.coerce.date(),
  duration:    z.coerce.number().int().positive().optional(),
  location:    z.string().max(300).optional(),
  objectives:  z.string().max(5000).optional(),
  notes:       z.string().max(10000).optional(),
  decisions:   z.string().max(5000).optional(),
  nextSteps:   z.string().max(5000).optional(),
  summary:     z.string().max(10000).optional(),
  projectId:   z.string().nullable().optional(),
  proposalId:  z.string().nullable().optional(),
})

export const updateMeetingSchema = createMeetingSchema.partial().omit({ clientId: true })

export const meetingQuerySchema = z.object({
  page:      z.coerce.number().int().min(1).optional().default(1),
  limit:     z.coerce.number().int().min(1).max(100).optional().default(50),
  search:    z.string().optional(),
  clientId:  z.string().optional(),
  projectId: z.string().optional(),
  status:    meetingStatusSchema.optional(),
  type:      meetingTypeSchema.optional(),
  from:      z.coerce.date().optional(),
  to:        z.coerce.date().optional(),
  sortBy:    z.enum(["scheduledAt", "createdAt", "updatedAt"]).optional().default("scheduledAt"),
  sortOrder: z.enum(["asc", "desc"]).optional().default("desc"),
  archived:  booleanQueryParam.optional(),
})

export type MeetingStatusType  = z.infer<typeof meetingStatusSchema>
export type MeetingTypeType    = z.infer<typeof meetingTypeSchema>
export type CreateMeetingInput = z.infer<typeof createMeetingSchema>
export type UpdateMeetingInput = z.infer<typeof updateMeetingSchema>
export type MeetingQueryInput  = z.infer<typeof meetingQuerySchema>
