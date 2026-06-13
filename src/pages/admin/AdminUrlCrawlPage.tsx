import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Globe, RefreshCw } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  listUrlIngestionDomains,
  triggerSiteCrawl,
  triggerUrlFetch,
} from '@/lib/api/admin'
import { ROUTES } from '@/constants/routes'

const getErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : 'Site crawl failed.'

export default function AdminUrlCrawlPage() {
  const queryClient = useQueryClient()
  const [rootUrl, setRootUrl] = useState('')
  const [crawlResult, setCrawlResult] = useState<Awaited<ReturnType<typeof triggerSiteCrawl>> | null>(
    null
  )
  const domainsQuery = useQuery({
    queryKey: ['admin', 'url-domains'],
    queryFn: listUrlIngestionDomains,
  })

  const crawlMutation = useMutation({
    mutationFn: () => triggerSiteCrawl(rootUrl),
    onSuccess: async (result) => {
      setCrawlResult(result)
      await queryClient.invalidateQueries({ queryKey: ['admin', 'source-list'] })
      await queryClient.invalidateQueries({ queryKey: ['admin', 'sources'] })
    },
  })

  const processMutation = useMutation({
    mutationFn: triggerUrlFetch,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin', 'source-list'] })
      await queryClient.invalidateQueries({ queryKey: ['admin', 'sources'] })
    },
  })

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    crawlMutation.mutate()
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="font-display text-xl uppercase text-ink">Crawl Site</h1>
        <p className="mt-1 font-body text-sm text-[#777]">
          Discover article URLs from an allowlisted site and create draft URL sources for review.
        </p>
      </div>

      <section className="rounded border border-0.5 border-black/[0.09] bg-white p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="font-display text-[10px] uppercase tracking-label text-ink">
            Allowed domains
          </h2>
          <Button asChild size="sm" type="button" variant="outline">
            <Link to={ROUTES.ADMIN_URL_DOMAINS}>Manage domains</Link>
          </Button>
        </div>
        <div className="flex flex-wrap gap-2">
          {(domainsQuery.data ?? []).map((domain) => (
            <Badge key={domain.id} variant={domain.enabled ? 'default' : 'outline'}>
              {domain.domain}
            </Badge>
          ))}
          {!domainsQuery.isLoading && (domainsQuery.data ?? []).length === 0 ? (
            <p className="font-body text-sm text-[#777]">No domains configured.</p>
          ) : null}
        </div>
      </section>

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
            required
            className="pl-9"
            placeholder="https://example.com/blog"
            value={rootUrl}
            onChange={(event) => setRootUrl(event.target.value)}
          />
        </div>
        <Button disabled={crawlMutation.isPending} type="submit">
          {crawlMutation.isPending ? (
            <RefreshCw aria-hidden="true" className="h-4 w-4 animate-spin" />
          ) : null}
          Crawl
        </Button>
      </form>

      {crawlMutation.error || processMutation.error ? (
        <p className="rounded border border-terracotta/30 bg-terracotta-light p-3 font-body text-sm text-terracotta-dark">
          {getErrorMessage(crawlMutation.error ?? processMutation.error)}
        </p>
      ) : null}

      {crawlResult ? (
        <section className="rounded border border-0.5 border-black/[0.09] bg-white">
          <div className="border-b-0.5 border-black/[0.06] p-4">
            <h2 className="font-display text-[10px] uppercase tracking-label text-ink">
              Discovered URLs
            </h2>
            <p className="mt-1 font-body text-xs text-[#777]">
              {crawlResult.created.length} created, {crawlResult.skipped.length} skipped.
            </p>
          </div>
          {crawlResult.created.length > 0 ? (
            <div className="divide-y divide-black/[0.06]">
              {crawlResult.created.map((source) => (
                <div key={source.id} className="grid gap-3 p-4 md:grid-cols-[minmax(0,1fr)_auto]">
                  <div className="min-w-0">
                    <Link
                      className="font-body text-sm font-semibold text-ink hover:text-verdigris"
                      to={`/admin/sources/${source.id}`}
                    >
                      {source.title}
                    </Link>
                    <p className="truncate font-body text-xs text-[#777]">{source.url}</p>
                    <p className="font-body text-xs text-[#888]">
                      Estimated {source.word_count} words
                    </p>
                  </div>
                  <Button
                    disabled={processMutation.isPending}
                    size="sm"
                    type="button"
                    variant="outline"
                    onClick={() => processMutation.mutate(source.id)}
                  >
                    Process
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <p className="p-4 font-body text-sm text-[#777]">No new URLs were created.</p>
          )}
          {crawlResult.skipped.length > 0 ? (
            <details className="border-t-0.5 border-black/[0.06] p-4">
              <summary className="cursor-pointer font-body text-sm text-[#777]">
                Skipped URLs
              </summary>
              <div className="mt-3 space-y-2">
                {crawlResult.skipped.map((item) => (
                  <p key={`${item.url}-${item.reason}`} className="font-body text-xs text-[#777]">
                    {item.reason} {item.url}
                  </p>
                ))}
              </div>
            </details>
          ) : null}
        </section>
      ) : null}
    </div>
  )
}
