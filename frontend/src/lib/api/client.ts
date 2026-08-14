// A thin fetch wrapper — no client-side token handling at all. The session
// lives only in an httpOnly cookie (credentials: 'include' sends it
// automatically); JS never reads or stores it. X-Yantra-Request is the CSRF
// defense the backend's RequireCSRFHeader middleware checks on every
// mutating request (paired with the cookie's SameSite=Lax).
const API_BASE = '/api/v1'

export class ApiError extends Error {
  status: number
  code: string

  constructor(status: number, code: string, message: string) {
    super(message)
    this.status = status
    this.code = code
  }
}

interface ErrorBody {
  error: { code: string; message: string }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const method = (options.method ?? 'GET').toUpperCase()
  const isMutating = method !== 'GET' && method !== 'HEAD'

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    method,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(isMutating ? { 'X-Yantra-Request': '1' } : {}),
      ...options.headers,
    },
  })

  if (res.status === 204) {
    return undefined as T
  }

  const body = await res.json().catch(() => null)

  if (!res.ok) {
    const errBody = body as ErrorBody | null
    throw new ApiError(
      res.status,
      errBody?.error?.code ?? 'unknown_error',
      errBody?.error?.message ?? 'Something went wrong.',
    )
  }

  return body as T
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, data?: unknown) =>
    request<T>(path, { method: 'POST', body: data !== undefined ? JSON.stringify(data) : undefined }),
  patch: <T>(path: string, data?: unknown) =>
    request<T>(path, { method: 'PATCH', body: data !== undefined ? JSON.stringify(data) : undefined }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
}
