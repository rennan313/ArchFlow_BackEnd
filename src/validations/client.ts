import { z } from "zod"

export const clientStatusSchema = z.enum(["LEAD", "NEGOTIATION", "ACTIVE", "INACTIVE"])
export const meetingStatusSchema = z.enum(["NOT_SCHEDULED", "SCHEDULED", "COMPLETED"])
export const meetingTypeSchema   = z.enum(["IN_PERSON", "PHONE_CALL", "GOOGLE_MEET"])

export const createClientSchema = z.object({
  name:    z.string().min(2).max(100),
  email:   z.string().email().optional(),
  phone:   z.string().max(20).optional(),
  company: z.string().max(100).optional(),
  address: z.string().max(300).optional(),
  city:    z.string().max(100).optional(),
  state:   z.string().length(2).toUpperCase().optional(),
  notes:   z.string().max(5000).optional(),
  status:  clientStatusSchema.optional().default("LEAD"),
  meetingStatus:  meetingStatusSchema.optional().default("NOT_SCHEDULED"),
  meetingType:    meetingTypeSchema.optional(),
  meetingDate:    z.coerce.date().optional(),
  meetingSummary: z.string().max(20000).optional(),
})

export const updateClientSchema = createClientSchema.partial()

export const clientQuerySchema = z.object({
  page:      z.coerce.number().int().min(1).optional().default(1),
  limit:     z.coerce.number().int().min(1).max(100).optional().default(20),
  search:    z.string().optional(),
  status:    clientStatusSchema.optional(),
  state:     z.string().length(2).optional(),
  sortBy:    z.enum(["name", "createdAt", "updatedAt", "status"]).optional().default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).optional().default("desc"),
})

export type ClientStatus      = z.infer<typeof clientStatusSchema>
export type MeetingStatus     = z.infer<typeof meetingStatusSchema>
export type MeetingType       = z.infer<typeof meetingTypeSchema>
export type CreateClientInput = z.infer<typeof createClientSchema>
export type UpdateClientInput = z.infer<typeof updateClientSchema>
export type ClientQueryInput  = z.infer<typeof clientQuerySchema>
