import Phaser from "phaser";
import type { Enemy } from "../model/Enemy";
import type { PlayerSave } from "../model/types";
import { PlayerSystem } from "./PlayerSystem";
import { EnemySystem } from "./EnemySystem";
import { BattleHUD } from "../ui/BattleHUD";
import { createRng } from "../logic/rng";
import { damageAfterDefense } from "../logic/balance";
import { rollKillDrop } from "../logic/drops";
import { applyExp } from "../logic/progression";

export type CombatResult = "victory" | "defeat" | null;

export class CombatSystem {
  private scene: Phaser.Scene;
  private playerSystem: PlayerSystem;
  private enemySystem: EnemySystem;
  private hud: BattleHUD;
  private save: PlayerSave;
  private rng = createRng(Date.now());

  constructor(
    scene: Phaser.Scene,
    playerSystem: PlayerSystem,
    enemySystem: EnemySystem,
    hud: BattleHUD,
    save: PlayerSave
  ) {
    this.scene = scene;
    this.playerSystem = playerSystem;
    this.enemySystem = enemySystem;
    this.hud = hud;
    this.save = save;
  }

  public update(_dt: number, isDefeated: boolean): CombatResult {
    if (isDefeated) return null;
    
    // Check victory condition
    if (this.enemySystem.killCount >= this.enemySystem.requiredKills) {
      return "victory";
    }

    // Check player death from system updates (e.g. from damage taken elsewhere)
    if (this.playerSystem.hp <= 0) {
      this.playerSystem.hp = 0;
      return "defeat";
    }

    const enemies = this.enemySystem.all;
    const playerDerived = this.playerSystem.getDerived();
    const playerPos = { x: this.playerSystem.x, y: this.playerSystem.y };

    for (const e of enemies) {
      if ((e.jumpOffsetY ?? 0) > 0) continue;
      const dist = Math.abs(e.sprite.x - playerPos.x);
      if (dist > 26) continue;
      if (e.attackCooldownMs > 0) continue;
      
      const earlyCdBoost =
        this.save.stage <= 5 ? 400 - (this.save.stage - 1) * 60 : 0;
      e.attackCooldownMs = 820 + Math.max(0, earlyCdBoost);
      
      let dmg: number;
      if (e.kind === "pusher" || e.kind === "pusher_elite") {
        dmg = Math.ceil(e.atk * 1.5);
      } else {
        const raw = e.atk;
        dmg = damageAfterDefense(raw, playerDerived.def);
      }
      
      let blocked = false;
      const effectiveThorns = this.playerSystem.isShieldWall ? 1 : playerDerived.thornsPct;
      if (effectiveThorns > 0 && this.rng.next() < effectiveThorns) {
        dmg = Math.ceil(dmg * 0.5);
        blocked = true;
        const shield = this.scene.add.circle(
          playerPos.x,
          playerPos.y,
          26,
          0x93c5fd,
          0.18
        );
        this.scene.tweens.add({
          targets: shield,
          scale: 1.25,
          alpha: 0,
          duration: 220,
          ease: "Cubic.easeOut",
          onComplete: () => shield.destroy(),
        });
        if (e.hp > 0) {
          const reflect = Math.ceil(e.atk);
          e.hp -= reflect;
          this.enemySystem.flashEnemy(e);
          this.hud.spawnFloatText(
            e.sprite.x,
            e.sprite.y - 18,
            `↩${reflect}`,
            "#fbbf24"
          );
          if (e.hp <= 0) {
             const result = this.handleEnemyDeath(e);
             if (result) return result;
          }
        }
      }
      
      this.playerSystem.takeDamage(dmg);
      this.hud.pushDefenseLog(
        `受伤：${Math.ceil(dmg)}${blocked ? "（格挡）" : ""}`
      );
      
      if (e.kind === "pusher" || e.kind === "pusher_elite") {
        if (!this.playerSystem.chargeImmune) {
          this.playerSystem.playKnockback(160);
          
          const basePush = 14;
          const push = e.kind === "pusher_elite" ? basePush * 3 : basePush;
          // Ideally we should get map bounds from MapSystem, but PlayerSystem handles constraints.
          // However, here we calculate nx for trail effect. 
          // Let's assume playerSystem handles position clamping, but we need the visual target for trail.
          // The original code used heroStartX as left bound.
          // We can ask PlayerSystem for bounds or just rely on its update.
          // For the trail, we just need to know roughly where it pushes.
          
          // Let's just spawn the trail effect here.
          const trail = this.scene.add.rectangle(
            e.sprite.x,
            e.sprite.y,
            e.kind === "pusher_elite" ? 28 : 20,
            4,
            0xf59e0b,
            0.6
          );
          trail.setOrigin(0.5, 0.5);
          this.scene.tweens.add({
            targets: trail,
            x: trail.x - (e.kind === "pusher_elite" ? 80 : 40),
            alpha: 0,
            duration: e.kind === "pusher_elite" ? 380 : 220,
            onComplete: () => trail.destroy(),
          });
          
          // Apply push to player (PlayerSystem should handle the velocity/position change if we want)
          // But original code set position directly.
          // PlayerSystem doesn't expose setPosition directly but has setters.
          // Let's assume we can push player by modifying x directly if needed, or add a method.
          // PlayerSystem.takeKnockback(pushDistance) would be better.
          // For now, let's access playerCircle directly if needed or use a new method.
          // Actually, PlayerSystem has updateMovement which uses speed.
          // The original code did: this.playerCircle.setPosition(nx, this.laneY);
          
          // Let's add a push method to PlayerSystem? Or just access the sprite.
          this.playerSystem.playerCircle.x = Math.max(20, this.playerSystem.playerCircle.x - push); 
          
          this.playerSystem.setDashLock(240);
        }
      }
      
      this.hud.spawnFloatText(
        this.playerSystem.x,
        this.playerSystem.y - 18,
        `-${Math.ceil(dmg)}`,
        blocked ? "#93c5fd" : "#fca5a5"
      );
      
      if (this.enemySystem.killCount >= this.enemySystem.requiredKills) {
        return "victory";
      }
      if (this.playerSystem.hp <= 0) {
        this.playerSystem.hp = 0;
        return "defeat";
      }
    }
    
    return null;
  }

  public handleEnemyDeath(enemy: Enemy): CombatResult {
    this.scene.tweens.killTweensOf([enemy.sprite, enemy.hpBarBg, enemy.hpBarFill]);
    if (enemy.stunFx) {
      const targets = [enemy.stunFx, ...(enemy.stunFx.list ?? [])];
      this.scene.tweens.killTweensOf(targets);
      enemy.stunFx.destroy();
      enemy.stunFx = undefined;
    }
    const ex = enemy.sprite.x;
    const ey = enemy.sprite.y;
    enemy.hpBarBg.setDepth(25);
    enemy.hpBarFill.setDepth(26);
    
    // 分裂怪死亡爆裂：对玩家造成固定伤害的1.5倍
    if (enemy.kind === "splitter" || enemy.kind === "splitter_small") {
      const base = enemy.atk;
      const boom = Math.ceil(base * 1.5);
      this.playerSystem.takeDamage(boom);
      const flame = this.scene.add.circle(ex, ey, 18, 0xf97316, 0.24);
      this.scene.tweens.add({
        targets: flame,
        scale: 1.8,
        alpha: 0,
        duration: 260,
        ease: "Cubic.easeOut",
        onComplete: () => flame.destroy(),
      });
      this.hud.spawnFloatText(
        this.playerSystem.x,
        this.playerSystem.y - 22,
        `爆裂 -${boom}`,
        "#fb7185"
      );
      this.hud.pushDefenseLog(`爆裂伤害：${boom}`);
      
      if (this.playerSystem.hp <= 0) {
        return "defeat";
      }
    }
    
    this.scene.tweens.add({
      targets: [enemy.sprite, enemy.hpBarBg, enemy.hpBarFill],
      alpha: 0,
      scaleX: 0.2,
      scaleY: 0.2,
      duration: 180,
      ease: "Cubic.easeIn",
      onComplete: () => {
        enemy.sprite.destroy();
        enemy.hpBarBg.destroy();
        enemy.hpBarFill.destroy();
      },
    });
    
    this.enemySystem.removeEnemy(enemy);
    this.enemySystem.incrementKills();
    
    // We need to update stage modifiers in BattleScene? 
    // Or maybe we can just pass them in update? 
    // Actually BattleScene holds stageAtkSpeedMult/stageCritBonus.
    // We should probably return these changes or handle them here if possible.
    // Ideally CombatSystem shouldn't manage stage modifiers state if it's transient.
    // But for now, let's emit an event or return something?
    // Or just let BattleScene handle it?
    // The original code modified `this.stageAtkSpeedMult` etc.
    // Let's expose a callback or method to notify kill?
    // Or we can move those modifiers into CombatSystem?
    // Let's assume CombatSystem manages them for now, but they need to be reset on stage start.
    
    // Actually, let's invoke a callback on Scene? Or just return "killed" status?
    // Simpler: CombatSystem triggers a callback passed in constructor?
    // Or just expose `onEnemyKilled` public method that Scene calls? No, Scene calls `killEnemy` (now `handleEnemyDeath`).
    
    // Let's add a callback for "onKill" to update scene state if needed.
    // For now, let's emit an event on the scene?
    this.scene.events.emit("enemy-killed", enemy);

    if (enemy.kind === "splitter") {
      const childHp = Math.max(1, enemy.hpMax * 0.45);
      const childAtk = enemy.atk * 0.7;
      const childDef = enemy.def * 0.7;
      const childSpeed = enemy.speed + 15;
      const childScale = 0.7;
      const childBarW = 20;
      const childOffsetY = 14;
      const left = this.enemySystem.createEnemy({
        x: ex - 10,
        y: ey,
        kind: "splitter_small",
        hpMax: childHp,
        atk: childAtk,
        def: childDef,
        speed: childSpeed,
        scale: childScale,
        tint: 0x22c55e,
        barW: childBarW,
        barColor: 0x22c55e,
        barOffsetY: childOffsetY,
        attackCooldownMs: this.rng.int(80, 420),
      });
      const right = this.enemySystem.createEnemy({
        x: ex + 10,
        y: ey,
        kind: "splitter_small",
        hpMax: childHp,
        atk: childAtk,
        def: childDef,
        speed: childSpeed,
        scale: childScale,
        tint: 0x22c55e,
        barW: childBarW,
        barColor: 0x22c55e,
        barOffsetY: childOffsetY,
        attackCooldownMs: this.rng.int(80, 420),
      });
      this.enemySystem.addEnemy(left);
      this.enemySystem.addEnemy(right);
    }

    const drop = rollKillDrop(this.rng, this.save.stage, this.save.stageRepeat);
    this.save.gold += drop.gold;
    const res = applyExp(this.save.level, this.save.exp, drop.exp);
    this.save.level = res.level;
    this.save.exp = res.exp;
    
    let dropText = `金币 +${drop.gold}，EXP +${drop.exp}`;
    if (res.leveledUp > 0) {
      this.save.skills.points += res.leveledUp;
      const msg = `升级：技能点 +${res.leveledUp}`;
      dropText = dropText ? `${dropText}；${msg}` : msg;
    }
    
    // We need to update lastDropText in BattleScene or HUD?
    // HUD doesn't seem to display lastDropText (it's for UI top?).
    // Actually BattleHUD.setTopText?
    // Let's use HUD to show it.
    this.hud.setTopText(dropText);

    if (this.enemySystem.killCount >= this.enemySystem.requiredKills) {
      return "victory";
    }
    
    return null;
  }
}
