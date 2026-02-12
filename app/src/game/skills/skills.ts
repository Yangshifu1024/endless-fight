import type { ActiveSkillId, PassiveSkillId, PlayerSave, SkillId, UltimateSkillId } from '../model/types'
import { skillDefs } from './defs'

export function getSkillDef(id: SkillId) {
  return skillDefs[id]
}

export function allSkills(): SkillId[] {
  return Object.keys(skillDefs) as SkillId[]
}

export function activeSkills(): ActiveSkillId[] {
  return allSkills().filter((id) => getSkillDef(id).type === 'active') as ActiveSkillId[]
}

export function ultimateSkills(): UltimateSkillId[] {
  return allSkills().filter((id) => getSkillDef(id).type === 'ultimate') as UltimateSkillId[]
}

export function passiveSkills(): PassiveSkillId[] {
  return [] as PassiveSkillId[]
}

export function skillLevel(save: PlayerSave, id: SkillId) {
  return Math.max(0, save.skills.levels[id] ?? 0)
}

export function skillBranch(save: PlayerSave, id: SkillId) {
  return save.skills.branches[id]
}

export function canLearnOrUpgrade(save: PlayerSave, id: SkillId) {
  const def = getSkillDef(id)
  if (save.level < def.unlockLevel) return false
  const lv = skillLevel(save, id)
  return lv < def.maxLevel && save.skills.points > 0
}

export function canSelectBranch(save: PlayerSave, id: SkillId) {
  const def = getSkillDef(id)
  if (def.branches.length <= 0) return false
  return skillLevel(save, id) >= def.branchUnlockLevel
}

export function passiveBonuses(_save: PlayerSave) {
  const atkPct = 0
  const hpPct = 0
  const critChance = 0
  const thornsPct = 0
  return { atkPct, hpPct, critChance, thornsPct }
}

export type { SkillDef } from './types'
