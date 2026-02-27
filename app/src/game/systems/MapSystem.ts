import Phaser from "phaser";

export class MapSystem {
  private scene: Phaser.Scene;
  private mapW: number = 0;
  private mapH: number = 0;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  public create(stage: number) {
    const stageMod = stage % 2;
    if (stageMod === 0) {
      this.createDungeon1Map();
    } else {
      this.createTownMap();
    }
    
    // Fallback if map loading failed
    if (this.mapW <= 0 || this.mapH <= 0) {
        this.mapW = this.scene.scale.width;
        this.mapH = this.scene.scale.height;
        this.scene.cameras.main.setBounds(0, 0, this.mapW, this.mapH);
    }
  }

  public get width(): number {
    return this.mapW;
  }

  public get height(): number {
    return this.mapH;
  }

  private createTownMap() {
    if (!this.scene.cache.tilemap.exists("town_map")) return;
    if (!this.scene.textures.exists("town_tiles")) return;
    const map = this.scene.make.tilemap({ key: "town_map" });
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
      this.scene.cameras.main.setBounds(0, 0, this.mapW, this.mapH);
  }

  private createDungeon1Map() {
    if (!this.scene.cache.tilemap.exists("dungeon1_map")) return;
    if (!this.scene.textures.exists("dungeon1_block1")) return;
    const map = this.scene.make.tilemap({ key: "dungeon1_map" });
    const tileset1 = map.addTilesetImage(
      "block1",
      "dungeon1_block1",
      16,
      16,
      0,
      0
    );
    const tileset2 = map.addTilesetImage(
      "platform1",
      "dungeon1_platform1",
      16,
      16,
      0,
      0
    );
    const tileset3 = map.addTilesetImage("exit", "dungeon1_exit", 16, 16, 0, 0);
    const tileset4 = map.addTilesetImage("sign", "dungeon1_sign", 16, 16, 0, 0);
    const tileset5 = map.addTilesetImage(
      "torch",
      "dungeon1_torch",
      16,
      16,
      0,
      0
    );
    const tileset6 = map.addTilesetImage(
      "window",
      "dungeon1_window",
      16,
      16,
      0,
      0
    );
    if (!tileset1) return;

    const layerDefs: Array<{ name: string; depth: number }> = [
      { name: "Background", depth: 0 },
      { name: "Road", depth: 1 },
    ];
    const allTilesets = [
      tileset1,
      tileset2,
      tileset3,
      tileset4,
      tileset5,
      tileset6,
    ].filter((t) => t !== null);
    for (const def of layerDefs) {
      const layer = map.createLayer(def.name, allTilesets, 0, 0);
      if (!layer) continue;
      layer.setDepth(def.depth);
    }

    this.mapW = map.widthInPixels;
    this.mapH = map.heightInPixels;
    if (this.mapW > 0 && this.mapH > 0)
      this.scene.cameras.main.setBounds(0, 0, this.mapW, this.mapH);
  }
}
