import { describe, expect, it } from 'vitest'
import {
  computeTimelineDomain,
  eraForYear,
  formatTimelineYear,
  TIMELINE_MAX_YEAR,
  TIMELINE_MIN_YEAR,
  yearToX,
} from '@/lib/timeline/eras'

describe('computeTimelineDomain', () => {
  it('falls back to the full era span when there are no years', () => {
    expect(computeTimelineDomain([])).toEqual([TIMELINE_MIN_YEAR, TIMELINE_MAX_YEAR])
  })

  it('extends the domain to include years outside the era bands', () => {
    const [min, max] = computeTimelineDomain([-4000, 3000])
    expect(min).toBe(-4000)
    expect(max).toBe(3000)
  })

  it('never shrinks below the predefined era span', () => {
    const [min, max] = computeTimelineDomain([0, 100])
    expect(min).toBe(TIMELINE_MIN_YEAR)
    expect(max).toBe(TIMELINE_MAX_YEAR)
  })
})

describe('yearToX', () => {
  it('maps the domain endpoints to 0 and the full width', () => {
    const domain: [number, number] = [-1000, 1000]
    expect(yearToX(-1000, domain, 800)).toBe(0)
    expect(yearToX(1000, domain, 800)).toBe(800)
    expect(yearToX(0, domain, 800)).toBe(400)
  })

  it('returns 0 for a degenerate domain', () => {
    expect(yearToX(500, [500, 500], 800)).toBe(0)
  })
})

describe('formatTimelineYear', () => {
  it('labels negative years as BCE and non-negative as CE', () => {
    expect(formatTimelineYear(-1200)).toBe('1200 BCE')
    expect(formatTimelineYear(800)).toBe('800 CE')
  })
})

describe('eraForYear', () => {
  it('classifies years into the expected band', () => {
    expect(eraForYear(-2000)?.key).toBe('bronze')
    expect(eraForYear(-500)?.key).toBe('classical')
    expect(eraForYear(800)?.key).toBe('medieval')
    expect(eraForYear(1500)?.key).toBe('renaissance')
    expect(eraForYear(1900)?.key).toBe('modern')
  })

  it('clamps years at or beyond the final era boundary into the modern band', () => {
    expect(eraForYear(TIMELINE_MAX_YEAR)?.key).toBe('modern')
    expect(eraForYear(5000)?.key).toBe('modern')
  })
})
