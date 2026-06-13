import {
  corsHeaders,
  createServiceClient,
  errorMessage,
  jsonResponse,
  readJsonBody,
  requireAdminOrServiceRole,
} from '../_shared/pipeline.ts'

interface CrawlCandidate {
  id: string
  title: string
  url: string
  word_count: number
}

const userAgent = 'AlexandriaBot/1.0'
const maxCandidates = 50
const minimumDelayMs = 1_000
const requestTimeoutMs = 10_000
const nonArticlePathPatterns = [
  /\/tag(\/|$)/i,
  /\/author(\/|$)/i,
  /\/page(\/|$)/i,
  /\/category(\/|$)/i,
  /\/search(\/|$)/i,
  /\/login(\/|$)/i,
  /\/signup(\/|$)/i,
]

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const getRootUrl = (body: unknown) => {
  if (typeof body !== 'object' || body === null || !('root_url' in body)) {
    throw new Error('root_url is required.')
  }

  const rootUrl = (body as { root_url: unknown }).root_url

  if (typeof rootUrl !== 'string' || !rootUrl.trim()) {
    throw new Error('root_url is required.')
  }

  return rootUrl.trim()
}

const normalizeUrl = (input: string | URL) => {
  const url = input instanceof URL ? new URL(input) : new URL(input)
  url.hash = ''
  url.search = ''

  if (url.pathname.length > 1) {
    url.pathname = url.pathname.replace(/\/+$/, '')
  }

  url.hostname = url.hostname.toLowerCase()

  return url.toString()
}

const decodeEntities = (text: string) => {
  return text
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
}

const stripHtmlToText = (html: string) =>
  decodeEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
  )
    .replace(/\s+/g, ' ')
    .trim()

const wordCount = (text: string) => text.match(/\S+/g)?.length ?? 0

const titleFromHtml = (html: string, fallbackUrl: string) => {
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]
  const cleanedTitle = title ? decodeEntities(title).replace(/\s+/g, ' ').trim() : ''

  if (cleanedTitle) {
    return cleanedTitle.slice(0, 180)
  }

  const url = new URL(fallbackUrl)
  const slug = url.pathname.split('/').filter(Boolean).at(-1)?.replace(/[-_]+/g, ' ') ?? url.host

  return slug.slice(0, 180)
}

const isArticleLikeUrl = (url: URL, rootHostname: string) => {
  if (url.hostname.toLowerCase() !== rootHostname) {
    return false
  }

  if (nonArticlePathPatterns.some((pattern) => pattern.test(url.pathname))) {
    return false
  }

  return url.pathname.split('/').filter(Boolean).length >= 2
}

const fetchText = async (url: string) => {
  const abortController = new AbortController()
  const timeoutId = setTimeout(() => abortController.abort(), requestTimeoutMs)

  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': userAgent },
      signal: abortController.signal,
    })

    if (!response.ok) {
      throw new Error(`${url} returned HTTP ${response.status}.`)
    }

    return await response.text()
  } finally {
    clearTimeout(timeoutId)
  }
}

const getAllowedDomain = async (
  supabase: ReturnType<typeof createServiceClient>,
  hostname: string
) => {
  const { data, error } = await supabase
    .from('url_ingestion_config')
    .select('id')
    .eq('domain', hostname)
    .eq('enabled', true)
    .maybeSingle()

  if (error) {
    throw error
  }

  return data
}

const fetchRobotsPolicy = async (origin: string) => {
  try {
    const robots = await fetchText(`${origin}/robots.txt`)
    const crawlDelayMatch = robots.match(/crawl-delay:\s*(\d+(?:\.\d+)?)/i)
    const delayMs = crawlDelayMatch
      ? Math.max(Number(crawlDelayMatch[1]) * 1000, minimumDelayMs)
      : minimumDelayMs
    const disallowPaths = Array.from(robots.matchAll(/disallow:\s*(\S+)/gi))
      .map((match) => match[1])
      .filter((path) => path && path !== '/')

    return { delayMs, disallowPaths }
  } catch {
    return { delayMs: minimumDelayMs, disallowPaths: [] }
  }
}

const isAllowedByRobots = (url: URL, disallowPaths: string[]) =>
  !disallowPaths.some((path) => url.pathname.startsWith(path))

const extractSitemapUrls = (xml: string, rootHostname: string) => {
  const locs = Array.from(xml.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/gi)).map((match) =>
    decodeEntities(match[1].trim())
  )
  const sitemapUrls = locs.filter((loc) => /sitemap/i.test(loc))

  if (sitemapUrls.length > 0 && locs.every((loc) => /sitemap/i.test(loc))) {
    return { articleUrls: [], sitemapUrls }
  }

  return {
    articleUrls: locs.filter((loc) => {
      try {
        return isArticleLikeUrl(new URL(loc), rootHostname)
      } catch {
        return false
      }
    }),
    sitemapUrls,
  }
}

const discoverFromSitemap = async (root: URL, rootHostname: string, delayMs: number) => {
  const candidates = [`${root.origin}/sitemap.xml`, `${root.origin}/sitemap_index.xml`]

  for (const sitemapUrl of candidates) {
    try {
      const xml = await fetchText(sitemapUrl)
      const sitemap = extractSitemapUrls(xml, rootHostname)
      const { sitemapUrls } = sitemap
      let { articleUrls } = sitemap

      for (const nestedSitemapUrl of sitemapUrls.slice(0, 5)) {
        if (articleUrls.length >= maxCandidates) {
          break
        }

        await sleep(delayMs)
        const nestedXml = await fetchText(nestedSitemapUrl)
        articleUrls = [
          ...articleUrls,
          ...extractSitemapUrls(nestedXml, rootHostname).articleUrls,
        ]
      }

      if (articleUrls.length > 0) {
        return articleUrls
      }
    } catch {
      // Try the next sitemap candidate or fall back to link extraction.
    }

    await sleep(delayMs)
  }

  return []
}

const discoverFromRootLinks = async (root: URL, rootHostname: string) => {
  const html = await fetchText(root.toString())

  return Array.from(html.matchAll(/<a\s+[^>]*href=["']([^"']+)["']/gi))
    .flatMap((match) => {
      try {
        const url = new URL(decodeEntities(match[1]), root)
        return isArticleLikeUrl(url, rootHostname) ? [url.toString()] : []
      } catch {
        return []
      }
    })
}

const sourceExists = async (
  supabase: ReturnType<typeof createServiceClient>,
  normalizedUrl: string
) => {
  const { data, error } = await supabase.rpc('find_source_by_normalized_url', {
    input_url: normalizedUrl,
  })

  if (error) {
    throw error
  }

  return Array.isArray(data) && data.length > 0
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabase = createServiceClient()
    const body = await readJsonBody(request)
    const rootUrlInput = getRootUrl(body)

    await requireAdminOrServiceRole(request, supabase)

    const root = new URL(
      rootUrlInput.startsWith('http://') || rootUrlInput.startsWith('https://')
        ? rootUrlInput
        : `https://${rootUrlInput}`
    )
    const rootHostname = root.hostname.toLowerCase()
    const allowedDomain = await getAllowedDomain(supabase, rootHostname)

    if (!allowedDomain) {
      return jsonResponse({ error: `Domain is not allowlisted: ${rootHostname}.` }, 400)
    }

    const robots = await fetchRobotsPolicy(root.origin)
    let urls = await discoverFromSitemap(root, rootHostname, robots.delayMs)

    if (urls.length === 0) {
      await sleep(robots.delayMs)
      urls = await discoverFromRootLinks(root, rootHostname)
    }

    const deduped = Array.from(new Set(urls.map((url) => normalizeUrl(url))))
    const totalDiscovered = deduped.length
    const uniqueUrls = deduped.slice(0, maxCandidates)
    const created: CrawlCandidate[] = []
    const skipped: Array<{ reason: string; url: string }> = []

    for (const url of uniqueUrls) {
      const parsedUrl = new URL(url)

      if (!isAllowedByRobots(parsedUrl, robots.disallowPaths)) {
        skipped.push({ reason: 'Blocked by robots.txt.', url })
        continue
      }

      if (await sourceExists(supabase, url)) {
        skipped.push({ reason: 'Duplicate source URL.', url })
        continue
      }

      // Derive title from URL slug without fetching the full page; the
      // per-URL fetch was too slow (50+ seconds) and word count is not needed
      // to make a process/skip decision. Word count will be computed when the
      // admin clicks Process.
      const title = titleFromHtml('', url)

      const { data: source, error } = await supabase
        .from('sources')
        .insert({
          authors: [],
          format: 'url',
          pipeline_stage: 'uploaded',
          status: 'draft',
          tier: 'secondary',
          title,
          url,
        })
        .select('id')
        .single()

      if (error) {
        skipped.push({ reason: error.message, url })
        continue
      }

      created.push({ id: source.id, title, url, word_count: 0 })
    }

    return jsonResponse({
      created,
      skipped,
      total_discovered: totalDiscovered,
      truncated: totalDiscovered > maxCandidates,
    })
  } catch (error) {
    return jsonResponse({ error: errorMessage(error) }, 500)
  }
})
