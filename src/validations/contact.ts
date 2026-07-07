import { z } from "zod"

export const demoRequestSchema = z.object({
  name:    z.string().min(2).max(100),
  email:   z.string().email(),
  company: z.string().min(2).max(150),
  phone:   z.string().max(30).optional(),
  message: z.string().max(2000).optional(),
})
