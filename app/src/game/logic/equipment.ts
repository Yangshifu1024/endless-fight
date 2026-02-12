import type { EquipmentItem, EquipmentSlot, Rarity, Stats } from '../model/types'
import { pickWeighted, type Rng } from './rng'

const slots: EquipmentSlot[] = ['weapon', 'helmet', 'armor', 'gloves', 'boots', 'accessory']

const rarityOrder: Rarity[] = ['common', 'uncommon', 'rare', 'epic', 'legendary']

export function rarityColor(r: Rarity) {
  switch (r) {
    case 'common':
      return '#cbd5e1'
    case 'uncommon':
      return '#22c55e'
    case 'rare':
      return '#3b82f6'
    case 'epic':
      return '#a855f7'
    case 'legendary':
      return '#f59e0b'
  }
}

export function rarityLabel(r: Rarity) {
  switch (r) {
    case 'common':
      return '白'
    case 'uncommon':
      return '绿'
    case 'rare':
      return '蓝'
    case 'epic':
      return '紫'
    case 'legendary':
      return '橙'
  }
}

export function rarityRank(r: Rarity) {
  return rarityOrder.indexOf(r)
}

function rarityWeightsAtStage(stage: number) {
  const s = Math.max(1, stage)
  const t = Math.min(1, s / 150)
  return [
    { item: 'common' as const, weight: 70 - 30 * t },
    { item: 'uncommon' as const, weight: 20 + 10 * t },
    { item: 'rare' as const, weight: 8 + 10 * t },
    { item: 'epic' as const, weight: 1.8 + 7 * t },
    { item: 'legendary' as const, weight: 0.2 + 3 * t },
  ]
}

function affixCount(rarity: Rarity) {
  switch (rarity) {
    case 'common':
      return 1
    case 'uncommon':
      return 2
    case 'rare':
      return 3
    case 'epic':
      return 4
    case 'legendary':
      return 5
  }
}

function rarityScalar(rarity: Rarity) {
  switch (rarity) {
    case 'common':
      return 1.0
    case 'uncommon':
      return 1.15
    case 'rare':
      return 1.35
    case 'epic':
      return 1.6
    case 'legendary':
      return 2.0
  }
}

function baseStatsForSlot(slot: EquipmentSlot, iLv: number, scalar: number): Stats {
  const t = Math.max(1, iLv)
  switch (slot) {
    case 'weapon':
      return { atkFlat: Math.floor((6 + t * 1.35) * scalar) }
    case 'helmet':
      return { hpFlat: Math.floor((18 + t * 3.2) * scalar), defFlat: Math.floor((1 + t * 0.25) * scalar) }
    case 'armor':
      return { hpFlat: Math.floor((26 + t * 4.8) * scalar), defFlat: Math.floor((2 + t * 0.35) * scalar) }
    case 'gloves':
      return { atkFlat: Math.floor((2 + t * 0.55) * scalar), attackSpeedPct: 0.02 * scalar }
    case 'boots':
      return { defFlat: Math.floor((1 + t * 0.2) * scalar), attackSpeedPct: 0.02 * scalar }
    case 'accessory':
      return { atkFlat: Math.floor((2 + t * 0.65) * scalar), critChance: 0.02 * scalar }
  }
}

function addStat(stats: Stats, key: keyof Stats, value: number) {
  const prev = (stats[key] ?? 0) as number
  ;(stats as Record<string, number>)[key as string] = prev + value
}

function rollAffix(rng: Rng, iLv: number, scalar: number, stats: Stats) {
  const t = Math.max(1, iLv)
  const pool = [
    { item: 'atkFlat' as const, weight: 28 },
    { item: 'hpFlat' as const, weight: 24 },
    { item: 'defFlat' as const, weight: 18 },
    { item: 'attackSpeedPct' as const, weight: 15 },
    { item: 'critChance' as const, weight: 10 },
    { item: 'critDamage' as const, weight: 4 },
    { item: 'lifeStealPct' as const, weight: 1 },
  ]
  const key = pickWeighted(rng, pool)
  switch (key) {
    case 'atkFlat':
      addStat(stats, key, Math.floor((1 + t * 0.45) * scalar))
      break
    case 'hpFlat':
      addStat(stats, key, Math.floor((6 + t * 1.2) * scalar))
      break
    case 'defFlat':
      addStat(stats, key, Math.floor((1 + t * 0.28) * scalar))
      break
    case 'attackSpeedPct':
      addStat(stats, key, (0.008 + t * 0.00015) * scalar)
      break
    case 'critChance':
      addStat(stats, key, (0.005 + t * 0.00008) * scalar)
      break
    case 'critDamage':
      addStat(stats, key, (0.02 + t * 0.00025) * scalar)
      break
    case 'lifeStealPct':
      addStat(stats, key, (0.01 + t * 0.00012) * scalar)
      break
  }
}

export function generateEquipment(rng: Rng, stage: number) {
  const iLv = Math.max(1, stage + rng.int(-2, 2))
  const rarity = pickWeighted(rng, rarityWeightsAtStage(stage))
  const scalar = rarityScalar(rarity)
  const slot = rng.pick(slots)
  const stats: Stats = { ...baseStatsForSlot(slot, iLv, scalar) }
  const count = affixCount(rarity)
  for (let i = 0; i < count; i++) rollAffix(rng, iLv, scalar, stats)
  const power = estimatePower(stats)

  const id = `${stage}-${iLv}-${rarityOrder.indexOf(rarity)}-${slot}-${Math.floor(rng.next() * 1e9).toString(16)}`
  const name = `${rarityLabel(rarity)}·${slotName(slot)}`

  const item: EquipmentItem = { id, name, slot, rarity, iLv, enhanceLevel: 0, stats, power }
  return item
}

export function estimatePower(stats: Stats) {
  const atk = stats.atkFlat ?? 0
  const hp = stats.hpFlat ?? 0
  const def = stats.defFlat ?? 0
  const as = stats.attackSpeedPct ?? 0
  const cc = stats.critChance ?? 0
  const cd = stats.critDamage ?? 0
  const ls = stats.lifeStealPct ?? 0
  return atk * 2.2 + hp * 0.25 + def * 1.4 + as * 320 + cc * 520 + cd * 160 + ls * 220
}

export function enhanceCost(item: EquipmentItem) {
  const lv = Math.max(0, item.enhanceLevel)
  const baseGold = 45 + item.iLv * 20
  const gold = Math.floor(baseGold * (1 + lv * 0.42))
  const essence = 1 + Math.floor(lv / 3)
  return { gold, essence }
}

export function canEnhance(item: EquipmentItem) {
  const maxLv = 20
  return item.enhanceLevel < maxLv
}

export function applyEnhance(item: EquipmentItem) {
  const factor = 1.04
  item.stats = scaleStats(item.stats, factor)
  item.enhanceLevel += 1
  item.power = estimatePower(item.stats)
  item.name = `${rarityLabel(item.rarity)}·${slotName(item.slot)}+${item.enhanceLevel}`
}

export function reforgeCost(item: EquipmentItem) {
  const gold = Math.floor(80 + item.iLv * 28)
  const reforgeStone = 1
  return { gold, reforgeStone }
}

export function applyReforge(rng: Rng, item: EquipmentItem) {
  const scalar = rarityScalar(item.rarity)
  const stats: Stats = { ...baseStatsForSlot(item.slot, item.iLv, scalar) }
  const count = affixCount(item.rarity)
  for (let i = 0; i < count; i++) rollAffix(rng, item.iLv, scalar, stats)
  const enhanced = item.enhanceLevel
  item.stats = stats
  item.power = estimatePower(item.stats)
  item.name = `${rarityLabel(item.rarity)}·${slotName(item.slot)}${enhanced > 0 ? `+${enhanced}` : ''}`
}

export function formatItemShort(item: EquipmentItem) {
  const enh = item.enhanceLevel > 0 ? `+${item.enhanceLevel}` : ''
  return `${rarityLabel(item.rarity)} ${slotName(item.slot)}${enh} iLv${item.iLv}`
}

export function formatStatsLines(stats: Stats) {
  const lines: string[] = []
  const add = (label: string, value: number, pct = false) => {
    if (!value) return
    const v = pct ? `${(value * 100).toFixed(2)}%` : `${Math.floor(value)}`
    lines.push(`${label} +${v}`)
  }
  add('攻击', stats.atkFlat ?? 0)
  add('生命', stats.hpFlat ?? 0)
  add('防御', stats.defFlat ?? 0)
  add('攻速', stats.attackSpeedPct ?? 0, true)
  add('暴击率', stats.critChance ?? 0, true)
  add('暴击伤害', stats.critDamage ?? 0, true)
  add('吸血', stats.lifeStealPct ?? 0, true)
  return lines
}

function scaleStats(stats: Stats, factor: number): Stats {
  const out: Stats = {}
  for (const [k, v] of Object.entries(stats)) {
    const key = k as keyof Stats
    const n = typeof v === 'number' ? v : 0
    if (key === 'atkFlat' || key === 'hpFlat' || key === 'defFlat') {
      ;(out as any)[key] = Math.floor(n * factor)
    } else {
      ;(out as any)[key] = n * factor
    }
  }
  return out
}

export function slotName(slot: EquipmentSlot) {
  switch (slot) {
    case 'weapon':
      return '武器'
    case 'helmet':
      return '头盔'
    case 'armor':
      return '护甲'
    case 'gloves':
      return '手套'
    case 'boots':
      return '靴子'
    case 'accessory':
      return '饰品'
  }
}
