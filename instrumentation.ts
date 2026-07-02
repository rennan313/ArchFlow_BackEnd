export async function register() {
  // Validate all required env vars at startup — fail fast before the first
  // request instead of throwing mid-request on the first API call.
  await import("./src/lib/env")
}
