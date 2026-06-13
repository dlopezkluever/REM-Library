import { useEffect, useMemo, useRef, useState, type RefObject } from 'react'
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
  const [failed, setFailed] = useState(false)
  const sourcePath = `/source/${sourceId}#t-${startSec}`
  const src = useMemo(() => (signedUrl ? `${signedUrl}#t=${startSec}` : null), [signedUrl, startSec])

  useEffect(() => {
    let cancelled = false

    const loadSignedUrl = async () => {
      try {
        const source = await getSourceById(sourceId)

        if (!source.file_path) {
          throw new Error('Source file is not hosted.')
        }

        const url = await getSignedSourceFileUrl(source.file_path)

        if (!cancelled) {
          setSignedUrl(url)
          setFailed(false)
        }
      } catch {
        if (!cancelled) {
          setFailed(true)
        }
      }
    }

    void loadSignedUrl()

    return () => {
      cancelled = true
    }
  }, [sourceId])

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
          onError={() => setFailed(true)}
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
          onError={() => setFailed(true)}
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
