import type { PlayerSave, Stats } from "../model/types";
import { passiveBonuses } from "../skills/skills";

export interface DerivedPlayerStats {
  atk: number;
  hpMax: number;
  def: number;
  attackIntervalMs: number;
  critChance: number;
  critDamage: number;
  lifeStealPct: number;
  thornsPct: number;
  recoveryPct: number;
}

function addInto(dst: Stats, src: Stats) {
  for (const [k, v] of Object.entries(src)) {
    const key = k as keyof Stats;
    const prev = (dst[key] ?? 0) as number;
    (dst as Record<string, number>)[key as string] = prev + (v ?? 0);
  }
}

const BASE_ATK = 12.25;
const BASE_DEF = 9.8;
const BASE_HP = 157.5;
const LIFESTEAL_TOTAL = 6.5; // %
const THORNS_TOTAL = 4.2; // %
const LIFESTEAL_START = 1;
const THORNS_START = 1;

function getCoefficients(level: number) {
  if (level < 50) return { gold: 1.0, attr: 1.0 };
  if (level < 100) return { gold: 1.2, attr: 1.3 };
  if (level < 150) return { gold: 1.4, attr: 1.7 };
  if (level < 200) return { gold: 1.7, attr: 2.2 };
  return { gold: 2.1, attr: 2.8 };
}

export function calcSingleGold(level: number): number {
  const { gold: coeff } = getCoefficients(level);
  const base = 100 * Math.pow(level, 1.35);
  return Math.round(base * coeff);
}

export function calcLevelAttributes(level: number): Stats {
  let totalAtk = 0;
  let totalDef = 0;
  let totalHp = 0;
  let totalLifesteal = 0;
  let totalThorns = 0;
  let totalRecovery = 0;

  const LIFESTEAL_PER_LEVEL = LIFESTEAL_TOTAL / (250 - LIFESTEAL_START + 1);
  const THORNS_PER_LEVEL = THORNS_TOTAL / (250 - THORNS_START + 1);
  const RECOVERY_START = THORNS_START;
  const RECOVERY_PER_LEVEL = 1; // 每级提升1%

  for (let lv = 1; lv <= level; lv++) {
    const { attr: attrCoeff } = getCoefficients(lv);
    totalAtk += BASE_ATK * attrCoeff;
    totalDef += BASE_DEF * attrCoeff;
    totalHp += BASE_HP * attrCoeff;
    if (lv >= LIFESTEAL_START) totalLifesteal += LIFESTEAL_PER_LEVEL;
    if (lv >= THORNS_START) totalThorns += THORNS_PER_LEVEL;
    if (lv >= RECOVERY_START) totalRecovery += RECOVERY_PER_LEVEL;
  }

  return {
    atkFlat: Math.floor(totalAtk),
    defFlat: Math.floor(totalDef),
    hpFlat: Math.floor(totalHp),
    lifeStealPct: Number((totalLifesteal / 100).toFixed(5)),
    thornsPct: Number((totalThorns / 100).toFixed(5)),
    recoveryPct: Number((totalRecovery / 100).toFixed(5)),
  };
}

export function calcPeakAttributes(peakTier: number): Stats {
  if (peakTier <= 0) return {};
  let totalAtk = 0;
  let totalDef = 0;
  let totalHp = 0;
  for (let t = 1; t <= peakTier; t++) {
    const decay = Math.pow(0.92, t);
    totalAtk += 9.8 * decay;
    totalDef += 7.84 * decay;
    totalHp += 126 * decay;
    if (t % 10 === 0) {
      totalHp += 500;
      totalAtk += 25;
    }
  }
  return {
    atkFlat: Math.round(totalAtk * 10) / 10,
    defFlat: Math.round(totalDef * 10) / 10,
    hpFlat: Math.round(totalHp * 10) / 10,
  };
}

export function calcPeakGold(peakTier: number): number {
  return Math.round(1_500_000 * Math.pow(1.18, peakTier));
}

export function computeDerivedPlayerStats(
  save: PlayerSave
): DerivedPlayerStats {
  const bonuses = passiveBonuses(save);
  const stage = Math.max(1, save.stage);
  const earlyBoost = clamp(1.45 - 0.07 * (stage - 1), 1, 1.45);
  const earlyDefFlat = clamp(9 - stage, 0, 8);
  const earlyLifeStealAdd = clamp(0.06 - 0.01 * (stage - 1), 0, 0.06);

  const baseAtk = 10 * (1 + bonuses.atkPct) * earlyBoost;
  const baseHp = 120 * (1 + bonuses.hpPct) * earlyBoost;
  const baseDef = 3 + earlyDefFlat;

  const gearStats = calcLevelAttributes(save.gearLevel);
  const peakStats = calcPeakAttributes(save.peakTier);
  const total: Stats = {};
  addInto(total, gearStats);
  addInto(total, peakStats);

  const atk = Math.max(1, baseAtk + (total.atkFlat ?? 0));
  const hpMax = Math.max(1, baseHp + (total.hpFlat ?? 0));
  const def = Math.max(0, baseDef + (total.defFlat ?? 0));

  const attackSpeedPct = Math.max(-0.5, total.attackSpeedPct ?? 0);
  const attackIntervalMs = 500 / (1 + attackSpeedPct);

  const baseCritChance = 0.05;
  const critChance = clamp(
    baseCritChance + (total.critChance ?? 0) + bonuses.critChance,
    0,
    0.6
  );
  const critDamage = clamp(1.5 + (total.critDamage ?? 0), 1.25, 3.0);
  const baseLifeStealPct = 0.1;
  const lifeStealPct = clamp(
    baseLifeStealPct + earlyLifeStealAdd + (total.lifeStealPct ?? 0),
    0,
    0.25
  );
  const thornsBasePct = 0.1;
  const thornsPct = clamp(thornsBasePct + (total.thornsPct ?? 0), 0, 0.6);
  const recoveryBasePct = 0.1;
  const recoveryPct = clamp(recoveryBasePct + (total.recoveryPct ?? 0), 0, 0.5);

  return {
    atk,
    hpMax,
    def,
    attackIntervalMs,
    critChance,
    critDamage,
    lifeStealPct,
    thornsPct,
    recoveryPct,
  };
}

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}
