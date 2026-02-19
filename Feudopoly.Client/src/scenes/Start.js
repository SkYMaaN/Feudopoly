export class Start extends Phaser.Scene {
    constructor() {
        super('Start');
    }

    create() {
        const { width, height } = this.scale.gameSize;

        const background = this.add.rectangle(width / 2, height / 2, width, height, 0x1a1207, 1);
        background.setOrigin(0.5);

        const vignette = this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.35);
        vignette.setOrigin(0.5);

        const panelShadow = this.add.rectangle(width / 2 + 10, height / 2 + 10, 980, 620, 0x000000, 0.45);
        const panel = this.add.rectangle(width / 2, height / 2, 980, 620, 0x2d1f11, 0.95)
            .setStrokeStyle(10, 0x8d6a3b, 1);

        this.add.text(width / 2, height / 2 - 190, 'FEUDOPOLY', {
            fontFamily: 'Georgia, serif',
            fontSize: '126px',
            color: '#e8d2a9',
            stroke: '#3a230c',
            strokeThickness: 14,
            fontStyle: 'bold'
        }).setOrigin(0.5);

        this.add.text(width / 2, height / 2 - 80, 'A medieval board of feuds and fortune', {
            fontFamily: 'Georgia, serif',
            fontSize: '38px',
            color: '#d9c39a',
            stroke: '#2a1707',
            strokeThickness: 8
        }).setOrigin(0.5);

        this.add.text(width / 2, height / 2 + 10, 'Gather your rivals and claim the realm', {
            fontFamily: 'Georgia, serif',
            fontSize: '30px',
            color: '#cdb58a',
            stroke: '#2a1707',
            strokeThickness: 6
        }).setOrigin(0.5);

        const hostButtonShadow = this.add.rectangle(width / 2 + 6, height / 2 + 126, 600, 98, 0x2a1708, 0.8);
        const hostButton = this.add.rectangle(width / 2, height / 2 + 120, 600, 98, 0x6f4b23, 1)
            .setStrokeStyle(8, 0xc89b58, 1)
            .setInteractive({ useHandCursor: true });

        const hostText = this.add.text(width / 2, height / 2 + 120, 'HOST NEW GAME', {
            fontFamily: 'Georgia, serif',
            fontSize: '40px',
            color: '#f2e4c3',
            stroke: '#3a230c',
            strokeThickness: 9,
            fontStyle: 'bold'
        }).setOrigin(0.5);

        const joinButtonShadow = this.add.rectangle(width / 2 + 6, height / 2 + 246, 600, 98, 0x2a1708, 0.8);
        const joinButton = this.add.rectangle(width / 2, height / 2 + 240, 600, 98, 0x6f4b23, 1)
            .setStrokeStyle(8, 0xc89b58, 1)
            .setInteractive({ useHandCursor: true });

        const joinText = this.add.text(width / 2, height / 2 + 240, 'JOIN BY SESSION ID', {
            fontFamily: 'Georgia, serif',
            fontSize: '36px',
            color: '#f2e4c3',
            stroke: '#3a230c',
            strokeThickness: 9,
            fontStyle: 'bold'
        }).setOrigin(0.5);

        this.tweens.add({
            targets: [hostButton, hostButtonShadow, hostText, joinButton, joinButtonShadow, joinText],
            scaleX: 1.03,
            scaleY: 1.03,
            duration: 900,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.InOut'
        });

        const attachButtonEvents = (button, defaultColor, hoverColor) => {
            button.on('pointerover', () => {
                button.setFillStyle(hoverColor, 1);
            });

            button.on('pointerout', () => {
                button.setFillStyle(defaultColor, 1);
            });
        };

        attachButtonEvents(hostButton, 0x6f4b23, 0x83592b);
        attachButtonEvents(joinButton, 0x6f4b23, 0x83592b);

        hostButton.on('pointerdown', () => {
            this.scene.start('Board', { mode: 'host' });
        });

        joinButton.on('pointerdown', () => {
            const sessionId = window.prompt('Enter session ID');
            const trimmedSessionId = sessionId?.trim();

            if (!trimmedSessionId) {
                return;
            }

            this.scene.start('Board', {
                mode: 'join',
                sessionId: trimmedSessionId
            });
        });

    }
}
