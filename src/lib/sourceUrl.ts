export const parseAndNormalizeSourceUrlForStorage = (value: string) => {
  const url = new URL(value)

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Source URLs must start with http:// or https://.')
  }

  return url.toString()
}

export const normalizeSourceUrlForDedup = (value: string) => {
  return value.trim().replace(/\/$/, '').toLowerCase()
}
