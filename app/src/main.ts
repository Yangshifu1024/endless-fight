import "./style.css";
import { startGame } from "./game/startGame";

document.querySelector<HTMLDivElement>("#app")!.innerHTML = `
  <div class="app">
    <div class="header">
      <div class="title">Endless Fight</div>
      <div class="hint">位置增益：右半屏攻击 +50%、左半屏防御 +50% ｜ 击杀增益：每击杀攻速 +20%（上限 200%）、暴击 +5%（上限 100%）</div>
    </div>
    <div id="game-root" class="gameRoot"></div>
  </div>
`;

startGame(document.querySelector<HTMLDivElement>("#game-root")!);
