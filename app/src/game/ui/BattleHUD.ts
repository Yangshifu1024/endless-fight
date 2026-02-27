import Phaser from "phaser";
import type { Enemy } from "../model/Enemy";
import type { PlayerSave } from "../model/types";
import { computeDerivedPlayerStats } from "../logic/playerStats";
import { requiredExpForNextLevel } from "../logic/progression";

export class BattleHUD {
  private scene: Phaser.Scene;
  private uiLeft!: Phaser.GameObjects.Text;
  private uiRight!: Phaser.GameObjects.Text;
  private uiBottom!: Phaser.GameObjects.Text;
  private uiTop!: Phaser.GameObjects.Text;
  private uiBottomFight!: Phaser.GameObjects.Text;
  private uiBottomSkill!: Phaser.GameObjects.Text;
  private uiBottomDefense!: Phaser.GameObjects.Text;

  private playerHpBarBg!: Phaser.GameObjects.Rectangle;
  private playerHpBarFill!: Phaser.GameObjects.Rectangle;

  private combatLog: string[] = [];
  private defenseLog: string[] = [];
  private skillLog: string[] = [];

  private uiButtons: Phaser.GameObjects.Text[] = [];

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  create(
    save: PlayerSave,
    callbacks: {
      onToggleAutoNext: () => void;
      onToggleAutoRetry: () => void;
      onToggleShowLogs: () => void;
      onOpenRole: () => void;
      onOpenSkills: () => void;
      onResetSave: () => void;
    }
  ) {
    const { width, height } = this.scene.scale;

    this.createButtons(save, callbacks);

    this.uiLeft = this.scene.add.text(12, 10, "", {
      fontFamily: "system-ui",
      fontSize: "14px",
      color: "#e2e8f0",
    });

    this.uiRight = this.scene.add
      .text(width - 12, 10, "", {
        fontFamily: "system-ui",
        fontSize: "14px",
        color: "#e2e8f0",
        align: "right",
      })
      .setOrigin(1, 0);

    this.uiBottom = this.scene.add
      .text(12, height - 12, "", {
        fontFamily: "system-ui",
        fontSize: "14px",
        color: "#94a3b8",
      })
      .setOrigin(0, 1);

    this.pinToScreen(this.uiLeft);
    this.pinToScreen(this.uiRight);
    this.pinToScreen(this.uiBottom);

    this.uiBottomFight = this.scene.add
      .text(12, height - 12, "", {
        fontFamily: "system-ui",
        fontSize: "13px",
        color: "#94a3b8",
        align: "left",
      })
      .setOrigin(0, 1);

    this.uiBottomSkill = this.scene.add
      .text(width * 0.5, height - 12, "", {
        fontFamily: "system-ui",
        fontSize: "13px",
        color: "#94a3b8",
        align: "center",
      })
      .setOrigin(0.5, 1);

    this.uiBottomDefense = this.scene.add
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

    this.uiTop = this.scene.add
      .text(width * 0.5, 6, "", {
        fontFamily: "system-ui",
        fontSize: "13px",
        color: "#ffffff",
        align: "center",
      })
      .setOrigin(0.5, 0);
    this.pinToScreen(this.uiTop);
  }

  refreshButtons(save: PlayerSave, callbacks: any) {
    for (const t of this.uiButtons) t.destroy();
    this.uiButtons = [];
    this.createButtons(save, callbacks);
  }

  private createButtons(
    save: PlayerSave,
    callbacks: {
      onToggleAutoNext: () => void;
      onToggleAutoRetry: () => void;
      onToggleShowLogs: () => void;
      onOpenRole: () => void;
      onOpenSkills: () => void;
      onResetSave: () => void;
    }
  ) {
    const mk = (x: number, y: number, text: string, onClick: () => void) => {
      const t = this.scene.add
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
        `自动下一关：${save.autoNext ? "开" : "关"}`,
        () => {
          callbacks.onToggleAutoNext();
          t.setText(`自动下一关：${save.autoNext ? "开" : "关"}`);
          t.setColor(save.autoNext ? "#22c55e" : "#ef4444");
        }
      );
      t.setColor(save.autoNext ? "#22c55e" : "#ef4444");
      t.removeAllListeners("pointerover");
      t.removeAllListeners("pointerout");
      t.on("pointerover", () =>
        t.setColor(save.autoNext ? "#4ade80" : "#f87171")
      );
      t.on("pointerout", () =>
        t.setColor(save.autoNext ? "#22c55e" : "#ef4444")
      );
    }
    {
      const t = mk(
        12,
        214,
        `自动重开：${save.autoRetry ? "开" : "关"}`,
        () => {
          callbacks.onToggleAutoRetry();
          t.setText(`自动重开：${save.autoRetry ? "开" : "关"}`);
          t.setColor(save.autoRetry ? "#22c55e" : "#ef4444");
        }
      );
      t.setColor(save.autoRetry ? "#22c55e" : "#ef4444");
      t.removeAllListeners("pointerover");
      t.removeAllListeners("pointerout");
      t.on("pointerover", () =>
        t.setColor(save.autoRetry ? "#4ade80" : "#f87171")
      );
      t.on("pointerout", () =>
        t.setColor(save.autoRetry ? "#22c55e" : "#ef4444")
      );
    }
    {
      const t = mk(
        12,
        238,
        `显示日志：${save.showLogs ? "开" : "关"}`,
        () => {
          callbacks.onToggleShowLogs();
          t.setText(`显示日志：${save.showLogs ? "开" : "关"}`);
          t.setColor(save.showLogs ? "#22c55e" : "#ef4444");
        }
      );
      t.setColor(save.showLogs ? "#22c55e" : "#ef4444");
      t.removeAllListeners("pointerover");
      t.removeAllListeners("pointerout");
      t.on("pointerover", () =>
        t.setColor(save.showLogs ? "#4ade80" : "#f87171")
      );
      t.on("pointerout", () =>
        t.setColor(save.showLogs ? "#22c55e" : "#ef4444")
      );
    }

    const { width, height } = this.scene.scale;
    const roleBtn = mk(width - 12, height - 56, "角色", callbacks.onOpenRole);
    roleBtn.setOrigin(1, 1);
    const skillsBtn = mk(width - 12, height - 32, "技能", callbacks.onOpenSkills);
    skillsBtn.setOrigin(1, 1);
    const resetBtn = mk(width - 12, height - 8, "重置存档", callbacks.onResetSave);
    resetBtn.setOrigin(1, 1);
  }

  private pinToScreen(go: Phaser.GameObjects.GameObject) {
    const anyGo = go as any;
    if (typeof anyGo.setScrollFactor === "function") anyGo.setScrollFactor(0);
    if (typeof anyGo.setDepth === "function") anyGo.setDepth(2000);
  }

  private layoutBottomLogs() {
    const { width, height } = this.scene.scale;
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

  createPlayerHpBar(playerCircle: Phaser.GameObjects.Sprite) {
    if (this.playerHpBarBg) this.playerHpBarBg.destroy();
    if (this.playerHpBarFill) this.playerHpBarFill.destroy();

    this.playerHpBarBg = this.scene.add.rectangle(
      playerCircle.x,
      playerCircle.y - 24,
      40,
      6,
      0x000000,
      0.8
    );
    this.playerHpBarFill = this.scene.add.rectangle(
      playerCircle.x - 20 + 1,
      playerCircle.y - 24,
      38,
      4,
      0x22c55e
    );
    this.playerHpBarBg.setDepth(30);
    this.playerHpBarFill.setDepth(31);
  }

  updatePlayerHpBar(playerCircle: Phaser.GameObjects.Sprite, hp: number, hpMax: number) {
    if (!this.playerHpBarBg || !this.playerHpBarFill) return;
    const pct = Phaser.Math.Clamp(hpMax <= 0 ? 0 : hp / hpMax, 0, 1);
    const barW = this.playerHpBarBg.width;
    const y = playerCircle.y - 24;
    this.playerHpBarBg.setPosition(playerCircle.x, y);
    this.playerHpBarFill.setPosition(playerCircle.x - barW / 2 + 1, y);
    this.playerHpBarFill.setScale(pct, 1);
    this.playerHpBarFill.setFillStyle(
      pct <= 0.3 ? 0xef4444 : pct <= 0.6 ? 0xf59e0b : 0x22c55e,
      1
    );
  }

  updateEnemyHpBar(e: Enemy) {
    const pct = Phaser.Math.Clamp(e.hpMax <= 0 ? 0 : e.hp / e.hpMax, 0, 1);
    const barW = e.hpBarW;
    const y = e.sprite.y - e.hpBarOffsetY;
    e.hpBarBg.setPosition(e.sprite.x, y);
    e.hpBarFill.setPosition(e.sprite.x - barW / 2 + 1, y);
    e.hpBarFill.setScale(pct, 1);
  }

  pushCombatLog(msg: string) {
    this.combatLog.unshift(msg);
    if (this.combatLog.length > 10)
      this.combatLog = this.combatLog.slice(0, 10);
  }

  pushDefenseLog(msg: string) {
    this.defenseLog.unshift(msg);
    if (this.defenseLog.length > 10)
      this.defenseLog = this.defenseLog.slice(0, 10);
  }

  pushSkillLog(msg: string) {
    this.skillLog.unshift(msg);
    if (this.skillLog.length > 10) this.skillLog = this.skillLog.slice(0, 10);
  }

  updateUi(
    save: PlayerSave,
    playerHp: number,
    kills: number,
    killsNeeded: number,
    playerCircle: Phaser.GameObjects.Sprite,
    berserkMs: number,
    shieldWallMs: number,
    berserkLifeStealBonusPct: number,
    stageAtkSpeedMult: number,
    stageCritBonus: number
  ) {
    const derived = computeDerivedPlayerStats(save);
    // Apply stage modifiers
    const spdMult = Math.max(1, Math.min(2, stageAtkSpeedMult));
    derived.attackIntervalMs = Math.max(80, Math.floor(derived.attackIntervalMs / spdMult));
    derived.critChance = Math.min(1, derived.critChance + Math.max(0, stageCritBonus));
    const cam = this.scene.cameras.main;
    const mid = cam.scrollX + cam.width * 0.5;
    const onRight = playerCircle.x >= mid;
    if (onRight) {
      derived.atk = derived.atk * 1.5;
    } else {
      derived.def = derived.def * 1.5;
    }

    const req = requiredExpForNextLevel(save.level);
    const expPct = (save.exp / req) * 100;
    const hpPct = (playerHp / derived.hpMax) * 100;

    this.uiLeft.setText(
      [
        `关卡：${save.stage}  (重复 ${save.stageRepeat})`,
        `目标：${kills}/${killsNeeded}`,
        `等级：${save.level}  EXP：${
          save.exp
        }/${req} (${expPct.toFixed(1)}%)`,
        `金币：${Math.floor(save.gold)}`,
        `装备等级：${save.gearLevel}  巅峰：${save.peakTier}`,
        `技能点：${save.skills.points}`,
      ].join("\n")
    );

    this.uiRight.setText(
      [
        `HP：${Math.floor(playerHp)}/${Math.floor(
          derived.hpMax
        )} (${hpPct.toFixed(0)}%)`,
        `ATK：${Math.floor(derived.atk)}  DEF：${Math.floor(derived.def)}`,
        `攻速：${(1000 / derived.attackIntervalMs).toFixed(2)}/s`,
        `暴击：${(derived.critChance * 100).toFixed(
          1
        )}%  x${derived.critDamage.toFixed(2)}`,
        (() => {
          return onRight ? "位置增益：攻击 +50%" : "位置增益：防御 +50%";
        })(),
        (() => {
          const ls = Math.max(
            0,
            derived.lifeStealPct + (berserkLifeStealBonusPct || 0)
          );
          if (ls <= 0) return "";
          const tag =
            berserkMs > 0
              ? `（狂暴 ${Math.max(0, berserkMs / 1000).toFixed(1)}s）`
              : "";
          return `吸血：${(ls * 100).toFixed(1)}%${tag}`;
        })(),
        (() => {
          const thornsPct =
            (shieldWallMs > 0 ? 1 : derived.thornsPct) * 100;
          const tag =
            shieldWallMs > 0
              ? `（盾墙 ${Math.max(0, shieldWallMs / 1000).toFixed(1)}s）`
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
    const show = !!save.showLogs;
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

  setTopText(text: string) {
    this.uiTop.setText(text);
  }

  spawnFloatText(x: number, y: number, text: string, color: string) {
    const t = this.scene.add.text(x, y, text, {
      fontFamily: "system-ui",
      fontSize: "12px",
      color,
      stroke: "#0b1020",
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
}
