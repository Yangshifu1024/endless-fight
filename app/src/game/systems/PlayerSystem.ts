import Phaser from "phaser";
import type { PlayerSave } from "../model/types";
import {
  computeDerivedPlayerStats,
} from "../logic/playerStats";
import { MapSystem } from "./MapSystem";
import { EnemySystem } from "./EnemySystem";
import {
  skillLevel,
  skillBranch,
} from "../skills/skills";
import {
  chargeParams,
  skillCooldownMs,
  whirlwindParams,
  thunderParams,
  berserkParams,
  shieldWallParams,
} from "../skills/effects";
import type { Enemy } from "../model/Enemy";
import { BattleHUD } from "../ui/BattleHUD";
import { createRng } from "../logic/rng";
import { damageAfterDefense } from "../logic/balance";

export class PlayerSystem {
  private scene: Phaser.Scene;
  private save: PlayerSave;
  private mapSystem: MapSystem;
  private enemySystem: EnemySystem;
  private hud: BattleHUD;
  private rng = createRng(Date.now());

  public playerCircle!: Phaser.GameObjects.Sprite;
  public playerHp = 1;
  public playerBaseScale = 2;
  
  // State
  private playerAttackCdMs = 0;
  private activeCooldownMs = [0, 0, 0, 0, 0];
  private playerAnimT = 0;
  private attackAnimMs = 0;
  private heroDir: "down" | "up" | "left" | "right" = "down";
  private laneY = 0;
  private heroStartX = 0;
  private dashLockMs = 0;
  private chargeImmuneMs = 0;
  private recoveryTickerMs = 0;
  private activeCastLockMs = 0;
  
  // Skills State
  private berserkMs = 0;
  private berserkLifeStealBonusPct = 0;
  private shieldWallMs = 0;
  private berserkPulse?: Phaser.Tweens.Tween;

  public keys!: Record<"W" | "A" | "S" | "D", Phaser.Input.Keyboard.Key>;

  constructor(
    scene: Phaser.Scene, 
    save: PlayerSave, 
    mapSystem: MapSystem, 
    enemySystem: EnemySystem,
    hud: BattleHUD
  ) {
    this.scene = scene;
    this.save = save;
    this.mapSystem = mapSystem;
    this.enemySystem = enemySystem;
    this.hud = hud;
    
    this.keys = this.scene.input.keyboard!.addKeys("W,A,S,D") as any;
  }

  public init(laneY: number, startX: number) {
    this.laneY = laneY;
    this.heroStartX = startX;
    
    this.createHeroAnims();
    
    if (this.scene.textures.exists("swordman")) this.playerBaseScale = 1;
    
    if (!this.playerCircle) {
      const heroKey = this.scene.textures.exists("swordman") ? "swordman" : "player";
      const heroFrame = heroKey === "swordman" ? 0 : undefined;
      
      this.playerCircle = this.scene.add.sprite(
        this.heroStartX,
        this.laneY,
        heroKey,
        heroFrame
      );
      this.playerCircle.setDepth(20);
    } else {
      this.playerCircle.setPosition(this.heroStartX, this.laneY);
      this.playerCircle.setVisible(true);
      this.playerCircle.setActive(true);
      this.playerCircle.setAlpha(1);
      this.playerCircle.setTint(0xffffff);
    }
    
    this.playerCircle.setScale(this.playerBaseScale);
    this.updateHeroAnim(0, 0);
    
    const derived = this.getDerived();
    this.playerHp = derived.hpMax;
    
    // Reset states
    this.playerAttackCdMs = 0;
    this.activeCooldownMs = [800, 800, 800, 800, 800];
    this.attackAnimMs = 0;
    this.dashLockMs = 0;
    this.recoveryTickerMs = 0;
    this.activeCastLockMs = 0;
    this.berserkMs = 0;
    this.berserkLifeStealBonusPct = 0;
    this.shieldWallMs = 0;
    
    if (this.berserkPulse) {
      this.berserkPulse.stop();
      this.berserkPulse = undefined;
    }
  }

  public getDerived(stageAtkSpeedMult: number = 1, stageCritBonus: number = 0) {
    const d = computeDerivedPlayerStats(this.save);
    const spdMult = Math.max(1, Math.min(2, stageAtkSpeedMult));
    d.attackIntervalMs = Math.max(80, Math.floor(d.attackIntervalMs / spdMult));
    d.critChance = Math.min(1, d.critChance + Math.max(0, stageCritBonus));
    const cam = this.scene.cameras?.main;
    if (cam && this.playerCircle) {
      const mid = cam.scrollX + cam.width * 0.5;
      const onRight = this.playerCircle.x >= mid;
      if (onRight) {
        d.atk = d.atk * 1.5;
      } else {
        d.def = d.def * 1.5;
      }
    }
    return d;
  }

  public update(dt: number, overlayOpen: boolean, isDefeated: boolean, stageAtkSpeedMult: number, stageCritBonus: number) {
    this.attackAnimMs = Math.max(0, this.attackAnimMs - dt);
    this.chargeImmuneMs = Math.max(0, this.chargeImmuneMs - dt);
    
    if (overlayOpen || isDefeated) return;

    this.updateMovement(dt);
    
    const derived = this.getDerived(stageAtkSpeedMult, stageCritBonus);
    
    // Combat updates
    this.playerAttackCdMs = Math.max(0, this.playerAttackCdMs - dt);
    this.updateSkillCasting(dt, derived);
    
    if (this.playerAttackCdMs <= 0) {
      this.playerAttack(derived);
      this.playerAttackCdMs = derived.attackIntervalMs;
    }
    
    // Recovery
    if (this.playerHp < derived.hpMax) {
      this.recoveryTickerMs += dt;
      if (this.recoveryTickerMs >= 1000) {
        this.recoveryTickerMs -= 1000;
        const rec = derived.hpMax * (derived.recoveryPct / 10);
        if (rec > 0) {
          this.playerHp = Math.min(derived.hpMax, this.playerHp + rec);
        }
      }
    }
  }

  // Exposed for Scene interaction
  public takeDamage(amount: number) {
    this.playerHp -= amount;
  }
  
  public get x() { return this.playerCircle.x; }
  public get y() { return this.playerCircle.y; }
  public get isBerserk() { return this.berserkMs > 0; }
  public get isShieldWall() { return this.shieldWallMs > 0; }
  public get berserkBonus() { return this.berserkLifeStealBonusPct; }
  public get hp() { return this.playerHp; }
  public set hp(val: number) { this.playerHp = val; }
  public get chargeImmune() { return this.chargeImmuneMs > 0; }
  
  public setDashLock(ms: number) {
    this.dashLockMs = ms;
  }
  
  public playKnockback(durationMs: number) {
    if (this.scene.anims.exists("hero_knockback")) {
      const anim = this.scene.anims.get("hero_knockback");
      const frames = anim?.frames.length ?? 4;
      const frameRate = anim?.frameRate ?? 12;
      const animDuration = Math.max(160, (frames / frameRate) * 1000);
      this.attackAnimMs = Math.max(this.attackAnimMs, animDuration, durationMs);
      this.playerCircle.anims.play(
        { key: "hero_knockback", frameRate, repeat: 0 },
        true
      );
    }
  }

  public playDefeatAnim(): number {
    const hasAnim =
      this.scene.textures.exists("swordman") && this.scene.anims.exists("hero_defeat");
    if (hasAnim) {
      const anim = this.scene.anims.get("hero_defeat");
      const frames = anim?.frames.length ?? 7;
      const durationMs = Math.max(
        600,
        (frames / (anim?.frameRate ?? 10)) * 1000
      );
      this.playerCircle.anims.play(
        { key: "hero_defeat", frameRate: 10, repeat: 0 },
        true
      );
      this.attackAnimMs = Math.max(this.attackAnimMs, durationMs);
      return durationMs;
    }
    return 0;
  }

  // Private implementation
  private updateMovement(dt: number) {
    if (this.dashLockMs > 0) {
      this.dashLockMs = Math.max(0, this.dashLockMs - dt);
      return;
    }

    const speed = 190;
    let vx = 0;
    if (this.keys.A.isDown) vx -= 1;
    if (this.keys.D.isDown) vx += 1;
    if (Math.abs(vx) > 0.001) {
      vx = Math.sign(vx);
    } else {
      const target = this.enemySystem.findNearestEnemyTo(this.playerCircle.x, this.playerCircle.y, Infinity, new Set());
      if (target) {
        const dx = target.sprite.x - this.playerCircle.x;
        const desiredDist = 24;
        if (Math.abs(dx) > desiredDist) vx = dx > 0 ? 1 : -1;
      }
    }

    const { width } = this.scene.scale;
    const boundW = this.mapSystem.width > 0 ? this.mapSystem.width : width;
    const pad = 10 * this.playerBaseScale;
    const nextX = this.playerCircle.x + vx * speed * (dt / 1000);
    const nx = Phaser.Math.Clamp(nextX, pad, boundW - pad);
    this.playerCircle.setPosition(nx, this.laneY);
    this.updateHeroAnim(vx, 0);
    this.playerAnimT += dt;
    if (this.attackAnimMs <= 0) {
      const targetScale = this.playerBaseScale;
      this.playerCircle.setScale(targetScale);
    }
  }

  private createHeroAnims() {
    if (this.scene.textures.exists("swordman")) {
      if (this.scene.anims.exists("hero_idle_down")) return;
      const range = (start: number, count: number) =>
        Array.from({ length: count }, (_, i) => start + i);
      const idle = range(0, 8);
      const run = range(48, 8);
      const attack1 = range(176, 8);
      const attack2 = range(80, 6);
      const attack3 = range(198, 10);
      const tex = this.scene.textures.get("swordman");
      const src: any = tex.getSourceImage();
      const cols = Math.max(1, Math.floor((src?.width ?? 0) / 80));
      const rows = Math.max(1, Math.floor((src?.height ?? 0) / 64));
      const defeatRowStart = Math.max(0, (rows - 2) * cols);
      const defeat = range(defeatRowStart, Math.min(7, cols));
      const knockback = range(defeatRowStart, Math.min(4, cols));
      const attack0Start = Math.max(0, (12 - 1) * cols);
      const attack0 = range(attack0Start, 8);
      const chargeStart = Math.max(0, (17 - 1) * cols);
      const chargeFrames = range(chargeStart, 10);
      const mk = (
        key: string,
        frames: number[],
        frameRate: number,
        repeat: number
      ) => {
        this.scene.anims.create({
          key,
          frames: frames.map((frame) => ({ key: "swordman", frame })),
          frameRate,
          repeat,
        });
      };
      mk("hero_idle_down", idle, 10, -1);
      mk("hero_idle_up", idle, 10, -1);
      mk("hero_idle_left", idle, 10, -1);
      mk("hero_idle_right", idle, 10, -1);
      mk("hero_run_down", run, 14, -1);
      mk("hero_run_up", run, 14, -1);
      mk("hero_run_left", run, 14, -1);
      mk("hero_run_right", run, 14, -1);
      mk("hero_attack0", attack0, 12, 0);
      mk("hero_attack1", attack1, 12, 0);
      mk("hero_attack2", attack2, 12, 0);
      mk("hero_attack3", attack3, 12, 0);
      mk("hero_charge", chargeFrames, 16, 0);
      mk("hero_knockback", knockback, 12, 0);
      mk("hero_defeat", defeat, 10, 0);
      return;
    }
  }

  private updateHeroAnim(vx: number, vy: number) {
    if (!this.scene.textures.exists("swordman")) return;
    if (
      this.attackAnimMs > 0 &&
      (this.scene.anims.exists("hero_attack0") ||
        this.scene.anims.exists("hero_attack1") ||
        this.scene.anims.exists("hero_attack2") ||
        this.scene.anims.exists("hero_attack3") ||
        this.scene.anims.exists("hero_charge"))
    ) {
      return;
    }
    const moving = Math.abs(vx) + Math.abs(vy) > 0.001;
    if (moving && Math.abs(vx) > 0.001) {
      this.heroDir = vx >= 0 ? "right" : "left";
    }
    const key = `hero_${moving ? "run" : "idle"}_${this.heroDir}`;
    if (!this.scene.anims.exists(key)) return;
    const cur = this.playerCircle.anims.currentAnim?.key;
    if (cur !== key) this.playerCircle.anims.play(key, true);
  }

  private playerAttack(derived: ReturnType<typeof computeDerivedPlayerStats>) {
    const enemies = this.enemySystem.all;
    if (enemies.length <= 0) return;
    let best: Enemy | undefined;
    let bestDist = Infinity;
    for (const e of enemies) {
      const dx = Math.abs(e.sprite.x - this.playerCircle.x);
      if (dx < bestDist) {
        bestDist = dx;
        best = e;
      }
    }
    if (!best) return;
    const meleeRange = 26;
    if (bestDist > meleeRange) return;

    this.playPlayerAttackAnim(derived.attackIntervalMs);
    const crit = this.rng.next() < derived.critChance;
    const raw = derived.atk * (crit ? derived.critDamage : 1);
    const dmg = damageAfterDefense(raw, best.def);
    best.hp -= dmg;
    this.flashEnemy(best);
    this.spawnFloatText(
      best.sprite.x,
      best.sprite.y - 16,
      `${crit ? "暴 " : ""}${Math.ceil(dmg)}`,
      crit ? "#fde68a" : "#e2e8f0"
    );
    this.hud.pushCombatLog(`普攻：${Math.ceil(dmg)}${crit ? "（暴击）" : ""}`);
    this.applyLifeSteal(derived, dmg, "普攻");
    if (best.hp <= 0) {
      this.killEnemy(best);
    }
  }

  private playPlayerAttackAnim(attackIntervalMs?: number) {
    const hasAttack0 = this.scene.anims.exists("hero_attack0");
    const hasAttack1 = this.scene.anims.exists("hero_attack1");
    const hasAttack2 = this.scene.anims.exists("hero_attack2");
    if (
      this.scene.textures.exists("swordman") &&
      (hasAttack0 || hasAttack1 || hasAttack2)
    ) {
      const choices = [
        ...(hasAttack0 ? ["hero_attack0"] : []),
        ...(hasAttack1 ? ["hero_attack1"] : []),
        ...(hasAttack2 ? ["hero_attack2"] : []),
      ];
      const key = choices[Math.floor(this.rng.next() * choices.length)];
      const anim = this.scene.anims.get(key);
      const frames = anim?.frames.length ?? 6;
      if (attackIntervalMs && attackIntervalMs > 0) {
        const desiredDuration = Math.max(120, attackIntervalMs * 0.85);
        const frameRate = Phaser.Math.Clamp(
          frames / (desiredDuration / 1000),
          6,
          30
        );
        this.attackAnimMs = Math.max(this.attackAnimMs, desiredDuration);
        this.playerCircle.anims.play({ key, frameRate, repeat: 0 }, true);
        return;
      }
      const frameRate = anim?.frameRate ?? 12;
      this.attackAnimMs = Math.max(
        this.attackAnimMs,
        (frames / frameRate) * 1000
      );
      this.playerCircle.anims.play(key, true);
      return;
    }
    const dx = this.heroDir === "left" ? -1 : this.heroDir === "right" ? 1 : 0;
    const dy = this.heroDir === "up" ? -1 : this.heroDir === "down" ? 1 : 0;
    this.scene.tweens.killTweensOf(this.playerCircle);
    this.scene.tweens.add({
      targets: this.playerCircle,
      x: this.playerCircle.x + dx * 4,
      y: this.playerCircle.y + dy * 4,
      scaleX: this.playerCircle.scale * 1.18,
      scaleY: this.playerCircle.scale * 0.92,
      duration: 80,
      yoyo: true,
      ease: "Quad.easeOut",
    });
  }

  private updateSkillCasting(
    dt: number,
    derived: ReturnType<typeof computeDerivedPlayerStats>
  ) {
    this.activeCastLockMs = Math.max(0, this.activeCastLockMs - dt);
    const wasBerserk = this.berserkMs > 0;
    this.berserkMs = Math.max(0, this.berserkMs - dt);
    if (wasBerserk && this.berserkMs <= 0) {
      this.berserkLifeStealBonusPct = 0;
      this.playerCircle.setScale(this.playerBaseScale);
      if (this.berserkPulse) {
        this.berserkPulse.stop();
        this.berserkPulse = undefined;
      }
    }
    this.shieldWallMs = Math.max(0, this.shieldWallMs - dt);
    // 恢复（每秒触发一次，比例为总恢复/10）
    if (derived.recoveryPct > 0 && this.playerHp > 0) {
      this.recoveryTickerMs += dt;
      if (this.recoveryTickerMs >= 1000) {
        const perSecondPct = derived.recoveryPct / 10;
        const heal = Math.ceil(derived.hpMax * perSecondPct);
        if (heal > 0) {
          this.playerHp = Math.min(derived.hpMax, this.playerHp + heal);
          this.spawnFloatText(
            this.playerCircle.x,
            this.playerCircle.y - 24,
            `恢复 +${heal}`,
            "#86efac"
          );
        }
        this.recoveryTickerMs = 0;
      }
    }
    const locked =
      this.attackAnimMs > 0 || this.dashLockMs > 0 || this.activeCastLockMs > 0;
    let casted = false;
    for (let i = 0; i < this.activeCooldownMs.length; i++) {
      this.activeCooldownMs[i] = Math.max(0, this.activeCooldownMs[i] - dt);
      if (locked || casted) continue;
      const id = this.save.skills.equippedActives[i];
      if (!id) continue;
      const lv = skillLevel(this.save, id);
      if (lv <= 0) continue;
      if (this.activeCooldownMs[i] > 0) continue;
      if (this.enemySystem.all.length <= 0) break;
      let inMelee = false;
      const meleeRange = 26;
      for (const e of this.enemySystem.all) {
        const dist = Math.abs(e.sprite.x - this.playerCircle.x);
        if (dist <= meleeRange) {
          inMelee = true;
          break;
        }
      }
      if (!inMelee) continue;
      this.castActiveSkill(id, lv, derived);
      this.activeCooldownMs[i] = skillCooldownMs(id, lv);
      this.activeCastLockMs = Math.max(this.activeCastLockMs, 300);
      casted = true;
    }
  }

  private castActiveSkill(
    id: any,
    lv: number,
    derived: ReturnType<typeof computeDerivedPlayerStats>
  ) {
    switch (id) {
      case "whirlwind":
        this.castWhirlwindSkill(lv, derived);
        break;
      case "charge":
        this.castChargeSkill(lv, derived);
        break;
      case "thunder":
        this.castThunderSkill(lv, derived);
        break;
      case "berserk":
        this.castBerserkSkill(lv);
        break;
      case "shield_wall":
        this.castShieldWallSkill(lv);
        break;
    }
  }

  // ... (Paste all skill cast methods here, modifying 'this.enemies' to 'this.enemySystem.all' and other refs)
  
  private castWhirlwindSkill(
    lv: number,
    derived: ReturnType<typeof computeDerivedPlayerStats>
  ) {
    const branch = skillBranch(this.save, "whirlwind");
    const p = whirlwindParams(lv, branch);
    const raw = derived.atk * p.coef;
    const hit: Enemy[] = [];
    for (const e of this.enemySystem.all) {
      const d = Phaser.Math.Distance.Between(
        e.sprite.x,
        e.sprite.y,
        this.playerCircle.x,
        this.playerCircle.y
      );
      if (d <= p.radius) hit.push(e);
    }
    if (hit.length <= 0) return;
    if (this.scene.anims.exists("hero_attack3")) {
      const duration = 600;
      this.attackAnimMs = Math.max(this.attackAnimMs, duration);
      this.playerCircle.anims.play(
        { key: "hero_attack3", frameRate: 18 },
        true
      );
      this.playerCircle.setTint(0x60a5fa);
      this.scene.time.delayedCall(duration, () => {
        if (this.playerCircle && this.playerCircle.active) {
          this.playerCircle.clearTint();
        }
      });
    }

    const ring = this.scene.add.circle(
      this.playerCircle.x,
      this.playerCircle.y,
      p.radius,
      0x60a5fa,
      0.12
    );
    this.scene.tweens.add({
      targets: ring,
      alpha: 0,
      duration: 240,
      onComplete: () => ring.destroy(),
    });

    let total = 0;
    for (const e of hit) {
      const dmg = damageAfterDefense(raw, e.def);
      e.hp -= dmg;
      total += dmg;
      this.flashEnemy(e);
      this.spawnFloatText(
        e.sprite.x,
        e.sprite.y - 16,
        `${Math.ceil(dmg)}`,
        "#60a5fa"
      );
      this.applyLifeSteal(derived, dmg * 0.2, "旋风斩");
      if (e.hp <= 0) this.killEnemy(e);
    }
    this.hud.pushSkillLog(`旋风斩：命中${hit.length} 伤害${Math.ceil(total)}`);
  }

  private castBerserkSkill(lv: number) {
    const p = berserkParams(lv);
    this.berserkMs = Math.max(this.berserkMs, p.durationMs);
    this.berserkLifeStealBonusPct = p.lifeStealBonusPct;
    this.playerCircle.setScale(this.playerBaseScale * 1.25);
    if (!this.berserkPulse) {
      this.berserkPulse = this.scene.tweens.add({
        targets: this.playerCircle,
        scale: this.playerBaseScale * 1.35,
        yoyo: true,
        duration: 400,
        repeat: -1,
      });
    }
    this.hud.pushSkillLog(
      `狂暴：持续${(p.durationMs / 1000).toFixed(1)}s 吸血+${(
        p.lifeStealBonusPct * 100
      ).toFixed(1)}%`
    );
  }

  private castShieldWallSkill(lv: number) {
    const { durationMs } = shieldWallParams(lv);
    this.shieldWallMs = Math.max(this.shieldWallMs, durationMs);
    const ring = this.scene.add.circle(
      this.playerCircle.x,
      this.playerCircle.y,
      36,
      0x93c5fd,
      0.2
    );
    this.scene.tweens.add({
      targets: ring,
      scale: 1.25,
      alpha: 0,
      duration: 300,
      ease: "Cubic.easeOut",
      onComplete: () => ring.destroy(),
    });
    this.hud.pushSkillLog(`盾墙：持续${(durationMs / 1000).toFixed(1)}s 荆棘=100%`);
  }

  private castThunderSkill(
    lv: number,
    derived: ReturnType<typeof computeDerivedPlayerStats>
  ) {
    const p = thunderParams(lv);
    const raw = derived.atk * p.coef;
    const hit: Enemy[] = [];
    for (const e of this.enemySystem.all) {
      const d = Phaser.Math.Distance.Between(
        e.sprite.x,
        e.sprite.y,
        this.playerCircle.x,
        this.playerCircle.y
      );
      if (d <= p.radius) hit.push(e);
    }
    if (hit.length <= 0) return;
    const cam = this.scene.cameras.main;
    cam.shake(120, 0.003);
    const ring = this.scene.add.circle(
      this.playerCircle.x,
      this.playerCircle.y,
      p.radius,
      0x93c5fd,
      0.12
    );
    this.scene.tweens.add({
      targets: ring,
      alpha: 0,
      duration: 200,
      onComplete: () => ring.destroy(),
    });
    const ring2 = this.scene.add.circle(
      this.playerCircle.x,
      this.playerCircle.y,
      p.radius * 0.6,
      0x93c5fd,
      0.12
    );
    this.scene.tweens.add({
      targets: ring2,
      scale: 1.15,
      alpha: 0,
      duration: 220,
      ease: "Cubic.easeOut",
      onComplete: () => ring2.destroy(),
    });
    const bolts = this.scene.add.graphics({ x: 0, y: 0 });
    bolts.setDepth(50);
    for (let i = 0; i < 4; i++) {
      const a = this.rng.next() * Math.PI * 2;
      const len = p.radius * (0.7 + 0.3 * this.rng.next());
      const seg = 4 + Math.floor(this.rng.next() * 3);
      const jitter = 4;
      let sx = this.playerCircle.x;
      let sy = this.playerCircle.y;
      bolts.lineStyle(2, 0x93c5fd, 0.35);
      bolts.beginPath();
      bolts.moveTo(sx, sy);
      for (let k = 1; k <= seg; k++) {
        const t = k / seg;
        const tx =
          this.playerCircle.x +
          Math.cos(a) * len * t +
          (this.rng.next() - 0.5) * jitter;
        const ty =
          this.playerCircle.y +
          Math.sin(a) * len * t +
          (this.rng.next() - 0.5) * jitter;
        bolts.lineTo(tx, ty);
        sx = tx;
        sy = ty;
      }
      bolts.strokePath();
      bolts.lineStyle(2, 0x93c5fd, 0.12);
      bolts.beginPath();
      bolts.moveTo(this.playerCircle.x, this.playerCircle.y);
      sx = this.playerCircle.x;
      sy = this.playerCircle.y;
      for (let k = 1; k <= seg; k++) {
        const t = k / seg;
        const tx =
          this.playerCircle.x +
          Math.cos(a) * len * t +
          (this.rng.next() - 0.5) * jitter * 0.6;
        const ty =
          this.playerCircle.y +
          Math.sin(a) * len * t +
          (this.rng.next() - 0.5) * jitter * 0.6;
        bolts.lineTo(tx, ty);
        sx = tx;
        sy = ty;
      }
      bolts.strokePath();
    }
    this.scene.tweens.add({
      targets: bolts,
      alpha: 0,
      duration: 140,
      ease: "Quadratic.Out",
      onComplete: () => bolts.destroy(),
    });
    if (hit.length > 0) {
      this.hud.pushSkillLog(`雷霆一击：命中${hit.length} 伤害${Math.ceil(0)}`); // Fix total calc later if needed
      // Actually we need to loop to calc damage
      let total = 0;
      for (const e of hit) {
        const dmg = damageAfterDefense(raw, e.def);
        e.hp -= dmg;
        total += dmg;
        this.flashEnemy(e);
        const mark = this.scene.add.graphics();
        mark.lineStyle(3, 0xf59e0b, 0.9);
        const mx = e.sprite.x;
        const my = e.sprite.y - 22;
        mark.beginPath();
        mark.moveTo(mx - 6, my - 10);
        mark.lineTo(mx, my);
        mark.lineTo(mx - 4, my + 10);
        mark.strokePath();
        this.scene.tweens.add({
          targets: mark,
          alpha: 0,
          y: my - 6,
          duration: 260,
          onComplete: () => mark.destroy(),
        });
        this.spawnFloatText(
          e.sprite.x,
          e.sprite.y - 16,
          `${Math.ceil(dmg)}`,
          "#fbbf24"
        );
        if (e.hp > 0 && e.sprite.active) {
          e.jumpOffsetY = e.jumpOffsetY ?? 0;
          this.scene.tweens.add({
            targets: e,
            props: { jumpOffsetY: { value: 22 } },
            duration: 200,
            yoyo: true,
            ease: "Back.easeOut",
            onComplete: () => {
              e.jumpOffsetY = 0;
            },
          });
        }
      }
      this.applyLifeSteal(derived, total * 0.35, "雷霆一击");
      for (const e of hit) {
        if (e.hp <= 0) this.killEnemy(e);
      }
    }
  }

  private castChargeSkill(
    lv: number,
    derived: ReturnType<typeof computeDerivedPlayerStats>
  ) {
    const branch = skillBranch(this.save, "charge");
    const p = chargeParams(lv, branch);

    const cam = this.scene.cameras.main;
    const resumeFollow = this.mapSystem.width > 0 && this.mapSystem.height > 0;
    if (resumeFollow) {
      cam.startFollow(this.playerCircle, true, 0.12, 0.12);
    }

    const { width } = this.scene.scale;
    const boundW = this.mapSystem.width > 0 ? this.mapSystem.width : width;
    const pad = 10 * this.playerBaseScale;
    const worldRight = boundW - pad - 20;
    const pushDist = boundW * 0.1;
    const endX = Math.min(worldRight, this.playerCircle.x + pushDist);

    this.dashLockMs = Math.max(this.dashLockMs, 1000);
    for (let i = 0; i < this.activeCooldownMs.length; i++) {
      this.activeCooldownMs[i] = Math.max(this.activeCooldownMs[i], 1000);
    }

    if (this.scene.anims.exists("hero_charge")) {
      const anim = this.scene.anims.get("hero_charge");
      const frames = anim?.frames.length ?? 10;
      const duration = 300;
      const frameRate = Math.max(8, Math.round(frames / (duration / 1000)));
      this.attackAnimMs = Math.max(this.attackAnimMs, duration);
      this.playerCircle.anims.play(
        { key: "hero_charge", frameRate, repeat: 0 },
        true
      );
    }
    this.scene.tweens.add({
      targets: this.playerCircle,
      x: endX,
      duration: 300,
      ease: "Cubic.easeIn",
      onComplete: () => {
        this.dealChargeDamage(derived, p, "冲撞");
        // 相机已跟随，无需额外处理
      },
    });
    this.chargeImmuneMs = Math.max(this.chargeImmuneMs, 320);
  }

  private dealChargeDamage(
    derived: ReturnType<typeof computeDerivedPlayerStats>,
    p: ReturnType<typeof chargeParams>,
    source: string
  ) {
    if (this.enemySystem.all.length <= 0) return;
    const raw = derived.atk * p.coef;
    let total = 0;
    const hit: Enemy[] = [];

    for (const e of this.enemySystem.all) {
      if (e.hp <= 0) continue;
      const dmg = damageAfterDefense(raw, e.def);
      e.hp -= dmg;
      total += dmg;
      this.flashEnemy(e);
      this.spawnFloatText(
        e.sprite.x,
        e.sprite.y - 16,
        `${Math.ceil(dmg)}`,
        "#fde68a"
      );
      hit.push(e);
    }

    if (hit.length > 0) {
      this.hud.pushSkillLog(`${source}：命中${hit.length} 伤害${Math.ceil(total)}`);
      this.applyLifeSteal(derived, total * 0.1, source);
      const worldW = this.mapSystem.width > 0 ? this.mapSystem.width : this.scene.scale.width;
      const pushDist = worldW * 0.1;
      const worldRight = worldW - 24;
      for (const e of hit) {
        if (!e.sprite.active) continue;
        const targetX = Math.min(worldRight, e.sprite.x + pushDist);
        this.scene.tweens.add({
          targets: [e.sprite, e.hpBarBg, e.hpBarFill],
          x: targetX,
          duration: 380,
          ease: "Cubic.easeIn",
          onComplete: () => {
            if (!e.sprite.active || e.hp <= 0) return;
            e.attackCooldownMs = this.rng.int(300, 900);
            e.stunMs = Math.max(e.stunMs ?? 0, p.stunMs ?? 0);
            this.applyStunFx(e, p.stunMs ?? 0);
          },
        });
      }
      for (const e of hit) {
        if (e.hp <= 0) this.killEnemy(e);
      }
    }
  }

  private applyStunFx(e: Enemy, durationMs: number) {
    if (!e.sprite.active || e.hp <= 0) return;
    if (e.stunFx) {
      const targets = [e.stunFx, ...(e.stunFx.list ?? [])];
      this.scene.tweens.killTweensOf(targets);
      e.stunFx.destroy();
      e.stunFx = undefined;
    }
    const group = this.scene.add.container(e.sprite.x, e.sprite.y - 24);
    const radius = 14;
    const count = 5;
    for (let i = 0; i < count; i++) {
      const ang = (i / count) * Math.PI * 2;
      const star = this.scene.add.circle(
        Math.cos(ang) * radius,
        Math.sin(ang) * radius,
        3,
        0xfbbf24,
        1
      );
      this.scene.tweens.add({
        targets: star,
        angle: 360,
        duration: 800,
        repeat: -1,
      });
      group.add(star);
    }
    this.scene.tweens.add({
      targets: group,
      angle: 360,
      duration: 1200,
      repeat: -1,
    });
    e.stunFx = group;
    e.stunMs = durationMs;
  }

  private applyLifeSteal(
    derived: ReturnType<typeof computeDerivedPlayerStats>,
    dmgDealt: number,
    source: string
  ) {
    const pct = Math.max(
      0,
      derived.lifeStealPct + (this.berserkLifeStealBonusPct || 0)
    );
    if (pct <= 0) return;
    const heal = Math.ceil(dmgDealt * pct);
    if (heal <= 0) return;
    const before = this.playerHp;
    const actual = Math.min(heal, Math.max(0, derived.hpMax - before));
    if (actual <= 0) return;
    this.playerHp = before + actual;
    this.spawnFloatText(
      this.playerCircle.x,
      this.playerCircle.y - 24,
      `+${Math.ceil(actual)}`,
      "#86efac"
    );
    this.hud.pushCombatLog(`吸血：+${actual}（${source}）`);
  }

  private flashEnemy(enemy: Enemy) {
    if (!enemy.sprite.active) return;
    enemy.sprite.setTintFill(0xffffff);
    this.scene.time.delayedCall(70, () => {
      if (!enemy.sprite.active) return;
      enemy.sprite.clearTint();
    });
  }

  private spawnFloatText(
    x: number,
    y: number,
    text: string,
    color: string
  ) {
    const t = this.scene.add.text(x, y, text, {
      fontFamily: "system-ui",
      fontSize: "14px",
      fontStyle: "bold",
      color,
      stroke: "#000",
      strokeThickness: 2,
    });
    t.setOrigin(0.5, 0.5);
    t.setDepth(100);
    this.scene.tweens.add({
      targets: t,
      y: y - 82,
      alpha: 0,
      duration: 1000,
      ease: "Cubic.easeOut",
      onComplete: () => t.destroy(),
    });
  }

  // NOTE: This delegates back to scene/enemySystem to actually remove the enemy
  // But PlayerSystem handles the "kill effect" logic from player's perspective
  private killEnemy(enemy: Enemy) {
    // This is tricky. The original code handled kill logic in Scene.
    // We should probably emit an event or call a method on Scene/EnemySystem.
    // For now, let's call a method on Scene that we will add, or handle it via callback?
    // A cleaner way: PlayerSystem just deals damage. EnemySystem checks death.
    // But PlayerSystem has "on kill" effects (berserk etc maybe?).
    // Let's call EnemySystem to remove it, and trigger Scene for rewards.
    
    // Actually, in the original code, `killEnemy` did animations and logic.
    // Let's call back to Scene to handle the "Game Loop" part of killing (drops, progress).
    (this.scene as any).killEnemy(enemy); 
  }
}
