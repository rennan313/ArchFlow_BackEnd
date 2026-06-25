import { logger } from "@/lib/logger"

// ── Event catalog ─────────────────────────────────────────────────────────────
// All structured events emitted by the application.
// Each event follows the pattern: { event, ...context }
// This file serves as the canonical event catalog — add new events here.

type AuthEvent =
  | "auth.login.success"
  | "auth.login.failure"
  | "auth.google.success"
  | "auth.google.failure"
  | "auth.register.success"
  | "auth.register.duplicate"
  | "auth.password_reset.requested"
  | "auth.password_reset.completed"
  | "auth.email_verification.requested"
  | "auth.email_verification.completed"
  | "auth.email_verification.failure"
  | "auth.email_verification.already_verified"
  | "auth.provision.success"
  | "auth.provision.idempotent"
  | "auth.provision.conflict"

type WorkspaceEvent =
  | "workspace.created"
  | "workspace.invite.sent"
  | "workspace.invite.accepted"
  | "workspace.invite.expired"
  | "workspace.member.role_changed"
  | "workspace.member.removed"

type ProposalEvent =
  | "proposal.created"
  | "proposal.updated"
  | "proposal.deleted"
  | "proposal.status_changed"
  | "proposal.ai_generated"
  | "proposal.pdf_generated"

type AllEvents = AuthEvent | WorkspaceEvent | ProposalEvent

interface EventContext {
  userId?:      string
  workspaceId?: string
  email?:       string
  proposalId?:  string
  status?:      string
  role?:        string
  provider?:    string
  tokensUsed?:  number
  err?:         unknown
  [key: string]: unknown
}

export function emitEvent(event: AllEvents, ctx: EventContext = {}): void {
  logger.info({ event, ...ctx })
}

export function emitErrorEvent(event: AllEvents, ctx: EventContext = {}): void {
  logger.error({ event, ...ctx })
}
