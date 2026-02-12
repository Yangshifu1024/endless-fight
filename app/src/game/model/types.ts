export type StatKey =
  | "atkFlat"
  | "hpFlat"
  | "defFlat"
  | "attackSpeedPct"
  | "critChance"
  | "critDamage"
  | "lifeStealPct"
  | "thornsPct"
  | "recoveryPct";

export type Stats = Partial<Record<StatKey, number>>;

export type SkillId =
  | "whirlwind"
  | "charge"
  | "thunder"
  | "berserk"
  | "shield_wall";

export type ActiveSkillId =
  | "whirlwind"
  | "charge"
  | "thunder"
  | "berserk"
  | "shield_wall";
export type UltimateSkillId = never;
export type PassiveSkillId = never;

export interface PlayerSave {
  version: 1;
  stage: number;
  stageRepeat: number;
  autoNext: boolean;
  autoRetry: boolean;
  showLogs?: boolean;
  level: number;
  exp: number;
  gold: number;
  gearLevel: number;
  peakTier: number;
  totalGoldSpent: number;
  skills: {
    points: number;
    levels: Partial<Record<SkillId, number>>;
    branches: Partial<Record<SkillId, string>>;
    equippedActives: Array<ActiveSkillId | null>;
  };
}
