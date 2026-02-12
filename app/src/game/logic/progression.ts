export function requiredExpForNextLevel(level: number) {
  const lv = Math.max(1, level)
  const base = 60
  return Math.floor(base * Math.pow(lv, 1.55))
}

export function applyExp(level: number, exp: number, gained: number) {
  let lv = level
  let xp = exp + gained
  let leveledUp = 0
  while (true) {
    const req = requiredExpForNextLevel(lv)
    if (xp < req) break
    xp -= req
    lv += 1
    leveledUp += 1
  }
  return { level: lv, exp: xp, leveledUp }
}

