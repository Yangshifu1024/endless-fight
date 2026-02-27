import Phaser from "phaser";
import type { Enemy } from "../model/Enemy";
import { createRng } from "../logic/rng";
import { enemyHpAtStage, enemyAtkAtStage, enemyDefAtStage } from "../logic/balance";
import { BattleHUD } from "../ui/BattleHUD";

export class EnemySystem {
  private scene: Phaser.Scene;
  private rng = createRng(Date.now());
  private enemies: Enemy[] = [];
  private hud: BattleHUD;

  // Spawn related
  private spawnedCount = 0;
  private spawnCooldownMs = 0;
  private kills = 0;
  private killsNeeded = 0;
  private laneY = 0;

  constructor(scene: Phaser.Scene, hud: BattleHUD) {
    this.scene = scene;
    this.hud = hud;
  }

  public init(stage: number, laneY: number) {
    this.laneY = laneY;
    this.kills = 0;
    this.killsNeeded = (10 + stage) * 2;
    this.spawnedCount = 0;
    this.spawnCooldownMs = 0;
    
    this.clearEnemies();
  }

  public clearEnemies() {
    this.enemies.forEach((e) => {
      e.sprite.destroy();
      e.hpBarBg.destroy();
      e.hpBarFill.destroy();
      if (e.stunFx) {
        e.stunFx.destroy();
      }
    });
    this.enemies = [];
  }

  public get all(): Enemy[] {
    return this.enemies;
  }

  public get killCount(): number {
    return this.kills;
  }

  public get requiredKills(): number {
    return this.killsNeeded;
  }

  public isStageClear(): boolean {
    return this.kills >= this.killsNeeded;
  }

  public incrementKills() {
    this.kills++;
  }

  public removeEnemy(enemy: Enemy) {
    this.enemies = this.enemies.filter((e) => e !== enemy);
  }

  public addEnemy(enemy: Enemy) {
    this.enemies.push(enemy);
    this.hud.updateEnemyHpBar(enemy);
  }

  public update(dt: number, playerX: number, stage: number, isDefeated: boolean, overlayOpen: boolean) {
    if (overlayOpen) return;
    if (isDefeated) return;

    this.updateSpawns(dt, stage);
    this.updateMovement(dt, playerX);
  }

  private updateSpawns(dt: number, stage: number) {
    if (this.kills >= this.killsNeeded) return;
    this.spawnCooldownMs = Math.max(0, this.spawnCooldownMs - dt);
    if (this.spawnCooldownMs > 0) return;

    const living = this.enemies.length;
    const maxLiving = 6 + Math.min(8, Math.floor(stage / 12));
    if (living >= maxLiving) return;
    if (this.spawnedCount >= this.killsNeeded) return;

    this.spawnEnemy(stage);
    this.spawnedCount += 1;
    this.spawnCooldownMs = Math.max(140, 520 - stage * 1.5);
  }

  private updateMovement(dt: number, playerX: number) {
    for (const e of this.enemies) {
      if (e.expelled) {
        // 暂时退出战斗：隐藏血条与单位，计时后回归
        e.expelledMs = Math.max(0, (e.expelledMs ?? 0) - dt);
        if (e.expelledMs <= 0) {
          // 回归战斗：在右侧边缘附近重现，保留原生命值
          const cam = this.scene.cameras.main;
          const rightEdge = cam.scrollX + cam.width - 30;
          e.sprite.x = rightEdge;
          e.sprite.y = this.laneY;
          e.sprite.setAlpha(1);
          e.hpBarBg.setAlpha(1);
          e.hpBarFill.setAlpha(1);
          e.attackCooldownMs = this.rng.int(300, 800);
          e.expelled = false;
          e.expelledMs = undefined;
          this.hud.updateEnemyHpBar(e);
        }
        continue;
      }
      if ((e.stunMs ?? 0) > 0) {
        e.stunMs = Math.max(0, (e.stunMs ?? 0) - dt);
        e.attackCooldownMs = Math.max(e.attackCooldownMs, e.stunMs ?? 0);
        if (e.stunFx) {
          e.stunFx.setPosition(e.sprite.x, e.sprite.y - 24);
          if (e.stunMs <= 0) {
            const targets = [e.stunFx, ...(e.stunFx.list ?? [])];
            this.scene.tweens.killTweensOf(targets);
            e.stunFx.destroy();
            e.stunFx = undefined;
          }
        }
        e.sprite.y = this.laneY - (e.jumpOffsetY ?? 0);
        this.hud.updateEnemyHpBar(e);
        continue;
      }
      const step = e.speed * (dt / 1000);
      const dx = playerX - e.sprite.x;
      const stopDist = 24;
      if (dx < -stopDist) {
        e.sprite.x -= step;
      } else if (dx > stopDist) {
        e.sprite.x += step;
      }
      e.sprite.y = this.laneY - (e.jumpOffsetY ?? 0);
      e.attackCooldownMs = Math.max(0, e.attackCooldownMs - dt);
      this.hud.updateEnemyHpBar(e);
    }
  }

  private spawnEnemy(stage: number) {
    const { width } = this.scene.scale;
    const pad = 10;
    const camRight = this.scene.cameras.main.scrollX + width;
    const x = camRight - pad;
    const y = this.laneY;

    const eliteChance = 0.08 + Math.min(0.12, stage * 0.0006);
    let kind: Enemy["kind"] = "normal";
    if (this.rng.chance(0.16)) {
      kind = "splitter";
    } else if (this.rng.chance(0.2)) {
      kind = this.rng.chance(eliteChance) ? "pusher_elite" : "pusher";
    } else if (this.rng.chance(eliteChance)) {
      kind = "elite";
    }

    const hpMaxBase = enemyHpAtStage(stage) * (kind === "elite" ? 1.8 : 1);
    const atkBase = enemyAtkAtStage(stage);
    const defBase = enemyDefAtStage(stage) * (kind === "elite" ? 1.3 : 1);

    let hpMax = hpMaxBase;
    let atk = atkBase;
    let def = defBase;
    let speed = (kind === "elite" ? 70 : 85) + Math.min(55, stage * 0.3);
    let tint: number | undefined;
    let barColor = 0x22c55e;
    let barW = 28;
    let barOffsetY = 18;
    let scale = 1;

    if (kind === "elite") {
      barColor = 0xf43f5e;
      barW = 34;
      barOffsetY = 22;
    } else if (kind === "splitter") {
      def *= 0.8;
      tint = 0x22c55e;
      barColor = 0x22c55e;
    } else if (kind === "pusher") {
      atk *= 0.5;
      def *= 2;
      tint = 0xf59e0b;
      barColor = 0xf59e0b;
      barW = 32;
      barOffsetY = 20;
      speed = Math.max(55, speed - 10);
    } else if (kind === "pusher_elite") {
      atk *= 0.6;
      def *= 2.2;
      tint = 0xf59e0b;
      barColor = 0xf59e0b;
      barW = 36;
      barOffsetY = 22;
      speed = Math.max(50, speed - 15);
    }

    const enemy = this.createEnemy({
      x,
      y,
      kind,
      hpMax,
      atk,
      def,
      speed,
      scale,
      tint,
      barW,
      barColor,
      barOffsetY,
      attackCooldownMs: this.rng.int(80, 420),
    });
    this.addEnemy(enemy);
  }

  public createEnemy(params: {
    x: number;
    y: number;
    kind: Enemy["kind"];
    hpMax: number;
    atk: number;
    def: number;
    speed: number;
    scale: number;
    tint?: number;
    barW: number;
    barColor: number;
    barOffsetY: number;
    attackCooldownMs: number;
  }): Enemy {
    const {
      x,
      y,
      kind,
      hpMax,
      atk,
      def,
      speed,
      scale,
      tint,
      barW,
      barColor,
      barOffsetY,
      attackCooldownMs,
    } = params;
    const isElite = kind === "elite";
    const sprite = this.scene.add.sprite(x, y, isElite ? "enemy_elite" : "enemy");
    sprite.setDepth(19);
    sprite.setScale(scale);
    if (tint !== undefined) sprite.setTint(tint);
    const barH = 6;
    const hpBarBg = this.scene.add.rectangle(
      x,
      y - barOffsetY,
      barW,
      barH,
      0x0b1220,
      0.92
    );
    hpBarBg.setStrokeStyle(1, 0x334155, 1);
    const hpBarFill = this.scene.add
      .rectangle(
        x - barW / 2 + 1,
        y - barOffsetY,
        barW - 2,
        barH - 2,
        barColor,
        1
      )
      .setOrigin(0, 0.5);
    hpBarBg.setDepth(25);
    hpBarFill.setDepth(26);
    return {
      id: `${Date.now()}-${Math.floor(this.rng.next() * 1e9)}`,
      sprite,
      hp: hpMax,
      hpMax,
      atk,
      def,
      isElite,
      kind,
      speed,
      attackCooldownMs,
      hpBarBg,
      hpBarFill,
      hpBarW: barW,
      hpBarOffsetY: barOffsetY,
      jumpOffsetY: 0,
    };
  }

  public findNearestEnemyTo(
    x: number,
    y: number,
    maxDist: number,
    ignoreIds: Set<string>
  ) {
    let best: Enemy | undefined;
    let bestDist = maxDist;
    for (const e of this.enemies) {
      if (ignoreIds.has(e.id)) continue;
      const d = Phaser.Math.Distance.Between(e.sprite.x, e.sprite.y, x, y);
      if (d < bestDist) {
        bestDist = d;
        best = e;
      }
    }
    return best;
  }

  public flashEnemy(enemy: Enemy) {
    if (!enemy.sprite.active) return;
    enemy.sprite.setTintFill(0xffffff);
    this.scene.time.delayedCall(70, () => {
      if (!enemy.sprite.active) return;
      enemy.sprite.clearTint();
    });
  }
}
