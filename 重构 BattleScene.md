# 重构 BattleScene.ts 计划

## 1. 现状分析

`BattleScene.ts` 文件行数接近 3000 行，承担了过多的职责，是一个典型的 "God Class"。主要包含以下耦合在一起的功能：
- **场景生命周期**：`preload`, `create`, `update`。
- **地图管理**：`createTownMap`, `createDungeon1Map` 等。
- **实体管理**：玩家 (`playerCircle`, `playerHp`) 和敌人 (`enemies`, `spawnEnemy`) 的创建、更新、销毁。
- **战斗逻辑**：伤害计算、技能释放 (`castBerserkSkill` 等)、战斗日志。
- **UI 系统**：HUD (`uiLeft`, `uiBottom`), 多个 Overlay (`StageClear`, `Defeat`, `Role`, `Skills`)。
- **数据持久化**：直接操作 `this.save` 并频繁调用 `persistSave`。
- **输入处理**：直接在 `update` 中处理键盘输入。

这种高耦合导致代码难以阅读、维护和扩展。修改任何一个小功能都可能影响整个场景。

## 2. 重构目标

- **单一职责原则**：将不同的功能拆分到独立的类/模块中。
- **提高可维护性**：减小文件体积，使代码结构清晰。
- **增强可扩展性**：方便添加新功能（如新技能、新敌人类型、新地图）。
- **优化性能**：通过更好的对象管理和事件驱动减少不必要的计算。

## 3. 核心策略：组件化与系统化

将 `BattleScene` 重构为协调者（Coordinator），不再直接处理逻辑，而是管理多个子系统（Systems/Managers）。

### 建议的新目录结构

```
src/game/
  ├── systems/              # 核心逻辑系统
  │   ├── MapSystem.ts      # 地图加载、切换、边界管理
  │   ├── PlayerSystem.ts   # 玩家实体、移动、动画、状态
  │   ├── EnemySystem.ts    # 敌人生成、AI、状态管理
  │   ├── CombatSystem.ts   # 战斗计算、技能释放、伤害判定
  │   └── LootSystem.ts     # 掉落物处理 (可选)
  ├── ui/                   # UI 相关
  │   ├── BattleHUD.ts      # 战斗界面 (血条, 顶部/底部文本)
  │   ├── overlays/         # 各种弹窗
  │   │   ├── StageClearOverlay.ts
  │   │   ├── DefeatOverlay.ts
  │   │   ├── RoleOverlay.ts
  │   │   ├── SkillsOverlay.ts
  │   │   └── OverlayBase.ts # 弹窗基类
  │   └── components/       # 通用 UI 组件 (如按钮)
  ├── entities/             # 实体类定义 (可选，如果不仅是类型)
  │   ├── Enemy.ts          # Enemy 类封装 (不仅仅是 type)
  │   └── Player.ts
  └── BattleScene.ts        # 主场景，负责初始化和 Update 调度
```

## 4. 详细重构步骤

### Phase 1: 基础设施与类型提取 (Risk: Low) - ✅ Completed

1.  **提取类型定义**：
    - 将 `type Enemy = ...` 移至 `src/game/model/Enemy.ts` 或 `types.ts`。
    - 确保所有相关文件引用新的类型定义。
2.  **创建基础管理器结构**：
    - 定义 `ISystem` 接口（包含 `create`, `update`, `destroy`）。
    - 在 `BattleScene` 中建立 `systems` 列表进行统一管理。

### Phase 2: UI 系统拆分 (Risk: Low, Impact: High) - ✅ Completed

UI 代码占据了很大篇幅，且相对独立，最适合优先拆分。

1.  **提取 HUD**：
    - 创建 `BattleHUD` 类。
    - 移动 `uiLeft`, `uiRight`, `uiBottom`, `createPlayerHpBar`, `updateHealthBars` 等逻辑。
    - `BattleScene` 通过事件或引用通知 `BattleHUD` 更新数据。
2.  **提取 Overlays**：
    - 为每个 Overlay 创建独立文件 (`StageClearOverlay`, `DefeatOverlay`, etc.)。
    - 移动 `open...Overlay`, `createButtons`, `refreshButtons` 等逻辑。
    - 使用回调或事件处理 Overlay 的关闭和结果返回。

### Phase 3: 地图系统拆分 (Risk: Medium) - ✅ Completed

1.  **创建 MapSystem**：
    - 移动 `createTownMap`, `createDungeon1Map`, `ensureActorTextures` (部分)。
    - 移动地图相关的状态变量 (`mapW`, `mapH`, `laneY`, `heroStartX`)。
    - 提供 `getMapBounds`, `getSpawnPoints` 等接口供其他系统使用。

### Phase 4: 实体系统拆分 (Risk: High) - ✅ Completed

这是核心逻辑，需要小心处理状态同步。

1.  **创建 PlayerSystem**：
    - 移动 `playerCircle`, `playerHp`, `playerAttackCdMs` 等状态。
    - 移动 `createHeroAnims`, `updateHeroAnim`, `updatePlayer` 逻辑。
    - 处理玩家输入 (`keys`)。
2.  **创建 EnemySystem**：
    - 移动 `enemies` 数组及相关状态 (`spawnCooldownMs`, `kills`).
    - 移动 `spawnEnemy`, `updateSpawns`, `updateEnemies`, `findNearestEnemy`。
    - 封装 `Enemy` 对象，不再使用简单的 Object，而是使用类来管理单个敌人的行为（可选，但推荐）。

### Phase 5: 战斗系统拆分 (Risk: High) - ✅ Completed

1.  **创建 CombatSystem**：
    - 移动 `updateCombat`, `playerAttack`, `applyStunFx`。
    - 移动技能逻辑 (`castBerserkSkill`, `castShieldWallSkill`)。
    - 处理伤害计算、击杀判定。
    - 引用 `PlayerSystem` 和 `EnemySystem` 进行交互。

### Phase 6: 数据与流程整合 (Risk: Medium) - ✅ Completed

1.  **统一数据管理**：
    - 考虑创建一个 `GameDataManager` 单例或作为 System，统一管理 `this.save` 的读取和 `persistSave`。
    - 减少 UI 组件直接操作 `save` 数据，改为通过 Action/Event 修改数据，数据变化后通知 UI 更新。
2.  **清理 BattleScene**：
    - `BattleScene` 最终应只包含系统初始化代码和极少量的胶水代码。
    - 按钮逻辑已移至 `BattleHUD`。

## 5. 关键依赖与通信

各系统之间需要通信，建议采用以下方式：
- **引用传递**：`CombatSystem` 需要 `PlayerSystem` 和 `EnemySystem` 的引用。
- **事件总线 (Event Bus)**：
  - 使用 Phaser 的 `this.events` 或独立的 `EventEmitter`。
  - 例如：`EnemySystem` 触发 `ENEMY_KILLED` 事件，`BattleHUD` 监听并更新击杀数，`GameDataManager` 监听并保存数据。

## 6. 注意事项

- **逐步进行**：不要一次性重构所有内容。每完成一个 Phase，确保游戏可运行且无 Regression。
- **测试**：在重构前，手动测试关键流程（战斗、升级、过关），确保重构后行为一致。
- **Git 提交**：每个小步骤（如提取一个 Overlay）都进行一次 Commit，方便回滚。

## 7. 结论

重构已全部完成。代码结构现在清晰地分为 `PlayerSystem`, `EnemySystem`, `CombatSystem`, `MapSystem`, `BattleHUD` 和多个 Overlays。`BattleScene.ts` 成功转型为协调者。
