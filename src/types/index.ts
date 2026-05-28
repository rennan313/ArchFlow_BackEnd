import type { NextRequest } from "next/server";
import type { JwtPayload } from "@/lib/jwt";

export interface AuthenticatedRequest extends NextRequest {
  user: JwtPayload;
}

export type SortOrder = "asc" | "desc";
