import Phaser from "phaser";
import { OverlayBase } from "./OverlayBase";
import type { PlayerSave } from "../../model/types";
import {
  calcSingleGold,
  calcPeakGold,
  computeDerivedPlayerStats,
} from "../../logic/playerStats";
import { persistSave } from "../../storage/save";

export class RoleOverlay extends OverlayBase {
  private save: PlayerSave;
  private onOpenSkills: () => void;
  private berserkMs: number;
  private shieldWallMs: number;
  private berserkLifeStealBonusPct: number;

  constructor(
    scene: Phaser.Scene,
    save: PlayerSave,
    onOpenSkills: () => void,
    berserkMs: number,
    shieldWallMs: number,
    berserkLifeStealBonusPct: number
  ) {
    super(scene);
    this.save = save;
    this.onOpenSkills = onOpenSkills;
    this.berserkMs = berserkMs;
    this.shieldWallMs = shieldWallMs;
    this.berserkLifeStealBonusPct = berserkLifeStealBonusPct;
  }

  show() {
    if (this.overlay) return;

    const { width, height } = this.scene.scale;
    const bg = this.createBackground();
    const panel = this.createPanel(720, 360, 0.98);

    const title = this.scene.add
      .text(width * 0.5, height * 0.5 - 150, "角色", {
        fontFamily: "system-ui",
        fontSize: "18px",
        color: "#e2e8f0",
      })
      .setOrigin(0.5, 0.5);

    const tabRole = this.scene.add
      .text(width * 0.5 - 320, height * 0.5 - 150, "角色", {
        fontFamily: "system-ui",
        fontSize: "14px",
        color: "#93c5fd",
        backgroundColor: "#0f172a",
        padding: { left: 10, right: 10, top: 6, bottom: 6 },
      })
      .setOrigin(0, 0.5)
      .setInteractive({ useHandCursor: true });

    const tabSkills = this.scene.add
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
      this.close();
      this.onOpenSkills();
    });

    const roleTabBorder = this.scene.add.rectangle(
      tabRole.x + tabRole.width / 2,
      tabRole.y,
      tabRole.width + 8,
      tabRole.height + 8,
      0x000000,
      0
    );
    roleTabBorder.setStrokeStyle(1, 0x93c5fd, 1);

    const closeBtn = this.createButton(
      width * 0.5 + 350,
      height * 0.5 - 150,
      "关闭",
      () => this.close()
    );
    closeBtn.setOrigin(1, 0.5);

    const leftX = width * 0.5 - 320;
    const topY = height * 0.5 - 110;

    const info = this.scene.add.text(leftX, topY, "", {
      fontFamily: "system-ui",
      fontSize: "14px",
      color: "#e2e8f0",
    });

    const statsText = this.scene.add.text(leftX, topY + 28, "", {
      fontFamily: "system-ui",
      fontSize: "13px",
      color: "#94a3b8",
    });

    const nextStatsText = this.scene.add.text(leftX + 240, topY + 28, "", {
      fontFamily: "system-ui",
      fontSize: "13px",
      color: "#93c5fd",
    });

    const costText = this.scene.add.text(leftX, topY + 140, "", {
      fontFamily: "system-ui",
      fontSize: "12px",
      color: "#94a3b8",
    });

    const btnY = height * 0.5 + 120;

    const enhanceBtn = this.createButton(
      width * 0.5 + 40,
      btnY,
      "升级装备等级",
      () => {
        const nextLv = (this.save.gearLevel ?? 1) + 1;
        const cost = calcSingleGold(nextLv);
        if (this.save.gold < cost) return;
        this.save.gold -= cost;
        this.save.totalGoldSpent += cost;
        this.save.gearLevel = nextLv;
        persistSave(this.save);
        refresh();
      }
    );
    enhanceBtn.setOrigin(0, 0.5);

    const peakBtn = this.createButton(
      width * 0.5 + 170,
      btnY,
      "升级巅峰等级",
      () => {
        const nextPeak = (this.save.peakTier ?? 0) + 1;
        const cost = calcPeakGold(nextPeak);
        if (this.save.gold < cost) return;
        this.save.gold -= cost;
        this.save.totalGoldSpent += cost;
        this.save.peakTier = nextPeak;
        persistSave(this.save);
        refresh();
      }
    );
    peakBtn.setOrigin(0, 0.5);

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

    this.overlay = this.scene.add.container(0, 0, [
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
}
