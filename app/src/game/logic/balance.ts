export function stageRewardMultiplier(stageRepeat: number) {
  return Math.max(0.25, 1 - 0.12 * stageRepeat)
}

export function enemyHpAtStage(stage: number, baseHp: number) {
  const s = Math.max(1, stage)
  const a = 0.06
  const p = 1.35
  return baseHp * Math.pow(1 + a * s, p)
}

export function enemyAtkAtStage(stage: number, baseAtk: number) {
  const s = Math.max(1, stage)
  const b = 0.045
  const q = 1.25
  return baseAtk * Math.pow(1 + b * s, q)
}

export function enemyDefAtStage(stage: number, baseDef: number) {
  const s = Math.max(1, stage)
  return baseDef + Math.floor(s * 0.35)
}

export function goldAtStage(stage: number, baseGold: number) {
  const s = Math.max(1, stage)
  const d = 0.06
  const u = 1.2
  return baseGold * Math.pow(1 + d * s, u)
}

export function expAtStage(stage: number, baseExp: number) {
  const s = Math.max(1, stage)
  const c = 0.06
  const r = 1.25
  return baseExp * Math.pow(1 + c * s, r)
}

export function damageAfterDefense(atk: number, def: number) {
  const d = Math.max(0, def)
  return atk * (100 / (100 + d))
}

