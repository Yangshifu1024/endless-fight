import type { PlayerSave, SkillId } from "../model/types";
import { getSkillDef, skillBranch, skillLevel } from "./skills";

export function skillCooldownMs(id: SkillId, lv: number) {
  const def = getSkillDef(id);
  const base = def.baseCooldownMs ?? 4000;
  const mult = Math.max(0.65, 1 - 0.03 * Math.max(0, lv - 1));
  return base * mult;
}

export function skillDamageMult(lv: number) {
  return 1 + 0.08 * Math.max(0, lv - 1);
}

export function whirlwindParams(lv: number, branch: string | undefined) {
  let radius = 110;
  let coef = 0.75 * skillDamageMult(lv);
  if (branch === "wide") {
    radius *= 1.35;
    coef *= 0.85;
  } else if (branch === "strong") {
    radius *= 0.9;
    coef *= 1.25;
  }
  return { radius, coef };
}

export function chainLightningParams(lv: number, branch: string | undefined) {
  let dashRange = 250 + lv * 6;
  let radius = 95;
  let coef = 0.85 * skillDamageMult(lv);
  let eliteMult = 1;
  if (branch === "fork") {
    radius *= 1.25;
    coef *= 0.9;
  } else if (branch === "shock") {
    eliteMult = 1.35;
  }
  return { dashRange, radius, coef, eliteMult };
}

export function meteorParams(lv: number, branch: string | undefined) {
  let radius = 180;
  let coef = 2.0 * skillDamageMult(lv);
  let burn = false;
  if (branch === "impact") {
    radius *= 0.9;
    coef *= 1.35;
  } else if (branch === "burn") {
    radius *= 1.1;
    coef *= 0.9;
    burn = true;
  }
  return { radius, coef, burn };
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
    lines.push(`分支：${formatBranch(def, br)}`);
  } else if (id === "chain_lightning") {
    const p = chainLightningParams(lv, br);
    lines.push(`冲锋距离：${Math.floor(p.dashRange)}`);
    lines.push(`范围：前方 180° 半径 ${Math.floor(p.radius)}`);
    lines.push(`倍率：${Math.round(p.coef * 100)}% ATK`);
    if (br === "shock") lines.push(`精英倍率：${p.eliteMult.toFixed(2)}x`);
    lines.push(`分支：${formatBranch(def, br)}`);
  } else if (id === "meteor") {
    const p = meteorParams(lv, br);
    lines.push(`范围：${Math.floor(p.radius)}`);
    lines.push(`倍率：${Math.round(p.coef * 100)}% ATK`);
    if (p.burn) lines.push("追加：延迟灼烧 1 次（约 40% 伤害）");
    lines.push(`分支：${formatBranch(def, br)}`);
  } else if (id === "sharpen") {
    lines.push(`效果：基础攻击 +${(lv * 3).toFixed(0)}%`);
  } else if (id === "vitality") {
    lines.push(`效果：基础生命 +${(lv * 5).toFixed(0)}%`);
  } else if (id === "precision") {
    lines.push(`效果：暴击率 +${(lv * 1).toFixed(0)}%`);
  } else if (id === "thorns") {
    lines.push(`效果：荆棘 +${(lv * 1).toFixed(0)}%`);
  }

  return lines;
}

function formatSeconds(ms: number) {
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatBranch(
  def: { branches: Array<{ id: string; name: string }> },
  branchId: string | undefined
) {
  if (!def.branches.length) return "无";
  if (!branchId)
    return `未选择（${def.branches.map((b) => b.name).join(" / ")}）`;
  const found = def.branches.find((b) => b.id === branchId);
  return found ? found.name : branchId;
}
