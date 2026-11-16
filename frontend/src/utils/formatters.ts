/**
 * Format an ISO date string to a human-readable date.
 */
export function formatDate(dateStr: string | Date | null | undefined): string {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('en-SG', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

/**
 * Format a number with locale-aware thousands separators.
 */
export function formatNumber(value: number | null | undefined): string {
  if (value == null) return '—'
  return value.toLocaleString('en-US')
}

/**
 * Truncate a string to maxLength characters, appending '...' if truncated.
 */
export function truncate(text: string, maxLength: number = 80): string {
  if (!text) return ''
  if (text.length <= maxLength) return text
  return text.slice(0, maxLength).trimEnd() + '...'
}

/**
 * Format a confidence score (0-1) as a percentage string.
 */
export function formatConfidence(score: number | null | undefined): string {
  if (score == null) return '—'
  return `${Math.round(score * 100)}%`
}
