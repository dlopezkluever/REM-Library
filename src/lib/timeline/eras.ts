// Era bands rendered as background columns on the timeline. Ranges are
// contiguous so every plotted year falls inside exactly one band.

export interface TimelineEra {
  key: string
  label: string
  startYear: number
  endYear: number
  color: string
}

export const TIMELINE_ERAS: TimelineEra[] = [
  { key: 'bronze', label: 'Bronze Age', startYear: -3300, endYear: -1200, color: 'rgba(139,115,85,0.08)' },
  {
    key: 'classical',
    label: 'Classical Antiquity',
    startYear: -1200,
    endYear: 500,
    color: 'rgba(74,124,111,0.08)',
  },
  { key: 'medieval', label: 'Medieval', startYear: 500, endYear: 1400, color: 'rgba(107,95,160,0.08)' },
  {
    key: 'renaissance',
    label: 'Renaissance',
    startYear: 1400,
    endYear: 1600,
    color: 'rgba(160,82,45,0.08)',
  },
  { key: 'modern', label: 'Modern', startYear: 1600, endYear: 2026, color: 'rgba(138,90,154,0.08)' },
]

export const TIMELINE_MIN_YEAR = TIMELINE_ERAS[0].startYear
export const TIMELINE_MAX_YEAR = TIMELINE_ERAS[TIMELINE_ERAS.length - 1].endYear

export type TimelineDomain = [number, number]

// The plotted domain always covers the full era span, but extends to include
// any entity dated outside the predefined bands.
export const computeTimelineDomain = (years: number[]): TimelineDomain => {
  const min = years.reduce((acc, year) => Math.min(acc, year), TIMELINE_MIN_YEAR)
  const max = years.reduce((acc, year) => Math.max(acc, year), TIMELINE_MAX_YEAR)

  return [min, max]
}

export const yearToX = (year: number, domain: TimelineDomain, width: number): number => {
  const [min, max] = domain

  if (max === min) {
    return 0
  }

  return ((year - min) / (max - min)) * width
}

export const formatTimelineYear = (year: number): string => {
  if (year < 0) {
    return `${Math.abs(year)} BCE`
  }

  return `${year} CE`
}

export const eraForYear = (year: number): TimelineEra | null => {
  return (
    TIMELINE_ERAS.find((era) => year >= era.startYear && year < era.endYear) ??
    (year >= TIMELINE_MAX_YEAR ? TIMELINE_ERAS[TIMELINE_ERAS.length - 1] : null)
  )
}
