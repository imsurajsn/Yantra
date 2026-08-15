import { describe, expect, it, vi, afterEach } from 'vitest'
import { api, ApiError } from './client'

describe('api client', () => {
  const originalFetch = globalThis.fetch

  afterEach(() => {
    globalThis.fetch = originalFetch
    vi.restoreAllMocks()
  })

  it('sends the CSRF header on mutating requests but not on GET', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    )
    globalThis.fetch = fetchMock as unknown as typeof fetch

    await api.get('/setup/status')
    await api.post('/auth/login', { email: 'a@b.com', password: 'x' })

    const [, getInit] = fetchMock.mock.calls[0]
    const [, postInit] = fetchMock.mock.calls[1]

    expect((getInit.headers as Record<string, string>)['X-Yantra-Request']).toBeUndefined()
    expect((postInit.headers as Record<string, string>)['X-Yantra-Request']).toBe('1')
    expect(getInit.credentials).toBe('include')
  })

  it('throws ApiError with the backend error envelope on failure', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: { code: 'invalid_credentials', message: 'Invalid email or password.' } }), {
        status: 401,
      }),
    ) as unknown as typeof fetch

    await expect(api.post('/auth/login', { email: 'a@b.com', password: 'wrong' })).rejects.toMatchObject({
      status: 401,
      code: 'invalid_credentials',
      message: 'Invalid email or password.',
    })
  })

  it('resolves to undefined on 204 No Content', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response(null, { status: 204 })) as unknown as typeof fetch
    await expect(api.post('/auth/logout')).resolves.toBeUndefined()
  })
})

// Sanity check that ApiError carries the fields callers switch on.
describe('ApiError', () => {
  it('exposes status and code', () => {
    const err = new ApiError(403, 'forbidden', 'nope')
    expect(err.status).toBe(403)
    expect(err.code).toBe('forbidden')
    expect(err.message).toBe('nope')
  })
})
