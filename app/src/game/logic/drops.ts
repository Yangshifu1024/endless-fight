import { expAtStage, goldAtStage, stageRewardMultiplier } from './balance'
import { generateEquipment } from './equipment'
import type { EquipmentItem } from '../model/types'
import type { Rng } from './rng'

export interface KillDrop {
  gold: number
  exp: number
  essence: number
  reforgeStone: number
  equipment?: EquipmentItem
}

export function rollKillDrop(rng: Rng, stage: number, stageRepeat: number): KillDrop {
  const mult = stageRewardMultiplier(stageRepeat)
  const gold = Math.floor(goldAtStage(stage, 2.4) * mult)
  const exp = Math.floor(expAtStage(stage, 2.0) * mult)

  const essence = Math.max(0, Math.floor((0.6 + stage * 0.03) * mult))
  const reforgeStoneChance = Math.min(0.06, 0.004 + stage * 0.00025)
  const reforgeStone = rng.chance(reforgeStoneChance) ? 1 : 0

  const baseEquipChance = 0.12
  const equipChance = Math.min(0.35, baseEquipChance + stage * 0.0008)
  const equipment = rng.chance(equipChance) ? generateEquipment(rng, stage) : undefined
  return { gold, exp, essence, reforgeStone, equipment }
}
