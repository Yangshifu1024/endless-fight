import './style.css'
import { startGame } from './game/startGame'

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <div class="app">
    <div class="header">
      <div class="title">Endless Fight</div>
      <div class="hint">WASD 移动（可选），其余自动。按钮在游戏内左上角。</div>
    </div>
    <div id="game-root" class="gameRoot"></div>
  </div>
`

startGame(document.querySelector<HTMLDivElement>('#game-root')!)
