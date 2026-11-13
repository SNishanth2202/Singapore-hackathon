export const INDUSTRIES = [
  'Technology',
  'Finance',
  'Healthcare',
  'Manufacturing',
  'Retail',
  'Telecommunications',
  'Energy',
  'Education',
  'Logistics',
  'Real Estate',
  'Media',
  'Consulting',
  'Other',
] as const

export type Industry = typeof INDUSTRIES[number]

export const COUNTRIES = [
  'Singapore',
  'Malaysia',
  'Indonesia',
  'Thailand',
  'Vietnam',
  'Philippines',
  'Myanmar',
  'Cambodia',
  'Laos',
  'Brunei',
  'Australia',
  'India',
  'China',
  'Japan',
  'South Korea',
  'United States',
  'United Kingdom',
] as const

export type Country = typeof COUNTRIES[number]

export const COMPANY_STAGES = [
  'Pre-Seed',
  'Seed',
  'Series A',
  'Series B',
  'Series C',
  'Series D+',
  'Growth',
  'Public',
  'Private',
] as const

export type CompanyStage = typeof COMPANY_STAGES[number]

export const OPPORTUNITY_STATUSES = ['OPEN', 'IN_PROGRESS', 'CLOSED'] as const
export type OpportunityStatus = typeof OPPORTUNITY_STATUSES[number]

export const PRIORITY_LEVELS = ['HIGH', 'MEDIUM', 'LOW'] as const
export type PriorityLevel = typeof PRIORITY_LEVELS[number]

export const SIGNAL_TYPES = [
  'FUNDING',
  'EXPANSION',
  'HIRING',
  'PRODUCT_LAUNCH',
  'PARTNERSHIP',
  'ACQUISITION',
  'LEADERSHIP_CHANGE',
  'MARKET_ENTRY',
] as const

export const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const
export const DEFAULT_PAGE_SIZE = 25

export const NAV_LINKS = [
  { label: 'Dashboard', path: '/', icon: 'LayoutDashboard' },
  { label: 'Company Intelligence', path: '/companies', icon: 'Building2' },
  { label: 'Knowledge Graph', path: '/graph', icon: 'Network' },
  { label: 'Opportunities', path: '/opportunities', icon: 'Target' },
  { label: 'Settings', path: '/settings', icon: 'Settings' },
] as const
