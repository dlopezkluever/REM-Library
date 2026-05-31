export const formatDate = (value: string | null) => {
  if (!value) {
    return 'Undated'
  }

  return new Intl.DateTimeFormat('en', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(`${value}T00:00:00`))
}

export const formatTimestamp = (seconds: number | null) => {
  if (seconds === null) {
    return null
  }

  const totalMilliseconds = Math.round(seconds * 1000)
  const wholeSeconds = Math.floor(totalMilliseconds / 1000)
  const milliseconds = totalMilliseconds % 1000
  const hours = Math.floor(wholeSeconds / 3600)
  const minutes = Math.floor((wholeSeconds % 3600) / 60)
  const remainingSeconds = wholeSeconds % 60
  const secondLabel =
    milliseconds > 0
      ? `${remainingSeconds.toString().padStart(2, '0')}.${milliseconds
          .toString()
          .padStart(3, '0')}`
      : remainingSeconds.toString().padStart(2, '0')

  return [hours, minutes].map((part) => part.toString().padStart(2, '0')).join(':') + `:${secondLabel}`
}

export const formatAnchorCitation = ({
  endPage,
  endTimestamp,
  startPage,
  startTimestamp,
}: {
  endPage: number | null
  endTimestamp: number | null
  startPage: number | null
  startTimestamp: number | null
}) => {
  const startTime = formatTimestamp(startTimestamp)
  const endTime = formatTimestamp(endTimestamp)

  if (startTime && endTime) {
    return `${startTime}-${endTime}`
  }

  if (startTime) {
    return startTime
  }

  if (startPage && endPage && startPage !== endPage) {
    return `pp. ${startPage}-${endPage}`
  }

  if (startPage) {
    return `p. ${startPage}`
  }

  return 'Unmarked location'
}

export const truncateText = (value: string | null, maxLength: number) => {
  if (!value) {
    return ''
  }

  if (value.length <= maxLength) {
    return value
  }

  return `${value.slice(0, maxLength).trim()}...`
}
