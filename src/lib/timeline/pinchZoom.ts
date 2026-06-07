interface PointerPoint {
  x: number
  y: number
}

interface PinchZoomInput {
  currentDistance: number
  maxZoom: number
  minZoom: number
  startDistance: number
  startZoom: number
}

export const clampTimelineZoom = (zoom: number, minZoom: number, maxZoom: number): number =>
  Math.min(Math.max(zoom, minZoom), maxZoom)

export const getPointerDistance = (first: PointerPoint, second: PointerPoint): number =>
  Math.hypot(first.x - second.x, first.y - second.y)

export const getPinchZoom = ({
  currentDistance,
  maxZoom,
  minZoom,
  startDistance,
  startZoom,
}: PinchZoomInput): number => {
  if (startDistance <= 0 || currentDistance <= 0) {
    return clampTimelineZoom(startZoom, minZoom, maxZoom)
  }

  return clampTimelineZoom(startZoom * (currentDistance / startDistance), minZoom, maxZoom)
}

export const parseTimelineSortYear = (value: string): number | null => {
  const trimmed = value.trim()
  if (trimmed === '') {
    return null
  }

  if (!/^-?\d+$/.test(trimmed)) {
    throw new Error('Sort year must be a whole number. Use negative years for BCE.')
  }

  const parsed = Number(trimmed)
  if (!Number.isSafeInteger(parsed)) {
    throw new Error('Sort year must be a valid number. Use negative years for BCE.')
  }

  return parsed
}
