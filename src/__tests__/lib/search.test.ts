import { beforeEach, describe, expect, it, vi } from 'vitest'

const { invokeMock, rpcMock } = vi.hoisted(() => ({
  invokeMock: vi.fn(),
  rpcMock: vi.fn(),
}))

vi.mock('@/lib/supabase/client', () => ({
  supabase: {
    functions: {
      invoke: invokeMock,
    },
    rpc: rpcMock,
  },
}))

describe('search API cancellation', () => {
  beforeEach(() => {
    invokeMock.mockReset()
    rpcMock.mockReset()
  })

  it('rejects with AbortError when the RPC fallback is aborted after resolving', async () => {
    const { searchAll } = await import('@/lib/api/search')
    const controller = new AbortController()
    let resolveRpc: (value: {
      data: { claims: []; entities: []; sources: [] }
      error: null
    }) => void = () => undefined

    invokeMock.mockRejectedValueOnce(new Error('Function unavailable'))
    rpcMock.mockReturnValueOnce({
      abortSignal: vi.fn(
        () =>
          new Promise<{
            data: { claims: []; entities: []; sources: [] }
            error: null
          }>((resolve) => {
            resolveRpc = resolve
          })
      ),
    })

    const searchPromise = searchAll('prometheus', { signal: controller.signal })

    await vi.waitFor(() =>
      expect(rpcMock).toHaveBeenCalledWith('search_global', { search_query: 'prometheus' })
    )

    controller.abort()
    resolveRpc({ data: { claims: [], entities: [], sources: [] }, error: null })

    await expect(searchPromise).rejects.toMatchObject({ name: 'AbortError' })
  })
})
