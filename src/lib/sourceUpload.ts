import type { SourceFormat } from '@/lib/api/admin'
import { parseAndNormalizeSourceUrlForStorage } from '@/lib/sourceUrl'

export const maxSourceUploadBytes = 1024 * 1024 * 1024

export const sourceFileAccept =
  '.aac,.aif,.aiff,.doc,.docx,.epub,.flac,.m4a,.md,.mov,.mp3,.mp4,.mpeg,.mpg,.ogg,.pdf,.rtf,.txt,.wav,.webm'

export const sourceFileMimeTypes = [
  'application/epub+zip',
  'application/msword',
  'application/pdf',
  'application/rtf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'audio/aac',
  'audio/aiff',
  'audio/flac',
  'audio/m4a',
  'audio/mp4',
  'audio/mpeg',
  'audio/ogg',
  'audio/wav',
  'audio/wave',
  'audio/webm',
  'audio/x-aiff',
  'audio/x-m4a',
  'audio/x-wav',
  'text/markdown',
  'text/plain',
  'video/mp4',
  'video/mpeg',
  'video/quicktime',
  'video/webm',
]

const audioExtensions = new Set(['aac', 'aif', 'aiff', 'flac', 'm4a', 'mp3', 'ogg', 'wav'])
const videoExtensions = new Set(['mov', 'mp4', 'mpeg', 'mpg', 'webm'])
const bookExtensions = new Set(['epub', 'pdf'])
const textExtensions = new Set(['doc', 'docx', 'md', 'rtf', 'txt'])

export const sourceFileExtensions = new Set([
  ...audioExtensions,
  ...videoExtensions,
  ...bookExtensions,
  ...textExtensions,
])

export const getFileExtension = (filename: string) => {
  return filename.split('.').pop()?.toLowerCase() ?? ''
}

export const detectSourceFormat = (filename: string): SourceFormat => {
  const extension = getFileExtension(filename)

  if (audioExtensions.has(extension)) {
    return 'audio'
  }

  if (videoExtensions.has(extension)) {
    return 'video'
  }

  if (bookExtensions.has(extension)) {
    return 'book'
  }

  return 'text'
}

export const titleFromFilename = (filename: string) => {
  return filename
    .replace(/\.[^.]+$/, '')
    .replace(/[-_]+/g, ' ')
    .trim()
}

export const formatFileSize = (bytes: number) => {
  if (bytes >= 1024 * 1024 * 1024) {
    return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`
  }

  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

export const validateSourceFile = (file: File) => {
  const extension = getFileExtension(file.name)

  if (!sourceFileExtensions.has(extension)) {
    return 'Choose a supported source file type.'
  }

  if (file.size > maxSourceUploadBytes) {
    return `Choose a file smaller than ${formatFileSize(maxSourceUploadBytes)}.`
  }

  return null
}

export const normalizeSourceUrl = parseAndNormalizeSourceUrlForStorage

export const createClientUuid = () => {
  if (!globalThis.crypto?.randomUUID) {
    throw new Error('This browser cannot create source ids. Please update the browser.')
  }

  return globalThis.crypto.randomUUID()
}
