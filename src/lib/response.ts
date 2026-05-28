import { NextResponse } from "next/server";
import { ZodError } from "zod";

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  message?: string;
  errors?: Record<string, string[]>;
  pagination?: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export function ok<T>(data: T, message?: string, pagination?: ApiResponse["pagination"]): NextResponse {
  return NextResponse.json({ success: true, data, message, pagination }, { status: 200 });
}

export function created<T>(data: T, message?: string): NextResponse {
  return NextResponse.json({ success: true, data, message }, { status: 201 });
}

export function noContent(): NextResponse {
  return new NextResponse(null, { status: 204 });
}

export function badRequest(message: string, errors?: Record<string, string[]>): NextResponse {
  return NextResponse.json({ success: false, message, errors }, { status: 400 });
}

export function unauthorized(message = "Unauthorized"): NextResponse {
  return NextResponse.json({ success: false, message }, { status: 401 });
}

export function forbidden(message = "Forbidden"): NextResponse {
  return NextResponse.json({ success: false, message }, { status: 403 });
}

export function notFound(message = "Resource not found"): NextResponse {
  return NextResponse.json({ success: false, message }, { status: 404 });
}

export function conflict(message: string): NextResponse {
  return NextResponse.json({ success: false, message }, { status: 409 });
}

export function internalError(message = "Internal server error"): NextResponse {
  return NextResponse.json({ success: false, message }, { status: 500 });
}

export function fromZodError(error: ZodError): NextResponse {
  const errors: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".");
    if (!errors[key]) errors[key] = [];
    errors[key].push(issue.message);
  }
  return badRequest("Validation failed", errors);
}
