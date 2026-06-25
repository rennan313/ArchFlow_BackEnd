import { z } from "zod"

export const patchTaskSchema = z.object({
  status: z.enum(["PENDING", "DONE"]),
})

export type PatchTaskInput = z.infer<typeof patchTaskSchema>
