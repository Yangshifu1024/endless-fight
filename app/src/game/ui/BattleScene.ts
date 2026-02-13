import Phaser from "phaser";
import {
  damageAfterDefense,
  enemyAtkAtStage,
  enemyDefAtStage,
  enemyHpAtStage,
} from "../logic/balance";
import { rollKillDrop } from "../logic/drops";
import {
  computeDerivedPlayerStats,
  calcSingleGold,
  calcPeakGold,
} from "../logic/playerStats";
import { applyExp, requiredExpForNextLevel } from "../logic/progression";
import { createRng } from "../logic/rng";
import type { ActiveSkillId, PlayerSave, SkillId } from "../model/types";
import {
  allSkills,
  canLearnOrUpgrade,
  getSkillDef,
  skillBranch,
  skillLevel,
} from "../skills/skills";
import {
  chargeParams,
  skillCooldownMs,
  skillPreviewLines,
  whirlwindParams,
  thunderParams,
  berserkParams,
  shieldWallParams,
} from "../skills/effects";
import { loadSave, persistSave, resetSave } from "../storage/save";

type Enemy = {
  id: string;
  sprite: Phaser.GameObjects.Sprite;
  hp: number;
  hpMax: number;
  atk: number;
  def: number;
  isElite: boolean;
  kind:
    | "normal"
    | "elite"
    | "splitter"
    | "splitter_small"
    | "pusher"
    | "pusher_elite";
  speed: number;
  attackCooldownMs: number;
  hpBarBg: Phaser.GameObjects.Rectangle;
  hpBarFill: Phaser.GameObjects.Rectangle;
  hpBarW: number;
  hpBarOffsetY: number;
  jumpOffsetY?: number;
  expelled?: boolean;
  expelledMs?: number;
  stunMs?: number;
  stunFx?: Phaser.GameObjects.Container;
};

export class BattleScene extends Phaser.Scene {
  private save!: PlayerSave;
  private rng = createRng(Date.now());

  private playerCircle!: Phaser.GameObjects.Sprite;
  private playerHp = 1;
  private playerBaseScale = 2;
  private playerHpBarBg!: Phaser.GameObjects.Rectangle;
  private playerHpBarFill!: Phaser.GameObjects.Rectangle;
  private playerAttackCdMs = 0;
  private activeCooldownMs = [0, 0, 0, 0, 0];
  private playerAnimT = 0;
  private attackAnimMs = 0;
  private heroDir: "down" | "up" | "left" | "right" = "down";
  private mapW = 0;
  private mapH = 0;
  private laneY = 0;
  private heroStartX = 0;

  private enemies: Enemy[] = [];
  private kills = 0;
  private killsNeeded = 0;
  private spawnedCount = 0;
  private spawnCooldownMs = 0;
  private dashLockMs = 0;
  private chargeImmuneMs = 0;

  private uiLeft!: Phaser.GameObjects.Text;
  private uiRight!: Phaser.GameObjects.Text;
  private uiBottom!: Phaser.GameObjects.Text;
  private uiTop!: Phaser.GameObjects.Text;
  private uiBottomFight!: Phaser.GameObjects.Text;
  private uiBottomSkill!: Phaser.GameObjects.Text;
  private uiBottomDefense!: Phaser.GameObjects.Text;
  private layoutBottomLogs() {
    const { width, height } = this.scale;
    const totalW = Math.floor(width * 0.5);
    const gap = 8;
    const colW = Math.max(80, Math.floor((totalW - gap * 2) / 3));
    const x0 = 12;
    const y = height - 12;
    this.uiBottomFight.setPosition(x0, y).setOrigin(0, 1);
    this.uiBottomSkill.setPosition(x0 + colW + gap, y).setOrigin(0, 1);
    this.uiBottomDefense.setPosition(x0 + (colW + gap) * 2, y).setOrigin(0, 1);
    this.uiBottomFight.setStyle({ wordWrap: { width: colW }, align: "left" });
    this.uiBottomSkill.setStyle({ wordWrap: { width: colW }, align: "left" });
    this.uiBottomDefense.setStyle({ wordWrap: { width: colW }, align: "left" });
  }
  private uiButtons: Phaser.GameObjects.Text[] = [];
  private refreshButtons() {
    for (const t of this.uiButtons) t.destroy();
    this.uiButtons = [];
    this.createButtons();
  }
  private overlay: Phaser.GameObjects.Container | undefined;
  private lastDropText = "";
  private combatLog: string[] = [];
  private defenseLog: string[] = [];
  private skillLog: string[] = [];
  private recoveryTickerMs = 0;
  private stageAtkSpeedMult = 1;
  private stageCritBonus = 0;
  private isDefeated = false;
  private activeCastLockMs = 0;

  private keys!: Record<"W" | "A" | "S" | "D", Phaser.Input.Keyboard.Key>;

  constructor() {
    super("BattleScene");
  }

  preload() {
    this.load.spritesheet(
      "swordman",
      "/assets/character/WarriorMan-Sheet.png",
      { frameWidth: 80, frameHeight: 64, margin: 0, spacing: 0 }
    );
    this.load.image("town_tiles", "/assets/map/town/town.png");
    this.load.tilemapTiledJSON("town_map", "/assets/map/town/town.json");
    this.load.image("dungeon1_tiles", "/assets/map/dungeon1/dungeon1.png");
    this.load.image("dungeon1_platform", "/assets/map/dungeon1/platform1.png");
    this.load.tilemapTiledJSON(
      "dungeon1_map",
      "/assets/map/dungeon1/dungeon1.json"
    );
  }

  create() {
    this.save = loadSave();
    this.keys = this.input.keyboard!.addKeys("W,A,S,D") as any;

    const { width, height } = this.scale;
    this.ensureActorTextures();
    const stageMod = this.save.stage % 2;
    if (stageMod === 0) {
      this.createDungeon1Map();
    } else {
      this.createTownMap();
    }
    this.createHeroAnims();
    if (this.textures.exists("swordman")) this.playerBaseScale = 1;
    const pad = 12 * this.playerBaseScale + 20;
    const heroStartX = pad;
    const heroStartY = this.mapH > 0 ? this.mapH * 0.6 : height * 0.6;
    this.heroStartX = heroStartX;
    this.laneY = heroStartY;
    const heroKey = this.textures.exists("swordman") ? "swordman" : "player";
    const heroFrame = heroKey === "swordman" ? 0 : undefined;
    this.playerCircle = this.add.sprite(
      heroStartX,
      heroStartY,
      heroKey,
      heroFrame
    );
    if (this.mapW > 0 && this.mapH > 0) {
      this.cameras.main.startFollow(this.playerCircle, true, 0.12, 0.12);
    }
    this.playerCircle.setDepth(10);
    this.playerCircle.setScale(this.playerBaseScale);
    this.updateHeroAnim(0, 0);
    this.playerHp = this.getDerived().hpMax;
    this.createPlayerHpBar();

    this.uiLeft = this.add.text(12, 10, "", {
      fontFamily: "system-ui",
      fontSize: "14px",
      color: "#e2e8f0",
    });
    this.uiRight = this.add
      .text(width - 12, 10, "", {
        fontFamily: "system-ui",
        fontSize: "14px",
        color: "#e2e8f0",
        align: "right",
      })
      .setOrigin(1, 0);
    this.uiBottom = this.add
      .text(12, height - 12, "", {
        fontFamily: "system-ui",
        fontSize: "14px",
        color: "#94a3b8",
      })
      .setOrigin(0, 1);
    this.pinToScreen(this.uiLeft);
    this.pinToScreen(this.uiRight);
    this.pinToScreen(this.uiBottom);
    this.uiBottomFight = this.add
      .text(12, height - 12, "", {
        fontFamily: "system-ui",
        fontSize: "13px",
        color: "#94a3b8",
        align: "left",
      })
      .setOrigin(0, 1);
    this.uiBottomSkill = this.add
      .text(width * 0.5, height - 12, "", {
        fontFamily: "system-ui",
        fontSize: "13px",
        color: "#94a3b8",
        align: "center",
      })
      .setOrigin(0.5, 1);
    this.uiBottomDefense = this.add
      .text(width - 12, height - 12, "", {
        fontFamily: "system-ui",
        fontSize: "13px",
        color: "#94a3b8",
        align: "right",
      })
      .setOrigin(1, 1);
    this.pinToScreen(this.uiBottomFight);
    this.pinToScreen(this.uiBottomSkill);
    this.pinToScreen(this.uiBottomDefense);
    this.layoutBottomLogs();
    this.uiTop = this.add
      .text(width * 0.5, 6, "", {
        fontFamily: "system-ui",
        fontSize: "13px",
        color: "#ffffff",
        align: "center",
      })
      .setOrigin(0.5, 0);
    this.pinToScreen(this.uiTop);

    this.createButtons();
    this.startStage();
    this.events.on(Phaser.Scenes.Events.SHUTDOWN, () => {
      persistSave(this.save);
    });
  }

  private pinToScreen(go: Phaser.GameObjects.GameObject) {
    const anyGo = go as any;
    if (typeof anyGo.setScrollFactor === "function") anyGo.setScrollFactor(0);
    if (typeof anyGo.setDepth === "function") anyGo.setDepth(2000);
  }

  private pinOverlay() {
    if (!this.overlay) return;
    this.overlay.setDepth(2100);
    for (const child of this.overlay.list) this.pinToScreen(child as any);
  }

  private pushCombatLog(msg: string) {
    this.combatLog.unshift(msg);
    if (this.combatLog.length > 10)
      this.combatLog = this.combatLog.slice(0, 10);
  }
  private pushDefenseLog(msg: string) {
    this.defenseLog.unshift(msg);
    if (this.defenseLog.length > 10)
      this.defenseLog = this.defenseLog.slice(0, 10);
  }
  private pushSkillLog(msg: string) {
    this.skillLog.unshift(msg);
    if (this.skillLog.length > 10) this.skillLog = this.skillLog.slice(0, 10);
  }

  private createTownMap() {
    if (!this.cache.tilemap.exists("town_map")) return;
    if (!this.textures.exists("town_tiles")) return;
    const map = this.make.tilemap({ key: "town_map" });
    const tileset = map.addTilesetImage(
      "Roguelike",
      "town_tiles",
      16,
      16,
      0,
      1
    );
    if (!tileset) return;

    const layerDefs: Array<{ name: string; depth: number }> = [
      { name: "Ground/terrain", depth: 0 },
      { name: "Ground overlay", depth: 1 },
      { name: "Objects", depth: 5 },
      { name: "Doors/windows/roof", depth: 8 },
      { name: "Roof object", depth: 15 },
    ];
    for (const def of layerDefs) {
      const layer = map.createLayer(def.name, tileset, 0, 0);
      if (!layer) continue;
      layer.setDepth(def.depth);
    }

    this.mapW = map.widthInPixels;
    this.mapH = map.heightInPixels;
    if (this.mapW > 0 && this.mapH > 0)
      this.cameras.main.setBounds(0, 0, this.mapW, this.mapH);
  }

  private createDungeon1Map() {
    if (!this.cache.tilemap.exists("dungeon1_map")) return;
    if (!this.textures.exists("dungeon1_tiles")) return;
    const map = this.make.tilemap({ key: "dungeon1_map" });
    const tileset1 = map.addTilesetImage(
      "Roguelike",
      "dungeon1_tiles",
      16,
      16,
      0,
      1
    );
    const tileset2 = map.addTilesetImage(
      "platform1",
      "dungeon1_platform",
      192,
      64,
      0,
      1
    );
    if (!tileset1) return;

    const layerDefs: Array<{ name: string; depth: number }> = [
      { name: "root", depth: 0 },
    ];
    const tilesets = tileset2 ? [tileset1, tileset2] : [tileset1];
    for (const def of layerDefs) {
      const layer = map.createLayer(def.name, tilesets, 0, 0);
      if (!layer) continue;
      layer.setDepth(def.depth);
    }

    this.mapW = map.widthInPixels;
    this.mapH = map.heightInPixels;
    if (this.mapW > 0 && this.mapH > 0)
      this.cameras.main.setBounds(0, 0, this.mapW, this.mapH);
  }

  private createHeroAnims() {
    if (this.textures.exists("swordman")) {
      if (this.anims.exists("hero_idle_down")) return;
      const range = (start: number, count: number) =>
        Array.from({ length: count }, (_, i) => start + i);
      const idle = range(0, 8);
      const run = range(48, 8);
      const attack1 = range(176, 8);
      const attack2 = range(80, 6);
      const attack3 = range(198, 10);
      const tex = this.textures.get("swordman");
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
        this.anims.create({
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
    if (!this.textures.exists("swordman")) return;
    if (this.isDefeated) return;
    if (
      this.attackAnimMs > 0 &&
      (this.anims.exists("hero_attack0") ||
        this.anims.exists("hero_attack1") ||
        this.anims.exists("hero_attack2") ||
        this.anims.exists("hero_attack3") ||
        this.anims.exists("hero_charge"))
    ) {
      return;
    }
    const moving = Math.abs(vx) + Math.abs(vy) > 0.001;
    if (moving && Math.abs(vx) > 0.001) {
      this.heroDir = vx >= 0 ? "right" : "left";
    }
    const key = `hero_${moving ? "run" : "idle"}_${this.heroDir}`;
    if (!this.anims.exists(key)) return;
    const cur = this.playerCircle.anims.currentAnim?.key;
    if (cur !== key) this.playerCircle.anims.play(key, true);
  }

  private ensureActorTextures() {
    if (this.textures.exists("player") && this.textures.exists("enemy_elite"))
      return;

    const make = (
      key: string,
      w: number,
      h: number,
      draw: (g: Phaser.GameObjects.Graphics) => void
    ) => {
      if (this.textures.exists(key)) return;
      const g = this.add.graphics();
      g.clear();
      draw(g);
      g.generateTexture(key, w, h);
      g.destroy();
    };

    make("player", 32, 32, (g) => {
      g.fillStyle(0xe2e8f0, 1);
      g.fillRoundedRect(6, 6, 20, 22, 6);
      g.fillStyle(0x334155, 1);
      g.fillCircle(16, 12, 4);
      g.lineStyle(2, 0x0b1220, 1);
      g.strokeRoundedRect(6, 6, 20, 22, 6);
    });

    make("enemy", 28, 28, (g) => {
      g.fillStyle(0x94a3b8, 1);
      g.fillCircle(14, 14, 11);
      g.fillStyle(0x0b1220, 0.9);
      g.fillCircle(10, 12, 2);
      g.fillCircle(18, 12, 2);
      g.lineStyle(2, 0x0b1220, 1);
      g.strokeCircle(14, 14, 11);
    });

    make("enemy_elite", 34, 34, (g) => {
      g.fillStyle(0xfb7185, 1);
      g.fillCircle(17, 17, 14);
      g.fillStyle(0x0b1220, 0.9);
      g.fillCircle(12, 14, 2.5);
      g.fillCircle(22, 14, 2.5);
      g.lineStyle(2, 0x0b1220, 1);
      g.strokeCircle(17, 17, 14);
      g.lineStyle(2, 0xf59e0b, 1);
      g.strokeCircle(17, 17, 9);
    });
  }

  update(_time: number, deltaMs: number) {
    const dt = Math.min(50, deltaMs);
    this.attackAnimMs = Math.max(0, this.attackAnimMs - dt);
    this.chargeImmuneMs = Math.max(0, this.chargeImmuneMs - dt);
    this.updatePlayer(dt);
    this.updateEnemies(dt);
    this.updateSpawns(dt);
    this.updateCombat(dt);
    this.updateHealthBars();
    this.updateUi();
  }

  private createPlayerHpBar() {
    const barW = 56;
    const barH = 7;
    const y = this.playerCircle.y - 24;
    this.playerHpBarBg = this.add.rectangle(
      this.playerCircle.x,
      y,
      barW,
      barH,
      0x0b1220,
      0.92
    );
    this.playerHpBarBg.setStrokeStyle(1, 0x334155, 1);
    this.playerHpBarFill = this.add
      .rectangle(
        this.playerCircle.x - barW / 2 + 1,
        y,
        barW - 2,
        barH - 2,
        0x22c55e,
        1
      )
      .setOrigin(0, 0.5);
    this.playerHpBarBg.setDepth(30);
    this.playerHpBarFill.setDepth(31);
  }

  private updateHealthBars() {
    this.updatePlayerHpBar();
    for (const e of this.enemies) this.updateEnemyHpBar(e);
  }

  private updatePlayerHpBar() {
    if (!this.playerHpBarBg || !this.playerHpBarFill) return;
    const derived = this.getDerived();
    const pct = Phaser.Math.Clamp(
      derived.hpMax <= 0 ? 0 : this.playerHp / derived.hpMax,
      0,
      1
    );
    const barW = this.playerHpBarBg.width;
    const y = this.playerCircle.y - 24;
    this.playerHpBarBg.setPosition(this.playerCircle.x, y);
    this.playerHpBarFill.setPosition(this.playerCircle.x - barW / 2 + 1, y);
    this.playerHpBarFill.setScale(pct, 1);
    this.playerHpBarFill.setFillStyle(
      pct <= 0.3 ? 0xef4444 : pct <= 0.6 ? 0xf59e0b : 0x22c55e,
      1
    );
  }

  private updateEnemyHpBar(e: Enemy) {
    const pct = Phaser.Math.Clamp(e.hpMax <= 0 ? 0 : e.hp / e.hpMax, 0, 1);
    const barW = e.hpBarW;
    const y = e.sprite.y - e.hpBarOffsetY;
    e.hpBarBg.setPosition(e.sprite.x, y);
    e.hpBarFill.setPosition(e.sprite.x - barW / 2 + 1, y);
    e.hpBarFill.setScale(pct, 1);
  }

  private updatePlayer(dt: number) {
    if (this.overlay) return;
    if (this.isDefeated) return;
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
      const target = this.findNearestEnemy();
      if (target) {
        const dx = target.sprite.x - this.playerCircle.x;
        const desiredDist = 24;
        if (Math.abs(dx) > desiredDist) vx = dx > 0 ? 1 : -1;
      }
    }

    const { width } = this.scale;
    const boundW = this.mapW > 0 ? this.mapW : width;
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

  private updateEnemies(dt: number) {
    if (this.overlay) return;
    if (this.isDefeated) return;

    for (const e of this.enemies) {
      if (e.expelled) {
        // 暂时退出战斗：隐藏血条与单位，计时后回归
        e.expelledMs = Math.max(0, (e.expelledMs ?? 0) - dt);
        if (e.expelledMs <= 0) {
          // 回归战斗：在右侧边缘附近重现，保留原生命值
          const rightEdge =
            this.cameras.main.scrollX + this.cameras.main.width - 30;
          e.sprite.x = rightEdge;
          e.sprite.y = this.laneY;
          e.sprite.setAlpha(1);
          e.hpBarBg.setAlpha(1);
          e.hpBarFill.setAlpha(1);
          e.attackCooldownMs = this.rng.int(300, 800);
          e.expelled = false;
          e.expelledMs = undefined;
          this.updateEnemyHpBar(e);
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
            this.tweens.killTweensOf(targets);
            e.stunFx.destroy();
            e.stunFx = undefined;
          }
        }
        e.sprite.y = this.laneY - (e.jumpOffsetY ?? 0);
        this.updateEnemyHpBar(e);
        continue;
      }
      const step = e.speed * (dt / 1000);
      const dx = this.playerCircle.x - e.sprite.x;
      const stopDist = 24;
      if (dx < -stopDist) {
        e.sprite.x -= step;
      } else if (dx > stopDist) {
        e.sprite.x += step;
      }
      e.sprite.y = this.laneY - (e.jumpOffsetY ?? 0);
      e.attackCooldownMs = Math.max(0, e.attackCooldownMs - dt);
      this.updateEnemyHpBar(e);
    }
  }

  private updateSpawns(dt: number) {
    if (this.overlay) return;
    if (this.isDefeated) return;

    if (this.kills >= this.killsNeeded) return;
    this.spawnCooldownMs = Math.max(0, this.spawnCooldownMs - dt);
    if (this.spawnCooldownMs > 0) return;

    const stage = this.save.stage;
    const living = this.enemies.length;
    const maxLiving = 6 + Math.min(8, Math.floor(stage / 12));
    if (living >= maxLiving) return;
    if (this.spawnedCount >= this.killsNeeded) return;

    this.spawnEnemy();
    this.spawnedCount += 1;
    this.spawnCooldownMs = Math.max(140, 520 - stage * 1.5);
  }

  private updateCombat(dt: number) {
    if (this.overlay) return;
    if (this.isDefeated) return;
    if (this.kills >= this.killsNeeded) {
      this.openStageClearOverlay();
      return;
    }

    const derived = this.getDerived();
    this.playerAttackCdMs = Math.max(0, this.playerAttackCdMs - dt);
    this.updateSkillCasting(dt, derived);
    if (this.kills >= this.killsNeeded) {
      this.openStageClearOverlay();
      return;
    }

    if (this.playerAttackCdMs <= 0) {
      this.playerAttack(derived);
      this.playerAttackCdMs = derived.attackIntervalMs;
    }
    if (this.kills >= this.killsNeeded) {
      this.openStageClearOverlay();
      return;
    }

    for (const e of [...this.enemies]) {
      if ((e.jumpOffsetY ?? 0) > 0) continue;
      const dist = Math.abs(e.sprite.x - this.playerCircle.x);
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
        dmg = damageAfterDefense(raw, derived.def);
      }
      let blocked = false;
      const effectiveThorns = this.shieldWallMs > 0 ? 1 : derived.thornsPct;
      if (effectiveThorns > 0 && this.rng.next() < effectiveThorns) {
        dmg = Math.ceil(dmg * 0.5);
        blocked = true;
        const shield = this.add.circle(
          this.playerCircle.x,
          this.playerCircle.y,
          26,
          0x93c5fd,
          0.18
        );
        this.tweens.add({
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
          this.flashEnemy(e);
          this.spawnFloatText(
            e.sprite.x,
            e.sprite.y - 18,
            `↩${reflect}`,
            "#fbbf24"
          );
          if (e.hp <= 0) this.killEnemy(e);
        }
      }
      this.playerHp -= dmg;
      this.pushDefenseLog(
        `受伤：${Math.ceil(dmg)}${blocked ? "（格挡）" : ""}`
      );
      if (e.kind === "pusher" || e.kind === "pusher_elite") {
        if (this.chargeImmuneMs <= 0) {
          const basePush = 14;
          const push = e.kind === "pusher_elite" ? basePush * 3 : basePush;
          const nx = Math.max(this.heroStartX, this.playerCircle.x - push);
          if (nx !== this.playerCircle.x) {
            this.playerCircle.setPosition(nx, this.laneY);
            if (this.anims.exists("hero_knockback")) {
              const anim = this.anims.get("hero_knockback");
              const frames = anim?.frames.length ?? 4;
              const frameRate = anim?.frameRate ?? 12;
              const duration = Math.max(160, (frames / frameRate) * 1000);
              this.attackAnimMs = Math.max(this.attackAnimMs, duration);
              this.playerCircle.anims.play(
                { key: "hero_knockback", frameRate, repeat: 0 },
                true
              );
            }
          }
          const trail = this.add.rectangle(
            e.sprite.x,
            e.sprite.y,
            e.kind === "pusher_elite" ? 28 : 20,
            4,
            0xf59e0b,
            0.6
          );
          trail.setOrigin(0.5, 0.5);
          this.tweens.add({
            targets: trail,
            x: trail.x - (e.kind === "pusher_elite" ? 80 : 40),
            alpha: 0,
            duration: e.kind === "pusher_elite" ? 380 : 220,
            onComplete: () => trail.destroy(),
          });
        }
      }
      this.spawnFloatText(
        this.playerCircle.x,
        this.playerCircle.y - 18,
        `-${Math.ceil(dmg)}`,
        blocked ? "#93c5fd" : "#fca5a5"
      );
      // 触发型荆棘：不再反伤，仅格挡减伤
      if (this.kills >= this.killsNeeded) {
        this.openStageClearOverlay();
        return;
      }
      if (this.playerHp <= 0) {
        this.playerHp = 0;
        this.openDefeatOverlay();
        return;
      }
    }
  }

  private playerAttack(derived: ReturnType<typeof computeDerivedPlayerStats>) {
    if (this.enemies.length <= 0) return;
    let best: Enemy | undefined;
    let bestDist = Infinity;
    for (const e of this.enemies) {
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
    this.pushCombatLog(`普攻：${Math.ceil(dmg)}${crit ? "（暴击）" : ""}`);
    this.applyLifeSteal(derived, dmg, "普攻");
    if (best.hp <= 0) {
      this.killEnemy(best);
    }
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
        this.berserkPulse.remove(false);
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
      if (this.enemies.length <= 0) break;
      let inMelee = false;
      const meleeRange = 26;
      for (const e of this.enemies) {
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
    id: ActiveSkillId,
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

  private castWhirlwindSkill(
    lv: number,
    derived: ReturnType<typeof computeDerivedPlayerStats>
  ) {
    const branch = skillBranch(this.save, "whirlwind");
    const p = whirlwindParams(lv, branch);
    const raw = derived.atk * p.coef;
    const hit: Enemy[] = [];
    for (const e of this.enemies) {
      const d = Phaser.Math.Distance.Between(
        e.sprite.x,
        e.sprite.y,
        this.playerCircle.x,
        this.playerCircle.y
      );
      if (d <= p.radius) hit.push(e);
    }
    if (hit.length <= 0) return;
    if (this.anims.exists("hero_attack3")) {
      const duration = 600;
      this.attackAnimMs = Math.max(this.attackAnimMs, duration);
      this.playerCircle.anims.play(
        { key: "hero_attack3", frameRate: 18 },
        true
      );
      this.playerCircle.setTint(0x60a5fa);
      this.time.delayedCall(duration, () => {
        if (this.playerCircle && this.playerCircle.active) {
          this.playerCircle.clearTint();
        }
      });
    }

    const ring = this.add.circle(
      this.playerCircle.x,
      this.playerCircle.y,
      p.radius,
      0x60a5fa,
      0.12
    );
    this.tweens.add({
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
        "#93c5fd"
      );
      this.applyLifeSteal(derived, dmg * 0.35, "旋风斩");
    }
    this.pushSkillLog(`旋风斩：命中${hit.length} 伤害${Math.ceil(total)}`);
    for (const e of [...hit]) {
      if (e.hp <= 0) this.killEnemy(e);
    }
  }

  private berserkMs = 0;
  private berserkLifeStealBonusPct = 0;
  private berserkPulse?: Phaser.Time.TimerEvent;
  private shieldWallMs = 0;
  private castBerserkSkill(lv: number) {
    const { durationMs, lifeStealBonusPct } = berserkParams(lv);
    this.berserkMs = Math.max(this.berserkMs, durationMs);
    this.berserkLifeStealBonusPct = lifeStealBonusPct;
    this.playerCircle.setScale(this.playerBaseScale);
    if (this.berserkPulse) {
      this.berserkPulse.remove(false);
      this.berserkPulse = undefined;
    }
    this.berserkPulse = this.time.addEvent({
      delay: 280,
      loop: true,
      callback: () => {
        const halo = this.add.circle(
          this.playerCircle.x,
          this.playerCircle.y,
          34,
          0xef4444,
          0.22
        );
        this.tweens.add({
          targets: halo,
          scale: 1.22,
          alpha: 0,
          duration: 240,
          ease: "Cubic.easeOut",
          onComplete: () => halo.destroy(),
        });
      },
    });
    this.pushSkillLog(
      `狂暴：持续${(durationMs / 1000).toFixed(1)}s 吸血+${(
        lifeStealBonusPct * 100
      ).toFixed(1)}%`
    );
  }
  private castShieldWallSkill(lv: number) {
    const { durationMs } = shieldWallParams(lv);
    this.shieldWallMs = Math.max(this.shieldWallMs, durationMs);
    const ring = this.add.circle(
      this.playerCircle.x,
      this.playerCircle.y,
      36,
      0x93c5fd,
      0.2
    );
    this.tweens.add({
      targets: ring,
      scale: 1.25,
      alpha: 0,
      duration: 300,
      ease: "Cubic.easeOut",
      onComplete: () => ring.destroy(),
    });
    this.pushSkillLog(`盾墙：持续${(durationMs / 1000).toFixed(1)}s 荆棘=100%`);
  }
  private castThunderSkill(
    lv: number,
    derived: ReturnType<typeof computeDerivedPlayerStats>
  ) {
    const p = thunderParams(lv);
    const raw = derived.atk * p.coef;
    const hit: Enemy[] = [];
    for (const e of this.enemies) {
      const d = Phaser.Math.Distance.Between(
        e.sprite.x,
        e.sprite.y,
        this.playerCircle.x,
        this.playerCircle.y
      );
      if (d <= p.radius) hit.push(e);
    }
    if (hit.length <= 0) return;
    const cam = this.cameras.main;
    cam.shake(120, 0.003);
    const ring = this.add.circle(
      this.playerCircle.x,
      this.playerCircle.y,
      p.radius,
      0x93c5fd,
      0.12
    );
    this.tweens.add({
      targets: ring,
      alpha: 0,
      duration: 200,
      onComplete: () => ring.destroy(),
    });
    const ring2 = this.add.circle(
      this.playerCircle.x,
      this.playerCircle.y,
      p.radius * 0.6,
      0x93c5fd,
      0.12
    );
    this.tweens.add({
      targets: ring2,
      scale: 1.15,
      alpha: 0,
      duration: 220,
      ease: "Cubic.easeOut",
      onComplete: () => ring2.destroy(),
    });
    const bolts = this.add.graphics({ x: 0, y: 0 });
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
    this.tweens.add({
      targets: bolts,
      alpha: 0,
      duration: 140,
      ease: "Quadratic.Out",
      onComplete: () => bolts.destroy(),
    });
    let total = 0;
    for (const e of hit) {
      const dmg = damageAfterDefense(raw, e.def);
      e.hp -= dmg;
      total += dmg;
      this.flashEnemy(e);
      const mark = this.add.graphics();
      mark.lineStyle(3, 0xf59e0b, 0.9);
      const mx = e.sprite.x;
      const my = e.sprite.y - 22;
      mark.beginPath();
      mark.moveTo(mx - 6, my - 10);
      mark.lineTo(mx, my);
      mark.lineTo(mx - 4, my + 10);
      mark.strokePath();
      this.tweens.add({
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
      this.applyLifeSteal(derived, dmg * 0.35, "雷霆一击");
      if (e.hp > 0 && e.sprite.active) {
        e.jumpOffsetY = e.jumpOffsetY ?? 0;
        this.tweens.add({
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
    this.pushSkillLog(`雷霆一击：命中${hit.length} 伤害${Math.ceil(total)}`);
    for (const e of [...hit]) {
      if (e.hp <= 0) this.killEnemy(e);
    }
  }
  private castChargeSkill(
    lv: number,
    derived: ReturnType<typeof computeDerivedPlayerStats>
  ) {
    const branch = skillBranch(this.save, "charge");
    const p = chargeParams(lv, branch);

    const cam = this.cameras.main;
    const resumeFollow = this.mapW > 0 && this.mapH > 0;
    if (resumeFollow) {
      cam.startFollow(this.playerCircle, true, 0.12, 0.12);
    }

    const { width } = this.scale;
    const boundW = this.mapW > 0 ? this.mapW : width;
    const pad = 10 * this.playerBaseScale;
    const worldRight = boundW - pad - 20;
    const pushDist = boundW * 0.1;
    const endX = Math.min(worldRight, this.playerCircle.x + pushDist);

    this.dashLockMs = Math.max(this.dashLockMs, 1000);
    for (let i = 0; i < this.activeCooldownMs.length; i++) {
      this.activeCooldownMs[i] = Math.max(this.activeCooldownMs[i], 1000);
    }

    if (this.anims.exists("hero_charge")) {
      const anim = this.anims.get("hero_charge");
      const frames = anim?.frames.length ?? 10;
      const duration = 300;
      const frameRate = Math.max(8, Math.round(frames / (duration / 1000)));
      this.attackAnimMs = Math.max(this.attackAnimMs, duration);
      this.playerCircle.anims.play(
        { key: "hero_charge", frameRate, repeat: 0 },
        true
      );
    }
    this.tweens.add({
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
    if (this.enemies.length <= 0) return;
    const raw = derived.atk * p.coef;
    let total = 0;
    const hit: Enemy[] = [];

    for (const e of this.enemies) {
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
      this.pushSkillLog(`${source}：命中${hit.length} 伤害${Math.ceil(total)}`);
      this.applyLifeSteal(derived, total * 0.1, source);
      const worldW = this.mapW > 0 ? this.mapW : this.scale.width;
      const pushDist = worldW * 0.1;
      const worldRight = worldW - 24;
      for (const e of hit) {
        if (!e.sprite.active) continue;
        const targetX = Math.min(worldRight, e.sprite.x + pushDist);
        this.tweens.add({
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
      this.tweens.killTweensOf(targets);
      e.stunFx.destroy();
      e.stunFx = undefined;
    }
    const group = this.add.container(e.sprite.x, e.sprite.y - 24);
    const radius = 14;
    const count = 5;
    for (let i = 0; i < count; i++) {
      const ang = (i / count) * Math.PI * 2;
      const star = this.add.circle(
        Math.cos(ang) * radius,
        Math.sin(ang) * radius,
        3,
        0xfbbf24,
        1
      );
      group.add(star);
      this.tweens.add({
        targets: star,
        alpha: 0.6,
        duration: 420,
        yoyo: true,
        repeat: Math.max(0, Math.ceil(durationMs / 420)),
        ease: "Sine.easeInOut",
      });
    }
    this.tweens.add({
      targets: group,
      angle: 360,
      duration: 1200,
      repeat: Math.max(0, Math.ceil(durationMs / 1200)),
      ease: "Linear",
    });
    e.stunFx = group;
  }

  private findNearestEnemy() {
    return this.findNearestEnemyTo(
      this.playerCircle.x,
      this.playerCircle.y,
      Infinity,
      new Set()
    );
  }

  private findNearestEnemyTo(
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

  private playPlayerAttackAnim(attackIntervalMs?: number) {
    const hasAttack0 = this.anims.exists("hero_attack0");
    const hasAttack1 = this.anims.exists("hero_attack1");
    const hasAttack2 = this.anims.exists("hero_attack2");
    if (
      this.textures.exists("swordman") &&
      (hasAttack0 || hasAttack1 || hasAttack2)
    ) {
      const choices = [
        ...(hasAttack0 ? ["hero_attack0"] : []),
        ...(hasAttack1 ? ["hero_attack1"] : []),
        ...(hasAttack2 ? ["hero_attack2"] : []),
      ];
      const key = choices[Math.floor(this.rng.next() * choices.length)];
      const anim = this.anims.get(key);
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
    this.tweens.killTweensOf(this.playerCircle);
    this.tweens.add({
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

  private flashEnemy(enemy: Enemy) {
    if (!enemy.sprite.active) return;
    enemy.sprite.setTintFill(0xffffff);
    this.time.delayedCall(70, () => {
      if (!enemy.sprite.active) return;
      enemy.sprite.clearTint();
    });
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
      `+${actual}`,
      "#86efac"
    );
    this.pushCombatLog(`吸血：+${actual}（${source}）`);
  }

  private killEnemy(enemy: Enemy) {
    this.tweens.killTweensOf([enemy.sprite, enemy.hpBarBg, enemy.hpBarFill]);
    if (enemy.stunFx) {
      const targets = [enemy.stunFx, ...(enemy.stunFx.list ?? [])];
      this.tweens.killTweensOf(targets);
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
      this.playerHp = Math.max(0, this.playerHp - boom);
      const flame = this.add.circle(ex, ey, 18, 0xf97316, 0.24);
      this.tweens.add({
        targets: flame,
        scale: 1.8,
        alpha: 0,
        duration: 260,
        ease: "Cubic.easeOut",
        onComplete: () => flame.destroy(),
      });
      this.spawnFloatText(
        this.playerCircle.x,
        this.playerCircle.y - 22,
        `爆裂 -${boom}`,
        "#fb7185"
      );
      this.pushDefenseLog(`爆裂伤害：${boom}`);
      if (this.playerHp <= 0) {
        this.openDefeatOverlay();
        return;
      }
    }
    this.tweens.add({
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
    this.enemies = this.enemies.filter((e) => e !== enemy);
    this.kills += 1;
    this.stageAtkSpeedMult = Math.min(2, this.stageAtkSpeedMult + 0.2);
    this.stageCritBonus = Math.min(1, this.stageCritBonus + 0.05);

    if (enemy.kind === "splitter") {
      const childHp = Math.max(1, enemy.hpMax * 0.45);
      const childAtk = enemy.atk * 0.7;
      const childDef = enemy.def * 0.7;
      const childSpeed = enemy.speed + 15;
      const childScale = 0.7;
      const childBarW = 20;
      const childOffsetY = 14;
      const left = this.createEnemy({
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
      const right = this.createEnemy({
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
      this.enemies.push(left, right);
      this.updateEnemyHpBar(left);
      this.updateEnemyHpBar(right);
    }

    const drop = rollKillDrop(this.rng, this.save.stage, this.save.stageRepeat);
    this.save.gold += drop.gold;
    const res = applyExp(this.save.level, this.save.exp, drop.exp);
    this.save.level = res.level;
    this.save.exp = res.exp;
    this.lastDropText = `金币 +${drop.gold}，EXP +${drop.exp}`;
    if (res.leveledUp > 0) {
      this.save.skills.points += res.leveledUp;
      const msg = `升级：技能点 +${res.leveledUp}`;
      this.lastDropText = this.lastDropText
        ? `${this.lastDropText}；${msg}`
        : msg;
    }

    if (this.kills >= this.killsNeeded) {
      this.openStageClearOverlay();
    }
  }

  private spawnEnemy() {
    const { width } = this.scale;
    const pad = 10;
    const camRight = this.cameras.main.scrollX + width;
    const x = camRight - pad;
    const y = this.laneY;

    const stage = this.save.stage;
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
    this.enemies.push(enemy);
    this.updateEnemyHpBar(enemy);
  }

  private createEnemy(params: {
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
    const sprite = this.add.sprite(x, y, isElite ? "enemy_elite" : "enemy");
    sprite.setDepth(9);
    sprite.setScale(scale);
    if (tint !== undefined) sprite.setTint(tint);
    const barH = 6;
    const hpBarBg = this.add.rectangle(
      x,
      y - barOffsetY,
      barW,
      barH,
      0x0b1220,
      0.92
    );
    hpBarBg.setStrokeStyle(1, 0x334155, 1);
    const hpBarFill = this.add
      .rectangle(
        x - barW / 2 + 1,
        y - barOffsetY,
        barW - 2,
        barH - 2,
        barColor,
        1
      )
      .setOrigin(0, 0.5);
    hpBarBg.setDepth(20);
    hpBarFill.setDepth(21);
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

  private startStage() {
    this.clearOverlay();

    this.kills = 0;
    this.killsNeeded = (10 + this.save.stage) * 2;
    this.spawnedCount = 0;
    this.spawnCooldownMs = 0;
    this.enemies.forEach((e) => {
      e.sprite.destroy();
      e.hpBarBg.destroy();
      e.hpBarFill.destroy();
    });
    this.enemies = [];

    const derived = this.getDerived();
    this.playerHp = Math.min(derived.hpMax, derived.hpMax);
    this.playerAttackCdMs = 0;
    this.activeCooldownMs = [800, 800, 800, 800, 800];
    this.lastDropText = "";
    this.combatLog = [];
    this.attackAnimMs = 0;
    this.dashLockMs = 0;
    this.recoveryTickerMs = 0;
    this.stageAtkSpeedMult = 1;
    this.stageCritBonus = 0;
    this.isDefeated = false;
    this.berserkMs = 0;
    this.berserkLifeStealBonusPct = 0;
    this.shieldWallMs = 0;
    if (this.berserkPulse) {
      this.berserkPulse.remove(false);
      this.berserkPulse = undefined;
    }
    if (this.playerCircle) {
      this.playerCircle.setPosition(this.heroStartX, this.laneY);
      this.playerCircle.setScale(this.playerBaseScale);
      this.updateHeroAnim(0, 0);
    }
    persistSave(this.save);
    this.updatePlayerHpBar();
  }

  private getDerived() {
    const d = computeDerivedPlayerStats(this.save);
    const spdMult = Math.max(1, Math.min(2, this.stageAtkSpeedMult));
    d.attackIntervalMs = Math.max(80, Math.floor(d.attackIntervalMs / spdMult));
    d.critChance = Math.min(1, d.critChance + Math.max(0, this.stageCritBonus));
    const cam = this.cameras?.main;
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

  private createButtons() {
    const mk = (x: number, y: number, text: string, onClick: () => void) => {
      const t = this.add
        .text(x, y, text, {
          fontFamily: "system-ui",
          fontSize: "14px",
          color: "#e2e8f0",
        })
        .setInteractive({ useHandCursor: true });
      this.pinToScreen(t);
      t.on("pointerdown", onClick);
      t.on("pointerover", () => t.setColor("#93c5fd"));
      t.on("pointerout", () => t.setColor("#e2e8f0"));
      this.uiButtons.push(t);
      return t;
    };

    {
      const t = mk(
        12,
        190,
        `自动下一关：${this.save.autoNext ? "开" : "关"}`,
        () => {
          this.save.autoNext = !this.save.autoNext;
          t.setText(`自动下一关：${this.save.autoNext ? "开" : "关"}`);
          t.setColor(this.save.autoNext ? "#22c55e" : "#ef4444");
          persistSave(this.save);
        }
      );
      t.setColor(this.save.autoNext ? "#22c55e" : "#ef4444");
      t.removeAllListeners("pointerover");
      t.removeAllListeners("pointerout");
      t.on("pointerover", () =>
        t.setColor(this.save.autoNext ? "#4ade80" : "#f87171")
      );
      t.on("pointerout", () =>
        t.setColor(this.save.autoNext ? "#22c55e" : "#ef4444")
      );
    }
    {
      const t = mk(
        12,
        214,
        `自动重开：${this.save.autoRetry ? "开" : "关"}`,
        () => {
          this.save.autoRetry = !this.save.autoRetry;
          t.setText(`自动重开：${this.save.autoRetry ? "开" : "关"}`);
          t.setColor(this.save.autoRetry ? "#22c55e" : "#ef4444");
          persistSave(this.save);
        }
      );
      t.setColor(this.save.autoRetry ? "#22c55e" : "#ef4444");
      t.removeAllListeners("pointerover");
      t.removeAllListeners("pointerout");
      t.on("pointerover", () =>
        t.setColor(this.save.autoRetry ? "#4ade80" : "#f87171")
      );
      t.on("pointerout", () =>
        t.setColor(this.save.autoRetry ? "#22c55e" : "#ef4444")
      );
    }
    {
      const t = mk(
        12,
        238,
        `显示日志：${this.save.showLogs ? "开" : "关"}`,
        () => {
          this.save.showLogs = !this.save.showLogs;
          t.setText(`显示日志：${this.save.showLogs ? "开" : "关"}`);
          t.setColor(this.save.showLogs ? "#22c55e" : "#ef4444");
          persistSave(this.save);
        }
      );
      t.setColor(this.save.showLogs ? "#22c55e" : "#ef4444");
      t.removeAllListeners("pointerover");
      t.removeAllListeners("pointerout");
      t.on("pointerover", () =>
        t.setColor(this.save.showLogs ? "#4ade80" : "#f87171")
      );
      t.on("pointerout", () =>
        t.setColor(this.save.showLogs ? "#22c55e" : "#ef4444")
      );
    }
    // 右下角：角色、技能下方的重置存档（需确认）

    const { width, height } = this.scale;
    const roleBtn = mk(width - 12, height - 56, "角色", () =>
      this.openRoleOverlay()
    );
    roleBtn.setOrigin(1, 1);
    const skillsBtn = mk(width - 12, height - 32, "技能", () =>
      this.openSkillsOverlay()
    );
    skillsBtn.setOrigin(1, 1);
    const resetBtn = mk(width - 12, height - 8, "重置存档", () => {
      const ok =
        typeof window !== "undefined"
          ? window.confirm("确认重置存档？此操作不可撤销")
          : true;
      if (!ok) return;
      resetSave();
      this.save = loadSave();
      this.startStage();
      this.refreshButtons();
    });
    resetBtn.setOrigin(1, 1);
  }

  private openStageClearOverlay() {
    if (this.overlay) return;
    persistSave(this.save);

    const { width, height } = this.scale;
    const bg = this.add.rectangle(
      width * 0.5,
      height * 0.5,
      width,
      height,
      0x000000,
      0.55
    );
    const panel = this.add.rectangle(
      width * 0.5,
      height * 0.5,
      520,
      220,
      0x0b1220,
      0.95
    );
    panel.setStrokeStyle(1, 0x334155, 1);

    const title = this.add
      .text(width * 0.5, height * 0.5 - 76, `通关：第 ${this.save.stage} 关`, {
        fontFamily: "system-ui",
        fontSize: "18px",
        color: "#e2e8f0",
      })
      .setOrigin(0.5, 0.5);

    const desc = this.add
      .text(
        width * 0.5,
        height * 0.5 - 34,
        this.save.autoNext ? "自动下一关已开启" : "选择：推进 or 留下刷",
        {
          fontFamily: "system-ui",
          fontSize: "14px",
          color: "#94a3b8",
        }
      )
      .setOrigin(0.5, 0.5);

    const nextBtn = this.add
      .text(width * 0.5 - 120, height * 0.5 + 48, "进入下一关", {
        fontFamily: "system-ui",
        fontSize: "16px",
        color: "#e2e8f0",
        backgroundColor: "#1e293b",
        padding: { left: 14, right: 14, top: 8, bottom: 8 },
      })
      .setOrigin(0.5, 0.5)
      .setInteractive({ useHandCursor: true });
    nextBtn.on("pointerdown", () => this.advanceStage(1));

    const stayBtn = this.add
      .text(width * 0.5 + 120, height * 0.5 + 48, "停留刷", {
        fontFamily: "system-ui",
        fontSize: "16px",
        color: "#e2e8f0",
        backgroundColor: "#1e293b",
        padding: { left: 14, right: 14, top: 8, bottom: 8 },
      })
      .setOrigin(0.5, 0.5)
      .setInteractive({ useHandCursor: true });
    stayBtn.on("pointerdown", () => this.repeatStage());

    this.overlay = this.add.container(0, 0, [
      bg,
      panel,
      title,
      desc,
      nextBtn,
      stayBtn,
    ]);
    this.pinOverlay();

    if (this.save.autoNext) {
      this.time.delayedCall(900, () => {
        if (!this.overlay) return;
        this.advanceStage(1);
      });
    }
  }

  private openDefeatOverlay() {
    if (this.overlay || this.isDefeated) return;
    persistSave(this.save);
    this.isDefeated = true;
    const hasAnim =
      this.textures.exists("swordman") && this.anims.exists("hero_defeat");
    const show = () => {
      if (this.overlay) return;
      const { width, height } = this.scale;
      const bg = this.add.rectangle(
        width * 0.5,
        height * 0.5,
        width,
        height,
        0x000000,
        0.65
      );
      const panel = this.add.rectangle(
        width * 0.5,
        height * 0.5,
        520,
        220,
        0x0b1220,
        0.95
      );
      panel.setStrokeStyle(1, 0x334155, 1);
      const title = this.add
        .text(width * 0.5, height * 0.5 - 76, "战败", {
          fontFamily: "system-ui",
          fontSize: "20px",
          color: "#fca5a5",
        })
        .setOrigin(0.5, 0.5);
      const desc = this.add
        .text(width * 0.5, height * 0.5 - 34, "重开本关（不回档）", {
          fontFamily: "system-ui",
          fontSize: "14px",
          color: "#94a3b8",
        })
        .setOrigin(0.5, 0.5);
      const retryBtn = this.add
        .text(width * 0.5, height * 0.5 + 48, "重开", {
          fontFamily: "system-ui",
          fontSize: "16px",
          color: "#e2e8f0",
          backgroundColor: "#1e293b",
          padding: { left: 18, right: 18, top: 8, bottom: 8 },
        })
        .setOrigin(0.5, 0.5)
        .setInteractive({ useHandCursor: true });
      retryBtn.on("pointerdown", () => this.startStage());
      this.overlay = this.add.container(0, 0, [
        bg,
        panel,
        title,
        desc,
        retryBtn,
      ]);
      this.pinOverlay();
      if (this.save.autoRetry) {
        this.time.delayedCall(900, () => {
          if (!this.overlay) return;
          this.repeatStage();
        });
      }
    };
    if (hasAnim) {
      const anim = this.anims.get("hero_defeat");
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
    }
    this.time.delayedCall(1000, () => {
      if (this.overlay) return;
      show();
    });
  }
  private clearOverlay() {
    this.overlay?.destroy(true);
    this.overlay = undefined;
  }

  private openRoleOverlay() {
    if (this.overlay) return;
    const { width, height } = this.scale;
    const bg = this.add.rectangle(
      width * 0.5,
      height * 0.5,
      width,
      height,
      0x000000,
      0.6
    );
    const panel = this.add.rectangle(
      width * 0.5,
      height * 0.5,
      720,
      360,
      0x0b1220,
      0.98
    );
    panel.setStrokeStyle(1, 0x334155, 1);
    const title = this.add
      .text(width * 0.5, height * 0.5 - 150, "角色", {
        fontFamily: "system-ui",
        fontSize: "18px",
        color: "#e2e8f0",
      })
      .setOrigin(0.5, 0.5);
    const tabRole = this.add
      .text(width * 0.5 - 320, height * 0.5 - 150, "角色", {
        fontFamily: "system-ui",
        fontSize: "14px",
        color: "#93c5fd",
        backgroundColor: "#0f172a",
        padding: { left: 10, right: 10, top: 6, bottom: 6 },
      })
      .setOrigin(0, 0.5)
      .setInteractive({ useHandCursor: true });
    const tabSkills = this.add
      .text(width * 0.5 - 250, height * 0.5 - 150, "技能", {
        fontFamily: "system-ui",
        fontSize: "14px",
        color: "#e2e8f0",
        backgroundColor: "#1e293b",
        padding: { left: 10, right: 10, top: 6, bottom: 6 },
      })
      .setOrigin(0, 0.5)
      .setInteractive({ useHandCursor: true });
    tabSkills.on("pointerdown", () => {
      this.clearOverlay();
      this.openSkillsOverlay();
    });
    const roleTabBorder = this.add.rectangle(
      tabRole.x + tabRole.width / 2,
      tabRole.y,
      tabRole.width + 8,
      tabRole.height + 8,
      0x000000,
      0
    );
    roleTabBorder.setStrokeStyle(1, 0x93c5fd, 1);
    const closeBtn = this.add
      .text(width * 0.5 + 350, height * 0.5 - 150, "关闭", {
        fontFamily: "system-ui",
        fontSize: "14px",
        color: "#e2e8f0",
        backgroundColor: "#1e293b",
        padding: { left: 10, right: 10, top: 6, bottom: 6 },
      })
      .setOrigin(1, 0.5)
      .setInteractive({ useHandCursor: true });
    closeBtn.on("pointerdown", () => this.clearOverlay());
    const leftX = width * 0.5 - 320;
    const topY = height * 0.5 - 110;
    const info = this.add.text(leftX, topY, "", {
      fontFamily: "system-ui",
      fontSize: "14px",
      color: "#e2e8f0",
    });
    const statsText = this.add.text(leftX, topY + 28, "", {
      fontFamily: "system-ui",
      fontSize: "13px",
      color: "#94a3b8",
    });
    const nextStatsText = this.add.text(leftX + 240, topY + 28, "", {
      fontFamily: "system-ui",
      fontSize: "13px",
      color: "#93c5fd",
    });
    const costText = this.add.text(leftX, topY + 140, "", {
      fontFamily: "system-ui",
      fontSize: "12px",
      color: "#94a3b8",
    });
    const btnY = height * 0.5 + 120;
    const mkBtn = (x: number, label: string, onClick: () => void) => {
      const t = this.add
        .text(x, btnY, label, {
          fontFamily: "system-ui",
          fontSize: "14px",
          color: "#e2e8f0",
          backgroundColor: "#1e293b",
          padding: { left: 12, right: 12, top: 8, bottom: 8 },
        })
        .setOrigin(0, 0.5)
        .setInteractive({ useHandCursor: true });
      t.on("pointerdown", onClick);
      return t;
    };
    const enhanceBtn = mkBtn(width * 0.5 + 40, "升级装备等级", () => {
      const nextLv = (this.save.gearLevel ?? 1) + 1;
      const cost = calcSingleGold(nextLv);
      if (this.save.gold < cost) return;
      this.save.gold -= cost;
      this.save.totalGoldSpent += cost;
      this.save.gearLevel = nextLv;
      persistSave(this.save);
      refresh();
    });
    const peakBtn = mkBtn(width * 0.5 + 170, "升级巅峰等级", () => {
      const nextPeak = (this.save.peakTier ?? 0) + 1;
      const cost = calcPeakGold(nextPeak);
      if (this.save.gold < cost) return;
      this.save.gold -= cost;
      this.save.totalGoldSpent += cost;
      this.save.peakTier = nextPeak;
      persistSave(this.save);
      refresh();
    });
    const refresh = () => {
      const derived = computeDerivedPlayerStats(this.save);
      info.setText(
        `金币 ${Math.floor(this.save.gold)}   装备等级 ${
          this.save.gearLevel
        }   巅峰 ${this.save.peakTier}`
      );
      statsText.setText(
        [
          `攻击 ${Math.floor(derived.atk)}`,
          `防御 ${Math.floor(derived.def)}`,
          `生命 ${Math.floor(derived.hpMax)}`,
          `攻速 ${(1000 / derived.attackIntervalMs).toFixed(2)}/s`,
          `暴击 ${(derived.critChance * 100).toFixed(
            1
          )}%  x${derived.critDamage.toFixed(2)}`,
          (() => {
            const ls = Math.max(
              0,
              derived.lifeStealPct + (this.berserkLifeStealBonusPct || 0)
            );
            const tag = this.berserkMs > 0 ? "（狂暴）" : "";
            return ls > 0 ? `吸血 ${(ls * 100).toFixed(1)}%${tag}` : "";
          })(),
          (() => {
            const th = (this.shieldWallMs > 0 ? 1 : derived.thornsPct) * 100;
            const tag = this.shieldWallMs > 0 ? "（盾墙）" : "";
            return `荆棘 ${th.toFixed(1)}%${tag}`;
          })(),
          derived.recoveryPct > 0
            ? `恢复 ${(derived.recoveryPct * 100).toFixed(
                1
              )}%（每秒，10秒合计）`
            : "",
        ]
          .filter(Boolean)
          .join("\n")
      );
      const nextLv = (this.save.gearLevel ?? 1) + 1;
      const nextPeak = (this.save.peakTier ?? 0) + 1;
      const tmp: PlayerSave = JSON.parse(JSON.stringify(this.save));
      const isGearMax = (this.save.gearLevel ?? 1) >= 250;
      if (!isGearMax) {
        tmp.gearLevel = nextLv;
      } else {
        tmp.peakTier = nextPeak;
      }
      const nextDerived = computeDerivedPlayerStats(tmp);
      nextStatsText.setText(
        [
          `下一级预览（${isGearMax ? "巅峰等级" : "装备等级"}）：`,
          `攻击 ${Math.floor(nextDerived.atk)}`,
          `防御 ${Math.floor(nextDerived.def)}`,
          `生命 ${Math.floor(nextDerived.hpMax)}`,
          `攻速 ${(1000 / nextDerived.attackIntervalMs).toFixed(2)}/s`,
          `暴击 ${(nextDerived.critChance * 100).toFixed(
            1
          )}%  x${nextDerived.critDamage.toFixed(2)}`,
        ].join("\n")
      );
      // 将按钮放到下一级预览下方，并按条件显示
      const belowPreviewY = nextStatsText.y + nextStatsText.height + 16;
      enhanceBtn.setY(belowPreviewY);
      peakBtn.setY(belowPreviewY);
      if (!isGearMax) {
        enhanceBtn.setVisible(true);
        peakBtn.setVisible(false);
        const gearCost = calcSingleGold(nextLv);
        costText.setText(`升级下一装备等级需要金币：${gearCost}`);
        costText.setY(belowPreviewY + 36);
        const canEnhance = this.save.gold >= gearCost;
        enhanceBtn.setAlpha(canEnhance ? 1 : 0.6);
        if (canEnhance) {
          enhanceBtn.setInteractive({ useHandCursor: true });
        } else {
          enhanceBtn.disableInteractive();
        }
      } else {
        enhanceBtn.setVisible(false);
        peakBtn.setVisible(true);
        const peakCost = calcPeakGold(nextPeak);
        costText.setText(`升级下一巅峰等级需要金币：${peakCost}`);
        costText.setY(belowPreviewY + 36);
        const canPeak = this.save.gold >= peakCost;
        peakBtn.setAlpha(canPeak ? 1 : 0.6);
        if (canPeak) {
          peakBtn.setInteractive({ useHandCursor: true });
        } else {
          peakBtn.disableInteractive();
        }
      }
    };
    refresh();
    this.overlay = this.add.container(0, 0, [
      bg,
      panel,
      title,
      tabRole,
      roleTabBorder,
      tabSkills,
      closeBtn,
      info,
      statsText,
      nextStatsText,
      costText,
      enhanceBtn,
      peakBtn,
    ]);
    this.pinOverlay();
  }

  private openSkillsOverlay() {
    if (this.overlay) return;

    const { width, height } = this.scale;
    const bg = this.add.rectangle(
      width * 0.5,
      height * 0.5,
      width,
      height,
      0x000000,
      0.6
    );
    const panel = this.add.rectangle(
      width * 0.5,
      height * 0.5,
      860,
      480,
      0x0b1220,
      0.98
    );
    panel.setStrokeStyle(1, 0x334155, 1);

    const title = this.add
      .text(width * 0.5, height * 0.5 - 220, "技能", {
        fontFamily: "system-ui",
        fontSize: "18px",
        color: "#e2e8f0",
      })
      .setOrigin(0.5, 0.5);

    const tabEquip = this.add
      .text(width * 0.5 - 400, height * 0.5 - 220, "角色", {
        fontFamily: "system-ui",
        fontSize: "14px",
        color: "#e2e8f0",
        backgroundColor: "#1e293b",
        padding: { left: 10, right: 10, top: 6, bottom: 6 },
      })
      .setOrigin(0, 0.5)
      .setInteractive({ useHandCursor: true });
    tabEquip.on("pointerdown", () => {
      this.clearOverlay();
      this.openRoleOverlay();
    });

    const tabSkills = this.add
      .text(width * 0.5 - 330, height * 0.5 - 220, "技能", {
        fontFamily: "system-ui",
        fontSize: "14px",
        color: "#93c5fd",
        backgroundColor: "#0f172a",
        padding: { left: 10, right: 10, top: 6, bottom: 6 },
      })
      .setOrigin(0, 0.5)
      .setInteractive({ useHandCursor: true });
    const skillsTabBorder = this.add.rectangle(
      tabSkills.x + tabSkills.width / 2,
      tabSkills.y,
      tabSkills.width + 8,
      tabSkills.height + 8,
      0x000000,
      0
    );
    skillsTabBorder.setStrokeStyle(1, 0x93c5fd, 1);

    const closeBtn = this.add
      .text(width * 0.5 + 400, height * 0.5 - 220, "关闭", {
        fontFamily: "system-ui",
        fontSize: "14px",
        color: "#e2e8f0",
        backgroundColor: "#1e293b",
        padding: { left: 10, right: 10, top: 6, bottom: 6 },
      })
      .setOrigin(1, 0.5)
      .setInteractive({ useHandCursor: true });
    closeBtn.on("pointerdown", () => this.clearOverlay());

    const leftX = width * 0.5 - 390;
    const topY = height * 0.5 - 170;

    const points = this.add.text(leftX, topY, "", {
      fontFamily: "system-ui",
      fontSize: "14px",
      color: "#e2e8f0",
    });
    const equipInfo = this.add.text(leftX, topY + 26, "", {
      fontFamily: "system-ui",
      fontSize: "12px",
      color: "#94a3b8",
    });

    const listTitle = this.add.text(
      leftX,
      topY + 60,
      "技能列表（升级得点；装配后自动施放）",
      {
        fontFamily: "system-ui",
        fontSize: "13px",
        color: "#e2e8f0",
      }
    );

    const skillLines: Phaser.GameObjects.Text[] = [];
    let selected: SkillId = "whirlwind";

    const detailX = width * 0.5 + 80;
    const detailTitle = this.add.text(detailX, topY, "详情", {
      fontFamily: "system-ui",
      fontSize: "14px",
      color: "#e2e8f0",
    });
    const detailBody = this.add.text(detailX, topY + 24, "", {
      fontFamily: "system-ui",
      fontSize: "13px",
      color: "#94a3b8",
      lineSpacing: 4,
      wordWrap: { width: 380 },
    });

    const btnY = height * 0.5 + 156;
    const mkBtn = (x: number, label: string, onClick: () => void) => {
      const t = this.add
        .text(x, btnY, label, {
          fontFamily: "system-ui",
          fontSize: "14px",
          color: "#e2e8f0",
          backgroundColor: "#1e293b",
          padding: { left: 12, right: 12, top: 8, bottom: 8 },
        })
        .setOrigin(0, 0.5)
        .setInteractive({ useHandCursor: true });
      t.on("pointerdown", onClick);
      return t;
    };

    const upgradeBtn = mkBtn(detailX, "升级", () => {
      if (!canLearnOrUpgrade(this.save, selected)) return;
      const def = getSkillDef(selected);
      const lv = (this.save.skills.levels[selected] ?? 0) + 1;
      this.save.skills.levels[selected] = Math.min(def.maxLevel, lv);
      this.save.skills.points -= 1;
      persistSave(this.save);
      refresh();
    });

    // 分支按钮已移除

    const equip1 = mkBtn(detailX, "装1", () =>
      this.tryEquipSkillToSlot(selected, 0)
    );
    const equip2 = mkBtn(detailX + 60, "装2", () =>
      this.tryEquipSkillToSlot(selected, 1)
    );
    const equip3 = mkBtn(detailX + 120, "装3", () =>
      this.tryEquipSkillToSlot(selected, 2)
    );
    const equip4 = mkBtn(detailX + 180, "装4", () =>
      this.tryEquipSkillToSlot(selected, 3)
    );
    const equip5 = mkBtn(detailX + 240, "装5", () =>
      this.tryEquipSkillToSlot(selected, 4)
    );

    equip1.setY(btnY + 44);
    equip2.setY(btnY + 44);
    equip3.setY(btnY + 44);
    equip4.setY(btnY + 44);
    equip5.setY(btnY + 44);

    const respecBtn = mkBtn(detailX + 86, "重置", () => {
      const ok =
        typeof window !== "undefined"
          ? window.confirm("确认重置技能？已投入的技能点将返还")
          : true;
      if (!ok) return;
      const spent = this.spentSkillPoints();
      this.save.skills.points += spent;
      this.save.skills.levels = { whirlwind: 1 };
      this.save.skills.branches = {};
      this.save.skills.equippedActives = ["whirlwind", null, null, null, null];
      persistSave(this.save);
      refresh();
    });

    const trySetSelected = (id: SkillId) => {
      selected = id;
      refresh();
    };

    const refresh = () => {
      points.setText(`技能点：${this.save.skills.points}`);
      equipInfo.setText(
        `已装备：${this.formatActiveSlot(0)} / ${this.formatActiveSlot(
          1
        )} / ${this.formatActiveSlot(2)} / ${this.formatActiveSlot(
          3
        )} / ${this.formatActiveSlot(4)}`
      );

      const ids = allSkills();
      for (let i = 0; i < ids.length; i++) {
        const id = ids[i]!;
        const def = getSkillDef(id);
        const lv = skillLevel(this.save, id);
        const br = skillBranch(this.save, id);
        const unlock = this.save.level >= def.unlockLevel;
        const lockedText = unlock ? "" : `（需等级${def.unlockLevel}）`;
        const brName = br
          ? def.branches.find((b) => b.id === br)?.name ?? br
          : "";
        const brText = brName ? ` ${brName}` : "";
        const text = `${def.name}  Lv${lv}/${def.maxLevel}${brText} ${lockedText}`;
        const t =
          skillLines[i] ??
          this.add
            .text(leftX, topY + 86 + i * 22, "", {
              fontFamily: "system-ui",
              fontSize: "13px",
              color: "#e2e8f0",
            })
            .setInteractive({ useHandCursor: true });
        skillLines[i] = t;
        t.setText(text);
        t.setAlpha(id === selected ? 1 : 0.85);
        t.setColor(unlock ? "#e2e8f0" : "#64748b");
        t.removeAllListeners("pointerdown");
        t.on("pointerdown", () => trySetSelected(id));
      }

      const def = getSkillDef(selected);
      const lv = skillLevel(this.save, selected);
      const canUp = canLearnOrUpgrade(this.save, selected);
      const unlocked = this.save.level >= def.unlockLevel;

      detailTitle.setText(`${def.name}（${def.type}）`);
      const currentLines = skillPreviewLines(this.save, selected);
      let lines = [...currentLines];
      if (def.type === "active") {
        const curLv = skillLevel(this.save, selected);
        const nextLv = Math.min(def.maxLevel, curLv + 1);
        const br = skillBranch(this.save, selected);
        const sep = "————————————";
        let nextLines: string[] = [];
        if (selected === "whirlwind") {
          const p1 = whirlwindParams(curLv, br);
          const p2 = whirlwindParams(nextLv, br);
          nextLines = [
            `范围：${Math.floor(p2.radius)} (+${Math.floor(
              p2.radius - p1.radius
            )})`,
            `倍率：${Math.round(p2.coef * 100)}% ATK (+${Math.round(
              (p2.coef - p1.coef) * 100
            )}%)`,
          ];
        } else if (selected === "charge") {
          const p1 = chargeParams(curLv, br);
          const p2 = chargeParams(nextLv, br);
          nextLines = [
            `倍率：${Math.round(p2.coef * 100)}% ATK (x2) (+${Math.round(
              (p2.coef - p1.coef) * 100
            )}%)`,
            `眩晕：${(p2.stunMs / 1000).toFixed(2)}s (+${(
              (p2.stunMs - p1.stunMs) /
              1000
            ).toFixed(2)}s)`,
          ];
        } else if (selected === "thunder") {
          const p1 = thunderParams(curLv);
          const p2 = thunderParams(nextLv);
          nextLines = [
            `范围：${Math.floor(p2.radius)} (+${Math.floor(
              p2.radius - p1.radius
            )})`,
            `倍率：${Math.round(p2.coef * 100)}% ATK (+${Math.round(
              (p2.coef - p1.coef) * 100
            )}%)`,
          ];
        } else if (selected === "berserk") {
          const p1 = berserkParams(curLv);
          const p2 = berserkParams(nextLv);
          nextLines = [
            `持续：${(p2.durationMs / 1000).toFixed(1)}s (+${(
              (p2.durationMs - p1.durationMs) /
              1000
            ).toFixed(1)}s)`,
            `额外吸血：${(p2.lifeStealBonusPct * 100).toFixed(1)}% (+${(
              (p2.lifeStealBonusPct - p1.lifeStealBonusPct) *
              100
            ).toFixed(1)}%)`,
          ];
        } else if (selected === "shield_wall") {
          const p1 = shieldWallParams(curLv);
          const p2 = shieldWallParams(nextLv);
          nextLines = [
            `持续：${(p2.durationMs / 1000).toFixed(1)}s (+${(
              (p2.durationMs - p1.durationMs) /
              1000
            ).toFixed(1)}s)`,
            `荆棘：100%`,
          ];
        }
        lines = [...currentLines, sep, "下一级预览：", ...nextLines];
      }
      detailBody.setText(lines.join("\n"));

      upgradeBtn.setAlpha(canUp ? 1 : 0.5);

      const isActive = def.type === "active";
      equip1.setAlpha(isActive && lv > 0 ? 1 : 0.4);
      equip2.setAlpha(isActive && lv > 0 ? 1 : 0.4);
      equip3.setAlpha(isActive && lv > 0 ? 1 : 0.4);
      equip4.setAlpha(isActive && lv > 0 ? 1 : 0.4);
      equip5.setAlpha(isActive && lv > 0 ? 1 : 0.4);

      if (!unlocked) {
        upgradeBtn.setAlpha(0.5);
      }
    };

    refresh();
    this.overlay = this.add.container(0, 0, [
      bg,
      panel,
      title,
      tabEquip,
      tabSkills,
      skillsTabBorder,
      closeBtn,
      points,
      equipInfo,
      listTitle,
      detailTitle,
      detailBody,
      upgradeBtn,
      equip1,
      equip2,
      equip3,
      equip4,
      equip5,
      respecBtn,
      ...skillLines,
    ]);
    this.pinOverlay();
  }

  private tryEquipSkillToSlot(id: SkillId, slotIndex: number) {
    const def = getSkillDef(id);
    if (def.type !== "active") return;
    if (skillLevel(this.save, id) <= 0) return;
    const actives = [...this.save.skills.equippedActives];
    actives[slotIndex] = id as ActiveSkillId;
    this.save.skills.equippedActives = actives;
    persistSave(this.save);
    this.clearOverlay();
    this.openSkillsOverlay();
  }

  private formatActiveSlot(i: number) {
    const id = this.save.skills.equippedActives[i];
    return id ? getSkillDef(id).name : "空";
  }

  private spentSkillPoints() {
    let spent = 0;
    for (const id of allSkills()) {
      const lv = skillLevel(this.save, id);
      spent += lv;
    }
    spent -= 1;
    return Math.max(0, spent);
  }

  private advanceStage(step: number) {
    this.save.stage = Math.max(1, this.save.stage + step);
    this.save.stageRepeat = 0;
    persistSave(this.save);
    this.scene.restart();
  }

  private repeatStage() {
    this.save.stageRepeat += 1;
    persistSave(this.save);
    this.scene.restart();
  }

  private updateUi() {
    const derived = this.getDerived();
    const req = requiredExpForNextLevel(this.save.level);
    const expPct = req <= 0 ? 0 : (this.save.exp / req) * 100;
    const hpPct =
      derived.hpMax <= 0 ? 0 : (this.playerHp / derived.hpMax) * 100;
    const slots = this.save.skills.equippedActives;
    const cdLine = slots
      .map((id, i) => {
        if (!id) return `空${i + 1}: -`;
        const name = getSkillDef(id).name;
        const cdMs = Math.max(0, this.activeCooldownMs[i] ?? 0);
        const sec = (cdMs / 1000).toFixed(1);
        return `${name} ${sec}s`;
      })
      .join("  |  ");
    this.uiTop.setText(`技能冷却：${cdLine}`);

    this.uiLeft.setText(
      [
        `关卡：${this.save.stage}  (重复 ${this.save.stageRepeat})`,
        `目标：${this.kills}/${this.killsNeeded}`,
        `等级：${this.save.level}  EXP：${
          this.save.exp
        }/${req} (${expPct.toFixed(1)}%)`,
        `金币：${Math.floor(this.save.gold)}`,
        `装备等级：${this.save.gearLevel}  巅峰：${this.save.peakTier}`,
        `技能点：${this.save.skills.points}`,
      ].join("\n")
    );

    this.uiRight.setText(
      [
        `HP：${Math.floor(this.playerHp)}/${Math.floor(
          derived.hpMax
        )} (${hpPct.toFixed(0)}%)`,
        `ATK：${Math.floor(derived.atk)}  DEF：${Math.floor(derived.def)}`,
        `攻速：${(1000 / derived.attackIntervalMs).toFixed(2)}/s`,
        `暴击：${(derived.critChance * 100).toFixed(
          1
        )}%  x${derived.critDamage.toFixed(2)}`,
        (() => {
          const cam = this.cameras?.main;
          if (!cam || !this.playerCircle) return "";
          const mid = cam.scrollX + cam.width * 0.5;
          const onRight = this.playerCircle.x >= mid;
          return onRight ? "位置增益：攻击 +50%" : "位置增益：防御 +50%";
        })(),
        (() => {
          const ls = Math.max(
            0,
            derived.lifeStealPct + (this.berserkLifeStealBonusPct || 0)
          );
          if (ls <= 0) return "";
          const tag =
            this.berserkMs > 0
              ? `（狂暴 ${Math.max(0, this.berserkMs / 1000).toFixed(1)}s）`
              : "";
          return `吸血：${(ls * 100).toFixed(1)}%${tag}`;
        })(),
        (() => {
          const thornsPct =
            (this.shieldWallMs > 0 ? 1 : derived.thornsPct) * 100;
          const tag =
            this.shieldWallMs > 0
              ? `（盾墙 ${Math.max(0, this.shieldWallMs / 1000).toFixed(1)}s）`
              : "";
          return `荆棘：${thornsPct.toFixed(1)}%${tag}`;
        })(),
        derived.recoveryPct > 0
          ? `恢复：${(derived.recoveryPct * 100).toFixed(1)}%（每秒，10秒合计）`
          : "",
      ]
        .filter(Boolean)
        .join("\n")
    );

    this.layoutBottomLogs();
    const show = !!this.save.showLogs;
    this.uiBottomFight.setVisible(show);
    this.uiBottomSkill.setVisible(show);
    this.uiBottomDefense.setVisible(show);
    if (show) {
      const fight = ["战斗日志：", ...this.combatLog.slice(0, 10)].join("\n");
      const skills = ["技能日志：", ...this.skillLog.slice(0, 10)].join("\n");
      const defense = ["防御日志：", ...this.defenseLog.slice(0, 10)].join(
        "\n"
      );
      this.uiBottomFight.setText(fight);
      this.uiBottomSkill.setText(skills);
      this.uiBottomDefense.setText(defense);
    } else {
      this.uiBottomFight.setText("");
      this.uiBottomSkill.setText("");
      this.uiBottomDefense.setText("");
    }
  }

  private spawnFloatText(x: number, y: number, text: string, color: string) {
    const t = this.add.text(x, y, text, {
      fontFamily: "system-ui",
      fontSize: "12px",
      color,
      stroke: "#0b1020",
      strokeThickness: 2,
    });
    t.setOrigin(0.5, 0.5);
    this.tweens.add({
      targets: t,
      y: y - 52,
      alpha: 0,
      duration: 720,
      ease: "Cubic.easeOut",
      onComplete: () => t.destroy(),
    });
  }
}
