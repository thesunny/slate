export function getDiffStart(prev, next) {
  const length = Math.min(prev.length, next.length)
  for (let i = 0; i < length; i++) {
    if (prev.charAt(i) !== next.charAt(i)) return i
  }
  if (prev.length !== next.length) return length
  return null
}

// returns a positive number where `0` is the last position and `1` is the
// second to last position.
export function getDiffEnd(prev, next, max) {
  const prevLength = prev.length
  const nextLength = next.length
  const length = Math.min(prevLength, nextLength, max)
  for (let i = 0; i < length; i++) {
    const prevChar = prev.charAt(prevLength - i - 1)
    const nextChar = next.charAt(nextLength - i - 1)
    if (prevChar !== nextChar) return i
  }
  if (prev.length !== next.length) return length
  return null
}

// If there are no differences, return null.
// Otherwise return an object containing a `start` and `end` offset.
// `start` is greedy (matches as much as it can) but `end` will only match
// up to the `start` position so that `start` + `end` will never be greater
// than the total length of one of `prev` or `next`
export function getDiffOffsets(prev, next) {
  if (prev === next) return null
  const start = getDiffStart(prev, next)
  const maxEnd = Math.min(prev.length - start, next.length - start)
  const end = getDiffEnd(prev, next, maxEnd)
  return { start, end, total: start + end }
}

export default getDiffOffsets