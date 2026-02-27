import Phaser from "phaser";

export class OverlayBase {
  protected scene: Phaser.Scene;
  protected overlay?: Phaser.GameObjects.Container;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  isOpen(): boolean {
    return !!this.overlay;
  }

  close() {
    this.overlay?.destroy(true);
    this.overlay = undefined;
  }

  protected pinToScreen(go: Phaser.GameObjects.GameObject) {
    const anyGo = go as any;
    if (typeof anyGo.setScrollFactor === "function") anyGo.setScrollFactor(0);
    if (typeof anyGo.setDepth === "function") anyGo.setDepth(2000);
  }

  protected pinOverlay() {
    if (!this.overlay) return;
    this.overlay.setDepth(2100);
    for (const child of this.overlay.list) this.pinToScreen(child as any);
  }

  protected createBackground(alpha: number = 0.6) {
    const { width, height } = this.scene.scale;
    return this.scene.add.rectangle(
      width * 0.5,
      height * 0.5,
      width,
      height,
      0x000000,
      alpha
    );
  }

  protected createPanel(w: number, h: number, alpha: number = 0.95) {
    const { width, height } = this.scene.scale;
    const panel = this.scene.add.rectangle(
      width * 0.5,
      height * 0.5,
      w,
      h,
      0x0b1220,
      alpha
    );
    panel.setStrokeStyle(1, 0x334155, 1);
    return panel;
  }

  protected createButton(
    x: number,
    y: number,
    label: string,
    onClick: () => void,
    fontSize: string = "14px"
  ) {
    const t = this.scene.add
      .text(x, y, label, {
        fontFamily: "system-ui",
        fontSize,
        color: "#e2e8f0",
        backgroundColor: "#1e293b",
        padding: { left: 12, right: 12, top: 8, bottom: 8 },
      })
      .setOrigin(0.5, 0.5)
      .setInteractive({ useHandCursor: true });
    t.on("pointerdown", onClick);
    return t;
  }
}
