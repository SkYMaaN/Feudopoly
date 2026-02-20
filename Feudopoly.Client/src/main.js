import { Start } from './scenes/Start.js';
import { Board } from './scenes/Board.js';

const config = {
    type: Phaser.AUTO,
    title: 'Feudopoly',
    description: '',
    parent: 'game-container',
    width: 1920,
    height: 1080,
    backgroundColor: '#000000',
    pixelArt: false,
    scene: [
        Start,
        Board
    ],
    scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH
    },
};

new Phaser.Game(config);
