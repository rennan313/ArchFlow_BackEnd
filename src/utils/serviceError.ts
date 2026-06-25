import { NextResponse } from "next/server";
import { ZodError } from "zod";
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
  // Legacy string aliases kept for backward compat during migration
  INVALID_TOKEN:     () => R.badRequest("Invalid reset token"),
  TOKEN_ALREADY_USED: () => R.badRequest("Reset token has already been used"),
  TOKEN_EXPIRED:     () => R.badRequest("Reset token has expired"),
};

export function handleServiceError(error: unknown): NextResponse {
  if (error instanceof ZodError) return R.fromZodError(error);

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
    const handler = SERVICE_ERRORS[error.message];
    if (handler) return handler();
  }

  logger.error({ err: error }, "[Unhandled error]");
  return R.internalError();
}
