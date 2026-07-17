import { z } from "zod"
import { booleanQueryParamWithDefault } from "./common"

// durationSeconds/pausedAccumSec/activeOwnerId are never accepted from the
// client — the service always computes them server-side from
// startedAt/endedAt (manual) or from the CAS transitions (timer), same
// boundary-conversion discipline as purchaseOrder's totalAmountCents.

export const startTimerSchema = z.object({
  projectId:   z.string().min(1).optional(),
  clientId:    z.string().min(1).optional(),
  taskId:      z.string().min(1).optional(),
  categoryId:  z.string().min(1).optional(),
  description: z.string().max(2000).optional(),
  tags:        z.array(z.string().min(1).max(50)).max(20).optional(),
  isBillable:  z.boolean().optional().default(true),
})

export const createManualTimeEntrySchema = z
  .object({
    projectId:   z.string().min(1).optional(),
    clientId:    z.string().min(1).optional(),
    taskId:      z.string().min(1).optional(),
    categoryId:  z.string().min(1).optional(),
    description: z.string().max(2000).optional(),
    tags:        z.array(z.string().min(1).max(50)).max(20).optional(),
    isBillable:  z.boolean().optional().default(true),
    startedAt:   z.coerce.date(),
    endedAt:     z.coerce.date(),
  })
  .refine((data) => data.endedAt > data.startedAt, {
    message: "endedAt must be after startedAt",
    path: ["endedAt"],
  })

// status/source/startedAt/endedAt are intentionally not editable through the
// generic update endpoint once a manual entry exists — editing the times of
// a completed entry is a "delete and recreate" in this phase (Fase 2 may add
// a dedicated re-time endpoint with its own duration recompute); this keeps
// durationSeconds always consistent with startedAt/endedAt without a
// recompute path to keep in sync.
export const updateTimeEntrySchema = z.object({
  projectId:   z.string().min(1).optional(),
  clientId:    z.string().min(1).optional(),
  taskId:      z.string().min(1).optional(),
  categoryId:  z.string().min(1).optional(),
  description: z.string().max(2000).optional(),
  tags:        z.array(z.string().min(1).max(50)).max(20).optional(),
  isBillable:  z.boolean().optional(),
})

export const timeEntryQuerySchema = z.object({
  page:  z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(200).optional().default(50),
  // userId is only honored by the service when the caller has
  // view:time-entries — otherwise the service silently scopes to the
  // caller's own userId regardless of what's requested here (ADR-022).
  userId:     z.string().min(1).optional(),
  projectId:  z.string().min(1).optional(),
  clientId:   z.string().min(1).optional(),
  categoryId: z.string().min(1).optional(),
  from:       z.coerce.date().optional(),
  to:         z.coerce.date().optional(),
  archived:   booleanQueryParamWithDefault(false),
  sortBy:    z.enum(["startedAt", "createdAt"]).optional().default("startedAt"),
  sortOrder: z.enum(["asc", "desc"]).optional().default("desc"),
})

export type StartTimerInput            = z.infer<typeof startTimerSchema>
export type CreateManualTimeEntryInput = z.infer<typeof createManualTimeEntrySchema>
export type UpdateTimeEntryInput       = z.infer<typeof updateTimeEntrySchema>
export type TimeEntryQueryInput        = z.infer<typeof timeEntryQuerySchema>
