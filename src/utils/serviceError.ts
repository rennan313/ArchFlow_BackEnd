import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { Prisma } from "@prisma/client";
import * as Sentry from "@sentry/nextjs";
import * as R from "@/lib/response";
import { AppError, ErrorCode } from "@/lib/errors";
import { logger } from "@/lib/logger";

const SERVICE_ERRORS: Record<string, () => NextResponse> = {
  // Auth
  [ErrorCode.EMAIL_TAKEN]:              () => R.conflict("This email is already registered. If you created this account before the migration, please sign in using your existing credentials."),
  [ErrorCode.INVALID_CREDENTIALS]:      () => R.unauthorized("Invalid email or password"),
  [ErrorCode.USE_GOOGLE]:               () => R.unauthorized("This account uses Google Sign-In. Please continue with Google."),
  [ErrorCode.INVALID_REFRESH_TOKEN]:    () => R.unauthorized("Invalid or expired refresh token"),
  [ErrorCode.INVALID_OR_EXPIRED_TOKEN]: () => R.badRequest("Reset token is invalid or has expired"),
  [ErrorCode.GOOGLE_TOKEN_INVALID]:     () => R.unauthorized("Invalid Google token. Please sign in again."),
  [ErrorCode.GOOGLE_AUTH_DISABLED]:     () => R.badRequest("Google authentication is not enabled on this server"),
  [ErrorCode.EMAIL_VERIFICATION_TOKEN_INVALID]: () => R.badRequest("Verification token is invalid"),
  [ErrorCode.EMAIL_VERIFICATION_TOKEN_EXPIRED]: () => R.badRequest("Verification token has expired"),
  [ErrorCode.EMAIL_ALREADY_VERIFIED]:   () => R.conflict("This email address is already verified"),
  // Users
  [ErrorCode.USER_NOT_FOUND]:           () => R.notFound("User not found"),
  // Generic
  [ErrorCode.NOT_FOUND]:                () => R.notFound(),
  // Location
  [ErrorCode.STATE_NOT_FOUND]:          () => R.notFound("State not found"),
  [ErrorCode.CITY_NOT_FOUND]:           () => R.notFound("City not found"),
  // Media
  [ErrorCode.MEDIA_LIMIT_REACHED]:      () => R.badRequest("Maximum media per proposal reached (50)"),
  // Workspace
  [ErrorCode.CANNOT_CHANGE_OWNER_ROLE]: () => R.badRequest("Cannot change the owner's role"),
  [ErrorCode.CANNOT_REMOVE_OWNER]:      () => R.badRequest("Cannot remove the workspace owner"),
  // Domain
  [ErrorCode.CLIENT_NOT_FOUND]:         () => R.notFound("Client not found"),
  [ErrorCode.PROJECT_NOT_FOUND]:        () => R.notFound("Project not found"),
  [ErrorCode.MEETING_NOT_FOUND]:        () => R.notFound("Meeting not found"),
  [ErrorCode.OPPORTUNITY_NOT_FOUND]:    () => R.notFound("Opportunity not found"),
  [ErrorCode.BRIEFING_NOT_FOUND]:       () => R.notFound("Briefing not found"),
  [ErrorCode.FOLLOWUP_NOT_FOUND]:       () => R.notFound("Follow-up not found"),
  [ErrorCode.VERSION_NOT_FOUND]:        () => R.notFound("Proposal version not found"),
  [ErrorCode.DOCUMENT_NOT_FOUND]:       () => R.notFound("Document not found"),
  [ErrorCode.DOCUMENT_FOLDER_NOT_FOUND]: () => R.notFound("Document folder not found"),
  [ErrorCode.AUTOMATION_NOT_FOUND]:     () => R.notFound("Automation not found"),
  [ErrorCode.TASK_NOT_FOUND]:           () => R.notFound("Task not found"),
  [ErrorCode.CROSS_TENANT_REFERENCE]:   () => R.forbidden("One or more referenced resources do not belong to this workspace"),
  [ErrorCode.PROPOSAL_TEMPLATE_NOT_FOUND]:  () => R.notFound("Proposal template not found"),
  [ErrorCode.PROPOSAL_SECTION_NOT_FOUND]:   () => R.notFound("Proposal section not found"),
  [ErrorCode.PROPOSAL_BLOCK_NOT_FOUND]:     () => R.notFound("Proposal block not found"),
  [ErrorCode.PROPOSAL_NARRATIVE_NOT_FOUND]: () => R.notFound("Proposal narrative not found"),
  [ErrorCode.SECTION_INSTANCE_NOT_FOUND]:   () => R.notFound("Section instance not found"),
  [ErrorCode.PROPOSAL_PROJECT_NOT_LINKED]:  () => R.badRequest("This proposal has no linked project yet — link a project before starting proposal editing"),
  [ErrorCode.INVALID_REORDER]:              () => R.badRequest("Reorder list must contain exactly the section instances that belong to this proposal"),
  // Billing
  [ErrorCode.SUBSCRIPTION_NOT_FOUND]:        () => R.notFound("Subscription not found"),
  [ErrorCode.SUBSCRIPTION_ALREADY_EXISTS]:   () => R.conflict("Subscription already exists for this workspace"),
  [ErrorCode.BILLING_NOT_CONFIGURED]:        () => R.internalError("Billing is not configured on this server. Contact support."),
  [ErrorCode.BILLING_PLAN_NOT_FOUND]:        () => R.notFound("Plan not found"),
  [ErrorCode.BILLING_PLAN_NOT_SELLABLE]:     () => R.badRequest("This plan cannot be subscribed to online. Contact sales."),
  [ErrorCode.BILLING_PROVIDER_ERROR]:        () => R.internalError("Payment provider is temporarily unavailable. Please try again."),
  [ErrorCode.WEBHOOK_SIGNATURE_INVALID]:     () => R.unauthorized("Invalid webhook signature"),
  [ErrorCode.BILLING_PLAN_VERSION_NOT_FOUND]: () => R.notFound("Plan version not found"),
  [ErrorCode.ENTITLEMENT_OVERRIDE_NOT_FOUND]: () => R.notFound("Entitlement override not found"),
  [ErrorCode.WORKSPACE_FROZEN]: () => R.forbidden("This workspace is frozen due to a billing issue. Reactivate your subscription to continue."),
  [ErrorCode.BILLING_STORAGE_LIMIT_EXCEEDED]: () => R.forbidden("Storage limit reached. Upgrade your plan to upload more files."),
  [ErrorCode.SEAT_LIMIT_REACHED]: () => R.forbidden("This workspace has reached its seat limit. Ask an admin to upgrade the plan."),
  // Financial
  [ErrorCode.SUPPLIER_CATEGORY_NOT_FOUND]:   () => R.notFound("Supplier category not found"),
  [ErrorCode.SUPPLIER_CATEGORY_NAME_TAKEN]:  () => R.conflict("A supplier category with this name already exists"),
  [ErrorCode.SUPPLIER_NOT_FOUND]:            () => R.notFound("Supplier not found"),
  [ErrorCode.BANK_ACCOUNT_NOT_FOUND]:        () => R.notFound("Bank account not found"),
  [ErrorCode.FINANCIAL_CATEGORY_NOT_FOUND]:  () => R.notFound("Financial category not found"),
  [ErrorCode.FINANCIAL_CATEGORY_NAME_TAKEN]: () => R.conflict("A financial category with this name already exists at this level"),
  [ErrorCode.FINANCIAL_CATEGORY_DIRECTION_MISMATCH]: () => R.badRequest("A financial category must have the same direction (Receita/Despesa) as its parent"),
  [ErrorCode.FINANCIAL_CATEGORY_HAS_CHILDREN]: () => R.conflict("Cannot archive a financial category that still has subcategories"),
  [ErrorCode.COST_CENTER_NOT_FOUND]:         () => R.notFound("Cost center not found"),
  [ErrorCode.COST_CENTER_NAME_TAKEN]:        () => R.conflict("A cost center with this name already exists"),
  [ErrorCode.FINANCIAL_DOCUMENT_NOT_FOUND]:  () => R.notFound("Financial document not found"),
  [ErrorCode.FINANCIAL_DOCUMENT_CANCELLED]:  () => R.badRequest("This financial document has been cancelled"),
  [ErrorCode.FINANCIAL_DOCUMENT_HAS_PAYMENTS]: () => R.conflict("Cannot cancel a document that already has payments — reversal is not yet supported"),
  [ErrorCode.FINANCIAL_DOCUMENT_DIRECTION_CONFLICT]: () => R.badRequest("A payable document cannot reference a client, and a receivable document cannot reference a supplier"),
  [ErrorCode.INSTALLMENTS_TOTAL_MISMATCH]:   () => R.badRequest("The sum of installment amounts must equal the document total"),
  [ErrorCode.INSTALLMENT_NOT_FOUND]:         () => R.notFound("Installment not found"),
  [ErrorCode.INSTALLMENT_ALREADY_PAID]:      () => R.conflict("This installment has already been fully paid"),
  [ErrorCode.PAYMENT_EXCEEDS_REMAINING]:     () => R.badRequest("Payment amount exceeds the remaining balance of this installment"),
  [ErrorCode.PROJECT_HAS_FINANCIAL_HISTORY]: () => R.conflict("This project has financial documents linked to it and cannot be deleted. Archive it instead, or cancel/reassign its financial history first."),
  [ErrorCode.CLIENT_HAS_FINANCIAL_HISTORY]:  () => R.conflict("This client has financial documents linked to it and cannot be deleted. Archive it instead (set status to Inativo), or cancel/reassign its financial history first."),
  [ErrorCode.OPPORTUNITY_HAS_PROJECT]: () => R.conflict("This opportunity already converted to a project and cannot be deleted. Delete or reassign the project first if you need to remove this record."),
  [ErrorCode.PROPOSAL_HAS_PROJECT]:    () => R.conflict("This proposal already converted to a project and cannot be deleted. Delete or reassign the project first if you need to remove this record."),
  // Compras
  [ErrorCode.PURCHASE_ORDER_NOT_FOUND]: () => R.notFound("Purchase order not found"),
  [ErrorCode.PURCHASE_ORDER_NOT_DRAFT]: () => R.badRequest("This purchase order is no longer a draft and can't be edited or cancelled"),
  [ErrorCode.PURCHASE_ORDER_ALREADY_DECIDED]: () => R.conflict("This purchase order was already cancelled by someone else"),
  [ErrorCode.PURCHASE_ORDER_CATEGORY_DIRECTION_MISMATCH]: () => R.badRequest("The financial category for a purchase order must be a Despesa (payable) category"),
  // Worklog
  [ErrorCode.TIME_ENTRY_NOT_FOUND]:     () => R.notFound("Time entry not found"),
  [ErrorCode.TIMER_ALREADY_RUNNING]:    () => R.conflict("You already have a timer running or paused. Finish it before starting a new one."),
  [ErrorCode.TIMER_NOT_ACTIVE]:         () => R.badRequest("This time entry has no active timer to pause, resume, or stop"),
  [ErrorCode.TIMER_NOT_PAUSED]:         () => R.badRequest("This timer is not paused"),
  [ErrorCode.TIME_ENTRY_NOT_EDITABLE]:  () => R.forbidden("You can only edit your own time entries"),
  [ErrorCode.TIME_ENTRY_ACTIVE_CANNOT_ARCHIVE]: () => R.badRequest("Stop this timer before archiving it"),
  [ErrorCode.ACTIVITY_CATEGORY_NOT_FOUND]: () => R.notFound("Activity category not found"),
  [ErrorCode.ACTIVITY_CATEGORY_NAME_TAKEN]: () => R.conflict("An activity category with this name already exists"),
  // Entity Lifecycle (ADR-020)
  [ErrorCode.ENTITY_ALREADY_ARCHIVED]: () => R.conflict("This record is already archived"),
  [ErrorCode.ENTITY_NOT_ARCHIVED]:     () => R.conflict("This record is not archived, there is nothing to restore"),
  [ErrorCode.PARENT_ARCHIVED]:         () => R.conflict("Cannot restore this record while its parent record is archived — restore the parent first"),
  // Kanban Sprint — Fase A (MEL-04)
  [ErrorCode.STALE_WRITE]: () => R.conflict("This record was changed by someone else. Refresh and try again."),
  // Legacy string aliases kept for backward compat during migration
  INVALID_TOKEN:     () => R.badRequest("Invalid reset token"),
  TOKEN_ALREADY_USED: () => R.badRequest("Reset token has already been used"),
  TOKEN_EXPIRED:     () => R.badRequest("Reset token has expired"),
};

// CORE-5 (Sprint 0) — string-prefix sentinel errors (thrown as
// `new Error("PREFIX:details")` where an AppError/ErrorCode isn't a natural
// fit — e.g. a validation message assembled inline in a service). Handled
// centrally, same as INVALID_TRANSITION: below, instead of each route
// re-implementing its own `error.message.startsWith(...)` block — the
// Release 1.0 review found 3 routes duplicating this exact parsing for
// VALIDATION: (see FINANCIAL_ARCHITECTURE_DECISIONS.md, Anexo). Add a new
// prefix here rather than a bespoke per-route check when a future service
// needs the same "inline message, no dedicated ErrorCode" shape.
const MESSAGE_PREFIX_HANDLERS: Record<string, (detail: string) => NextResponse> = {
  "VALIDATION:": (detail) => R.badRequest(detail),
};

// UNSUPPORTED_FILE_TYPE: is deliberately NOT centralized the same way —
// each upload route allows a different file-type set, so the human-readable
// "Allowed: ..." suffix is route-specific. This just centralizes the
// PARSING (the part that was byte-for-byte duplicated across 4 routes);
// callers still own their own message. See documents/route.ts for the
// canonical call pattern.
export function parseUnsupportedFileType(error: unknown): string | null {
  if (error instanceof Error && error.message.startsWith("UNSUPPORTED_FILE_TYPE:")) {
    return error.message.slice("UNSUPPORTED_FILE_TYPE:".length) || "unknown";
  }
  return null;
}

export function handleServiceError(error: unknown): NextResponse {
  if (error instanceof ZodError) return R.fromZodError(error);

  // P2025 on a nested `connect` almost always means the authenticated
  // caller's own User/Workspace record (from the JWT) no longer exists in
  // this database — e.g. a session that outlived a dev-DB reset/reseed, or
  // an account deleted after the token was issued. Every other referenced
  // record (client, project, etc.) is already existence-checked explicitly
  // before use, so this generic write-time failure is the one case worth a
  // dedicated message: without it, the caller sees an opaque 500 with no
  // path forward instead of "sign in again".
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2025"
  ) {
    return R.unauthorized("Sua sessão não é mais válida. Faça login novamente.");
  }

  if (error instanceof AppError) {
    const handler = SERVICE_ERRORS[error.code];
    if (handler) return handler();
  }

  if (error instanceof Error) {
    if (error.message.startsWith("INVALID_TRANSITION:")) {
      const [, from, to, allowed] = error.message.split(":")
      const allowedList = allowed ? ` Allowed: ${allowed.split(",").join(", ")}` : ""
      return R.badRequest(`Cannot transition from ${from} to ${to}.${allowedList}`)
    }
    for (const [prefix, handler] of Object.entries(MESSAGE_PREFIX_HANDLERS)) {
      if (error.message.startsWith(prefix)) return handler(error.message.slice(prefix.length));
    }
    const handler = SERVICE_ERRORS[error.message];
    if (handler) return handler();
  }

  logger.error({ err: error }, "[Unhandled error]");
  Sentry.captureException(error);
  return R.internalError();
}
