import type { SkillId } from "../model/types";
import type { SkillDef } from "./types";

export const skillDefs: Record<SkillId, SkillDef> = {
  whirlwind: {
    id: "whirlwind",
    type: "active",
    name: "旋风斩",
    description: "对周围敌人造成范围伤害。",
    unlockLevel: 1,
    maxLevel: 7,
    branchUnlockLevel: 3,
    branches: [
      { id: "wide", name: "广域", description: "范围更大，但伤害略低。" },
      { id: "strong", name: "强袭", description: "范围更小，但伤害更高。" },
    ],
    baseCooldownMs: 4500,
  },
  charge: {
    id: "charge",
    type: "active",
    name: "冲撞",
    description: "变大并冲锋至屏幕最右侧再返回，造成2次伤害。",
    unlockLevel: 3,
    maxLevel: 7,
    branchUnlockLevel: 3,
    branches: [
      {
        id: "heavy",
        name: "重击",
        description: "造成更高伤害。",
      },
      { id: "wide", name: "巨化", description: "体型更大，攻击范围更广。" },
    ],
    baseCooldownMs: 20000,
  },

  sharpen: {
    id: "sharpen",
    type: "passive",
    name: "磨锋",
    description: "提高基础攻击力。",
    unlockLevel: 2,
    maxLevel: 10,
    branchUnlockLevel: 999,
    branches: [],
  },
  vitality: {
    id: "vitality",
    type: "passive",
    name: "体魄",
    description: "提高基础生命值上限。",
    unlockLevel: 4,
    maxLevel: 10,
    branchUnlockLevel: 999,
    branches: [],
  },
  precision: {
    id: "precision",
    type: "passive",
    name: "精确",
    description: "提高暴击率。",
    unlockLevel: 6,
    maxLevel: 10,
    branchUnlockLevel: 999,
    branches: [],
  },
  thorns: {
    id: "thorns",
    type: "passive",
    name: "荆棘",
    description: "受到攻击时反弹部分伤害。",
    unlockLevel: 5,
    maxLevel: 10,
    branchUnlockLevel: 999,
    branches: [],
  },
};
