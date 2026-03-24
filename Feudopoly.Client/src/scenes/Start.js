const PANEL_STROKE = 0x2b5e8a;
const TEXT_COLOR = '#FF0000';
const INPUT_TEXT_COLOR = '#1d3557';
const FOCUSED_STROKE = 0x214c74;

export class Start extends Phaser.Scene {
    constructor() {
        super('Start');
        this.nickname = '';
        this.gender = 'Other';
        this.religion = 'Islam';
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

        this.genderLabel = this.add.text(width / 2, height / 2 - 100, 'Gender', {
            fontFamily: 'Georgia, serif',
            fontSize: '30px',
            color: TEXT_COLOR
        }).setOrigin(0.5);

        this.genderDropdown = this.createDropdown(width / 2, height / 2 - 40, [
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
        this.time.delayedCall(60, () => this.focusField(this.nicknameField));

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

        input.addEventListener('input', () => config.onChange?.(input.value));

        input.addEventListener('focus', () => this.setFieldFocused(background, true));
        input.addEventListener('blur', () => this.setFieldFocused(background, false));

        shell.setInteractive({ useHandCursor: true });
        shell.on('pointerdown', () => input.focus());

        return { input };
    }


    openLobbyList(additionalData = {}) {
        const nickname = this.nickname.trim();
        if (!nickname) {
            this.showMessage('Enter a nickname first.');
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

        const dropdown = this.rexUI.add.dropDownList({
            x,
            y,
            width: 330,
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
            },
            options: options.map((option) => ({ text: option.label, value: option.value })),
            value: initialValue,
            setValueCallback: (dropDownList, value) => {
                const selectedOption = dropDownList.options.find((option) => option.value === value);
                text.setText(selectedOption?.text ?? '');
                onSelect(value);
            },
            list: {
                createBackgroundCallback: () => this.rexUI.add.roundRectangle(0, 0, 230, 10, 16, 0x4682b4, 1)
                    .setStrokeStyle(5, 0x2b5e8a, 1),
                createButtonCallback: (scene, option) => {
                    const optionBackground = this.rexUI.add.roundRectangle(0, 0, 500, 64, 12, 0x9cbfd9, 1)
                        .setStrokeStyle(4, 0x2b5e8a, 1);

                    const optionText = this.add.text(0, 0, option.text, {
                        fontFamily: 'Georgia, serif',
                        fontSize: '28px',
                        color: TEXT_COLOR,
                    }).setOrigin(0, 0.5);

                    return this.rexUI.add.label({
                        x: 0,
                        y: 0,
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
                    }).layout();
                },
                onButtonOver: (button) => {
                    button.getElement('background')?.setFillStyle(0x8FA9BF, 1);
                },
                onButtonOut: (button) => {
                    button.getElement('background')?.setFillStyle(0x9cbfd9, 1);
                },
                onButtonClick: (button, index, pointer, event) => {
                    event?.stopPropagation?.();
                },
                easeIn: 0,
                easeOut: 0
            }
        }).layout();

        dropdown.on('list.open', (dropDownList, listPanel) => {
            listPanel.setDepth(1000);
            arrow.setText('▲');
            background.setStrokeStyle(5, FOCUSED_STROKE, 1);
        });

        dropdown.on('list.close', () => {
            arrow.setText('▼');
            background.setStrokeStyle(5, PANEL_STROKE, 0.95);
        });

        return dropdown;
    }

    focusField(field) {
        if (field?.input && !field.input.disabled) {
            field.input.focus();
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
