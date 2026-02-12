import type { PlayerSave } from '../model/types'

const KEY = 'endless-fight-save-v1'

export function createNewSave(): PlayerSave {
  return {
    version: 1,
    stage: 1,
    stageRepeat: 0,
    autoNext: false,
    level: 1,
    exp: 0,
    gold: 0,
    essence: 0,
    reforgeStone: 0,
    equipment: {},
    inventory: [],
    skills: {
      points: 0,
      levels: { whirlwind: 1 },
      branches: {},
      equippedActives: ['whirlwind', null, null],
      equippedUltimate: null,
    },
  }
}

export function loadSave(): PlayerSave {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return createNewSave()
    const parsed = JSON.parse(raw) as PlayerSave
    if (parsed?.version !== 1) return createNewSave()
    const base = {
      ...createNewSave(),
      ...parsed,
      equipment: parsed.equipment ?? {},
      inventory: parsed.inventory ?? [],
      essence: typeof parsed.essence === 'number' ? parsed.essence : 0,
      reforgeStone: typeof parsed.reforgeStone === 'number' ? parsed.reforgeStone : 0,
      skills: parsed.skills ?? createNewSave().skills,
    }
    for (const it of Object.values(base.equipment)) {
      if (!it) continue
      if (typeof it.enhanceLevel !== 'number') it.enhanceLevel = 0
      if (typeof it.power !== 'number') it.power = 0
    }
    for (const it of base.inventory) {
      if (typeof it.enhanceLevel !== 'number') it.enhanceLevel = 0
      if (typeof it.power !== 'number') it.power = 0
    }
    if (typeof base.skills.points !== 'number') base.skills.points = 0
    if (!base.skills.levels) base.skills.levels = { whirlwind: 1 }
    if (typeof base.skills.levels.whirlwind !== 'number') base.skills.levels.whirlwind = 1
    if (!base.skills.branches) base.skills.branches = {}
    if (!Array.isArray(base.skills.equippedActives)) base.skills.equippedActives = ['whirlwind', null, null]
    if (base.skills.equippedActives.length !== 3) base.skills.equippedActives = ['whirlwind', null, null]
    if (base.skills.equippedUltimate === undefined) base.skills.equippedUltimate = null
    return base
  } catch {
    return createNewSave()
  }
}

export function persistSave(save: PlayerSave) {
  localStorage.setItem(KEY, JSON.stringify(save))
}

export function resetSave() {
  localStorage.removeItem(KEY)
}

