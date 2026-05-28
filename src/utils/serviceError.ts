import { NextResponse } from "next/server";
import { ZodError } from "zod";
import * as R from "@/lib/response";

const SERVICE_ERRORS: Record<string, () => NextResponse> = {
  EMAIL_TAKEN: () => R.conflict("Email address is already registered"),
  INVALID_CREDENTIALS: () => R.unauthorized("Invalid email or password"),
  INVALID_REFRESH_TOKEN: () => R.unauthorized("Invalid or expired refresh token"),
  INVALID_TOKEN: () => R.badRequest("Invalid reset token"),
  TOKEN_ALREADY_USED: () => R.badRequest("Reset token has already been used"),
  TOKEN_EXPIRED: () => R.badRequest("Reset token has expired"),
  USER_NOT_FOUND: () => R.notFound("User not found"),
  NOT_FOUND:         () => R.notFound(),
  STATE_NOT_FOUND:   () => R.notFound('State not found'),
  CITY_NOT_FOUND:    () => R.notFound('City not found'),
};

export function handleServiceError(error: unknown): NextResponse {
  if (error instanceof ZodError) return R.fromZodError(error);

  if (error instanceof Error) {
    const handler = SERVICE_ERRORS[error.message];
    if (handler) return handler();
  }

  console.error("[Unhandled error]", error);
  return R.internalError();
}
