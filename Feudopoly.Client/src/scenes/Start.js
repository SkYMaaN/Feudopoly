const PANEL_STROKE = 0x2b5e8a;
const TEXT_COLOR = '#FF0000';
const INPUT_TEXT_COLOR = '#1d3557';
const FOCUSED_STROKE = 0x214c74;
const EMPTY_FIELD_HINT = 0xffd166;

export class Start extends Phaser.Scene {
    constructor() {
        super('Start');
        this.nickname = '';
        this.gender = 'Male';
        this.religion = 'Islam';
        this.openDropdown = null;
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

        this.add.rectangle(width / 2, height / 2, width, height, 0x9cbfd9, 1).setOrigin(0.5);
        this.add.rectangle(width / 2, height / 2, 980, 920, 0x4682b4, 1).setStrokeStyle(10, 0x2b5e8a, 1);

        this.add.text(width / 2, height / 2 - 360, 'FEUDOPOLY', {
            fontFamily: 'Georgia, serif',
            fontSize: '120px',
            color: '#FF0000',
            fontStyle: 'bold'
        }).setOrigin(0.5);

        this.add.text(width / 2, height / 2 - 270, 'A medieval board of feuds and fortune', {
            fontFamily: 'Georgia, serif',
            fontSize: '34px',
            color: '#FF0000',
        }).setOrigin(0.5);

        this.add.text(width / 2, height / 2 - 220, 'Nickname', {
            fontFamily: 'Georgia, serif',
            fontSize: '30px',
            color: TEXT_COLOR,
            fontStyle: 'bold'
        }).setOrigin(0.5);

        this.nicknameField = this.createTextField({
            x: width / 2,
            y: height / 2 - 160,
            width: 330,
            height: 58,
            placeholder: 'Enter your nickname',
            value: this.nickname,
            maxLength: 28,
            onChange: (value) => {
                this.nickname = value;
            }
        });
        this.nicknameField.emptyState = this.createEmptyFieldAnimation(this.nicknameField);
        this.updateEmptyFieldAnimation(this.nicknameField);

        this.genderLabel = this.add.text(width / 2, height / 2 - 100, 'Gender', {
            fontFamily: 'Georgia, serif',
            fontSize: '30px',
            color: TEXT_COLOR
        }).setOrigin(0.5);

        this.genderDropdown = this.createDropdown(width / 2, height / 2 - 40, [
            { label: 'Male', value: 'Male' },
            { label: 'Female', value: 'Female' },
            { label: 'Other', value: 'Other' }
        ], this.gender, (value) => {
            this.gender = value;
        });

        this.religionLabel = this.add.text(width / 2, height / 2 + 25 , 'Religion', {
            fontFamily: 'Georgia, serif',
            fontSize: '30px',
            color: TEXT_COLOR
        }).setOrigin(0.5);

        this.religionDropdown = this.createDropdown(width / 2, height / 2 + 85, [
            { label: 'Other', value: 'Other' },
            { label: 'Islam', value: 'Islam' }
        ], this.religion, (value) => {
            this.religion = value;
        });

        this.joinLobbyButton = this.createButton(width / 2, height / 2 + 200, 410, 96, 'Join', () => {
            this.openLobbyList();
        });

        this.openNewButton = this.createButton(width / 2, height / 2 + 340, 410, 96, 'Open new', () => {
            this.openLobbyList({ openCreateLobbyModal: true });
        });

        this.messageText = this.add.text(width / 2, height / 2 + 420, '', {
            fontFamily: 'Georgia, serif',
            fontSize: '36px',
            color: TEXT_COLOR,
            stroke: '#214c74',
            align: 'center'
        }).setOrigin(0.5);
        this.focusField(this.nicknameField);
        this.time.delayedCall(60, () => this.focusField(this.nicknameField));

        this.input.on('pointerdown', (pointer, currentlyOver) => {
            if (!this.openDropdown) {
                return;
            }

            const hoveredObjects = currentlyOver || [];
            const isClickInsideDropdown = hoveredObjects.some((gameObject) => this.isInDropdownHierarchy(gameObject));
            if (!isClickInsideDropdown) {
                this.closeDropdown(this.openDropdown);
            }
        });
    }

    createTextField(config) {
        const background = this.rexUI.add.roundRectangle(0, 0, config.width, config.height, 16, 0xffffff, 1)
            .setStrokeStyle(5, PANEL_STROKE, 0.95);
        const shell = this.rexUI.add.label({
            x: config.x,
            y: config.y,
            width: config.width,
            height: config.height,
            background,
            align: 'center'
        }).layout();

        const dom = this.add.dom(config.x - config.width / 2 + 100, config.y - 10).createFromHTML(`
            <input
                class="start-scene-input"
                type="text"
                maxlength="${config.maxLength}"
                placeholder="${config.placeholder}"
                autocomplete="off"
                autocapitalize="none"
                spellcheck="false"
            />
        `);

        const input = dom.node.querySelector('input');
        input.value = config.value || '';
        Object.assign(input.style, {
            width: `${config.width - 30}px`,
            height: `${config.height - 18}px`,
            border: '0',
            outline: 'none',
            background: 'transparent',
            color: INPUT_TEXT_COLOR,
            fontFamily: 'Arial, sans-serif',
            fontSize: '30px',
            textAlign: 'left',
            padding: '0 4px',
            borderRadius: '12px'
        });

        input.addEventListener('input', () => {
            config.onChange?.(input.value);
            this.updateEmptyFieldAnimation(field);
        });

        input.addEventListener('focus', () => {
            this.setFieldFocused(background, true);
            this.updateEmptyFieldAnimation(field);
        });
        input.addEventListener('blur', () => {
            this.setFieldFocused(background, false);
            this.updateEmptyFieldAnimation(field);
        });

        shell.setInteractive({ useHandCursor: true });
        shell.on('pointerdown', () => input.focus());

        const field = { input, background, shell, config };
        return field;
    }


    openLobbyList(additionalData = {}) {
        const nickname = this.nickname.trim();
        if (!nickname) {
            this.showMessage('Enter a nickname first.');
            this.focusField(this.nicknameField);
            this.restartEmptyFieldAnimation(this.nicknameField);
            return;
        }

        this.scene.start('LobbyList', {
            displayName: nickname,
            isMan: this.gender === 'Male',
            isMuslim: this.religion === 'Islam',
            ...additionalData
        });
    }

    createButton(x, y, width, height, label, onClick) {
        const background = this.rexUI.add.roundRectangle(0, 0, width, height, 16, 0x9cbfd9, 1)
            .setStrokeStyle(7, 0x2b5e8a, 1);

        const buttonText = this.add.text(0, 0, label, {
            fontFamily: 'Georgia, serif',
            fontSize: '38px',
            color: TEXT_COLOR,
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

        button.on('pointerover', () => background.setFillStyle(0x8FA9BF, 1));
        button.on('pointerout', () => background.setFillStyle(0x9cbfd9, 1));
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

    createDropdown(x, y, options, initialValue, onSelect) {
        const background = this.rexUI.add.roundRectangle(0, 0, 500, 74, 16, 0xffffff, 1)
            .setStrokeStyle(5, PANEL_STROKE, 0.95);

        const text = this.add.text(0, 0, initialValue, {
            fontFamily: 'Georgia, serif',
            fontSize: '30px',
            color: TEXT_COLOR,
        }).setOrigin(0, 0.5);

        const arrow = this.add.text(0, 0, '▼', {
            fontFamily: 'Georgia, serif',
            fontSize: '30px',
            color: TEXT_COLOR,
            stroke: '#214c74',
            strokeThickness: 5
        }).setOrigin(0.5);

        const dropdown = this.rexUI.add.label({
            x,
            y,
            width: 330,
            height: 40,
            background,
            text,
            icon: arrow,
            align: 'left',
            space: {
                left: 25,
                right: 20,
                top: 10,
                bottom: 10,
                icon: 18
            }
        }).layout().setInteractive({ useHandCursor: true, pixelPerfect: false });

        const optionButtons = options.map((option, index) => {
            const optionBackground = this.rexUI.add.roundRectangle(0, 0, 500, 64, 12, 0x9cbfd9, 1)
                .setStrokeStyle(4, 0x2b5e8a, 1);

            const optionText = this.add.text(0, 0, option.label, {
                fontFamily: 'Georgia, serif',
                fontSize: '28px',
                color: TEXT_COLOR,
            }).setOrigin(0, 0.5);

            const button = this.rexUI.add.label({
                x: 0,
                y: 40 + index * 68,
                width: 200,
                height: 20,
                background: optionBackground,
                text: optionText,
                align: 'left',
                space: {
                    left: 20,
                    right: 20,
                    top: 8,
                    bottom: 8
                }
            }).layout().setOrigin(0.5, 0).setInteractive({ useHandCursor: true, pixelPerfect: false });

            button.on('pointerover', () => optionBackground.setFillStyle(0x8FA9BF, 1));
            button.on('pointerout', () => optionBackground.setFillStyle(0x9cbfd9, 1));
            button.on('pointerdown', () => {
                text.setText(option.label);
                onSelect(option.value);
                this.closeDropdown(dropdownData);
            });

            return button;
        });

        const panelHeight = options.length * 68 + 10;
        const panelBackground = this.rexUI.add.roundRectangle(0, 0, 230, panelHeight, 16, 0x4682b4, 1)
            .setStrokeStyle(5, 0x2b5e8a, 1)
            .setOrigin(0.5, 0);
        const panel = this.add.container(x, y + 40, [panelBackground, ...optionButtons]).setVisible(false).setDepth(250);

        const dropdownData = { container: dropdown, panel, arrow, background, optionButtons };

        dropdown.on('pointerdown', () => {
            if (this.openDropdown && this.openDropdown !== dropdownData) {
                this.closeDropdown(this.openDropdown);
            }

            if (panel.visible) {
                this.closeDropdown(dropdownData);
                return;
            }

            this.openDropdown = dropdownData;
            panel.setVisible(true);
            arrow.setText('▲');
            background.setStrokeStyle(5, 0x214c74, 1);
        });

        return dropdownData;
    }

    closeDropdown(dropdown) {
        if (!dropdown) {
            return;
        }

        dropdown.panel.setVisible(false);
        dropdown.arrow.setText('▼');
        dropdown.background.setStrokeStyle(5, PANEL_STROKE, 0.95);

        if (this.openDropdown === dropdown) {
            this.openDropdown = null;
        }
    }

    isInDropdownHierarchy(gameObject) {
        if (!this.openDropdown || !gameObject) {
            return false;
        }

        if (gameObject === this.openDropdown.container || gameObject === this.openDropdown.panel) {
            return true;
        }

        if (this.openDropdown.optionButtons.includes(gameObject)) {
            return true;
        }

        return this.openDropdown.panel.list?.includes(gameObject) ?? false;
    }

    createEmptyFieldAnimation(field) {
        const { x, y, width, height } = field.config;
        const offset = 10;
        const left = x - width / 2 + 18;
        const right = x + width / 2 - 18;
        const top = y - height / 2 - offset;
        const bottom = y + height / 2 + offset;

        const orbit = this.add.circle(left, top, 7, EMPTY_FIELD_HINT, 0.95).setDepth(50).setVisible(false);
        const glow = this.add.circle(left, top, 16, EMPTY_FIELD_HINT, 0.28).setDepth(49).setVisible(false);

        const syncGlow = () => glow.setPosition(orbit.x, orbit.y);
        const tween = this.tweens.timeline({
            targets: orbit,
            paused: true,
            repeat: -1,
            tweens: [
                { x: right, y: top, duration: 550, ease: 'Sine.InOut', onUpdate: syncGlow },
                { x: right, y: bottom, duration: 400, ease: 'Sine.InOut', onUpdate: syncGlow },
                { x: left, y: bottom, duration: 550, ease: 'Sine.InOut', onUpdate: syncGlow },
                { x: left, y: top, duration: 400, ease: 'Sine.InOut', onUpdate: syncGlow }
            ]
        });

        return { orbit, glow, tween, left, top };
    }

    updateEmptyFieldAnimation(field) {
        if (!field?.emptyState) {
            return;
        }

        const isEmpty = !field.input.value.trim();
        const { orbit, glow, tween, left, top } = field.emptyState;

        if (!isEmpty) {
            tween.pause();
            orbit.setVisible(false);
            glow.setVisible(false);
            orbit.setPosition(left, top);
            glow.setPosition(left, top);
            return;
        }

        orbit.setVisible(true);
        glow.setVisible(true);

        if (!tween.isPlaying()) {
            tween.play();
        }
    }

    restartEmptyFieldAnimation(field) {
        if (!field?.emptyState) {
            return;
        }

        const { tween, orbit, glow, left, top } = field.emptyState;
        orbit.setPosition(left, top).setVisible(true);
        glow.setPosition(left, top).setVisible(true);
        tween.restart();
    }

    focusField(field) {
        if (field?.input && !field.input.disabled) {
            field.input.focus();
            field.input.setSelectionRange?.(field.input.value.length, field.input.value.length);
        }
    }

    setFieldFocused(background, isFocused) {
        background?.setStrokeStyle(5, isFocused ? FOCUSED_STROKE : PANEL_STROKE, 1);
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
