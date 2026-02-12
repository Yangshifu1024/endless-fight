import Phaser from 'phaser'
import { BootScene } from './ui/BootScene'
import { BattleScene } from './ui/BattleScene'

export function startGame(parent: HTMLElement) {
  const config: Phaser.Types.Core.GameConfig = {
    type: Phaser.AUTO,
    parent,
    backgroundColor: '#0b1020',
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
      width: 960,
      height: 540,
    },
    render: {
      pixelArt: false,
      antialias: true,
    },
    fps: {
      target: 60,
      forceSetTimeOut: true,
    },
    scene: [BootScene, BattleScene],
  }

  new Phaser.Game(config)
}

