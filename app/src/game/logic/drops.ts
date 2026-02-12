import { expAtStage, stageRewardMultiplier } from './balance'
import { calcSingleGold } from './playerStats'
import type { Rng } from './rng'

export interface KillDrop {
  gold: number
  exp: number
}

export function rollKillDrop(rng: Rng, stage: number, stageRepeat: number): KillDrop {
  void rng
  const mult = stageRewardMultiplier(stageRepeat)
  
  // New Gold Logic based on Economy Anchor
  // Normal Stage Drop = Current Level Single Cost * 1.3
  // Distributed among (stage + 10) enemies
  const totalStageGold = calcSingleGold(stage) * 1.3
  const enemyCount = stage + 10
  const baseGold = Math.max(1, totalStageGold / enemyCount)
  
  const gold = Math.floor(baseGold * mult)
  
  // Keep XP logic consistent with previous balance for now
  const exp = Math.floor(expAtStage(stage, 2.0) * mult)

  return { gold, exp }
}
