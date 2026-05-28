# ArchFlow API — Frontend Integration Guide

Complete reference for connecting your frontend to the ArchFlow backend.

---

## Base URL

```
Development:  http://localhost:3000
Production:   https://your-domain.com
```

All API routes live under `/api/`.

---

## Global Headers

| Header | Value | When |
|---|---|---|
| `Content-Type` | `application/json` | Every request with a body |
| `Authorization` | `Bearer <accessToken>` | Every protected route |

---

## Standard Response Envelope

Every response follows the same shape:

```ts
// Success
{
  success: true,
  data: T,
  message?: string,
  pagination?: {         // only on list endpoints
    total: number,
    page: number,
    limit: number,
    totalPages: number
  }
}

// Error
{
  success: false,
  message: string,
  errors?: {             // only on validation errors (400)
    [field: string]: string[]
  }
}
```

### HTTP Status Codes

| Code | Meaning |
|---|---|
| `200` | OK |
| `201` | Created |
| `204` | Deleted (no body) |
| `400` | Validation error |
| `401` | Missing / invalid / expired token |
| `403` | Forbidden (wrong role) |
| `404` | Resource not found |
| `409` | Conflict (e.g. email already taken) |
| `500` | Internal server error |

---

## TypeScript Types

Copy these into your frontend project:

```ts
// ─── Enums ───────────────────────────────────────────────────────────────────
export type Role            = "USER" | "ADMIN";
export type ProposalStatus  = "DRAFT" | "SENT" | "APPROVED" | "REJECTED";
export type InstanceStatus  = "RUNNING" | "STOPPED" | "PENDING" | "ERROR";
export type Environment     = "PRODUCTION" | "STAGING" | "DEVELOPMENT";

// ─── Models ──────────────────────────────────────────────────────────────────
export interface User {
  id:        string;
  name:      string;
  email:     string;
  role:      Role;
  createdAt: string; // ISO 8601
  updatedAt: string;
}

export interface Proposal {
  id:            string;
  userId:        string;
  clientName:    string;
  projectType:   string;
  squareMeters:  number;
  city:          string;
  style:         string;
  scope:         string;
  generatedText: string | null;
  status:        ProposalStatus;
  createdAt:     string;
  updatedAt:     string;
}

export interface Instance {
  id:          string;
  name:        string;
  status:      InstanceStatus;
  ip:          string;
  environment: Environment;
  memoryUsage: number;   // 0–100 %
  cpuUsage:    number;   // 0–100 %
  uptime:      number;   // seconds
  createdAt:   string;
}

export interface InstanceMetrics {
  id:     string;
  name:   string;
  status: InstanceStatus;
  metrics: {
    memoryUsage: number;
    cpuUsage:    number;
    uptime:      number;
  };
  timestamp: string; // ISO 8601
}

// ─── Pagination ───────────────────────────────────────────────────────────────
export interface Pagination {
  total:      number;
  page:       number;
  limit:      number;
  totalPages: number;
}

// ─── API Responses ────────────────────────────────────────────────────────────
export interface ApiResponse<T> {
  success:    boolean;
  data?:      T;
  message?:   string;
  pagination?: Pagination;
  errors?:    Record<string, string[]>;
}
```

---

## Auth Endpoints

### POST `/api/auth/register`

Create a new account.

**Headers:** `Content-Type: application/json`

**Body:**
```json
{
  "name":     "Ana Souza",
  "email":    "ana@archflow.com",
  "password": "Secure123"
}
```

**Validation rules:**
- `name` — min 2 chars, max 100
- `email` — valid email format
- `password` — min 8 chars, at least 1 uppercase letter, at least 1 number

**Response `201`:**
```json
{
  "success": true,
  "message": "Account created successfully",
  "data": {
    "id":        "6650a1b2c3d4e5f678901234",
    "name":      "Ana Souza",
    "email":     "ana@archflow.com",
    "role":      "USER",
    "createdAt": "2025-05-27T18:00:00.000Z",
    "updatedAt": "2025-05-27T18:00:00.000Z"
  }
}
```

**Error `409` — email taken:**
```json
{ "success": false, "message": "Email address is already registered" }
```

**Error `400` — validation:**
```json
{
  "success": false,
  "message": "Validation failed",
  "errors": {
    "email":    ["Invalid email address"],
    "password": ["Password must contain at least one uppercase letter"]
  }
}
```

---

### POST `/api/auth/login`

Authenticate and receive tokens.

**Headers:** `Content-Type: application/json`

**Body:**
```json
{
  "email":    "ana@archflow.com",
  "password": "Secure123"
}
```

**Response `200`:**
```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "user": {
      "id":        "6650a1b2c3d4e5f678901234",
      "name":      "Ana Souza",
      "email":     "ana@archflow.com",
      "role":      "USER",
      "createdAt": "2025-05-27T18:00:00.000Z",
      "updatedAt": "2025-05-27T18:00:00.000Z"
    },
    "accessToken":  "<jwt — expires in 15 min>",
    "refreshToken": "<jwt — expires in 7 days>"
  }
}
```

**Error `401`:**
```json
{ "success": false, "message": "Invalid email or password" }
```

> **Storage tip:** store `accessToken` in memory (e.g. React state / Zustand) and `refreshToken` in an `httpOnly` cookie or `localStorage`. Never store the access token in a cookie accessible to JS.

---

### POST `/api/auth/refresh`

Exchange a refresh token for a new access + refresh token pair.

**Headers:** `Content-Type: application/json`

**Body:**
```json
{
  "refreshToken": "<your refresh token>"
}
```

**Response `200`:**
```json
{
  "success": true,
  "message": "Token refreshed",
  "data": {
    "accessToken":  "<new access token>",
    "refreshToken": "<new refresh token>"
  }
}
```

**Error `401`:**
```json
{ "success": false, "message": "Invalid or expired refresh token" }
```

> **When to call:** intercept `401` responses in your HTTP client and automatically call this endpoint, update stored tokens, then retry the original request.

---

### POST `/api/auth/forgot-password`

Request a password reset link.

**Headers:** `Content-Type: application/json`

**Body:**
```json
{
  "email": "ana@archflow.com"
}
```

**Response `200`:** *(always 200 to prevent email enumeration)*
```json
{
  "success": true,
  "data": {
    "message": "If this email exists, a reset link has been sent"
  }
}
```

> **Development only:** the response also includes `debug_token` with the raw token so you can test reset without an email provider.

```json
{
  "success": true,
  "data": {
    "message":     "If this email exists, a reset link has been sent",
    "debug_token": "a3f9bc12d45e6f7890ab..."
  }
}
```

---

### POST `/api/auth/reset-password`

Set a new password using the token from the reset email.

**Headers:** `Content-Type: application/json`

**Body:**
```json
{
  "token":    "a3f9bc12d45e6f7890ab...",
  "password": "NewSecure456"
}
```

**Validation rules:** same as register password (min 8, 1 uppercase, 1 number).

**Response `200`:**
```json
{
  "success": true,
  "message": "Password reset successfully",
  "data":    null
}
```

**Errors `400`:**
```json
{ "success": false, "message": "Invalid reset token" }
{ "success": false, "message": "Reset token has already been used" }
{ "success": false, "message": "Reset token has expired" }
```

---

### GET `/api/auth/me`

Get the currently logged-in user.

**Headers:** `Authorization: Bearer <accessToken>`

**Response `200`:**
```json
{
  "success": true,
  "data": {
    "id":        "6650a1b2c3d4e5f678901234",
    "name":      "Ana Souza",
    "email":     "ana@archflow.com",
    "role":      "USER",
    "createdAt": "2025-05-27T18:00:00.000Z",
    "updatedAt": "2025-05-27T18:00:00.000Z"
  }
}
```

**Error `401`:**
```json
{ "success": false, "message": "Missing or invalid authorization header" }
```

---

## Proposal Endpoints

All proposal routes require `Authorization: Bearer <accessToken>`.

Each user can only see and modify **their own** proposals — the backend filters by the authenticated user automatically.

---

### GET `/api/proposals`

List proposals with pagination, search, and filters.

**Headers:** `Authorization: Bearer <accessToken>`

**Query params:**

| Param | Type | Default | Description |
|---|---|---|---|
| `page` | `number` | `1` | Page number |
| `limit` | `number` | `10` | Items per page (max 100) |
| `search` | `string` | — | Searches `clientName`, `city`, `projectType`, `style` |
| `status` | `ProposalStatus` | — | Filter: `DRAFT` \| `SENT` \| `APPROVED` \| `REJECTED` |
| `sortBy` | `string` | `createdAt` | `createdAt` \| `updatedAt` \| `clientName` \| `squareMeters` |
| `sortOrder` | `string` | `desc` | `asc` \| `desc` |

**Example request:**
```
GET /api/proposals?page=1&limit=10&search=luxury&status=DRAFT&sortBy=createdAt&sortOrder=desc
```

**Response `200`:**
```json
{
  "success": true,
  "data": [
    {
      "id":            "6650a1b2c3d4e5f678901235",
      "userId":        "6650a1b2c3d4e5f678901234",
      "clientName":    "João Lima",
      "projectType":   "Residential",
      "squareMeters":  120.5,
      "city":          "São Paulo",
      "style":         "Modern Minimalist",
      "scope":         "Full interior and exterior design...",
      "generatedText": null,
      "status":        "DRAFT",
      "createdAt":     "2025-05-27T18:00:00.000Z",
      "updatedAt":     "2025-05-27T18:00:00.000Z"
    }
  ],
  "pagination": {
    "total":      42,
    "page":       1,
    "limit":      10,
    "totalPages": 5
  }
}
```

---

### GET `/api/proposals/:id`

Get a single proposal.

**Headers:** `Authorization: Bearer <accessToken>`

**URL param:** `id` — MongoDB ObjectId string

**Response `200`:**
```json
{
  "success": true,
  "data": {
    "id":            "6650a1b2c3d4e5f678901235",
    "userId":        "6650a1b2c3d4e5f678901234",
    "clientName":    "João Lima",
    "projectType":   "Residential",
    "squareMeters":  120.5,
    "city":          "São Paulo",
    "style":         "Modern Minimalist",
    "scope":         "Full interior and exterior design...",
    "generatedText": null,
    "status":        "DRAFT",
    "createdAt":     "2025-05-27T18:00:00.000Z",
    "updatedAt":     "2025-05-27T18:00:00.000Z"
  }
}
```

**Error `404`:**
```json
{ "success": false, "message": "Resource not found" }
```

---

### POST `/api/proposals`

Create a new proposal.

**Headers:** `Authorization: Bearer <accessToken>`, `Content-Type: application/json`

**Body:**
```json
{
  "clientName":    "João Lima",
  "projectType":   "Residential",
  "squareMeters":  120.5,
  "city":          "São Paulo",
  "style":         "Modern Minimalist",
  "scope":         "Full interior and exterior design including lighting plan.",
  "generatedText": "Optional AI-generated text...",
  "status":        "DRAFT"
}
```

**Field rules:**

| Field | Required | Rules |
|---|---|---|
| `clientName` | Yes | min 2, max 100 chars |
| `projectType` | Yes | min 2, max 100 chars |
| `squareMeters` | Yes | positive number |
| `city` | Yes | min 2, max 100 chars |
| `style` | Yes | min 2, max 100 chars |
| `scope` | Yes | min 10, max 2000 chars |
| `generatedText` | No | max 10000 chars |
| `status` | No | defaults to `DRAFT` |

**Response `201`:**
```json
{
  "success": true,
  "message": "Proposal created successfully",
  "data": {
    "id":            "6650a1b2c3d4e5f678901235",
    "userId":        "6650a1b2c3d4e5f678901234",
    "clientName":    "João Lima",
    "projectType":   "Residential",
    "squareMeters":  120.5,
    "city":          "São Paulo",
    "style":         "Modern Minimalist",
    "scope":         "Full interior and exterior design including lighting plan.",
    "generatedText": "Optional AI-generated text...",
    "status":        "DRAFT",
    "createdAt":     "2025-05-27T18:00:00.000Z",
    "updatedAt":     "2025-05-27T18:00:00.000Z"
  }
}
```

---

### PUT `/api/proposals/:id`

Update a proposal. All fields are optional — send only what changed.

**Headers:** `Authorization: Bearer <accessToken>`, `Content-Type: application/json`

**URL param:** `id` — MongoDB ObjectId string

**Body (all optional):**
```json
{
  "clientName":    "João Lima Updated",
  "projectType":   "Commercial",
  "squareMeters":  200,
  "city":          "Rio de Janeiro",
  "style":         "Industrial",
  "scope":         "Updated scope description here.",
  "generatedText": "New AI text...",
  "status":        "SENT"
}
```

**Response `200`:**
```json
{
  "success": true,
  "message": "Proposal updated successfully",
  "data": { "...updated proposal..." }
}
```

---

### DELETE `/api/proposals/:id`

Delete a proposal.

**Headers:** `Authorization: Bearer <accessToken>`

**URL param:** `id` — MongoDB ObjectId string

**Response `204`:** no body

**Error `404`:**
```json
{ "success": false, "message": "Resource not found" }
```

---

## Instance Endpoints

All instance routes require `Authorization: Bearer <accessToken>`.

Instances are read-only from the frontend (monitoring only).

---

### GET `/api/instances`

List all infrastructure instances.

**Headers:** `Authorization: Bearer <accessToken>`

**Query params:**

| Param | Type | Default | Description |
|---|---|---|---|
| `page` | `number` | `1` | Page number |
| `limit` | `number` | `10` | Items per page (max 100) |
| `search` | `string` | — | Searches `name` and `ip` |
| `status` | `InstanceStatus` | — | `RUNNING` \| `STOPPED` \| `PENDING` \| `ERROR` |
| `environment` | `Environment` | — | `PRODUCTION` \| `STAGING` \| `DEVELOPMENT` |
| `sortBy` | `string` | `createdAt` | `createdAt` \| `name` \| `cpuUsage` \| `memoryUsage` \| `uptime` |
| `sortOrder` | `string` | `desc` | `asc` \| `desc` |

**Example request:**
```
GET /api/instances?status=RUNNING&environment=PRODUCTION&sortBy=cpuUsage&sortOrder=desc
```

**Response `200`:**
```json
{
  "success": true,
  "data": [
    {
      "id":          "6650a1b2c3d4e5f678901236",
      "name":        "prod-server-01",
      "status":      "RUNNING",
      "ip":          "192.168.1.100",
      "environment": "PRODUCTION",
      "memoryUsage": 72.3,
      "cpuUsage":    14.5,
      "uptime":      86400,
      "createdAt":   "2025-05-27T18:00:00.000Z"
    }
  ],
  "pagination": {
    "total":      3,
    "page":       1,
    "limit":      10,
    "totalPages": 1
  }
}
```

---

### GET `/api/instances/:id`

Get a single instance.

**Headers:** `Authorization: Bearer <accessToken>`

**URL param:** `id` — MongoDB ObjectId string

**Response `200`:**
```json
{
  "success": true,
  "data": {
    "id":          "6650a1b2c3d4e5f678901236",
    "name":        "prod-server-01",
    "status":      "RUNNING",
    "ip":          "192.168.1.100",
    "environment": "PRODUCTION",
    "memoryUsage": 72.3,
    "cpuUsage":    14.5,
    "uptime":      86400,
    "createdAt":   "2025-05-27T18:00:00.000Z"
  }
}
```

---

### GET `/api/instances/:id/metrics`

Get a metrics snapshot for an instance (CPU, memory, uptime + timestamp).

**Headers:** `Authorization: Bearer <accessToken>`

**URL param:** `id` — MongoDB ObjectId string

**Response `200`:**
```json
{
  "success": true,
  "data": {
    "id":     "6650a1b2c3d4e5f678901236",
    "name":   "prod-server-01",
    "status": "RUNNING",
    "metrics": {
      "memoryUsage": 72.3,
      "cpuUsage":    14.5,
      "uptime":      86400
    },
    "timestamp": "2025-05-27T20:00:00.000Z"
  }
}
```

> **Dashboard polling:** call this endpoint every 10–30 seconds to keep metrics fresh in your dashboard. Use `setInterval` + `clearInterval` on component unmount, or a library like SWR/React Query with `refreshInterval`.

---

## Auth Flow — Step-by-Step

```
1. User fills register form
   → POST /api/auth/register
   → on 201: redirect to login

2. User fills login form
   → POST /api/auth/login
   → on 200: store accessToken in memory, refreshToken in localStorage
   → redirect to dashboard

3. Every API call
   → add header: Authorization: Bearer <accessToken>

4. Any response is 401
   → POST /api/auth/refresh  { refreshToken }
   → on 200: update stored tokens, retry original request
   → on 401: clear tokens, redirect to login

5. Forgot password flow
   → POST /api/auth/forgot-password  { email }
   → show "check your email" message regardless of response
   → user clicks link in email → your frontend reads ?token= from URL
   → POST /api/auth/reset-password  { token, password }
   → on 200: redirect to login with success message
```

---

## Suggested HTTP Client Setup (Axios)

```ts
// lib/api.ts
import axios from "axios";

export const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000",
  headers: { "Content-Type": "application/json" },
});

// Attach access token to every request
api.interceptors.request.use((config) => {
  const token = getAccessToken(); // your state/store getter
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Auto-refresh on 401
api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;
    if (error.response?.status === 401 && !original._retry) {
      original._retry = true;
      try {
        const refreshToken = localStorage.getItem("refreshToken");
        const { data } = await axios.post("/api/auth/refresh", { refreshToken });
        setAccessToken(data.data.accessToken);   // your state/store setter
        localStorage.setItem("refreshToken", data.data.refreshToken);
        original.headers.Authorization = `Bearer ${data.data.accessToken}`;
        return api(original);
      } catch {
        clearTokens(); // logout
        window.location.href = "/login";
      }
    }
    return Promise.reject(error);
  }
);
```

---

## Suggested HTTP Client Setup (fetch + SWR)

```ts
// lib/fetcher.ts
export async function fetcher<T>(url: string): Promise<T> {
  const token = getAccessToken();
  const res = await fetch(url, {
    headers: {
      "Content-Type":  "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.message ?? "Request failed");
  }
  return res.json();
}

// Usage with SWR
import useSWR from "swr";

function useProposals(page = 1, search = "") {
  const { data, error, isLoading } = useSWR(
    `/api/proposals?page=${page}&search=${search}`,
    fetcher
  );
  return { proposals: data?.data, pagination: data?.pagination, error, isLoading };
}

// Metrics with auto-refresh every 15 seconds
function useInstanceMetrics(id: string) {
  return useSWR(`/api/instances/${id}/metrics`, fetcher, {
    refreshInterval: 15_000,
  });
}
```

---

## Error Handling Pattern

```ts
async function createProposal(body: CreateProposalInput) {
  try {
    const { data } = await api.post("/api/proposals", body);
    return data.data; // the Proposal object
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const res = error.response?.data;

      // Validation errors — map to form fields
      if (res?.errors) {
        // e.g. { clientName: ["min 2 chars"] }
        return { fieldErrors: res.errors };
      }

      // Single message errors
      throw new Error(res?.message ?? "Something went wrong");
    }
    throw error;
  }
}
```

---

## Quick Reference — All Endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/api/auth/register` | No | Create account |
| `POST` | `/api/auth/login` | No | Login, get tokens |
| `POST` | `/api/auth/refresh` | No | Refresh tokens |
| `POST` | `/api/auth/forgot-password` | No | Request reset link |
| `POST` | `/api/auth/reset-password` | No | Set new password |
| `GET` | `/api/auth/me` | Yes | Get current user |
| `GET` | `/api/proposals` | Yes | List proposals (paginated) |
| `POST` | `/api/proposals` | Yes | Create proposal |
| `GET` | `/api/proposals/:id` | Yes | Get proposal |
| `PUT` | `/api/proposals/:id` | Yes | Update proposal |
| `DELETE` | `/api/proposals/:id` | Yes | Delete proposal |
| `GET` | `/api/instances` | Yes | List instances (paginated) |
| `GET` | `/api/instances/:id` | Yes | Get instance |
| `GET` | `/api/instances/:id/metrics` | Yes | Get metrics snapshot |

> **Interactive docs:** run the backend and open `http://localhost:3000/docs` to explore and test every endpoint directly in the browser via Swagger UI.
