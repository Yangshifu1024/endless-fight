import Phaser from "phaser";
import { OverlayBase } from "./OverlayBase";
import type { PlayerSave } from "../../model/types";
import { persistSave } from "../../storage/save";

export class StageClearOverlay extends OverlayBase {
  private save: PlayerSave;
  private onNext: () => void;
  private onRepeat: () => void;

  constructor(
    scene: Phaser.Scene,
    save: PlayerSave,
    onNext: () => void,
    onRepeat: () => void
  ) {
    super(scene);
    this.save = save;
    this.onNext = onNext;
    this.onRepeat = onRepeat;
  }

  show() {
    if (this.overlay) return;
    persistSave(this.save);

    const { width, height } = this.scene.scale;
    const bg = this.createBackground(0.55);
    const panel = this.createPanel(520, 220);

    const title = this.scene.add
      .text(width * 0.5, height * 0.5 - 76, `通关：第 ${this.save.stage} 关`, {
        fontFamily: "system-ui",
        fontSize: "18px",
        color: "#e2e8f0",
      })
      .setOrigin(0.5, 0.5);

    const desc = this.scene.add
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

    const nextBtn = this.createButton(
      width * 0.5 - 120,
      height * 0.5 + 48,
      "进入下一关",
      this.onNext,
      "16px"
    );

    const stayBtn = this.createButton(
      width * 0.5 + 120,
      height * 0.5 + 48,
      "停留刷",
      this.onRepeat,
      "16px"
    );

    this.overlay = this.scene.add.container(0, 0, [
      bg,
      panel,
      title,
      desc,
      nextBtn,
      stayBtn,
    ]);
    this.pinOverlay();

    if (this.save.autoNext) {
      this.scene.time.delayedCall(900, () => {
        if (!this.overlay) return;
        this.onNext();
      });
    }
  }
}
