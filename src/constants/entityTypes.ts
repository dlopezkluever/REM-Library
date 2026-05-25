import type { EntityType } from '@/types/domain'

export const ENTITY_COLORS: Record<
  EntityType,
  { node: string; badgeBg: string; badgeText: string; badgeBorder: string; glow: string }
> = {
  symbol: {
    node: '#4A7C6F',
    badgeBg: '#E8F0EE',
    badgeText: '#1C4A3F',
    badgeBorder: '#4A7C6F',
    glow: 'rgba(74,124,111,0.12)',
  },
  figure: {
    node: '#A0522D',
    badgeBg: '#F5EDE8',
    badgeText: '#5C2E12',
    badgeBorder: '#A0522D',
    glow: 'rgba(160,82,45,0.12)',
  },
  trope: {
    node: '#6B5FA0',
    badgeBg: '#EEEAF5',
    badgeText: '#2A2240',
    badgeBorder: '#6B5FA0',
    glow: 'rgba(107,95,160,0.12)',
  },
  narrative: {
    node: '#8B7355',
    badgeBg: '#F0EDE8',
    badgeText: '#3A2E22',
    badgeBorder: '#8B7355',
    glow: 'rgba(139,115,85,0.12)',
  },
  culture: {
    node: '#8A5A9A',
    badgeBg: '#EDE8F2',
    badgeText: '#2E1A3A',
    badgeBorder: '#8A5A9A',
    glow: 'rgba(138,90,154,0.12)',
  },
}

export const ENTITY_LABELS: Record<EntityType, string> = {
  symbol: 'Symbol',
  figure: 'Figure',
  narrative: 'Narrative',
  culture: 'Culture',
  trope: 'Trope',
}
