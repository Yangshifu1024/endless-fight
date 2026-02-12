import Phaser from "phaser";
import {
  damageAfterDefense,
  enemyAtkAtStage,
  enemyDefAtStage,
  enemyHpAtStage,
} from "../logic/balance";
import { rollKillDrop } from "../logic/drops";
import {
  applyEnhance,
  applyReforge,
  canEnhance,
  enhanceCost,
  formatItemShort,
  formatStatsLines,
  rarityColor,
  rarityRank,
  reforgeCost,
} from "../logic/equipment";
import { computeDerivedPlayerStats } from "../logic/playerStats";
import { applyExp, requiredExpForNextLevel } from "../logic/progression";
import { createRng } from "../logic/rng";
import type {
  ActiveSkillId,
  EquipmentItem,
  PlayerSave,
  SkillId,
  UltimateSkillId,
} from "../model/types";
import {
  allSkills,
  canLearnOrUpgrade,
  canSelectBranch,
  getSkillDef,
  skillBranch,
  skillLevel,
} from "../skills/skills";
import {
  chainLightningParams,
  meteorParams,
  skillCooldownMs,
  skillPreviewLines,
  whirlwindParams,
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
  speed: number;
  attackCooldownMs: number;
  hpBarBg: Phaser.GameObjects.Rectangle;
  hpBarFill: Phaser.GameObjects.Rectangle;
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
  private activeCooldownMs = [0, 0, 0];
  private ultimateCooldownMs = 0;
  private playerAnimT = 0;
  private heroDir: "down" | "up" | "left" | "right" = "down";
  private kenneyCharCols = 0;
  private kenneyHeroIndex = 0;
  private mapW = 0;
  private mapH = 0;

  private enemies: Enemy[] = [];
  private kills = 0;
  private killsNeeded = 0;
  private spawnCooldownMs = 0;

  private uiLeft!: Phaser.GameObjects.Text;
  private uiRight!: Phaser.GameObjects.Text;
  private uiBottom!: Phaser.GameObjects.Text;
  private uiButtons: Phaser.GameObjects.Text[] = [];
  private overlay: Phaser.GameObjects.Container | undefined;
  private lastDropText = "";

  private keys!: Record<"W" | "A" | "S" | "D", Phaser.Input.Keyboard.Key>;

  constructor() {
    super("BattleScene");
  }

  preload() {
    this.load.spritesheet(
      "kenney_char",
      "/assets/kenney/kenney_roguelike-characters/roguelikeChar_transparent.png",
      { frameWidth: 16, frameHeight: 16, margin: 0, spacing: 1 }
    );
    this.load.image(
      "kenney_tiles",
      "/assets/kenney/kenney_roguelike-rpg-pack/Spritesheet/roguelikeSheet_transparent.png"
    );
    this.load.tilemapTiledJSON(
      "kenney_map",
      "/assets/kenney/kenney_roguelike-rpg-pack/Map/sample_map.json"
    );
  }

  create() {
    this.save = loadSave();
    this.keys = this.input.keyboard!.addKeys("W,A,S,D") as any;

    const { width, height } = this.scale;
    this.ensureActorTextures();
    this.createKenneyMap();
    this.createHeroAnims();
    const heroStartX = this.mapW > 0 ? this.mapW * 0.5 : width * 0.5;
    const heroStartY = this.mapH > 0 ? this.mapH * 0.5 : height * 0.58;
    this.playerCircle = this.add.sprite(
      heroStartX,
      heroStartY,
      this.textures.exists("kenney_char") ? "kenney_char" : "player",
      this.textures.exists("kenney_char")
        ? this.heroFrame("down", 1)
        : undefined
    );
    if (this.mapW > 0 && this.mapH > 0) {
      this.cameras.main.startFollow(this.playerCircle, true, 0.12, 0.12);
    }
    this.playerCircle.setDepth(10);
    this.playerCircle.setScale(this.playerBaseScale);
    this.playerHp = computeDerivedPlayerStats(this.save).hpMax;
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

  private createKenneyMap() {
    if (!this.cache.tilemap.exists("kenney_map")) return;
    if (!this.textures.exists("kenney_tiles")) return;
    const map = this.make.tilemap({ key: "kenney_map" });
    const tileset = map.addTilesetImage(
      "Roguelike",
      "kenney_tiles",
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

  private createHeroAnims() {
    if (!this.textures.exists("kenney_char")) return;
    if (this.anims.exists("hero_idle_down")) return;
    const img = this.textures
      .get("kenney_char")
      .getSourceImage() as HTMLImageElement;
    const cols = Math.floor((img.width + 1) / (16 + 1));
    this.kenneyCharCols = Math.max(1, cols);
    const mk = (
      key: string,
      frames: number[],
      frameRate: number,
      repeat: number
    ) => {
      this.anims.create({
        key,
        frames: frames.map((frame) => ({ key: "kenney_char", frame })),
        frameRate,
        repeat,
      });
    };
    mk("hero_idle_down", [this.heroFrame("down", 1)], 1, -1);
    mk("hero_idle_up", [this.heroFrame("up", 1)], 1, -1);
    mk("hero_idle_left", [this.heroFrame("left", 1)], 1, -1);
    mk("hero_idle_right", [this.heroFrame("right", 1)], 1, -1);
    mk(
      "hero_walk_down",
      [
        this.heroFrame("down", 0),
        this.heroFrame("down", 1),
        this.heroFrame("down", 2),
      ],
      9,
      -1
    );
    mk(
      "hero_walk_up",
      [
        this.heroFrame("up", 0),
        this.heroFrame("up", 1),
        this.heroFrame("up", 2),
      ],
      9,
      -1
    );
    mk(
      "hero_walk_left",
      [
        this.heroFrame("left", 0),
        this.heroFrame("left", 1),
        this.heroFrame("left", 2),
      ],
      9,
      -1
    );
    mk(
      "hero_walk_right",
      [
        this.heroFrame("right", 0),
        this.heroFrame("right", 1),
        this.heroFrame("right", 2),
      ],
      9,
      -1
    );
  }

  private heroFrame(dir: "down" | "up" | "left" | "right", step: 0 | 1 | 2) {
    const cols = Math.max(1, this.kenneyCharCols || 1);
    const blockCols = Math.max(1, Math.floor(cols / 3));
    const idx = Math.max(0, this.kenneyHeroIndex);
    const bx = idx % blockCols;
    const by = Math.floor(idx / blockCols);
    const dirRow =
      dir === "down" ? 0 : dir === "left" ? 1 : dir === "right" ? 2 : 3;
    const col = bx * 3 + step;
    const row = by * 4 + dirRow;
    return row * cols + col;
  }

  private updateHeroAnim(vx: number, vy: number) {
    if (!this.textures.exists("kenney_char")) return;
    const moving = Math.abs(vx) + Math.abs(vy) > 0.001;
    if (moving) {
      if (Math.abs(vx) > Math.abs(vy))
        this.heroDir = vx >= 0 ? "right" : "left";
      else this.heroDir = vy >= 0 ? "down" : "up";
    }
    const key = `hero_${moving ? "walk" : "idle"}_${this.heroDir}`;
    if (!this.anims.exists(key)) return;
    const cur = this.playerCircle.anims.currentAnim?.key;
    if (cur !== key) this.playerCircle.anims.play(key, true);
  }

  private ensureActorTextures() {
    if (
      this.textures.exists("player") &&
      this.textures.exists("enemy") &&
      this.textures.exists("enemy_elite")
    )
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
    const derived = computeDerivedPlayerStats(this.save);
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
    const barW = e.hpBarBg.width;
    const offsetY = e.isElite ? 22 : 18;
    const y = e.sprite.y - offsetY;
    e.hpBarBg.setPosition(e.sprite.x, y);
    e.hpBarFill.setPosition(e.sprite.x - barW / 2 + 1, y);
    e.hpBarFill.setScale(pct, 1);
  }

  private updatePlayer(dt: number) {
    if (this.overlay) return;

    const speed = 190;
    let vx = 0;
    let vy = 0;
    if (this.keys.W.isDown) vy -= 1;
    if (this.keys.S.isDown) vy += 1;
    if (this.keys.A.isDown) vx -= 1;
    if (this.keys.D.isDown) vx += 1;
    const len = Math.hypot(vx, vy);
    if (len > 0) {
      vx /= len;
      vy /= len;
    } else {
      const target = this.findNearestEnemy();
      if (target) {
        const dx = target.sprite.x - this.playerCircle.x;
        const dy = target.sprite.y - this.playerCircle.y;
        const dist = Math.max(0.001, Math.hypot(dx, dy));
        const desiredDist = 24;
        if (dist > desiredDist) {
          vx = dx / dist;
          vy = dy / dist;
        }
      }
    }

    const { width, height } = this.scale;
    const boundW = this.mapW > 0 ? this.mapW : width;
    const boundH = this.mapH > 0 ? this.mapH : height;
    const pad = 10 * this.playerBaseScale;
    const nx = Phaser.Math.Clamp(
      this.playerCircle.x + vx * speed * (dt / 1000),
      pad,
      boundW - pad
    );
    const ny = Phaser.Math.Clamp(
      this.playerCircle.y + vy * speed * (dt / 1000),
      pad,
      boundH - pad
    );
    this.playerCircle.setPosition(nx, ny);
    this.updateHeroAnim(vx, vy);
    this.playerAnimT += dt;
    const moving = Math.abs(vx) + Math.abs(vy) > 0.0001;
    const bob =
      Math.sin(this.playerAnimT * (moving ? 0.03 : 0.015)) *
      (moving ? 0.06 : 0.03);
    const scaleX = 1 + bob;
    const scaleY = 1 - bob * 0.35;
    this.playerCircle.setScale(
      this.playerBaseScale * scaleX,
      this.playerBaseScale * scaleY
    );
  }

  private updateEnemies(dt: number) {
    if (this.overlay) return;

    for (const e of this.enemies) {
      const dx = this.playerCircle.x - e.sprite.x;
      const dy = this.playerCircle.y - e.sprite.y;
      const dist = Math.max(0.001, Math.hypot(dx, dy));
      const ux = dx / dist;
      const uy = dy / dist;
      const step = e.speed * (dt / 1000);
      e.sprite.x += ux * step;
      e.sprite.y += uy * step;
      e.attackCooldownMs = Math.max(0, e.attackCooldownMs - dt);
      this.updateEnemyHpBar(e);
    }
  }

  private updateSpawns(dt: number) {
    if (this.overlay) return;

    if (this.kills >= this.killsNeeded) return;
    this.spawnCooldownMs = Math.max(0, this.spawnCooldownMs - dt);
    if (this.spawnCooldownMs > 0) return;

    const stage = this.save.stage;
    const living = this.enemies.length;
    const maxLiving = 6 + Math.min(8, Math.floor(stage / 12));
    if (living >= maxLiving) return;

    this.spawnEnemy();
    this.spawnCooldownMs = Math.max(140, 520 - stage * 1.5);
  }

  private updateCombat(dt: number) {
    if (this.overlay) return;
    if (this.enemies.length <= 0 && this.kills >= this.killsNeeded) {
      this.openStageClearOverlay();
      return;
    }

    const derived = computeDerivedPlayerStats(this.save);
    this.playerAttackCdMs = Math.max(0, this.playerAttackCdMs - dt);
    this.updateSkillCasting(dt, derived);

    if (this.playerAttackCdMs <= 0) {
      this.playerAttack(derived);
      this.playerAttackCdMs = derived.attackIntervalMs;
    }

    for (const e of this.enemies) {
      const dist = Phaser.Math.Distance.Between(
        e.sprite.x,
        e.sprite.y,
        this.playerCircle.x,
        this.playerCircle.y
      );
      if (dist > 22) continue;
      if (e.attackCooldownMs > 0) continue;
      e.attackCooldownMs = 820;
      const raw = e.atk;
      const dmg = damageAfterDefense(raw, derived.def);
      this.playerHp -= dmg;
      this.spawnFloatText(
        this.playerCircle.x,
        this.playerCircle.y - 18,
        `-${Math.floor(dmg)}`,
        "#fca5a5"
      );
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
      const d = Phaser.Math.Distance.Between(
        e.sprite.x,
        e.sprite.y,
        this.playerCircle.x,
        this.playerCircle.y
      );
      if (d < bestDist) {
        bestDist = d;
        best = e;
      }
    }
    if (!best) return;
    const meleeRange = 26;
    if (bestDist > meleeRange) return;

    this.playPlayerAttackAnim();
    const crit = this.rng.next() < derived.critChance;
    const raw = derived.atk * (crit ? derived.critDamage : 1);
    const dmg = damageAfterDefense(raw, best.def);
    best.hp -= dmg;
    this.flashEnemy(best);
    this.spawnFloatText(
      best.sprite.x,
      best.sprite.y - 16,
      `${crit ? "暴 " : ""}${Math.floor(dmg)}`,
      crit ? "#fde68a" : "#e2e8f0"
    );
    this.applyLifeSteal(derived, dmg);
    if (best.hp <= 0) {
      this.killEnemy(best);
    }
  }

  private updateSkillCasting(
    dt: number,
    derived: ReturnType<typeof computeDerivedPlayerStats>
  ) {
    for (let i = 0; i < this.activeCooldownMs.length; i++) {
      this.activeCooldownMs[i] = Math.max(0, this.activeCooldownMs[i] - dt);
      const id = this.save.skills.equippedActives[i];
      if (!id) continue;
      const lv = skillLevel(this.save, id);
      if (lv <= 0) continue;
      if (this.activeCooldownMs[i] > 0) continue;
      if (this.enemies.length <= 0) break;
      this.castActiveSkill(id, lv, derived);
      this.activeCooldownMs[i] = skillCooldownMs(id, lv);
    }

    this.ultimateCooldownMs = Math.max(0, this.ultimateCooldownMs - dt);
    const uid = this.save.skills.equippedUltimate;
    if (uid && this.ultimateCooldownMs <= 0 && this.enemies.length >= 3) {
      const lv = skillLevel(this.save, uid);
      if (lv > 0) {
        this.castUltimateSkill(uid, lv, derived);
        this.ultimateCooldownMs = skillCooldownMs(uid, lv);
      }
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
      case "chain_lightning":
        this.castChainLightningSkill(lv, derived);
        break;
    }
  }

  private castUltimateSkill(
    id: UltimateSkillId,
    lv: number,
    derived: ReturnType<typeof computeDerivedPlayerStats>
  ) {
    switch (id) {
      case "meteor":
        this.castMeteorSkill(lv, derived);
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

    for (const e of hit) {
      const dmg = damageAfterDefense(raw, e.def);
      e.hp -= dmg;
      this.flashEnemy(e);
      this.spawnFloatText(
        e.sprite.x,
        e.sprite.y - 16,
        `${Math.floor(dmg)}`,
        "#93c5fd"
      );
      this.applyLifeSteal(derived, dmg * 0.35);
    }
    for (const e of [...hit]) {
      if (e.hp <= 0) this.killEnemy(e);
    }
  }

  private castChainLightningSkill(
    lv: number,
    derived: ReturnType<typeof computeDerivedPlayerStats>
  ) {
    const branch = skillBranch(this.save, "chain_lightning");
    const p = chainLightningParams(lv, branch);

    const start = this.findNearestEnemy();
    if (!start) return;

    const hitIds = new Set<string>();
    const chain: Enemy[] = [];
    let current: Enemy | undefined = start;
    while (current && chain.length < p.bounces) {
      chain.push(current);
      hitIds.add(current.id);
      current = this.findNearestEnemyTo(
        current.sprite.x,
        current.sprite.y,
        p.range,
        hitIds
      );
    }

    const g = this.add.graphics();
    g.lineStyle(2, 0xa78bfa, 0.65);
    g.beginPath();
    g.moveTo(this.playerCircle.x, this.playerCircle.y);
    for (const e of chain) {
      g.lineTo(e.sprite.x, e.sprite.y);
    }
    g.strokePath();
    this.tweens.add({
      targets: g,
      alpha: 0,
      duration: 260,
      onComplete: () => g.destroy(),
    });

    for (const e of chain) {
      let dmgRaw = derived.atk * p.coef;
      if (branch === "shock" && e.isElite) dmgRaw *= p.eliteMult;
      const dmg = damageAfterDefense(dmgRaw, e.def);
      e.hp -= dmg;
      this.flashEnemy(e);
      this.spawnFloatText(
        e.sprite.x,
        e.sprite.y - 16,
        `${Math.floor(dmg)}`,
        "#c4b5fd"
      );
      this.applyLifeSteal(derived, dmg * 0.22);
    }
    for (const e of [...chain]) {
      if (e.hp <= 0) this.killEnemy(e);
    }
  }

  private castMeteorSkill(
    lv: number,
    derived: ReturnType<typeof computeDerivedPlayerStats>
  ) {
    const branch = skillBranch(this.save, "meteor");
    const p = meteorParams(lv, branch);
    const raw = derived.atk * p.coef;
    const targets = this.enemies.filter(
      (e) =>
        Phaser.Math.Distance.Between(
          e.sprite.x,
          e.sprite.y,
          this.playerCircle.x,
          this.playerCircle.y
        ) <= p.radius
    );
    if (targets.length <= 0) return;

    const ring = this.add.circle(
      this.playerCircle.x,
      this.playerCircle.y,
      p.radius,
      0xf59e0b,
      0.12
    );
    this.tweens.add({
      targets: ring,
      alpha: 0,
      duration: 360,
      onComplete: () => ring.destroy(),
    });

    for (const e of targets) {
      const dmg = damageAfterDefense(raw, e.def);
      e.hp -= dmg;
      this.flashEnemy(e);
      this.spawnFloatText(
        e.sprite.x,
        e.sprite.y - 16,
        `${Math.floor(dmg)}`,
        "#fdba74"
      );
      this.applyLifeSteal(derived, dmg * 0.18);
    }
    for (const e of [...targets]) {
      if (e.hp <= 0) this.killEnemy(e);
    }

    if (p.burn) {
      const tickRaw = derived.atk * p.coef * 0.4;
      this.time.delayedCall(650, () => {
        if (this.overlay) return;
        const laterTargets = this.enemies.filter(
          (e) =>
            Phaser.Math.Distance.Between(
              e.sprite.x,
              e.sprite.y,
              this.playerCircle.x,
              this.playerCircle.y
            ) <= p.radius
        );
        for (const e of laterTargets) {
          const dmg = damageAfterDefense(tickRaw, e.def);
          e.hp -= dmg;
          this.flashEnemy(e);
          this.spawnFloatText(
            e.sprite.x,
            e.sprite.y - 16,
            `${Math.floor(dmg)}`,
            "#fb923c"
          );
          this.applyLifeSteal(derived, dmg * 0.1);
        }
        for (const e of [...laterTargets]) {
          if (e.hp <= 0) this.killEnemy(e);
        }
      });
    }
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

  private playPlayerAttackAnim() {
    const dx = this.heroDir === "left" ? -1 : this.heroDir === "right" ? 1 : 0;
    const dy = this.heroDir === "up" ? -1 : this.heroDir === "down" ? 1 : 0;
    this.tweens.killTweensOf(this.playerCircle);
    this.tweens.add({
      targets: this.playerCircle,
      x: this.playerCircle.x + dx * 4,
      y: this.playerCircle.y + dy * 4,
      scaleX: this.playerBaseScale * 1.18,
      scaleY: this.playerBaseScale * 0.92,
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
    dmgDealt: number
  ) {
    if (derived.lifeStealPct <= 0) return;
    const heal = dmgDealt * derived.lifeStealPct;
    if (heal <= 0.01) return;
    this.playerHp = Math.min(derived.hpMax, this.playerHp + heal);
  }

  private killEnemy(enemy: Enemy) {
    const ex = enemy.sprite.x;
    const ey = enemy.sprite.y;
    enemy.hpBarBg.setDepth(25);
    enemy.hpBarFill.setDepth(26);
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

    const drop = rollKillDrop(this.rng, this.save.stage, this.save.stageRepeat);
    this.save.gold += drop.gold;
    this.save.essence += drop.essence;
    this.save.reforgeStone += drop.reforgeStone;
    const res = applyExp(this.save.level, this.save.exp, drop.exp);
    this.save.level = res.level;
    this.save.exp = res.exp;
    if (res.leveledUp > 0) {
      this.save.skills.points += res.leveledUp;
      const msg = `升级：技能点 +${res.leveledUp}`;
      this.lastDropText = this.lastDropText
        ? `${this.lastDropText}；${msg}`
        : msg;
    }

    if (drop.equipment) {
      const looted = drop.equipment;
      this.save.inventory.push(looted);
      const equipped = this.tryAutoEquip(looted);
      this.trimInventory();
      const label = formatItemShort(equipped ?? looted);
      const dropText = `掉落：${label}${
        drop.reforgeStone ? "，重铸石 +1" : ""
      }`;
      this.lastDropText = this.lastDropText
        ? `${dropText}；${this.lastDropText}`
        : dropText;
      this.spawnFloatText(
        ex,
        ey - 20,
        label,
        rarityColor((equipped ?? looted).rarity)
      );
    }

    if (this.kills >= this.killsNeeded && this.enemies.length <= 0) {
      this.openStageClearOverlay();
    }
  }

  private tryAutoEquip(item: EquipmentItem) {
    const current = this.save.equipment[item.slot];
    if (!current || item.power > current.power * 1.02) {
      this.save.equipment[item.slot] = item;
      if (current) this.save.inventory.push(current);
      this.removeFromInventoryById(item.id);
      persistSave(this.save);
      return item;
    }
    persistSave(this.save);
    return undefined;
  }

  private removeFromInventoryById(id: string) {
    const idx = this.save.inventory.findIndex((it) => it.id === id);
    if (idx >= 0) this.save.inventory.splice(idx, 1);
  }

  private trimInventory() {
    const cap = 80;
    while (this.save.inventory.length > cap) {
      let minIndex = 0;
      let minPower = this.save.inventory[0]!.power;
      for (let i = 1; i < this.save.inventory.length; i++) {
        const p = this.save.inventory[i]!.power;
        if (p < minPower) {
          minPower = p;
          minIndex = i;
        }
      }
      const sold = this.save.inventory.splice(minIndex, 1)[0]!;
      const { gold, essence } = this.sellValue(sold);
      this.save.gold += gold;
      this.save.essence += essence;
    }
  }

  private sellValue(item: EquipmentItem) {
    const gold = Math.max(
      1,
      Math.floor(
        item.power * 0.12 + item.iLv * 3 + rarityRank(item.rarity) * 14
      )
    );
    const essence = 1 + rarityRank(item.rarity);
    return { gold, essence };
  }

  private spawnEnemy() {
    const { width, height } = this.scale;
    const areaW = this.mapW > 0 ? this.mapW : width;
    const areaH = this.mapH > 0 ? this.mapH : height;
    const edge = this.rng.int(0, 3);
    const pad = 10;
    const x =
      edge === 0 ? -pad : edge === 1 ? areaW + pad : this.rng.int(0, areaW);
    const y =
      edge === 2 ? -pad : edge === 3 ? areaH + pad : this.rng.int(0, areaH);

    const stage = this.save.stage;
    const isElite = this.rng.chance(0.08 + Math.min(0.12, stage * 0.0006));
    const baseHp = isElite ? 65 : 45;
    const baseAtk = isElite ? 10 : 7;
    const baseDef = isElite ? 4 : 2;

    const hpMax = enemyHpAtStage(stage, baseHp) * (isElite ? 1.7 : 1);
    const atk = enemyAtkAtStage(stage, baseAtk) * (isElite ? 1.25 : 1);
    const def = enemyDefAtStage(stage, baseDef);
    const speed = (isElite ? 70 : 85) + Math.min(55, stage * 0.3);

    const sprite = this.add.sprite(x, y, isElite ? "enemy_elite" : "enemy");
    sprite.setDepth(9);
    const barW = isElite ? 34 : 28;
    const barH = 6;
    const offsetY = isElite ? 22 : 18;
    const hpBarBg = this.add.rectangle(
      x,
      y - offsetY,
      barW,
      barH,
      0x0b1220,
      0.92
    );
    hpBarBg.setStrokeStyle(1, 0x334155, 1);
    const hpBarFill = this.add
      .rectangle(
        x - barW / 2 + 1,
        y - offsetY,
        barW - 2,
        barH - 2,
        isElite ? 0xf43f5e : 0x22c55e,
        1
      )
      .setOrigin(0, 0.5);
    hpBarBg.setDepth(20);
    hpBarFill.setDepth(21);
    const enemy: Enemy = {
      id: `${Date.now()}-${Math.floor(this.rng.next() * 1e9)}`,
      sprite,
      hp: hpMax,
      hpMax,
      atk,
      def,
      isElite,
      speed,
      attackCooldownMs: this.rng.int(80, 420),
      hpBarBg,
      hpBarFill,
    };
    this.enemies.push(enemy);
    this.updateEnemyHpBar(enemy);
  }

  private startStage() {
    this.clearOverlay();

    this.kills = 0;
    this.killsNeeded = 10 + this.save.stage * 2;
    this.spawnCooldownMs = 0;
    this.enemies.forEach((e) => {
      e.sprite.destroy();
      e.hpBarBg.destroy();
      e.hpBarFill.destroy();
    });
    this.enemies = [];

    const derived = computeDerivedPlayerStats(this.save);
    this.playerHp = Math.min(derived.hpMax, derived.hpMax);
    this.playerAttackCdMs = 0;
    this.activeCooldownMs = [900, 1400, 2000];
    this.ultimateCooldownMs = 6500;
    this.lastDropText = "";
    persistSave(this.save);
    this.updatePlayerHpBar();
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

    mk(12, 190, "下一关", () => this.advanceStage(1));
    mk(12, 214, "停留刷（衰减）", () => this.repeatStage());
    mk(12, 238, "背包/装备", () => this.openBackpackOverlay());
    mk(12, 262, "自动下一关：切换", () => {
      this.save.autoNext = !this.save.autoNext;
      persistSave(this.save);
    });
    mk(12, 286, "重置存档", () => {
      resetSave();
      this.save = loadSave();
      this.startStage();
    });
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
    if (this.overlay) return;
    persistSave(this.save);

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

    this.overlay = this.add.container(0, 0, [bg, panel, title, desc, retryBtn]);
    this.pinOverlay();
  }

  private clearOverlay() {
    this.overlay?.destroy(true);
    this.overlay = undefined;
  }

  private openBackpackOverlay() {
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
      .text(
        width * 0.5,
        height * 0.5 - 220,
        `装备背包  ${this.save.inventory.length}/80`,
        {
          fontFamily: "system-ui",
          fontSize: "18px",
          color: "#e2e8f0",
        }
      )
      .setOrigin(0.5, 0.5);

    const tabEquip = this.add
      .text(width * 0.5 - 400, height * 0.5 - 220, "装备", {
        fontFamily: "system-ui",
        fontSize: "14px",
        color: "#93c5fd",
        backgroundColor: "#1e293b",
        padding: { left: 10, right: 10, top: 6, bottom: 6 },
      })
      .setOrigin(0, 0.5)
      .setInteractive({ useHandCursor: true });

    const tabSkills = this.add
      .text(width * 0.5 - 330, height * 0.5 - 220, "技能", {
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

    const money = this.add
      .text(width * 0.5, height * 0.5 - 192, "", {
        fontFamily: "system-ui",
        fontSize: "13px",
        color: "#94a3b8",
      })
      .setOrigin(0.5, 0.5);

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
    const topY = height * 0.5 - 160;

    const equipTitle = this.add.text(leftX, topY, "已装备", {
      fontFamily: "system-ui",
      fontSize: "14px",
      color: "#e2e8f0",
    });

    const equipLines: Phaser.GameObjects.Text[] = [];
    const slots: Array<{ key: EquipmentItem["slot"]; label: string }> = [
      { key: "weapon", label: "武器" },
      { key: "helmet", label: "头盔" },
      { key: "armor", label: "护甲" },
      { key: "gloves", label: "手套" },
      { key: "boots", label: "靴子" },
      { key: "accessory", label: "饰品" },
    ];

    const setEquipLine = (i: number, text: string, color = "#e2e8f0") => {
      const y = topY + 26 + i * 22;
      const t =
        equipLines[i] ??
        this.add
          .text(leftX, y, "", {
            fontFamily: "system-ui",
            fontSize: "13px",
            color: "#e2e8f0",
          })
          .setInteractive({ useHandCursor: true });
      t.setText(text);
      t.setColor(color);
      equipLines[i] = t;
      return t;
    };

    const invX = width * 0.5 - 70;
    const invTitle = this.add.text(invX, topY, "背包（点击选择）", {
      fontFamily: "system-ui",
      fontSize: "14px",
      color: "#e2e8f0",
    });

    const invLines: Phaser.GameObjects.Text[] = [];
    const pageSize = 12;
    let page = 0;
    let selectedId: string | undefined;
    let selectedSource: "inv" | "equip" | undefined;

    const detailX = width * 0.5 + 250;
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
      wordWrap: { width: 320 },
    });

    const btnY = height * 0.5 + 150;
    const actionInfo = this.add.text(detailX, btnY - 56, "", {
      fontFamily: "system-ui",
      fontSize: "12px",
      color: "#94a3b8",
      wordWrap: { width: 320 },
    });

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

    const equipBtn = mkBtn(detailX, "穿戴/替换", () => {
      const item = getSelectedItem();
      if (!item) return;
      const equipped = this.save.equipment[item.slot];
      if (selectedSource === "equip") return;
      this.save.equipment[item.slot] = item;
      this.removeFromInventoryById(item.id);
      if (equipped) this.save.inventory.push(equipped);
      this.trimInventory();
      persistSave(this.save);
      selectedId = item.id;
      selectedSource = "equip";
      refresh();
    });

    const enhanceBtn = mkBtn(detailX + 120, "强化", () => {
      const item = getSelectedItem();
      if (!item) return;
      if (!canEnhance(item)) return;
      const cost = enhanceCost(item);
      if (this.save.gold < cost.gold || this.save.essence < cost.essence)
        return;
      this.save.gold -= cost.gold;
      this.save.essence -= cost.essence;
      applyEnhance(item);
      persistSave(this.save);
      refresh();
    });

    const reforgeBtn = mkBtn(detailX + 190, "重铸", () => {
      const item = getSelectedItem();
      if (!item) return;
      const cost = reforgeCost(item);
      if (
        this.save.gold < cost.gold ||
        this.save.reforgeStone < cost.reforgeStone
      )
        return;
      this.save.gold -= cost.gold;
      this.save.reforgeStone -= cost.reforgeStone;
      applyReforge(this.rng, item);
      persistSave(this.save);
      refresh();
    });

    const sellBtn = mkBtn(detailX + 260, "出售", () => {
      const item = getSelectedItem();
      if (!item) return;
      if (selectedSource === "equip") return;
      const { gold, essence } = this.sellValue(item);
      this.save.gold += gold;
      this.save.essence += essence;
      this.removeFromInventoryById(item.id);
      persistSave(this.save);
      selectedId = undefined;
      selectedSource = undefined;
      refresh();
    });

    const prevBtn = this.add
      .text(invX, height * 0.5 + 180, "上一页", {
        fontFamily: "system-ui",
        fontSize: "13px",
        color: "#e2e8f0",
        backgroundColor: "#1e293b",
        padding: { left: 10, right: 10, top: 6, bottom: 6 },
      })
      .setOrigin(0, 0.5)
      .setInteractive({ useHandCursor: true });
    prevBtn.on("pointerdown", () => {
      page = Math.max(0, page - 1);
      refresh();
    });

    const nextBtn = this.add
      .text(invX + 80, height * 0.5 + 180, "下一页", {
        fontFamily: "system-ui",
        fontSize: "13px",
        color: "#e2e8f0",
        backgroundColor: "#1e293b",
        padding: { left: 10, right: 10, top: 6, bottom: 6 },
      })
      .setOrigin(0, 0.5)
      .setInteractive({ useHandCursor: true });
    nextBtn.on("pointerdown", () => {
      page += 1;
      refresh();
    });

    const getSelectedItem = () => {
      if (!selectedId || !selectedSource) return undefined;
      if (selectedSource === "inv")
        return this.save.inventory.find((it) => it.id === selectedId);
      const all = Object.values(this.save.equipment).filter(
        Boolean
      ) as EquipmentItem[];
      return all.find((it) => it.id === selectedId);
    };

    const refresh = () => {
      title.setText(`装备背包  ${this.save.inventory.length}/80`);
      money.setText(
        `金币 ${Math.floor(this.save.gold)}   精华 ${Math.floor(
          this.save.essence
        )}   重铸石 ${Math.floor(this.save.reforgeStone)}`
      );

      for (let i = 0; i < slots.length; i++) {
        const slot = slots[i]!;
        const it = this.save.equipment[slot.key];
        const label = it
          ? `${slot.label}：${formatItemShort(it)}`
          : `${slot.label}：空`;
        const t = setEquipLine(
          i,
          label,
          it ? rarityColor(it.rarity) : "#94a3b8"
        );
        t.removeAllListeners("pointerdown");
        t.on("pointerdown", () => {
          if (!it) return;
          selectedId = it.id;
          selectedSource = "equip";
          refresh();
        });
      }

      const invSorted = [...this.save.inventory].sort(
        (a, b) => b.power - a.power
      );
      const pageCount = Math.max(1, Math.ceil(invSorted.length / pageSize));
      page = Phaser.Math.Clamp(page, 0, pageCount - 1);
      const start = page * pageSize;
      const slice = invSorted.slice(start, start + pageSize);

      for (let i = 0; i < pageSize; i++) {
        const y = topY + 26 + i * 20;
        const it = slice[i];
        const text = it
          ? `${start + i + 1}. ${formatItemShort(it)}  强度 ${Math.floor(
              it.power
            )}`
          : "";
        const line =
          invLines[i] ??
          this.add
            .text(invX, y, "", {
              fontFamily: "system-ui",
              fontSize: "12px",
              color: "#e2e8f0",
            })
            .setInteractive({ useHandCursor: true });
        invLines[i] = line;
        line.setText(text);
        line.setColor(it ? rarityColor(it.rarity) : "#e2e8f0");
        line.setAlpha(
          it && selectedSource === "inv" && selectedId === it.id
            ? 1
            : it
            ? 0.9
            : 1
        );
        line.removeAllListeners("pointerdown");
        if (it) {
          line.on("pointerdown", () => {
            selectedId = it.id;
            selectedSource = "inv";
            refresh();
          });
        }
      }

      const selected = getSelectedItem();
      if (!selected) {
        detailBody.setText("选择一件装备查看属性");
        actionInfo.setText("");
        equipBtn.setAlpha(0.6);
        enhanceBtn.setAlpha(0.6);
        reforgeBtn.setAlpha(0.6);
        sellBtn.setAlpha(0.6);
        return;
      }

      const lines = [
        formatItemShort(selected),
        `强度：${Math.floor(selected.power)}`,
        "",
        ...formatStatsLines(selected.stats),
      ];
      detailBody.setText(lines.join("\n"));

      const ec = enhanceCost(selected);
      const rc = reforgeCost(selected);
      actionInfo.setText(
        [
          selectedSource === "equip"
            ? "已装备：可以强化/重铸，不能出售"
            : "背包：可以穿戴/强化/重铸/出售",
          `强化消耗：金币 ${ec.gold}，精华 ${ec.essence}${
            canEnhance(selected) ? "" : "（已满级）"
          }`,
          `重铸消耗：金币 ${rc.gold}，重铸石 ${rc.reforgeStone}`,
          selectedSource === "inv"
            ? `出售获得：金币 ${this.sellValue(selected).gold}，精华 ${
                this.sellValue(selected).essence
              }`
            : "",
        ]
          .filter(Boolean)
          .join("\n")
      );

      equipBtn.setAlpha(selectedSource === "inv" ? 1 : 0.6);
      enhanceBtn.setAlpha(canEnhance(selected) ? 1 : 0.6);
      reforgeBtn.setAlpha(1);
      sellBtn.setAlpha(selectedSource === "inv" ? 1 : 0.6);
      invTitle.setText(`背包（第 ${page + 1}/${pageCount} 页）`);
    };

    refresh();
    this.overlay = this.add.container(0, 0, [
      bg,
      panel,
      title,
      tabEquip,
      tabSkills,
      money,
      closeBtn,
      equipTitle,
      invTitle,
      detailTitle,
      detailBody,
      actionInfo,
      equipBtn,
      enhanceBtn,
      reforgeBtn,
      sellBtn,
      prevBtn,
      nextBtn,
      ...equipLines,
      ...invLines,
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
      .text(width * 0.5 - 400, height * 0.5 - 220, "装备", {
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
      this.openBackpackOverlay();
    });

    const tabSkills = this.add
      .text(width * 0.5 - 330, height * 0.5 - 220, "技能", {
        fontFamily: "system-ui",
        fontSize: "14px",
        color: "#93c5fd",
        backgroundColor: "#1e293b",
        padding: { left: 10, right: 10, top: 6, bottom: 6 },
      })
      .setOrigin(0, 0.5)
      .setInteractive({ useHandCursor: true });

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

    const branchA = mkBtn(detailX + 90, "分支A", () => {
      if (!canSelectBranch(this.save, selected)) return;
      const def = getSkillDef(selected);
      if (def.branches.length < 1) return;
      this.save.skills.branches[selected] = def.branches[0]!.id;
      persistSave(this.save);
      refresh();
    });
    const branchB = mkBtn(detailX + 170, "分支B", () => {
      if (!canSelectBranch(this.save, selected)) return;
      const def = getSkillDef(selected);
      if (def.branches.length < 2) return;
      this.save.skills.branches[selected] = def.branches[1]!.id;
      persistSave(this.save);
      refresh();
    });

    const equip1 = mkBtn(detailX, "装1", () =>
      this.tryEquipSkillToSlot(selected, 0)
    );
    const equip2 = mkBtn(detailX + 60, "装2", () =>
      this.tryEquipSkillToSlot(selected, 1)
    );
    const equip3 = mkBtn(detailX + 120, "装3", () =>
      this.tryEquipSkillToSlot(selected, 2)
    );
    const equipU = mkBtn(detailX + 180, "装U", () =>
      this.tryEquipUltimate(selected)
    );

    equip1.setY(btnY + 44);
    equip2.setY(btnY + 44);
    equip3.setY(btnY + 44);
    equipU.setY(btnY + 44);

    const respecBtn = mkBtn(detailX + 250, "重置", () => {
      const spent = this.spentSkillPoints();
      this.save.skills.points += spent;
      this.save.skills.levels = { whirlwind: 1 };
      this.save.skills.branches = {};
      this.save.skills.equippedActives = ["whirlwind", null, null];
      this.save.skills.equippedUltimate = null;
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
        )} / ${this.formatActiveSlot(2)}   终极：${this.formatUltimateSlot()}`
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
      const canBr = canSelectBranch(this.save, selected);
      const unlocked = this.save.level >= def.unlockLevel;

      const branchLines =
        def.branches.length > 0
          ? def.branches.map(
              (b) => `${b.name}${b.description ? `：${b.description}` : ""}`
            )
          : [];
      detailTitle.setText(`${def.name}（${def.type}）`);
      detailBody.setText(
        skillPreviewLines(this.save, selected)
          .concat(branchLines.length ? ["", "分支可选：", ...branchLines] : [])
          .join("\n")
      );

      upgradeBtn.setAlpha(canUp ? 1 : 0.5);
      branchA.setText(
        def.branches[0] ? `分支：${def.branches[0].name}` : "分支A"
      );
      branchB.setText(
        def.branches[1] ? `分支：${def.branches[1].name}` : "分支B"
      );
      branchA.setAlpha(canBr && def.branches.length >= 1 ? 1 : 0.5);
      branchB.setAlpha(canBr && def.branches.length >= 2 ? 1 : 0.5);

      const isActive = def.type === "active";
      const isUltimate = def.type === "ultimate";
      equip1.setAlpha(isActive && lv > 0 ? 1 : 0.4);
      equip2.setAlpha(isActive && lv > 0 ? 1 : 0.4);
      equip3.setAlpha(isActive && lv > 0 ? 1 : 0.4);
      equipU.setAlpha(isUltimate && lv > 0 ? 1 : 0.4);

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
      closeBtn,
      points,
      equipInfo,
      listTitle,
      detailTitle,
      detailBody,
      upgradeBtn,
      branchA,
      branchB,
      equip1,
      equip2,
      equip3,
      equipU,
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

  private tryEquipUltimate(id: SkillId) {
    const def = getSkillDef(id);
    if (def.type !== "ultimate") return;
    if (skillLevel(this.save, id) <= 0) return;
    this.save.skills.equippedUltimate = id as UltimateSkillId;
    persistSave(this.save);
    this.clearOverlay();
    this.openSkillsOverlay();
  }

  private formatActiveSlot(i: number) {
    const id = this.save.skills.equippedActives[i];
    return id ? getSkillDef(id).name : "空";
  }

  private formatUltimateSlot() {
    const id = this.save.skills.equippedUltimate;
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
    this.startStage();
  }

  private repeatStage() {
    this.save.stageRepeat += 1;
    persistSave(this.save);
    this.startStage();
  }

  private updateUi() {
    const derived = computeDerivedPlayerStats(this.save);
    const req = requiredExpForNextLevel(this.save.level);
    const expPct = req <= 0 ? 0 : (this.save.exp / req) * 100;
    const hpPct =
      derived.hpMax <= 0 ? 0 : (this.playerHp / derived.hpMax) * 100;

    this.uiLeft.setText(
      [
        `关卡：${this.save.stage}  (重复 ${this.save.stageRepeat})`,
        `目标：${this.kills}/${this.killsNeeded}`,
        `等级：${this.save.level}  EXP：${
          this.save.exp
        }/${req} (${expPct.toFixed(1)}%)`,
        `金币：${Math.floor(this.save.gold)}`,
        `精华：${Math.floor(this.save.essence)}  重铸石：${Math.floor(
          this.save.reforgeStone
        )}`,
        `技能点：${this.save.skills.points}`,
        `背包：${this.save.inventory.length}/80`,
        `自动下一关：${this.save.autoNext ? "开" : "关"}`,
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
        derived.lifeStealPct > 0
          ? `吸血：${(derived.lifeStealPct * 100).toFixed(1)}%`
          : "",
      ]
        .filter(Boolean)
        .join("\n")
    );

    this.uiBottom.setText(
      [
        this.lastDropText || "击杀掉落会进背包；更强的同槽位装备会自动替换",
        "提示：停留刷关会有收益衰减，推进关卡掉落/经验更高",
      ].join("\n")
    );
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
      y: y - 26,
      alpha: 0,
      duration: 720,
      ease: "Cubic.easeOut",
      onComplete: () => t.destroy(),
    });
  }
}
