import Phaser from "phaser";

export type Enemy = {
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
