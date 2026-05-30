import { useEffect, useRef, useState } from 'react'
import { searchAll } from '@/lib/api/search'
import { EMPTY_SEARCH_RESULTS } from '@/lib/searchResults'
import type { SearchResults } from '@/types/domain'

interface UseSearchOptions {
  debounceMs?: number
}

export const useSearch = (options: UseSearchOptions = {}) => {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResults>(EMPTY_SEARCH_RESULTS)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)
  const debounceMs = options.debounceMs ?? 200

  useEffect(() => {
    const trimmedQuery = query.trim()

    abortControllerRef.current?.abort()

    if (!trimmedQuery) {
      return undefined
    }

    const controller = new AbortController()
    abortControllerRef.current = controller

    const timer = window.setTimeout(() => {
      setIsLoading(true)
      setError(null)
      void searchAll(trimmedQuery, { signal: controller.signal })
        .then((nextResults) => {
          if (!controller.signal.aborted) {
            setResults(nextResults)
          }
        })
        .catch((nextError: unknown) => {
          if (controller.signal.aborted) {
            return
          }

          setError(nextError instanceof Error ? nextError : new Error('Search failed.'))
          setResults(EMPTY_SEARCH_RESULTS)
        })
        .finally(() => {
          if (!controller.signal.aborted) {
            setIsLoading(false)
          }
        })
    }, debounceMs)

    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [debounceMs, query])

  const updateQuery = (nextQuery: string) => {
    setQuery(nextQuery)

    if (!nextQuery.trim()) {
      abortControllerRef.current?.abort()
      setResults(EMPTY_SEARCH_RESULTS)
      setIsLoading(false)
      setError(null)
    }
  }

  const hasQuery = query.trim().length > 0

  return {
    error: hasQuery ? error : null,
    isLoading: hasQuery ? isLoading : false,
    query,
    results: hasQuery ? results : EMPTY_SEARCH_RESULTS,
    setQuery: updateQuery,
  }
}
