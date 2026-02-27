import Phaser from "phaser";
import { OverlayBase } from "./OverlayBase";
import type { PlayerSave, SkillId } from "../../model/types";
import {
  allSkills,
  getSkillDef,
  skillLevel,
  skillBranch,
  canLearnOrUpgrade,
} from "../../skills/skills";
import {
  skillPreviewLines,
  whirlwindParams,
  chargeParams,
  thunderParams,
  berserkParams,
  shieldWallParams,
} from "../../skills/effects";
import { persistSave } from "../../storage/save";

export class SkillsOverlay extends OverlayBase {
  private save: PlayerSave;
  private onOpenRole: () => void;
  private onEquip: (id: SkillId, slotIndex: number) => void;

  constructor(
    scene: Phaser.Scene,
    save: PlayerSave,
    onOpenRole: () => void,
    onEquip: (id: SkillId, slotIndex: number) => void
  ) {
    super(scene);
    this.save = save;
    this.onOpenRole = onOpenRole;
    this.onEquip = onEquip;
  }

  show() {
    if (this.overlay) return;

    const { width, height } = this.scene.scale;
    const bg = this.createBackground(0.6);
    const panel = this.createPanel(860, 480, 0.98);

    const title = this.scene.add
      .text(width * 0.5, height * 0.5 - 220, "技能", {
        fontFamily: "system-ui",
        fontSize: "18px",
        color: "#e2e8f0",
      })
      .setOrigin(0.5, 0.5);

    const tabEquip = this.scene.add
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
      this.close();
      this.onOpenRole();
    });

    const tabSkills = this.scene.add
      .text(width * 0.5 - 330, height * 0.5 - 220, "技能", {
        fontFamily: "system-ui",
        fontSize: "14px",
        color: "#93c5fd",
        backgroundColor: "#0f172a",
        padding: { left: 10, right: 10, top: 6, bottom: 6 },
      })
      .setOrigin(0, 0.5)
      .setInteractive({ useHandCursor: true });

    const skillsTabBorder = this.scene.add.rectangle(
      tabSkills.x + tabSkills.width / 2,
      tabSkills.y,
      tabSkills.width + 8,
      tabSkills.height + 8,
      0x000000,
      0
    );
    skillsTabBorder.setStrokeStyle(1, 0x93c5fd, 1);

    const closeBtn = this.createButton(
      width * 0.5 + 400,
      height * 0.5 - 220,
      "关闭",
      () => this.close()
    );
    closeBtn.setOrigin(1, 0.5);

    const leftX = width * 0.5 - 390;
    const topY = height * 0.5 - 170;

    const points = this.scene.add.text(leftX, topY, "", {
      fontFamily: "system-ui",
      fontSize: "14px",
      color: "#e2e8f0",
    });
    const equipInfo = this.scene.add.text(leftX, topY + 26, "", {
      fontFamily: "system-ui",
      fontSize: "12px",
      color: "#94a3b8",
    });

    const listTitle = this.scene.add.text(
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
    const detailTitle = this.scene.add.text(detailX, topY, "详情", {
      fontFamily: "system-ui",
      fontSize: "14px",
      color: "#e2e8f0",
    });
    const detailBody = this.scene.add.text(detailX, topY + 24, "", {
      fontFamily: "system-ui",
      fontSize: "13px",
      color: "#94a3b8",
      lineSpacing: 4,
      wordWrap: { width: 380 },
    });

    const btnY = height * 0.5 + 156;

    const upgradeBtn = this.createButton(detailX, btnY, "升级", () => {
      if (!canLearnOrUpgrade(this.save, selected)) return;
      const def = getSkillDef(selected);
      const lv = (this.save.skills.levels[selected] ?? 0) + 1;
      this.save.skills.levels[selected] = Math.min(def.maxLevel, lv);
      this.save.skills.points -= 1;
      persistSave(this.save);
      refresh();
    });
    upgradeBtn.setOrigin(0, 0.5);

    const equip1 = this.createButton(detailX, btnY + 44, "装1", () =>
      this.onEquip(selected, 0)
    );
    equip1.setOrigin(0, 0.5);

    const equip2 = this.createButton(detailX + 60, btnY + 44, "装2", () =>
      this.onEquip(selected, 1)
    );
    equip2.setOrigin(0, 0.5);

    const equip3 = this.createButton(detailX + 120, btnY + 44, "装3", () =>
      this.onEquip(selected, 2)
    );
    equip3.setOrigin(0, 0.5);

    const equip4 = this.createButton(detailX + 180, btnY + 44, "装4", () =>
      this.onEquip(selected, 3)
    );
    equip4.setOrigin(0, 0.5);

    const equip5 = this.createButton(detailX + 240, btnY + 44, "装5", () =>
      this.onEquip(selected, 4)
    );
    equip5.setOrigin(0, 0.5);

    const respecBtn = this.createButton(detailX + 86, btnY, "重置", () => {
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
    respecBtn.setOrigin(0, 0.5);

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
          this.scene.add
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
    this.overlay = this.scene.add.container(0, 0, [
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
}
