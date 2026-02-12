export interface Rng {
  next(): number
  int(minInclusive: number, maxInclusive: number): number
  pick<T>(items: readonly T[]): T
  chance(p: number): boolean
}

export function createRng(seed: number): Rng {
  let t = seed >>> 0

  const next = () => {
    t += 0x6d2b79f5
    let x = Math.imul(t ^ (t >>> 15), 1 | t)
    x ^= x + Math.imul(x ^ (x >>> 7), 61 | x)
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296
  }

  return {
    next,
    int(minInclusive, maxInclusive) {
      const r = next()
      return Math.floor(r * (maxInclusive - minInclusive + 1)) + minInclusive
    },
    pick(items) {
      if (items.length <= 0) {
        throw new Error('pick() on empty array')
      }
      return items[Math.floor(next() * items.length)]!
    },
    chance(p) {
      return next() < p
    },
  }
}

export function pickWeighted<T>(rng: Rng, items: readonly { item: T; weight: number }[]): T {
  let total = 0
  for (const it of items) total += Math.max(0, it.weight)
  if (total <= 0) return items[0]!.item
  let r = rng.next() * total
  for (const it of items) {
    r -= Math.max(0, it.weight)
    if (r <= 0) return it.item
  }
  return items[items.length - 1]!.item
}

