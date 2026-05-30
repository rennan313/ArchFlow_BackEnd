export enum ErrorCode {
  // Auth
  EMAIL_TAKEN              = "EMAIL_TAKEN",
  INVALID_CREDENTIALS      = "INVALID_CREDENTIALS",
  USE_GOOGLE               = "USE_GOOGLE",
  INVALID_REFRESH_TOKEN    = "INVALID_REFRESH_TOKEN",
  INVALID_OR_EXPIRED_TOKEN = "INVALID_OR_EXPIRED_TOKEN",
  // Users
  USER_NOT_FOUND           = "USER_NOT_FOUND",
  // Workspace
  CANNOT_CHANGE_OWNER_ROLE = "CANNOT_CHANGE_OWNER_ROLE",
  CANNOT_REMOVE_OWNER      = "CANNOT_REMOVE_OWNER",
  // Domain
  NOT_FOUND                = "NOT_FOUND",
  CLIENT_NOT_FOUND         = "CLIENT_NOT_FOUND",
  OPPORTUNITY_NOT_FOUND    = "OPPORTUNITY_NOT_FOUND",
  BRIEFING_NOT_FOUND       = "BRIEFING_NOT_FOUND",
  FOLLOWUP_NOT_FOUND       = "FOLLOWUP_NOT_FOUND",
  VERSION_NOT_FOUND        = "VERSION_NOT_FOUND",
  STATE_NOT_FOUND          = "STATE_NOT_FOUND",
  CITY_NOT_FOUND           = "CITY_NOT_FOUND",
  MEDIA_LIMIT_REACHED      = "MEDIA_LIMIT_REACHED",
}

export class AppError extends Error {
  constructor(public readonly code: ErrorCode, message?: string) {
    super(message ?? code)
    this.name = "AppError"
  }
}
