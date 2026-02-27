import Phaser from "phaser";
import {
  computeDerivedPlayerStats,
} from "../logic/playerStats";
import type { ActiveSkillId, PlayerSave, SkillId } from "../model/types";
import {
  getSkillDef,
  skillLevel,
} from "../skills/skills";
import { loadSave, persistSave, resetSave } from "../storage/save";
import { BattleHUD } from "./BattleHUD";
import { StageClearOverlay } from "./overlays/StageClearOverlay";
import { DefeatOverlay } from "./overlays/DefeatOverlay";
import { RoleOverlay } from "./overlays/RoleOverlay";
import { SkillsOverlay } from "./overlays/SkillsOverlay";

import { MapSystem } from "../systems/MapSystem";
import { EnemySystem } from "../systems/EnemySystem";
import { PlayerSystem } from "../systems/PlayerSystem";
import { CombatSystem } from "../systems/CombatSystem";

export class BattleScene extends Phaser.Scene {
  private save!: PlayerSave;
  // private rng ... (Moved)
  private mapSystem!: MapSystem;
  private enemySystem!: EnemySystem;
  private playerSystem!: PlayerSystem;
  private combatSystem!: CombatSystem;

  private get playerCircle() {
    return this.playerSystem.playerCircle;
  }

  private get playerHp() {
    return this.playerSystem.playerHp;
  }

  private set playerHp(val: number) {
    this.playerSystem.hp = val;
  }

  // private get playerBaseScale() { ... } // Removed
  // private get dashLockMs() { ... } // Removed
  // private set dashLockMs(val: number) { ... } // Removed
  // private get chargeImmuneMs() { ... } // Removed
  // private set chargeImmuneMs(val: number) { ... } // Removed

  private get berserkMs() {
      return this.playerSystem.isBerserk ? 1 : 0;
  }
  
  private get berserkLifeStealBonusPct() {
      return this.playerSystem.berserkBonus;
  }

  private get shieldWallMs() {
      return this.playerSystem.isShieldWall ? 1 : 0;
  }
  
  // private activeCooldownMs ... (Moved)
  // private playerAnimT ... (Moved)
  // private attackAnimMs ... (Moved)
  // private heroDir ... (Moved)
  private laneY = 0;
  private heroStartX = 0;

  // private get enemies() { ... } // Removed
  
  // private get kills() { ... } // Removed

  // private set kills(_val: number) { ... } // Removed

  // private get killsNeeded() { ... } // Removed

  // private set killsNeeded(_val: number) { ... } // Removed
  // private dashLockMs ... (Moved)
  // private chargeImmuneMs ... (Moved)

  private hud!: BattleHUD;
  // private uiButtons ... (Moved)
  
  private stageClearOverlay?: StageClearOverlay;
  private defeatOverlay?: DefeatOverlay;
  private roleOverlay?: RoleOverlay;
  private skillsOverlay?: SkillsOverlay;
  
  private get overlay() {
    return (
      (this.stageClearOverlay?.isOpen() ||
        this.defeatOverlay?.isOpen() ||
        this.roleOverlay?.isOpen() ||
        this.skillsOverlay?.isOpen()) ??
      false
    );
  }

  // private recoveryTickerMs ... (Moved)
  private stageAtkSpeedMult = 1;
  private stageCritBonus = 0;
  private isDefeated = false;
  // private activeCastLockMs ... (Moved)

  // private keys ... (Moved)

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
    this.load.image(
      "dungeon1_block1",
      "/assets/map/dungeon1/platformBlock1.png"
    );
    this.load.image("dungeon1_platform1", "/assets/map/dungeon1/platform1.png");
    this.load.image("dungeon1_exit", "/assets/map/dungeon1/exit.png");
    this.load.image("dungeon1_sign", "/assets/map/dungeon1/sign.png");
    this.load.image("dungeon1_torch", "/assets/map/dungeon1/torch.png");
    this.load.image("dungeon1_window", "/assets/map/dungeon1/window1.png");
    this.load.tilemapTiledJSON(
      "dungeon1_map",
      "/assets/map/dungeon1/dungeon1.json"
    );
  }

  create() {
    this.save = loadSave();
    
    this.ensureActorTextures();
    this.mapSystem = new MapSystem(this);
    this.mapSystem.create(this.save.stage);

    const pad = 12 + 20; // default base scale 1 approx
    const heroStartX = pad;
    const mapH = this.mapSystem.height;
    const heroStartY = mapH > 0 ? mapH * 0.6 : this.scale.height * 0.6;
    this.heroStartX = heroStartX;
    this.laneY = heroStartY;
    
    this.hud = new BattleHUD(this);
    // this.hud.create(); (Moved to createButtons)

    this.enemySystem = new EnemySystem(this, this.hud);
    this.playerSystem = new PlayerSystem(this, this.save, this.mapSystem, this.enemySystem, this.hud);
    // this.playerSystem.init(this.laneY, this.heroStartX); (Moved to startStage)
    
    this.combatSystem = new CombatSystem(this, this.playerSystem, this.enemySystem, this.hud, this.save);

    // this.hud.createPlayerHpBar(this.playerCircle); (Moved to startStage)

    this.createButtons();
    
    this.events.on("enemy-killed", () => {
      this.stageAtkSpeedMult = Math.min(2, this.stageAtkSpeedMult + 0.2);
      this.stageCritBonus = Math.min(1, this.stageCritBonus + 0.05);
    });

    this.startStage();
    this.events.on(Phaser.Scenes.Events.SHUTDOWN, () => {
      persistSave(this.save);
    });
  }

  // private pinToScreen(go: Phaser.GameObjects.GameObject) { ... } // Moved to BattleHUD

  private refreshButtons() {
    this.hud.refreshButtons(this.save, {
      onToggleAutoNext: () => {
        this.save.autoNext = !this.save.autoNext;
        persistSave(this.save);
      },
      onToggleAutoRetry: () => {
        this.save.autoRetry = !this.save.autoRetry;
        persistSave(this.save);
      },
      onToggleShowLogs: () => {
        this.save.showLogs = !this.save.showLogs;
        persistSave(this.save);
      },
      onOpenRole: () => this.openRoleOverlay(),
      onOpenSkills: () => this.openSkillsOverlay(),
      onResetSave: () => {
        const ok =
          typeof window !== "undefined"
            ? window.confirm("确认重置存档？此操作不可撤销")
            : true;
        if (!ok) return;
        resetSave();
        this.save = loadSave();
        this.startStage();
        this.refreshButtons();
      },
    });
  }

  // private pushCombatLog(msg: string) { ... } // Removed
  // private pushDefenseLog(msg: string) { ... } // Removed
  // private pushSkillLog(msg: string) { ... } // Removed

  // private createHeroAnims() { ... } // Removed: Handled by PlayerSystem
  // private updateHeroAnim(...) { ... } // Removed: Handled by PlayerSystem

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
    // this.attackAnimMs ... (Moved)
    // this.chargeImmuneMs ... (Moved)
    // this.updatePlayer(dt); (Removed)
    this.playerSystem.update(dt, this.overlay, this.isDefeated, this.stageAtkSpeedMult, this.stageCritBonus);
    this.enemySystem.update(dt, this.playerCircle.x, this.save.stage, this.isDefeated, this.overlay);
    
    const result = this.combatSystem.update(dt, this.isDefeated || this.overlay);
    if (result === "victory") {
      this.openStageClearOverlay();
    } else if (result === "defeat") {
      this.openDefeatOverlay();
    }
    
    // UI Updates
    const derived = this.getDerived();
    this.hud.updatePlayerHpBar(this.playerCircle, this.playerHp, derived.hpMax);
    
    this.hud.updateUi(
      this.save,
      this.playerHp,
      this.enemySystem.killCount,
      this.enemySystem.requiredKills,
      this.playerCircle,
      this.berserkMs,
      this.shieldWallMs,
      this.berserkLifeStealBonusPct,
      this.stageAtkSpeedMult,
      this.stageCritBonus
    );
  }

  // private updatePlayer(dt: number) { ... } // Removed: Handled by PlayerSystem

  // private updateEnemies(dt: number) { ... } // Removed: Handled by EnemySystem
  // private updateSpawns(dt: number) { ... } // Removed: Handled by EnemySystem

  // private updateCombat(_dt: number) { ... } // Removed: Handled by CombatSystem

  // private playerAttack(...) { ... } // Removed: Handled by PlayerSystem
  // private updateSkillCasting(...) { ... } // Removed: Handled by PlayerSystem
  // private castActiveSkill(...) { ... } // Removed: Handled by PlayerSystem
  // private castWhirlwindSkill(...) { ... } // Removed: Handled by PlayerSystem

  // private castBerserkSkill(...) { ... } // Removed: Handled by PlayerSystem
  // private castShieldWallSkill(...) { ... } // Removed: Handled by PlayerSystem
  // private castThunderSkill(...) { ... } // Removed: Handled by PlayerSystem
  // private castChargeSkill(...) { ... } // Removed: Handled by PlayerSystem
  // private dealChargeDamage(...) { ... } // Removed: Handled by PlayerSystem
  // private applyStunFx(...) { ... } // Removed: Handled by PlayerSystem


  // private findNearestEnemy() { ... } // Removed: Handled by PlayerSystem/EnemySystem
  // private findNearestEnemyTo(...) { ... } // Removed: Handled by EnemySystem
  // private playPlayerAttackAnim(...) { ... } // Removed: Handled by PlayerSystem
  // private flashEnemy(...) { ... } // Removed: Handled by PlayerSystem
  // private applyLifeSteal(...) { ... } // Removed: Handled by PlayerSystem


  // private killEnemy(enemy: Enemy) { ... } // Removed: Handled by CombatSystem

  // private spawnEnemy() { ... } // Removed

  // private createEnemy(params: { ... }) { ... } // Removed

  private startStage() {
    this.clearOverlay();

    this.enemySystem.init(this.save.stage, this.laneY);
    this.playerSystem.init(this.laneY, this.heroStartX);
    
    // Setup camera follow
    if (this.mapSystem.width > 0 && this.mapSystem.height > 0) {
      this.cameras.main.startFollow(this.playerCircle, true, 0.12, 0.12);
      this.cameras.main.setBounds(0, 0, this.mapSystem.width, this.mapSystem.height);
    }
    
    // Create/Update HUD HP Bar
    this.hud.createPlayerHpBar(this.playerCircle);

    const derived = this.getDerived();
    
    this.stageAtkSpeedMult = 1;
    this.stageCritBonus = 0;
    this.isDefeated = false;
    
    persistSave(this.save);
    this.hud.updatePlayerHpBar(this.playerCircle, this.playerHp, derived.hpMax);
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
    this.hud.create(this.save, {
      onToggleAutoNext: () => {
        this.save.autoNext = !this.save.autoNext;
        persistSave(this.save);
      },
      onToggleAutoRetry: () => {
        this.save.autoRetry = !this.save.autoRetry;
        persistSave(this.save);
      },
      onToggleShowLogs: () => {
        this.save.showLogs = !this.save.showLogs;
        persistSave(this.save);
      },
      onOpenRole: () => this.openRoleOverlay(),
      onOpenSkills: () => this.openSkillsOverlay(),
      onResetSave: () => {
        const ok =
          typeof window !== "undefined"
            ? window.confirm("确认重置存档？此操作不可撤销")
            : true;
        if (!ok) return;
        resetSave();
        this.save = loadSave();
        this.startStage();
        this.refreshButtons();
      },
    });
  }

  private openStageClearOverlay() {
    if (this.overlay) return;
    this.stageClearOverlay = new StageClearOverlay(
      this,
      this.save,
      () => this.advanceStage(1),
      () => this.repeatStage()
    );
    this.stageClearOverlay.show();
  }

  private openDefeatOverlay() {
    if (this.overlay || this.isDefeated) return;
    persistSave(this.save);
    this.isDefeated = true;
    this.playerSystem.playDefeatAnim();
    const show = () => {
      if (this.overlay) return;
      this.defeatOverlay = new DefeatOverlay(this, this.save, () =>
        this.startStage()
      );
      this.defeatOverlay.show();
    };
    this.time.delayedCall(1000, () => {
      if (this.overlay) return;
      show();
    });
  }
  private clearOverlay() {
    this.stageClearOverlay?.close();
    this.stageClearOverlay = undefined;
    this.defeatOverlay?.close();
    this.defeatOverlay = undefined;
    this.roleOverlay?.close();
    this.roleOverlay = undefined;
    this.skillsOverlay?.close();
    this.skillsOverlay = undefined;
  }

  private openRoleOverlay() {
    if (this.overlay) return;
    this.roleOverlay = new RoleOverlay(
      this,
      this.save,
      () => this.openSkillsOverlay(),
      this.berserkMs,
      this.shieldWallMs,
      this.berserkLifeStealBonusPct
    );
    this.roleOverlay.show();
  }

  private openSkillsOverlay() {
    if (this.overlay) return;
    this.skillsOverlay = new SkillsOverlay(
      this,
      this.save,
      () => this.openRoleOverlay(),
      (id, slotIndex) => this.tryEquipSkillToSlot(id, slotIndex)
    );
    this.skillsOverlay.show();
  }

  private tryEquipSkillToSlot(id: SkillId, slotIndex: number) {
    const def = getSkillDef(id);
    if (def.type !== "active") return;
    if (skillLevel(this.save, id) <= 0) return;
    const actives = [...this.save.skills.equippedActives];
    actives[slotIndex] = id as ActiveSkillId;
    this.save.skills.equippedActives = actives;
    persistSave(this.save);
    
    // Close existing overlay if any
    if (this.skillsOverlay) {
        this.skillsOverlay.close();
        this.skillsOverlay = undefined;
    }
    
    this.openSkillsOverlay();
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

  // private spawnFloatText(...) { ... } // Removed: Handled by PlayerSystem/BattleHUD
}
