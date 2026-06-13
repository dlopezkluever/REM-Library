import { useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Globe, Plus } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useAuth } from '@/hooks/useAuth'
import {
  createUrlIngestionDomain,
  listUrlIngestionDomains,
  updateUrlIngestionDomainEnabled,
} from '@/lib/api/admin'

const getErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : 'Domain update failed.'

export default function AdminUrlDomainsPage() {
  const queryClient = useQueryClient()
  const { role } = useAuth()
  const [domain, setDomain] = useState('')
  const domainsQuery = useQuery({
    queryKey: ['admin', 'url-domains'],
    queryFn: listUrlIngestionDomains,
  })

  const createMutation = useMutation({
    mutationFn: () => createUrlIngestionDomain(domain),
    onSuccess: async () => {
      setDomain('')
      await queryClient.invalidateQueries({ queryKey: ['admin', 'url-domains'] })
    },
  })

  const toggleMutation = useMutation({
    mutationFn: ({ id, enabled }: { enabled: boolean; id: string }) =>
      updateUrlIngestionDomainEnabled(id, enabled),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin', 'url-domains'] })
    },
  })

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    createMutation.mutate()
  }

  if (role !== 'super_admin') {
    return (
      <div className="rounded border border-0.5 border-terracotta/30 bg-terracotta-light p-5">
        <p className="font-body text-sm text-terracotta-dark">Super admin access is required.</p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="font-display text-xl uppercase text-ink">URL Domains</h1>
        <p className="mt-1 font-body text-sm text-[#777]">
          Allowlisted domains for single-URL source ingestion.
        </p>
      </div>

      <form
        className="flex gap-2 rounded border border-0.5 border-black/[0.09] bg-white p-4"
        onSubmit={handleSubmit}
      >
        <div className="relative min-w-0 flex-1">
          <Globe
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#888]"
          />
          <Input
            className="pl-9"
            placeholder="example.com"
            value={domain}
            onChange={(event) => setDomain(event.target.value)}
          />
        </div>
        <Button disabled={createMutation.isPending || !domain.trim()} type="submit">
          <Plus aria-hidden="true" className="h-4 w-4" />
          Add
        </Button>
      </form>

      {createMutation.error || toggleMutation.error ? (
        <p className="font-body text-sm text-terracotta-dark">
          {getErrorMessage(createMutation.error ?? toggleMutation.error)}
        </p>
      ) : null}

      <section className="overflow-hidden rounded border border-0.5 border-black/[0.09] bg-white">
        {domainsQuery.isLoading ? (
          <p className="p-4 font-body text-sm text-[#777]">Loading domains...</p>
        ) : domainsQuery.error ? (
          <p className="p-4 font-body text-sm text-terracotta-dark">Domains could not load.</p>
        ) : (domainsQuery.data ?? []).length === 0 ? (
          <p className="p-4 font-body text-sm text-[#777]">No domains configured.</p>
        ) : (
          (domainsQuery.data ?? []).map((row) => (
            <div
              key={row.id}
              className="flex items-center justify-between gap-4 border-b border-b-0.5 border-b-black/[0.06] p-4 last:border-b-0"
            >
              <div>
                <p className="font-body text-sm text-ink">{row.domain}</p>
                <p className="font-body text-xs text-[#777]">
                  Added {new Date(row.created_at).toLocaleDateString()}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <Badge variant={row.enabled ? 'default' : 'outline'}>
                  {row.enabled ? 'Enabled' : 'Disabled'}
                </Badge>
                <Button
                  disabled={toggleMutation.isPending}
                  size="sm"
                  type="button"
                  variant="outline"
                  onClick={() =>
                    toggleMutation.mutate({
                      enabled: !row.enabled,
                      id: row.id,
                    })
                  }
                >
                  {row.enabled ? 'Disable' : 'Enable'}
                </Button>
              </div>
            </div>
          ))
        )}
      </section>
    </div>
  )
}
