import { describe, expect, it } from 'vitest'
import {
  computeTimelineDomain,
  eraForYear,
  formatTimelineYear,
  TIMELINE_MAX_YEAR,
  TIMELINE_MIN_YEAR,
  yearToX,
} from '@/lib/timeline/eras'
import { getPinchZoom, getPointerDistance, parseTimelineSortYear } from '@/lib/timeline/pinchZoom'

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

describe('timeline pinch and date helpers', () => {
  it('computes pointer distance and clamps pinch zoom', () => {
    expect(getPointerDistance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5)
    expect(
      getPinchZoom({
        currentDistance: 200,
        maxZoom: 4,
        minZoom: 1,
        startDistance: 100,
        startZoom: 1.5,
      })
    ).toBe(3)
    expect(
      getPinchZoom({
        currentDistance: 500,
        maxZoom: 4,
        minZoom: 1,
        startDistance: 100,
        startZoom: 2,
      })
    ).toBe(4)
  })

  it('parses blank years as null and valid BCE years as numbers', () => {
    expect(parseTimelineSortYear('')).toBeNull()
    expect(parseTimelineSortYear('  -1200 ')).toBe(-1200)
  })

  it('rejects invalid and decimal years', () => {
    expect(() => parseTimelineSortYear('abc')).toThrow('Sort year')
    expect(() => parseTimelineSortYear('1200.5')).toThrow('Sort year')
  })
})
