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
  STATE_NOT_FOUND:    () => R.notFound('State not found'),
  CITY_NOT_FOUND:     () => R.notFound('City not found'),
  MEDIA_LIMIT_REACHED: () => R.badRequest('Maximum media per proposal reached (50)'),
};

export function handleServiceError(error: unknown): NextResponse {
  if (error instanceof ZodError) return R.fromZodError(error);

  if (error instanceof Error) {
    // Dynamic INVALID_TRANSITION error: "INVALID_TRANSITION:FROM:TO:ALLOWED"
    if (error.message.startsWith("INVALID_TRANSITION:")) {
      const [, from, to, allowed] = error.message.split(":")
      const allowedList = allowed ? ` Allowed: ${allowed.split(",").join(", ")}` : ""
      return R.badRequest(`Cannot transition from ${from} to ${to}.${allowedList}`)
    }

    const handler = SERVICE_ERRORS[error.message];
    if (handler) return handler();
  }

  console.error("[Unhandled error]", error);
  return R.internalError();
}
