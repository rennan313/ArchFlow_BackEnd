// Sanitize user input before injecting into AI prompts.
// Prevents prompt-injection attacks via meetingNotes / briefing fields.
// Extracted from prompt-builder.service.ts (Fase A) so both the legacy and
// the premium-narrative prompt builders share the exact same filter list —
// this regex set must never drift between the two flows.
export function sanitize(text: string | undefined | null, maxLen = 3000): string {
  if (!text) return ""
  return text
    .slice(0, maxLen)
    .replace(/```/g, "'''")           // prevent markdown code-fence breakout
    .replace(/\bignore\b.{0,80}\binstructions?\b/gi, "[filtrado]")
    .replace(/\bsystem\b.{0,20}\bprompt\b/gi, "[filtrado]")
    .replace(/\bdisregard\b/gi, "[filtrado]")
    .replace(/\bforget\b.{0,30}\binstructions?\b/gi, "[filtrado]")
    .replace(/\bpretend\b.{0,30}\byou are\b/gi, "[filtrado]")
    .replace(/\bact as\b/gi, "[filtrado]")
    .replace(/\n\n(Human|Assistant|System):/g, "\n\n[filtrado]:")
    .trim()
}
