import { z } from "zod"

export const patchAutomationSchema = z.object({
  enabled: z.boolean(),
})

export type PatchAutomationInput = z.infer<typeof patchAutomationSchema>
