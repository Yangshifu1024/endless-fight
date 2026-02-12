import type { SkillId } from '../model/types'
import type { SkillDef } from './types'

export const skillDefs: Record<SkillId, SkillDef> = {
  whirlwind: {
    id: 'whirlwind',
    type: 'active',
    name: '旋风斩',
    description: '对周围敌人造成范围伤害。',
    unlockLevel: 1,
    maxLevel: 7,
    branchUnlockLevel: 3,
    branches: [
      { id: 'wide', name: '广域', description: '范围更大，但伤害略低。' },
      { id: 'strong', name: '强袭', description: '范围更小，但伤害更高。' },
    ],
    baseCooldownMs: 4500,
  },
  chain_lightning: {
    id: 'chain_lightning',
    type: 'active',
    name: '连锁闪电',
    description: '对目标造成伤害并在敌人间弹射。',
    unlockLevel: 3,
    maxLevel: 7,
    branchUnlockLevel: 3,
    branches: [
      { id: 'fork', name: '分叉', description: '提高弹射次数，但单次伤害略低。' },
      { id: 'shock', name: '震击', description: '对精英造成更高伤害。' },
    ],
    baseCooldownMs: 5200,
  },
  meteor: {
    id: 'meteor',
    type: 'ultimate',
    name: '陨星',
    description: '大范围高伤害，适合清场。',
    unlockLevel: 8,
    maxLevel: 5,
    branchUnlockLevel: 2,
    branches: [
      { id: 'impact', name: '冲击', description: '更高瞬间伤害，更小范围。' },
      { id: 'burn', name: '余烬', description: '范围更大，并追加一次延迟灼烧。' },
    ],
    baseCooldownMs: 18000,
  },
  sharpen: {
    id: 'sharpen',
    type: 'passive',
    name: '磨锋',
    description: '提高基础攻击力。',
    unlockLevel: 2,
    maxLevel: 10,
    branchUnlockLevel: 999,
    branches: [],
  },
  vitality: {
    id: 'vitality',
    type: 'passive',
    name: '体魄',
    description: '提高基础生命值上限。',
    unlockLevel: 4,
    maxLevel: 10,
    branchUnlockLevel: 999,
    branches: [],
  },
  precision: {
    id: 'precision',
    type: 'passive',
    name: '精确',
    description: '提高暴击率。',
    unlockLevel: 6,
    maxLevel: 10,
    branchUnlockLevel: 999,
    branches: [],
  },
}

