import { z } from "zod"

export const adviseProposalSchema = z.object({
  projectId: z.string().min(1),
})

export type AdviseProposalInput = z.infer<typeof adviseProposalSchema>
