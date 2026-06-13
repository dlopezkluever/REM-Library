import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import { Link } from 'react-router-dom'
import { getSignedSourceFileUrl, getSourceById } from '@/lib/api/sources'
import { formatTimestamp } from '@/lib/format'

interface InlineMediaPlayerProps {
  endSec?: number
  format: 'audio' | 'video'
  label?: string
  sourceId: string
  startSec: number
}

export const InlineMediaPlayer = ({
  endSec,
  format,
  label,
  sourceId,
  startSec,
}: InlineMediaPlayerProps) => {
  const mediaRef = useRef<HTMLMediaElement | null>(null)
  const [signedUrl, setSignedUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const retryCountRef = useRef(0)
  const sourcePath = `/source/${sourceId}#t-${startSec}`
  const src = signedUrl ? `${signedUrl}#t=${startSec}` : null

  const doFetch = useCallback(async (): Promise<string> => {
    const source = await getSourceById(sourceId)
    if (!source.file_path) throw new Error('Source file is not hosted.')
    return getSignedSourceFileUrl(source.file_path)
  }, [sourceId])

  useEffect(() => {
    let cancelled = false
    retryCountRef.current = 0

    void doFetch().then(
      (url) => {
        if (!cancelled) {
          setFailed(false)
          setSignedUrl(url)
          setLoading(false)
        }
      },
      () => {
        if (!cancelled) {
          setSignedUrl(null)
          setFailed(true)
          setLoading(false)
        }
      }
    )

    return () => {
      cancelled = true
    }
  }, [doFetch])

  const handleLoadedMetadata = () => {
    if (mediaRef.current) {
      mediaRef.current.currentTime = startSec
    }
  }

  const handleTimeUpdate = () => {
    if (endSec !== undefined && mediaRef.current && mediaRef.current.currentTime >= endSec) {
      mediaRef.current.pause()
    }
  }

  const handleError = useCallback(() => {
    if (retryCountRef.current === 0) {
      retryCountRef.current = 1
      setSignedUrl(null)
      setLoading(true)
      setFailed(false)
      void doFetch().then(
        (url) => {
          setSignedUrl(url)
          setLoading(false)
        },
        () => {
          setFailed(true)
          setLoading(false)
        }
      )
    } else {
      setFailed(true)
      setLoading(false)
    }
  }, [doFetch])

  if (loading) {
    return (
      <div className="mt-3 h-12 animate-pulse rounded border-0.5 border-black/10 bg-stone/50" />
    )
  }

  if (failed || !src) {
    return (
      <Link className="font-body text-[11px] text-verdigris hover:text-verdigris-dark" to={sourcePath}>
        Open source at {formatTimestamp(startSec) ?? `${startSec}s`}
      </Link>
    )
  }

  return (
    <div className="mt-3 space-y-2 rounded border-0.5 border-black/10 bg-stone/50 p-3">
      {format === 'video' ? (
        <video
          ref={mediaRef as RefObject<HTMLVideoElement>}
          className="w-full"
          controls
          src={src}
          onError={handleError}
          onLoadedMetadata={handleLoadedMetadata}
          onTimeUpdate={handleTimeUpdate}
        >
          <track kind="captions" />
        </video>
      ) : (
        <audio
          ref={mediaRef as RefObject<HTMLAudioElement>}
          className="w-full"
          controls
          src={src}
          onError={handleError}
          onLoadedMetadata={handleLoadedMetadata}
          onTimeUpdate={handleTimeUpdate}
        >
          <track kind="captions" />
        </audio>
      )}
      <Link className="font-body text-[11px] text-verdigris hover:text-verdigris-dark" to={sourcePath}>
        {label ?? `Source at ${formatTimestamp(startSec) ?? `${startSec}s`}`}
      </Link>
    </div>
  )
}
