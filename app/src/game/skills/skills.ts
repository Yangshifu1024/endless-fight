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
  return allSkills().filter((id) => getSkillDef(id).type === 'passive') as PassiveSkillId[]
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

export function passiveBonuses(save: PlayerSave) {
  const sharpenLv = skillLevel(save, 'sharpen')
  const vitalityLv = skillLevel(save, 'vitality')
  const precisionLv = skillLevel(save, 'precision')
  const thornsLv = skillLevel(save, 'thorns')

  const atkPct = sharpenLv * 0.03
  const hpPct = vitalityLv * 0.05
  const critChance = precisionLv * 0.01
  const thornsPct = thornsLv * 0.01

  return { atkPct, hpPct, critChance, thornsPct }
}

export type { SkillDef } from './types'
