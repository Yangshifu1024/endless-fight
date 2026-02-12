import type { PlayerSave } from '../model/types'

const KEY = 'endless-fight-save-v1'

export function createNewSave(): PlayerSave {
  return {
    version: 1,
    stage: 1,
    stageRepeat: 0,
    autoNext: false,
    autoRetry: false,
    showLogs: false,
    level: 1,
    exp: 0,
    gold: 1000,
    gearLevel: 1,
    peakTier: 0,
    totalGoldSpent: 0,
    skills: {
      points: 3,
      levels: { whirlwind: 1, thunder: 0, charge: 0, berserk: 0 },
      branches: {},
      equippedActives: [null, null, null, null, null],
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
      gearLevel: typeof parsed.gearLevel === 'number' ? parsed.gearLevel : 1,
      peakTier: typeof parsed.peakTier === 'number' ? parsed.peakTier : 0,
      autoRetry: typeof (parsed as any).autoRetry === 'boolean' ? (parsed as any).autoRetry : false,
      showLogs: typeof (parsed as any).showLogs === 'boolean' ? (parsed as any).showLogs : false,
      totalGoldSpent: typeof parsed.totalGoldSpent === 'number' ? parsed.totalGoldSpent : 0,
      skills: parsed.skills ?? createNewSave().skills,
    }
    if (typeof base.skills.points !== 'number') base.skills.points = 0
    if (!base.skills.levels) base.skills.levels = { whirlwind: 1 }
    if (typeof base.skills.levels.whirlwind !== 'number') base.skills.levels.whirlwind = 1
    if (!base.skills.branches) base.skills.branches = {}
    if (!Array.isArray(base.skills.equippedActives)) base.skills.equippedActives = ['whirlwind', null, null, null, null]
    if (base.skills.equippedActives.length !== 5) base.skills.equippedActives = ['whirlwind', null, null, null, null]
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

