import { z } from "zod"

export const createClientSchema = z.object({
  name:  z.string().min(2).max(100),
  email: z.string().email().optional(),
  phone: z.string().max(20).optional(),
  city:  z.string().max(100).optional(),
  state: z.string().length(2).toUpperCase().optional(),
  notes: z.string().max(2000).optional(),
})

export const updateClientSchema = createClientSchema.partial()

export const clientQuerySchema = z.object({
  page:      z.coerce.number().int().min(1).optional().default(1),
  limit:     z.coerce.number().int().min(1).max(100).optional().default(20),
  search:    z.string().optional(),
  state:     z.string().length(2).optional(),
  sortBy:    z.enum(["name", "createdAt"]).optional().default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).optional().default("desc"),
})

export type CreateClientInput = z.infer<typeof createClientSchema>
export type UpdateClientInput = z.infer<typeof updateClientSchema>
export type ClientQueryInput  = z.infer<typeof clientQuerySchema>
