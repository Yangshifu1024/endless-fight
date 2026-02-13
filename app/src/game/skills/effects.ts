import type { PlayerSave, SkillId } from "../model/types";
import { getSkillDef, skillBranch, skillLevel } from "./skills";

export function skillCooldownMs(id: SkillId, lv: number) {
  const def = getSkillDef(id);
  if (id === "whirlwind") return 3000;
  if (id === "charge") return 9000;
  if (id === "thunder") return 6000;
  if (id === "berserk") return 30000;
  if (id === "shield_wall") return 30000;
  const base = def.baseCooldownMs ?? 4000;
  const mult = Math.max(0.65, 1 - 0.03 * Math.max(0, lv - 1));
  return base * mult;
}

export function skillDamageMult(lv: number) {
  return 1 + 0.05 * Math.max(0, lv - 1);
}

export function whirlwindParams(lv: number, _branch: string | undefined) {
  const radius = 110;
  const coef = 1.5 + 0.05 * Math.max(0, lv - 1);
  return { radius, coef };
}

export function chargeParams(lv: number, _branch: string | undefined) {
  const scale = 2.0;
  const coef = 2.0 + 0.05 * Math.max(0, lv - 1);
  const stunMs = 3000 + 50 * Math.max(0, lv - 1);
  return { scale, coef, stunMs };
}

export function thunderParams(lv: number) {
  const radius = 110;
  const coef = 1.5 + 0.08 * Math.max(0, lv - 1);
  return { radius, coef };
}

export function berserkParams(lv: number) {
  const baseDuration = 10000;
  const durationMs = baseDuration + 100 * Math.max(0, lv - 1);
  const lifeStealBonusPct = 0.30 + 0.005 * Math.max(0, lv - 1);
  return { durationMs, lifeStealBonusPct };
}

export function shieldWallParams(lv: number) {
  const baseDuration = 10000;
  const durationMs = baseDuration + 100 * Math.max(0, lv - 1);
  return { durationMs };
}

export function skillPreviewLines(save: PlayerSave, id: SkillId) {
  const def = getSkillDef(id);
  const lv = skillLevel(save, id);
  const br = skillBranch(save, id);
  const lines: string[] = [];

  lines.push(def.description);
  lines.push(`等级：Lv${lv}/${def.maxLevel}`);
  if (def.baseCooldownMs) {
    lines.push(`冷却：${formatSeconds(skillCooldownMs(id, Math.max(1, lv)))}`);
  }

  if (id === "whirlwind") {
    const p = whirlwindParams(lv, br);
    lines.push(`范围：${Math.floor(p.radius)}`);
    lines.push(`倍率：${Math.round(p.coef * 100)}% ATK`);
  } else if (id === "charge") {
    const p = chargeParams(lv, br);
    lines.push(`倍率：${Math.round(p.coef * 100)}% ATK (x2)`);
    lines.push(`眩晕：${formatSeconds(p.stunMs)}`);
  } else if (id === "thunder") {
    const p = thunderParams(lv);
    lines.push(`范围：${Math.floor(p.radius)}`);
    lines.push(`倍率：${Math.round(p.coef * 100)}% ATK`);
  } else if (id === "berserk") {
    const p = berserkParams(lv);
    lines.push(`持续：${formatSeconds(p.durationMs)}`);
    lines.push(`额外吸血：${(p.lifeStealBonusPct * 100).toFixed(1)}%`);
  } else if (id === "shield_wall") {
    const p = shieldWallParams(lv);
    lines.push(`持续：${formatSeconds(p.durationMs)}`);
    lines.push(`荆棘：100%`);
  }

  return lines;
}

function formatSeconds(ms: number) {
  return `${(ms / 1000).toFixed(1)}s`;
}

// 分支信息已移除
