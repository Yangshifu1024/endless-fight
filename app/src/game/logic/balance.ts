export function stageRewardMultiplier(stageRepeat: number) {
  return Math.max(0.25, 1 - 0.12 * stageRepeat);
}

export function enemyHpAtStage(stage: number) {
  const s = Math.max(1, stage);
  if (s <= 250) {
    const HP_ANCHOR_250 = 16500;
    const exp = 0.891;
    const hp = HP_ANCHOR_250 * Math.pow(s / 250, exp);
    return Math.max(1, Math.round(hp));
  }
  const tier = s - 250;
  const HP_ANCHOR_250 = 16500;
  const growth = 1.0 + 0.68 * (1 - Math.pow(0.94, tier));
  const hp = HP_ANCHOR_250 * (1 + 0.032 * tier * growth);
  return Math.max(1, Math.round(hp));
}

export function enemyAtkAtStage(stage: number) {
  const s = Math.max(1, stage);
  if (s <= 250) {
    const ATK_ANCHOR_250 = 1820.0;
    const exp = 0.972;
    const atk = ATK_ANCHOR_250 * Math.pow(s / 250, exp);
    return Math.max(1, Number(atk.toFixed(1)));
  }
  const tier = s - 250;
  const ATK_ANCHOR_250 = 1820.0;
  const growth = 1.0 + 0.68 * (1 - Math.pow(0.94, tier));
  const atk = ATK_ANCHOR_250 * (1 + 0.018 * tier * growth);
  return Math.max(1, Number(atk.toFixed(1)));
}

export function enemyDefAtStage(stage: number) {
  const s = Math.max(1, stage);
  if (s <= 250) {
    const DEF_ANCHOR_250 = 1420.0;
    const exp = 1.016;
    const def = DEF_ANCHOR_250 * Math.pow(s / 250, exp);
    return Math.max(0, Number(def.toFixed(1)));
  }
  const tier = s - 250;
  const DEF_ANCHOR_250 = 1420.0;
  const growth = 1.0 + 0.68 * (1 - Math.pow(0.94, tier));
  const def = DEF_ANCHOR_250 * (1 + 0.015 * tier * growth);
  return Math.max(0, Number(def.toFixed(1)));
}

export function goldAtStage(stage: number, baseGold: number) {
  const s = Math.max(1, stage);
  const d = 0.06;
  const u = 1.2;
  return baseGold * Math.pow(1 + d * s, u);
}

export function expAtStage(stage: number, baseExp: number) {
  const s = Math.max(1, stage);
  const c = 0.06;
  const r = 1.25;
  return baseExp * Math.pow(1 + c * s, r);
}

export function damageAfterDefense(atk: number, def: number) {
  const d = Math.max(0, def);
  return atk * (100 / (100 + d));
}
