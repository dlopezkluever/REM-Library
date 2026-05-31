import { useState, type ChangeEvent, type FormEvent, type KeyboardEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Check, FileUp, LinkIcon, Loader2, Upload, X } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ROUTES } from '@/constants/routes'
import {
  adminSourceTitleExists,
  createAdminSource,
  deleteSourceFile,
  isAssemblyAiSourceFormat,
  triggerSourceTranscription,
  uploadSourceFile,
  type SourceFormat,
  type SourceTier,
  type SourceUploadProgress,
} from '@/lib/api/admin'
import {
  createClientUuid,
  detectSourceFormat,
  formatFileSize,
  normalizeSourceUrl,
  sourceFileAccept,
  titleFromFilename,
  validateSourceFile,
} from '@/lib/sourceUpload'
import { cn } from '@/lib/utils'

type SourceInputType = 'file' | 'url'

const formatOptions: Array<{ label: string; value: SourceFormat }> = [
  { label: 'Audio', value: 'audio' },
  { label: 'Video', value: 'video' },
  { label: 'Text', value: 'text' },
  { label: 'Book', value: 'book' },
  { label: 'URL', value: 'url' },
]

const tierOptions: Array<{ description: string; label: string; value: SourceTier }> = [
  {
    description: 'Primary or canonical material from the core research group.',
    label: 'Tier 1',
    value: 'primary',
  },
  {
    description: 'Secondary, corroborating, or contextual material.',
    label: 'Tier 2',
    value: 'secondary',
  },
]

const getErrorMessage = (error: unknown) => {
  if (error instanceof Error) {
    return error.message
  }

  return 'The source could not be submitted.'
}

export default function AdminSourceNewPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [step, setStep] = useState(1)
  const [inputType, setInputType] = useState<SourceInputType>('file')
  const [file, setFile] = useState<File | null>(null)
  const [fileValidationError, setFileValidationError] = useState<string | null>(null)
  const [sourceUrl, setSourceUrl] = useState('')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [authors, setAuthors] = useState<string[]>([])
  const [authorInput, setAuthorInput] = useState('')
  const [publicationDate, setPublicationDate] = useState('')
  const [format, setFormat] = useState<SourceFormat>('audio')
  const [tier, setTier] = useState<SourceTier>('primary')
  const [uploadProgress, setUploadProgress] = useState<SourceUploadProgress | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const titleQueryValue = title.trim()
  const duplicateTitleQuery = useQuery({
    enabled: titleQueryValue.length >= 3,
    queryKey: ['admin', 'source-title-exists', titleQueryValue],
    queryFn: () => adminSourceTitleExists(titleQueryValue),
    staleTime: 30_000,
  })

  const addAuthor = () => {
    const nextAuthor = authorInput.trim()

    if (
      !nextAuthor ||
      authors.some((author) => author.toLowerCase() === nextAuthor.toLowerCase())
    ) {
      setAuthorInput('')
      return
    }

    setAuthors((currentAuthors) => [...currentAuthors, nextAuthor])
    setAuthorInput('')
  }

  const handleAuthorKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' || event.key === ',' || event.key === 'Tab') {
      event.preventDefault()
      addAuthor()
    }
  }

  const applySelectedFile = (selectedFile: File | null) => {
    setFile(selectedFile)

    if (!selectedFile) {
      setFileValidationError(null)
      return
    }

    setFileValidationError(validateSourceFile(selectedFile))
    setFormat(detectSourceFormat(selectedFile.name))

    if (!title.trim()) {
      setTitle(titleFromFilename(selectedFile.name))
    }
  }

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    applySelectedFile(event.target.files?.[0] ?? null)
  }

  const handleInputTypeChange = (nextInputType: SourceInputType) => {
    setInputType(nextInputType)
    setFormat(nextInputType === 'url' ? 'url' : file ? detectSourceFormat(file.name) : 'audio')
    setError(null)
  }

  const validateForm = () => {
    if (!title.trim()) {
      return 'Title is required.'
    }

    if (inputType === 'file' && !file) {
      return 'Choose a source file to upload.'
    }

    if (inputType === 'file' && file && fileValidationError) {
      return fileValidationError
    }

    if (inputType === 'url') {
      try {
        normalizeSourceUrl(sourceUrl)
      } catch (urlError) {
        return getErrorMessage(urlError) || 'Enter a valid source URL.'
      }
    }

    return null
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const pendingAuthor = authorInput.trim()
    const nextAuthors =
      pendingAuthor &&
      !authors.some((author) => author.toLowerCase() === pendingAuthor.toLowerCase())
        ? [...authors, pendingAuthor]
        : authors

    setAuthors(nextAuthors)
    setAuthorInput('')

    const validationError = validateForm()

    if (validationError) {
      setError(validationError)
      return
    }

    let sourceId: string

    try {
      sourceId = createClientUuid()
    } catch (uuidError) {
      setError(getErrorMessage(uuidError))
      return
    }

    setError(null)
    setIsSubmitting(true)
    setUploadProgress(
      inputType === 'file' ? { loaded: 0, percent: 0, total: file?.size ?? 0 } : null
    )

    let uploadedFilePath: string | null = null
    let sourceCreated = false

    try {
      uploadedFilePath =
        inputType === 'file' && file ? await uploadSourceFile(sourceId, file, setUploadProgress) : null

      const source = await createAdminSource({
        authors: nextAuthors,
        description: description.trim() || null,
        filePath: uploadedFilePath,
        format,
        id: sourceId,
        publicationDate: publicationDate || null,
        tier,
        title: title.trim(),
        url: inputType === 'url' ? normalizeSourceUrl(sourceUrl) : null,
      })
      sourceCreated = true

      let triggerError: string | null = null
      let triggerWarning: string | null = null

      if (inputType === 'file' && isAssemblyAiSourceFormat(source.format)) {
        try {
          await triggerSourceTranscription(source.id)
        } catch (invokeError) {
          triggerError = getErrorMessage(invokeError)
        }
      } else if (inputType === 'file') {
        triggerWarning =
          'Text and document sources are saved for cataloging, but automatic document ingestion is not available yet.'
      } else {
        triggerWarning =
          'URL sources are saved for cataloging, but automatic URL ingestion is not available yet.'
      }

      await queryClient.invalidateQueries({ queryKey: ['admin', 'sources'] })
      await queryClient.invalidateQueries({ queryKey: ['admin', 'source-list'] })
      navigate(`/admin/sources/${source.id}`, {
        state:
          triggerError || triggerWarning
            ? { triggerError: triggerError ?? undefined, triggerWarning: triggerWarning ?? undefined }
            : undefined,
      })
    } catch (submitError) {
      if (uploadedFilePath && !sourceCreated) {
        try {
          await deleteSourceFile(uploadedFilePath)
        } catch (cleanupError) {
          console.error('Failed to clean up source file after source create failure.', cleanupError)
        }
      }

      setUploadProgress(null)
      setError(getErrorMessage(submitError))
      setIsSubmitting(false)
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Button asChild className="mb-4" size="sm" variant="ghost">
            <Link to={ROUTES.ADMIN_SOURCES}>
              <ArrowLeft aria-hidden="true" className="h-3.5 w-3.5" />
              Sources
            </Link>
          </Button>
          <h1 className="font-display text-xl uppercase text-ink">Add Source</h1>
          <p className="mt-1 font-body text-sm text-[#777]">
            Upload source material or register an external URL for ingestion.
          </p>
        </div>
        <Badge variant="outline">Step {step} of 2</Badge>
      </div>

      <form className="space-y-5" onSubmit={handleSubmit}>
        <section className="rounded border border-0.5 border-black/[0.09] bg-white p-5">
          <div className="mb-4 flex items-center justify-between gap-4">
            <div>
              <h2 className="font-display text-sm uppercase tracking-label text-ink">
                Source Type
              </h2>
              <p className="mt-1 font-body text-xs text-[#777]">
                Choose where the raw source material is coming from.
              </p>
            </div>
            {step === 2 ? (
              <Button size="sm" type="button" variant="outline" onClick={() => setStep(1)}>
                Change
              </Button>
            ) : null}
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            {[
              {
                description: 'Audio, video, text, PDFs, or manuscript files.',
                icon: FileUp,
                label: 'File upload',
                value: 'file' as const,
              },
              {
                description: 'External web pages, media links, or source archives.',
                icon: LinkIcon,
                label: 'URL',
                value: 'url' as const,
              },
            ].map((option) => {
              const Icon = option.icon
              const isSelected = inputType === option.value

              return (
                <button
                  key={option.value}
                  className={cn(
                    'rounded border border-0.5 p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-verdigris',
                    isSelected
                      ? 'border-verdigris bg-verdigris-light'
                      : 'border-black/[0.09] bg-stone/40 hover:border-black/20'
                  )}
                  type="button"
                  onClick={() => handleInputTypeChange(option.value)}
                >
                  <span className="flex items-center gap-2">
                    <Icon
                      aria-hidden="true"
                      className={cn('h-4 w-4', isSelected ? 'text-verdigris' : 'text-[#777]')}
                    />
                    <span className="font-display text-[10px] uppercase tracking-label text-ink">
                      {option.label}
                    </span>
                    {isSelected ? <Check aria-hidden="true" className="ml-auto h-4 w-4" /> : null}
                  </span>
                  <span className="mt-2 block font-body text-xs leading-meta text-[#777]">
                    {option.description}
                  </span>
                </button>
              )
            })}
          </div>

          {step === 1 ? (
            <div className="mt-5 flex justify-end">
              <Button type="button" onClick={() => setStep(2)}>
                Continue
              </Button>
            </div>
          ) : null}
        </section>

        {step === 2 ? (
          <section className="rounded border border-0.5 border-black/[0.09] bg-white p-5">
            <h2 className="font-display text-sm uppercase tracking-label text-ink">Metadata</h2>
            <p className="mt-1 font-body text-xs text-[#777]">
              Catalog details used by the ingestion pipeline and review queue.
            </p>

            <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_280px]">
              <div className="space-y-4">
                {inputType === 'file' ? (
                  <label className="block">
                    <span className="mb-2 block font-body text-xs text-[#777]">Source file</span>
                    <div
                      className={cn(
                        'rounded border border-0.5 border-dashed p-4 transition-colors',
                        fileValidationError
                          ? 'border-terracotta/50 bg-terracotta-light'
                          : 'border-black/20 bg-stone/40'
                      )}
                      onDragOver={(event) => event.preventDefault()}
                      onDrop={(event) => {
                        event.preventDefault()
                        applySelectedFile(event.dataTransfer.files.item(0))
                      }}
                    >
                      <Input
                        accept={sourceFileAccept}
                        disabled={isSubmitting}
                        type="file"
                        onChange={handleFileChange}
                      />
                      <p className="mt-2 font-body text-xs text-[#777]">
                        Drop a supported source file here, or choose one from your computer. Uploads
                        are limited to {formatFileSize(1024 * 1024 * 1024)}.
                      </p>
                    </div>
                    {file ? (
                      <p className="mt-2 font-body text-xs text-[#777]">
                        {file.name} / {formatFileSize(file.size)}
                      </p>
                    ) : null}
                    {fileValidationError ? (
                      <p className="mt-2 font-body text-xs text-terracotta-dark">
                        {fileValidationError}
                      </p>
                    ) : null}
                  </label>
                ) : (
                  <label className="block">
                    <span className="mb-2 block font-body text-xs text-[#777]">Source URL</span>
                    <Input
                      disabled={isSubmitting}
                      placeholder="https://example.com/source"
                      type="url"
                      value={sourceUrl}
                      onChange={(event) => setSourceUrl(event.target.value)}
                    />
                    <p className="mt-2 font-body text-xs text-[#777]">
                      URL sources are saved now. Automatic URL ingestion will be enabled after the
                      URL pipeline is defined.
                    </p>
                  </label>
                )}

                <label className="block">
                  <span className="mb-2 block font-body text-xs text-[#777]">Title</span>
                  <Input
                    disabled={isSubmitting}
                    required
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                  />
                  {duplicateTitleQuery.data ? (
                    <p className="mt-2 font-body text-xs text-[#6F5A12]">
                      A source with this title already exists.
                    </p>
                  ) : null}
                </label>

                <label className="block">
                  <span className="mb-2 block font-body text-xs text-[#777]">Description</span>
                  <textarea
                    className="min-h-28 w-full rounded border border-black/15 bg-stone px-3 py-2 font-body text-sm text-ink shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-verdigris"
                    disabled={isSubmitting}
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                  />
                </label>

                <div>
                  <span className="mb-2 block font-body text-xs text-[#777]">Authors</span>
                  <div className="flex flex-wrap gap-2">
                    {authors.map((author) => (
                      <span
                        key={author}
                        className="inline-flex items-center gap-2 rounded border border-0.5 border-black/15 bg-stone px-2 py-1 font-body text-xs text-ink"
                      >
                        {author}
                        <button
                          aria-label={`Remove ${author}`}
                          className="text-[#777] hover:text-terracotta"
                          disabled={isSubmitting}
                          type="button"
                          onClick={() =>
                            setAuthors((currentAuthors) =>
                              currentAuthors.filter((currentAuthor) => currentAuthor !== author)
                            )
                          }
                        >
                          <X aria-hidden="true" className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                  <div className="mt-2 flex gap-2">
                    <Input
                      disabled={isSubmitting}
                      placeholder="Add author and press Enter"
                      value={authorInput}
                      onBlur={addAuthor}
                      onChange={(event) => setAuthorInput(event.target.value)}
                      onKeyDown={handleAuthorKeyDown}
                    />
                    <Button
                      disabled={isSubmitting || !authorInput.trim()}
                      type="button"
                      variant="outline"
                      onClick={addAuthor}
                    >
                      Add
                    </Button>
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <label className="block">
                    <span className="mb-2 block font-body text-xs text-[#777]">
                      Publication date
                    </span>
                    <Input
                      disabled={isSubmitting}
                      type="date"
                      value={publicationDate}
                      onChange={(event) => setPublicationDate(event.target.value)}
                    />
                  </label>
                  <label className="block">
                    <span className="mb-2 block font-body text-xs text-[#777]">Format</span>
                    <select
                      className="flex h-10 w-full rounded border border-black/15 bg-stone px-3 py-2 font-body text-sm text-ink shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-verdigris"
                      disabled={isSubmitting}
                      value={format}
                      onChange={(event) => setFormat(event.target.value as SourceFormat)}
                    >
                      {formatOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </div>

              <aside className="space-y-4">
                <div>
                  <p className="mb-2 font-body text-xs text-[#777]">Tier</p>
                  <div className="space-y-2">
                    {tierOptions.map((option) => (
                      <label
                        key={option.value}
                        className={cn(
                          'flex cursor-pointer gap-3 rounded border border-0.5 p-3',
                          tier === option.value
                            ? 'border-verdigris bg-verdigris-light'
                            : 'border-black/[0.09] bg-stone/40'
                        )}
                      >
                        <input
                          checked={tier === option.value}
                          className="mt-1 accent-verdigris"
                          disabled={isSubmitting}
                          name="tier"
                          type="radio"
                          value={option.value}
                          onChange={() => setTier(option.value)}
                        />
                        <span>
                          <span className="block font-display text-[10px] uppercase tracking-label text-ink">
                            {option.label}
                          </span>
                          <span className="mt-1 block font-body text-xs leading-meta text-[#777]">
                            {option.description}
                          </span>
                        </span>
                      </label>
                    ))}
                  </div>
                </div>

                {uploadProgress ? (
                  <div className="rounded border border-0.5 border-black/[0.09] bg-stone/40 p-3">
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <span className="font-body text-xs text-[#777]">Upload progress</span>
                      <span className="font-body text-xs text-ink">{uploadProgress.percent}%</span>
                    </div>
                    <div
                      aria-valuemax={100}
                      aria-valuemin={0}
                      aria-valuenow={uploadProgress.percent}
                      className="h-2 overflow-hidden rounded bg-black/10"
                      role="progressbar"
                    >
                      <div
                        className="h-full rounded bg-verdigris transition-[width]"
                        style={{ width: `${uploadProgress.percent}%` }}
                      />
                    </div>
                  </div>
                ) : null}
              </aside>
            </div>

            {error ? (
              <div className="mt-5 rounded border border-0.5 border-terracotta/30 bg-terracotta-light p-3">
                <p className="font-body text-sm text-terracotta-dark">{error}</p>
              </div>
            ) : null}

            <div className="mt-5 flex justify-end gap-3">
              <Button
                disabled={isSubmitting}
                type="button"
                variant="outline"
                onClick={() => setStep(1)}
              >
                Back
              </Button>
              <Button disabled={isSubmitting} type="submit">
                {isSubmitting ? (
                  <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
                ) : (
                  <Upload aria-hidden="true" className="h-4 w-4" />
                )}
                {isSubmitting ? 'Submitting' : 'Upload source'}
              </Button>
            </div>
          </section>
        ) : null}
      </form>
    </div>
  )
}
