export class Start extends Phaser.Scene {
    constructor() {
        super('Start');
        this.nickname = '';
        this.sessionId = '';
        this.activeInput = null;
    }

    preload() {
        this.load.scenePlugin({
            key: 'rexuiplugin',
            url: "plugins/rexuiplugin.min.js",
            sceneKey: 'rexUI'
        });
    }

    create() {
        const { width, height } = this.scale.gameSize;

        this.add.rectangle(width / 2, height / 2, width, height, 0x1a1207, 1).setOrigin(0.5);
        this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.35).setOrigin(0.5);
        this.add.rectangle(width / 2 + 10, height / 2 + 10, 980, 720, 0x000000, 0.45);
        this.add.rectangle(width / 2, height / 2, 980, 720, 0x2d1f11, 0.95).setStrokeStyle(10, 0x8d6a3b, 1);

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
        this.activeInput = this.nicknameField;

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
                this.activeInput = this.sessionField;
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

    createInputField(x, y, placeholder, maxLength) {
        const bg = this.rexUI.add.roundRectangle(0, 0, 500, 74, 16, 0x1f1308, 1)
            .setStrokeStyle(5, 0x8d6a3b, 0.9);

        const text = this.add.text(0, 0, placeholder, {
            fontFamily: 'Arial, sans-serif',
            fontSize: '30px',
            color: '#9f8b69'
        }).setOrigin(0, 0.5);

        const label = this.rexUI.add.label({
            x,
            y,
            background: bg,
            text,
            align: 'left',
            space: {
                left: 25,
                right: 25,
                top: 10,
                bottom: 10
            }
        }).layout().setInteractive({ useHandCursor: true });

        const field = { container: label, bg, text, placeholder, maxLength };

        label.on('pointerdown', () => {
            if (field === this.sessionField && !this.joinCodeVisible) {
                return;
            }

            this.activeInput = field;
            this.refreshInputStyles();
        });

        return field;
    }

    createButton(x, y, width, height, label, onClick) {
        const background = this.rexUI.add.roundRectangle(0, 0, width, height, 16, 0x6f4b23, 1)
            .setStrokeStyle(7, 0xc89b58, 1);

        const buttonText = this.add.text(0, 0, label, {
            fontFamily: 'Georgia, serif',
            fontSize: '38px',
            color: '#f2e4c3',
            stroke: '#3a230c',
            strokeThickness: 8,
            fontStyle: 'bold'
        }).setOrigin(0.5);

        const button = this.rexUI.add.label({
            x,
            y,
            width,
            height,
            background,
            text: buttonText,
            align: 'center'
        }).layout().setInteractive({ useHandCursor: true });

        button.on('pointerover', () => background.setFillStyle(0x3E5A2E, 1));
        button.on('pointerout', () => background.setFillStyle(0x6f4b23, 1));
        button.on('pointerdown', onClick);

        this.tweens.add({
            targets: button,
            scaleX: 1.02,
            scaleY: 1.02,
            duration: 1000,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.InOut'
        });

        return button;
    }

    setBackButtonVisibility(isVisible) {
        this.backButton.setVisible(isVisible);
    }

    setGameButtonsVisibility(isVisible) {
        this.createNewButton.setVisible(isVisible);
        this.joinGameButton.setVisible(isVisible);
    }

    setConnectGameButtonVisibility(isVisible) {
        this.connectGameButton.setVisible(isVisible);
    }

    setJoinCodeVisibility(isVisible) {
        this.joinCodeVisible = isVisible;
        this.joinCodeLabel.setVisible(isVisible);
        this.sessionField.container.setVisible(isVisible);

        if (!isVisible && this.activeInput === this.sessionField) {
            this.activeInput = this.nicknameField;
        }

        this.refreshInputStyles();
    }

    refreshInputStyles() {
        [this.nicknameField, this.sessionField].forEach((field) => {
            const hidden = field === this.sessionField && !this.joinCodeVisible;
            if (hidden) {
                return;
            }

            const isActive = this.activeInput === field;
            field.bg.setStrokeStyle(5, isActive ? 0xe5b96d : 0x8d6a3b, 1);
        });
    }

    setupKeyboardInput() {
        this.input.keyboard.on('keydown', (event) => {
            if (!this.activeInput) {
                return;
            }

            if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'v') {
                event.preventDefault();
                this.pasteFromClipboard();
                return;
            }

            const isNickname = this.activeInput === this.nicknameField;
            const value = isNickname ? this.nickname : this.sessionId;
            const maxLength = isNickname ? this.nicknameField.maxLength : this.sessionField.maxLength;

            if (event.key === 'Backspace') {
                this.setFieldValue(isNickname, value.slice(0, -1));
                return;
            }

            if (event.key === 'Tab') {
                event.preventDefault();
                this.activeInput = this.joinCodeVisible && isNickname ? this.sessionField : this.nicknameField;
                this.refreshInputStyles();
                return;
            }

            if (event.key.length === 1 && value.length < maxLength) {
                this.setFieldValue(isNickname, value + event.key);
            }
        });
    }

    async pasteFromClipboard() {
        if (!navigator.clipboard?.readText || !this.activeInput) {
            return;
        }

        try {
            const isNickname = this.activeInput === this.nicknameField;
            const value = isNickname ? this.nickname : this.sessionId;
            const maxLength = isNickname ? this.nicknameField.maxLength : this.sessionField.maxLength;

            const clipboardText = await navigator.clipboard.readText();
            const cleanText = clipboardText.replace(/[\r\n]+/g, ' ').trim();
            const nextValue = (value + cleanText).slice(0, maxLength);

            this.setFieldValue(isNickname, nextValue);
        } catch {
            this.showMessage('Clipboard access is unavailable.');
        }
    }

    setFieldValue(isNickname, value) {
        const field = isNickname ? this.nicknameField : this.sessionField;

        if (isNickname) {
            this.nickname = value;
        } else {
            this.sessionId = value;
        }

        field.text.setText(value || field.placeholder);
        field.text.setColor(value ? '#f2e4c3' : '#9f8b69');
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
