import type { PlayerSave, Stats } from '../model/types'
import { passiveBonuses } from '../skills/skills'

export interface DerivedPlayerStats {
  atk: number
  hpMax: number
  def: number
  attackIntervalMs: number
  critChance: number
  critDamage: number
  lifeStealPct: number
}

function addInto(dst: Stats, src: Stats) {
  for (const [k, v] of Object.entries(src)) {
    const key = k as keyof Stats
    const prev = (dst[key] ?? 0) as number
    ;(dst as Record<string, number>)[key as string] = prev + (v ?? 0)
  }
}

export function computeDerivedPlayerStats(save: PlayerSave): DerivedPlayerStats {
  const lv = Math.max(1, save.level)
  const bonuses = passiveBonuses(save)
  const stage = Math.max(1, save.stage)
  const earlyBoost = clamp(1.45 - 0.07 * (stage - 1), 1, 1.45)
  const earlyDefFlat = clamp(5 - stage, 0, 4)
  const earlyLifeStealAdd = clamp(0.06 - 0.01 * (stage - 1), 0, 0.06)

  const baseAtk = (10 + (lv - 1) * 2) * (1 + bonuses.atkPct) * earlyBoost
  const baseHp = (120 + (lv - 1) * 22) * (1 + bonuses.hpPct) * earlyBoost
  const baseDef = 3 + (lv - 1) * 0.9 + earlyDefFlat

  const total: Stats = {}
  for (const it of Object.values(save.equipment)) {
    if (!it) continue
    addInto(total, it.stats)
  }

  const atk = Math.max(1, baseAtk + (total.atkFlat ?? 0))
  const hpMax = Math.max(1, baseHp + (total.hpFlat ?? 0))
  const def = Math.max(0, baseDef + (total.defFlat ?? 0))

  const attackSpeedPct = Math.max(-0.5, total.attackSpeedPct ?? 0)
  const attackIntervalMs = 520 / (1 + attackSpeedPct)

  const critChance = clamp((total.critChance ?? 0) + bonuses.critChance, 0, 0.6)
  const critDamage = clamp(1.5 + (total.critDamage ?? 0), 1.25, 3.0)
  const baseLifeStealPct = 0.05
  const lifeStealPct = clamp(
    baseLifeStealPct + earlyLifeStealAdd + (total.lifeStealPct ?? 0),
    0,
    0.25
  )

  return { atk, hpMax, def, attackIntervalMs, critChance, critDamage, lifeStealPct }
}

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v))
}

