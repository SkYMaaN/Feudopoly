export class Start extends Phaser.Scene {
    constructor() {
        super('Start');
        this.nickname = '';
        this.sessionId = '';
        this.activeInput = null;
        this.buttonsVisible = true;
    }

    create() {
        const { width, height } = this.scale.gameSize;

        const background = this.add.rectangle(width / 2, height / 2, width, height, 0x1a1207, 1);
        background.setOrigin(0.5);

        const vignette = this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.35);
        vignette.setOrigin(0.5);

        this.add.rectangle(width / 2 + 10, height / 2 + 10, 980, 720, 0x000000, 0.45);
        this.add.rectangle(width / 2, height / 2, 980, 720, 0x2d1f11, 0.95)
            .setStrokeStyle(10, 0x8d6a3b, 1);

        this.add.text(width / 2, height / 2 - 260, 'FEUDOPOLY', {
            fontFamily: 'Georgia, serif',
            fontSize: '120px',
            color: '#e8d2a9',
            stroke: '#3a230c',
            strokeThickness: 14,
            fontStyle: 'bold'
        }).setOrigin(0.5);

        this.add.text(width / 2, height / 2 - 165, 'A medieval board of feuds and fortune', {
            fontFamily: 'Georgia, serif',
            fontSize: '34px',
            color: '#d9c39a',
            stroke: '#2a1707',
            strokeThickness: 8
        }).setOrigin(0.5);

        this.add.text(width / 2, height / 2 - 90, 'Nickname', {
            fontFamily: 'Georgia, serif',
            fontSize: '30px',
            color: '#f2e4c3'
        }).setOrigin(0.5);

        this.nicknameField = this.createInputField(width / 2, height / 2 - 30, 'Enter your nickname', 28);
        this.activeInput = this.nicknameField.bg;

        this.joinCodeLabel = this.add.text(width / 2, height / 2 + 50, 'Game code (for joining)', {
            fontFamily: 'Georgia, serif',
            fontSize: '30px',
            color: '#f2e4c3'
        }).setOrigin(0.5).setVisible(false);

        this.sessionField = this.createInputField(width / 2, height / 2 + 110, 'Paste game code here', 36);
        this.setJoinCodeVisibility(false);

        this.createNewButton = this.createButton(width / 2, height / 2 + 100, 420, 96, 'CREATE NEW', () => {
            const nickname = this.nickname.trim();

            if (!nickname) {
                this.showMessage('Enter a nickname before creating a game.');
                return;
            }

            this.scene.start('Board', {
                mode: 'create',
                displayName: nickname,
                sessionId: crypto.randomUUID()
            });
        });

        this.joinGameButton = this.createButton(width / 2, height / 2 + 230, 420, 96, 'JOIN', () => {
            const nickname = this.nickname.trim();

            if (!nickname) {
                this.showMessage('Enter your nickname before connecting.');
                return;
            }

            if (!this.joinCodeVisible) {
                this.setConnectGameButtonVisibility(true);
                this.setJoinCodeVisibility(true);
                this.setGameButtonsVisibility(false);
                this.setBackButtonVisibility(true);
                this.activeInput = this.sessionField.bg;
                this.refreshInputStyles();
                this.showMessage('Enter the session code to connect.');
                return;
            }

            const sessionId = this.sessionId.trim();

            if (!sessionId) {
                this.showMessage('Please enter the game code to connect.');
                return;
            }

            this.scene.start('Board', {
                mode: 'join',
                displayName: nickname,
                sessionId
            });
        });

        this.setGameButtonsVisibility(true);

        this.connectGameButton = this.createButton(width / 2 - 180, height / 2 + 220, 300, 96, 'CONNECT', () => {
            const nickname = this.nickname.trim();

            if (!nickname) {
                this.showMessage('Enter your nickname before connecting.');
                return;
            }

            if (!this.joinCodeVisible) {
                this.setJoinCodeVisibility(true);
                this.setGameButtonsVisibility(false);
                this.setBackButtonVisibility(true);
                this.activeInput = this.sessionField.bg;
                this.refreshInputStyles();
                this.showMessage('Enter the session code to connect.');
                return;
            }

            const sessionId = this.sessionId.trim();

            if (!sessionId) {
                this.showMessage('Please enter the game code to connect.');
                return;
            }

            this.scene.start('Board', {
                mode: 'join',
                displayName: nickname,
                sessionId
            });
        });

        this.setConnectGameButtonVisibility(false);

        this.backButton = this.createButton(width / 2 + 180, height / 2 + 220, 300, 96, 'BACK', () => {
            this.setJoinCodeVisibility(false);
            this.setGameButtonsVisibility(true);
            this.setBackButtonVisibility(false);
            this.setConnectGameButtonVisibility(false);
        });

        this.setBackButtonVisibility(false);

        this.messageText = this.add.text(width / 2, height / 2 + 445, '', {
            fontFamily: 'Georgia, serif',
            fontSize: '26px',
            color: '#ffd9a0',
            stroke: '#2a1707',
            strokeThickness: 6,
            align: 'center'
        }).setOrigin(0.5);

        this.setupKeyboardInput();
        this.refreshInputStyles();
    }

    setBackButtonVisibility(isVisible) {
        this.backButton.shadow.setVisible(isVisible);
        this.backButton.button.setVisible(isVisible);
        this.backButton.text.setVisible(isVisible);
    }

    setGameButtonsVisibility(isVisible) {
        this.createNewButton.shadow.setVisible(isVisible);
        this.createNewButton.button.setVisible(isVisible);
        this.createNewButton.text.setVisible(isVisible);

        this.joinGameButton.shadow.setVisible(isVisible);
        this.joinGameButton.button.setVisible(isVisible);
        this.joinGameButton.text.setVisible(isVisible);
    }

    setConnectGameButtonVisibility(isVisible) {
        this.connectGameButton.shadow.setVisible(isVisible);
        this.connectGameButton.button.setVisible(isVisible);
        this.connectGameButton.text.setVisible(isVisible);
    }

    setJoinCodeVisibility(isVisible) {
        this.joinCodeVisible = isVisible;
        this.joinCodeLabel.setVisible(isVisible);
        this.sessionField.bg.setVisible(isVisible);
        this.sessionField.text.setVisible(isVisible);

        if (!isVisible && this.activeInput === this.sessionField.bg) {
            this.activeInput = this.nicknameField.bg;
        }
    }

    createInputField(x, y, placeholder, maxLength) {
        const bg = this.add.rectangle(x, y, 500, 74, 0x1f1308, 1)
            .setStrokeStyle(5, 0x8d6a3b, 0.9)
            .setInteractive({ useHandCursor: true });

        const text = this.add.text(x - 225, y, placeholder, {
            fontFamily: 'Arial, sans-serif',
            fontSize: '30px',
            color: '#9f8b69'
        }).setOrigin(0, 0.5);

        bg.on('pointerdown', () => {
            if (bg === this.sessionField?.bg && !this.joinCodeVisible) {
                return;
            }

            this.activeInput = bg;
            this.refreshInputStyles();
        });

        return { bg, text, placeholder, maxLength };
    }

    refreshInputStyles() {
        const fields = [this.nicknameField, this.sessionField];

        fields.forEach((inputField) => {
            const isSessionHidden = inputField === this.sessionField && !this.joinCodeVisible;
            if (isSessionHidden) {
                return;
            }

            const isActive = this.activeInput === inputField.bg;
            inputField.bg.setStrokeStyle(5, isActive ? 0xe5b96d : 0x8d6a3b, 1);
        });
    }

    setupKeyboardInput() {
        this.input.keyboard.on('keydown', (event) => {
            if (!this.activeInput) {
                return;
            }

            const isNickname = this.activeInput === this.nicknameField.bg;
            const value = isNickname ? this.nickname : this.sessionId;
            const maxLength = isNickname ? this.nicknameField.maxLength : this.sessionField.maxLength;

            if (event.key === 'Backspace') {
                const next = value.slice(0, -1);
                this.setFieldValue(isNickname, next);
                return;
            }

            if (event.key === 'Tab') {
                event.preventDefault();

                if (this.joinCodeVisible) {
                    this.activeInput = isNickname ? this.sessionField.bg : this.nicknameField.bg;
                } else {
                    this.activeInput = this.nicknameField.bg;
                }

                this.refreshInputStyles();
                return;
            }

            if (event.key.length === 1 && value.length < maxLength) {
                this.setFieldValue(isNickname, value + event.key);
            }
        });
    }

    setFieldValue(isNickname, value) {
        if (isNickname) {
            this.nickname = value;
            this.nicknameField.text.setText(value || this.nicknameField.placeholder);
            this.nicknameField.text.setColor(value ? '#f2e4c3' : '#9f8b69');
            return;
        }

        this.sessionId = value;
        this.sessionField.text.setText(value || this.sessionField.placeholder);
        this.sessionField.text.setColor(value ? '#f2e4c3' : '#9f8b69');
    }

    createButton(x, y, width, height, label, onClick) {
        const shadow = this.add.rectangle(x + 6, y + 6, width, height, 0x2a1708, 0.8);
        const button = this.add.rectangle(x, y, width, height, 0x6f4b23, 1)
            .setStrokeStyle(7, 0xc89b58, 1)
            .setInteractive({ useHandCursor: true });

        const text = this.add.text(x, y, label, {
            fontFamily: 'Georgia, serif',
            fontSize: '38px',
            color: '#f2e4c3',
            stroke: '#3a230c',
            strokeThickness: 8,
            fontStyle: 'bold'
        }).setOrigin(0.5);

        button.on('pointerover', () => button.setFillStyle(0x83592b, 1));
        button.on('pointerout', () => button.setFillStyle(0x6f4b23, 1));
        button.on('pointerdown', onClick);

        this.tweens.add({
            targets: [shadow, button, text],
            scaleX: 1.02,
            scaleY: 1.02,
            duration: 1000,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.InOut'
        });

        return { shadow, button, text };
    }

    showMessage(text) {
        this.messageText.setText(text);
        this.tweens.killTweensOf(this.messageText);
        this.messageText.setAlpha(1);

        this.tweens.add({
            targets: this.messageText,
            alpha: 0,
            delay: 2500,
            duration: 600
        });
    }
}
