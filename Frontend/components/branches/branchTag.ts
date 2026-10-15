export function getTagBadgeStyle(tag: string) {
  const normalized = tag.toLowerCase()
  if (normalized === 'production' || normalized === 'prod') {
    return 'border-amber-500/40 text-amber-500 bg-amber-500/10'
  }
  if (normalized === 'staging') {
    return 'border-blue-500/40 text-blue-500 bg-blue-500/10'
  }
  if (normalized === 'preview') {
    return 'border-purple-500/40 text-purple-500 bg-purple-500/10'
  }
  return 'border-strong text-foreground-lighter bg-surface-200'
}

export function isValidBranchTag(tag: string) {
  return tag.length <= 32 && (tag.length === 0 || /^[\p{L}\p{N}][\p{L}\p{N} _./-]{0,31}$/u.test(tag))
}
