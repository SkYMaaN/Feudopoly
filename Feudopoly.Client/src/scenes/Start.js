export class Start extends Phaser.Scene {
    constructor() {
        super('Start');
        this.nickname = '';
        this.sessionId = '';
        this.activeInput = null;
        this.joinCodeVisible = false;
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

        this.createButton(width / 2, height / 2 + 235, 620, 96, 'CREATE NEW GAME', () => {
            const nickname = this.nickname.trim();

            if (!nickname) {
                this.showMessage('Введите никнейм перед созданием игры.');
                return;
            }

            this.scene.start('Board', {
                mode: 'create',
                displayName: nickname,
                sessionId: crypto.randomUUID()
            });
        });

        this.createButton(width / 2, height / 2 + 350, 620, 96, 'JOIN EXISTING GAME', () => {
            const nickname = this.nickname.trim();

            if (!nickname) {
                this.showMessage('Введите никнейм перед подключением.');
                return;
            }

            if (!this.joinCodeVisible) {
                this.setJoinCodeVisibility(true);
                this.activeInput = this.sessionField.bg;
                this.refreshInputStyles();
                this.showMessage('Введите код сессии для подключения.');
                return;
            }

            const sessionId = this.sessionId.trim();

            if (!sessionId) {
                this.showMessage('Укажите код игры для подключения.');
                return;
            }

            this.scene.start('Board', {
                mode: 'join',
                displayName: nickname,
                sessionId
            });
        });

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
        const bg = this.add.rectangle(x, y, 680, 74, 0x1f1308, 1)
            .setStrokeStyle(5, 0x8d6a3b, 0.9)
            .setInteractive({ useHandCursor: true });

        const text = this.add.text(x - 315, y, placeholder, {
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
