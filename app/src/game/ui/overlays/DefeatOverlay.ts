import Phaser from "phaser";
import { OverlayBase } from "./OverlayBase";
import type { PlayerSave } from "../../model/types";
import { persistSave } from "../../storage/save";

export class DefeatOverlay extends OverlayBase {
  private save: PlayerSave;
  private onRestart: () => void;

  constructor(scene: Phaser.Scene, save: PlayerSave, onRestart: () => void) {
    super(scene);
    this.save = save;
    this.onRestart = onRestart;
  }

  show() {
    if (this.overlay) return;
    persistSave(this.save);

    const { width, height } = this.scene.scale;
    const bg = this.createBackground(0.65);
    const panel = this.createPanel(520, 220);

    const title = this.scene.add
      .text(width * 0.5, height * 0.5 - 76, "战败", {
        fontFamily: "system-ui",
        fontSize: "20px",
        color: "#fca5a5",
      })
      .setOrigin(0.5, 0.5);

    const desc = this.scene.add
      .text(width * 0.5, height * 0.5 - 34, "重开本关（不回档）", {
        fontFamily: "system-ui",
        fontSize: "14px",
        color: "#94a3b8",
      })
      .setOrigin(0.5, 0.5);

    const retryBtn = this.createButton(
      width * 0.5,
      height * 0.5 + 48,
      "重开",
      this.onRestart,
      "16px"
    );

    this.overlay = this.scene.add.container(0, 0, [
      bg,
      panel,
      title,
      desc,
      retryBtn,
    ]);
    this.pinOverlay();

    if (this.save.autoRetry) {
      this.scene.time.delayedCall(900, () => {
        if (!this.overlay) return;
        this.onRestart();
      });
    }
  }
}
