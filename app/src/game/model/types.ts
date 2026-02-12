export type EquipmentSlot = 'weapon' | 'helmet' | 'armor' | 'gloves' | 'boots' | 'accessory'

export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary'

export type StatKey =
  | 'atkFlat'
  | 'hpFlat'
  | 'defFlat'
  | 'attackSpeedPct'
  | 'critChance'
  | 'critDamage'
  | 'lifeStealPct'

export type Stats = Partial<Record<StatKey, number>>

export type SkillId =
  | 'whirlwind'
  | 'chain_lightning'
  | 'meteor'
  | 'sharpen'
  | 'vitality'
  | 'precision'

export type ActiveSkillId = 'whirlwind' | 'chain_lightning'
export type UltimateSkillId = 'meteor'
export type PassiveSkillId = 'sharpen' | 'vitality' | 'precision'

export interface EquipmentItem {
  id: string
  name: string
  slot: EquipmentSlot
  rarity: Rarity
  iLv: number
  enhanceLevel: number
  stats: Stats
  power: number
}

export interface PlayerSave {
  version: 1
  stage: number
  stageRepeat: number
  autoNext: boolean
  level: number
  exp: number
  gold: number
  essence: number
  reforgeStone: number
  equipment: Partial<Record<EquipmentSlot, EquipmentItem>>
  inventory: EquipmentItem[]
  skills: {
    points: number
    levels: Partial<Record<SkillId, number>>
    branches: Partial<Record<SkillId, string>>
    equippedActives: Array<ActiveSkillId | null>
    equippedUltimate: UltimateSkillId | null
  }
}
