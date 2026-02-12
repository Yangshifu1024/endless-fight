import type { SkillId } from '../model/types'

export type SkillType = 'active' | 'passive' | 'ultimate'

export interface SkillBranchDef {
  id: string
  name: string
  description?: string
}

export interface SkillDef {
  id: SkillId
  type: SkillType
  name: string
  description: string
  unlockLevel: number
  maxLevel: number
  branchUnlockLevel: number
  branches: SkillBranchDef[]
  baseCooldownMs?: number
}
