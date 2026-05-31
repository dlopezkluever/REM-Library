/* eslint-disable react-refresh/only-export-components */
import { BookOpen, FileAudio, FileText, LinkIcon, Video } from 'lucide-react'
import type { AdminSourceRow, PipelineStage } from '@/lib/api/admin'

export const formatLabels: Record<AdminSourceRow['format'], string> = {
  audio: 'Audio',
  book: 'Book',
  text: 'Text',
  url: 'URL',
  video: 'Video',
}

export const stageLabels: Record<PipelineStage, string> = {
  chunking: 'Chunking',
  chunking_failed: 'Chunking Failed',
  curated: 'Curated',
  extracting: 'Extracting',
  extracting_failed: 'Extraction Failed',
  published: 'Published',
  review: 'Review',
  transcribing: 'Transcribing',
  transcribing_failed: 'Transcription Failed',
  uploaded: 'Uploaded',
}

export const pipelineOrder: PipelineStage[] = [
  'uploaded',
  'transcribing',
  'chunking',
  'extracting',
  'review',
  'curated',
  'published',
]

export const failedStageMap: Partial<Record<PipelineStage, PipelineStage>> = {
  chunking_failed: 'chunking',
  extracting_failed: 'extracting',
  transcribing_failed: 'transcribing',
}

export const isFailedPipelineStage = (stage: PipelineStage) => {
  return stage.endsWith('_failed')
}

export const getStageClassName = (stage: PipelineStage) => {
  if (isFailedPipelineStage(stage) || stage === 'review') {
    return 'border-terracotta/50 bg-terracotta-light text-terracotta-dark'
  }

  if (stage === 'published' || stage === 'curated') {
    return 'border-verdigris/60 bg-verdigris-light text-verdigris-dark'
  }

  if (stage === 'extracting' || stage === 'transcribing' || stage === 'chunking') {
    return 'border-[#C9A84C]/60 bg-[#FBF6DF] text-[#6F5A12]'
  }

  return 'border-black/15 bg-white text-[#777]'
}

const formatIconClass = 'h-4 w-4 text-[#777]'

export const SourceFormatIcon = ({ format }: { format: AdminSourceRow['format'] }) => {
  if (format === 'audio') {
    return <FileAudio aria-hidden="true" className={formatIconClass} />
  }

  if (format === 'video') {
    return <Video aria-hidden="true" className={formatIconClass} />
  }

  if (format === 'book') {
    return <BookOpen aria-hidden="true" className={formatIconClass} />
  }

  if (format === 'url') {
    return <LinkIcon aria-hidden="true" className={formatIconClass} />
  }

  return <FileText aria-hidden="true" className={formatIconClass} />
}
