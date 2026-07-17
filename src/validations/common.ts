import { z } from "zod"

// `z.coerce.boolean()` is a footgun for query-string booleans: it calls
// `Boolean(value)` internally, and in JavaScript `Boolean("false")` is
// `true` — any non-empty string coerces to `true`. A caller explicitly
// requesting `?archived=false` would get the exact opposite of what they
// asked for. This instead parses the two literal strings a query param
// actually sends ("true"/"false") and coerces to the real boolean value.
// Never replace with `z.coerce.boolean()` in a query schema — see ADR-020,
// this bug was caught live testing the Entity Lifecycle sprint.
export const booleanQueryParam = z.enum(["true", "false"]).transform((v) => v === "true")

/** Same as `booleanQueryParam`, but a missing query param resolves to
 *  `defaultValue` instead of `undefined` — for list endpoints that must
 *  always filter one way or the other (e.g. `archived` defaulting to
 *  `false`). Preprocesses `undefined` into the default's string form
 *  *before* the enum validates, since `.default()` alone would try to
 *  validate the boolean default against the pre-transform string enum. */
export function booleanQueryParamWithDefault(defaultValue: boolean) {
  return z.preprocess(
    (v) => (v === undefined ? String(defaultValue) : v),
    booleanQueryParam,
  )
}
