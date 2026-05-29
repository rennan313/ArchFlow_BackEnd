import { z } from "zod"

export const upsertBriefingSchema = z.object({
  projectObjective: z.string().max(2000).optional(),
  spaceUsage:       z.string().max(2000).optional(),
  desiredStyle:     z.string().max(200).optional(),
  currentProblems:  z.string().max(2000).optional(),
  priorities:       z.string().max(2000).optional(),
  budget:           z.string().max(500).optional(),
  timeline:         z.string().max(500).optional(),
  meetingNotes:     z.string().max(5000).optional(),
})

export type UpsertBriefingInput = z.infer<typeof upsertBriefingSchema>
