import { z } from "zod"

// durationSeconds/pausedAccumSec/activeOwnerId are never accepted from the
// client — the service always computes them server-side, same boundary
// discipline as purchaseOrder's totalAmountCents (WORKLOG_ARCHITECTURE_
// DECISIONS.md ADR-024).

// ADR-025 — every context field is optional. A bare "start" click sends none
// of them; the user organizes projeto/categoria later (worklog-v3-adr.md §5).
export const startWorkSessionSchema = z.object({
  projectId:   z.string().min(1).optional(),
  clientId:    z.string().min(1).optional(),
  taskId:      z.string().min(1).optional(),
  categoryId:  z.string().min(1).optional(),
  description: z.string().max(2000).optional(),
  tags:        z.array(z.string().min(1).max(50)).max(20).optional(),
  isBillable:  z.boolean().optional().default(true),
  // MEL-16-equivalent (observability) — telemetry-only hint of which UI
  // affordance called start(). Never persisted.
  startSource: z.enum(["quick_start", "continue", "task"]).optional(),
})

// "+ Nova Atividade" — same optionality as start(), no startSource (always
// called from the same widget/list affordance).
export const switchActivitySchema = z.object({
  projectId:   z.string().min(1).optional(),
  clientId:    z.string().min(1).optional(),
  taskId:      z.string().min(1).optional(),
  categoryId:  z.string().min(1).optional(),
  description: z.string().max(2000).optional(),
  tags:        z.array(z.string().min(1).max(50)).max(20).optional(),
  isBillable:  z.boolean().optional(),
})

export type StartWorkSessionInput = z.infer<typeof startWorkSessionSchema>
export type SwitchActivityInput   = z.infer<typeof switchActivitySchema>
