# Kenney 素材（战士主角向）

Kenney 的大部分资源是 **Creative Commons CC0**（可免费商用、可修改、可不署名）。

## 角色（优先）

- Roguelike Characters（CC0，2D，450 files）：https://kenney.nl/assets/roguelike-characters
- Modular Characters（CC0，2D，425 files）：https://kenney.nl/assets/modular-characters
- Platformer Characters（CC0，2D，150 files）：https://kenney.nl/assets/platformer-characters

## 场景/地形（配套）

- Roguelike/RPG pack（CC0，2D，1700 files，16×16）：https://kenney.nl/assets/roguelike-rpg-pack
- Roguelike Indoors（CC0，2D，480 files）：https://kenney.nl/assets/roguelike-indoors

## UI（可选）

- UI Pack (RPG Expansion)（CC0，2D，85 files）：https://kenney.nl/assets/ui-pack-rpg-expansion
- Fantasy UI Borders（CC0，2D，140 files）：https://kenney.nl/assets/fantasy-ui-borders

## 放进项目的建议结构

把下载的 zip 解压到：

- `app/public/assets/kenney/<pack-name>/...`

然后在 Phaser 的 preload 里用相对 `public/` 的路径加载（例如 `/assets/kenney/roguelike-characters/...`）。
