# Auth Endpoint Migration — Completed in Phase 5

## Final State (Phase 5)

The auth system has been consolidated to **7 canonical endpoints**.

### Active endpoints
| Endpoint | File | Called by |
|---|---|---|
| `POST /api/auth/login` | `auth/login/route.ts` | NextAuth Credentials provider (canonical) |
| `POST /api/auth/register` | `auth/register/route.ts` | Direct API consumers |
| `POST /api/auth/google-signin` | `auth/google-signin/route.ts` | NextAuth Google callback |
| `POST /api/auth/forgot-password` | `auth/forgot-password/route.ts` | Frontend forgot-password page |
| `POST /api/auth/reset-password` | `auth/reset-password/route.ts` | Frontend reset-password page |
| `POST /api/auth/provision` | `auth/provision/route.ts` | Frontend register page (Supabase flow) |
| `GET  /api/auth/me` | `auth/me/route.ts` | Frontend API client |

### Removed in Phase 5
| Endpoint | Reason |
|---|---|
| `POST /api/auth/credentials-signin` | Duplicate of /api/auth/login. Frontend updated to call canonical endpoint. |
| `POST /api/auth/credentials-register` | No active callers after Supabase migration. |
| `POST /api/auth/refresh` | Was already returning 404. Removed. |

## Authentication Architecture

```
Browser / Client
     │
     ▼
NextAuth v5 (cookie-based JWT session)
     │
     ├─── Credentials provider ──────────► POST /api/auth/login
     │                                         authService.login() → JWT issue
     │
     ├─── Google provider ───────────────► POST /api/auth/google-signin
     │                                         authService.googleSignIn() → JWT issue
     │
     └─── Supabase signUp flow ──────────► POST /api/auth/provision
               (new registrations)             provisionService.provision()
                                               Supabase JWT verify → MongoDB user → JWT

All authenticated API requests:
  Browser ──► NextAuth session cookie
           ──► lib/api.ts extracts backendToken
           ──► Authorization: Bearer <backendToken>
           ──► withAuth() verifies JWT → handler executes
```

## Remaining work (Phase 6)
1. Complete Supabase migration: migrate all users to Supabase Auth
2. Remove password field from MongoDB User model
3. Retire POST /api/auth/provision after migration
4. Final endpoint count: 4
