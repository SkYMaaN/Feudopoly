import { getOrCreateProfile } from '../network/profileStorage.js';

const COLORS = {
    background: 0x9cbfd9,
    panel: 0x4682b4,
    panelStroke: 0x2b5e8a,
    panelShadow: 0x214c74,
    card: 0x5b94bf,
    inputFill: 0xffffff,
    buttonFill: 0x9cbfd9,
    buttonHover: 0x8fa9bf,
    buttonDisabled: 0x6d879c,
    optionFill: 0xdbe8f3,
    optionHover: 0xc7d9e8,
    optionSelected: 0x214c74,
    optionSelectedHover: 0x285d8e,
    error: 0xa81818,
    errorFill: 0xf7d8d8,
    text: '#FF0000',
    lightText: '#F7F0E6',
    mutedText: '#6E1C1C',
    selectedText: '#F7F0E6',
    placeholderText: '#B44A4A'
};

const RELIGION_OPTIONS = [
    { label: 'Islam', value: 'Islam' },
    { label: 'Other', value: 'Other', defaultSelected: true }
];

const GENDER_OPTIONS = [
    { label: 'Male', value: 'Male', defaultSelected: true },
    { label: 'Female', value: 'Female' },
    { label: 'Other', value: 'Other' }
];

function getDefaultOptionValue(options) {
    return options.find((option) => option.defaultSelected)?.value ?? options[0]?.value ?? null;
}

export class Start extends Phaser.Scene {
    constructor() {
        super('Start');
        this.nickname = '';
        this.activeInputKey = 'nickname';
        this.religion = getDefaultOptionValue(RELIGION_OPTIONS);
        this.gender = getDefaultOptionValue(GENDER_OPTIONS);
        this.hasAttemptedSubmit = false;
        this.ui = {};
    }

    preload() {
        this.load.scenePlugin({
            key: 'rexuiplugin',
            url: 'plugins/rexuiplugin.min.js',
            sceneKey: 'rexUI'
        });
    }

    create() {
        const profile = getOrCreateProfile();
        this.nickname = profile.displayName ?? '';

        this.createBackground();
        this.createContent();
        this.createHiddenNicknameInput();
        this.layoutUI(this.scale.gameSize);
        this.updateNicknameDisplay();
        this.updateFormState();

        this.scale.on('resize', this.handleResize, this);
        this.events.once('shutdown', this.handleShutdown, this);
        this.events.once('destroy', this.handleShutdown, this);

        this.input.keyboard?.on('keydown-ENTER', this.handleEnterSubmit, this);
        this.time.delayedCall(60, () => this.focusNicknameField(true));
    }

    createBackground() {
        this.ui.background = this.add.rectangle(0, 0, 0, 0, COLORS.background, 1).setOrigin(0.5);
        this.ui.panelShadow = this.add.rectangle(0, 0, 0, 0, COLORS.panelShadow, 0.22).setOrigin(0.5);
        this.ui.panel = this.rexUI.add.roundRectangle(0, 0, 0, 0, 34, COLORS.panel, 1)
            .setStrokeStyle(10, COLORS.panelStroke, 1);
    }

    createContent() {
        this.ui.title = this.add.text(0, 0, 'FEUDOPOLY', {
            fontFamily: 'Georgia, serif',
            fontSize: '110px',
            color: COLORS.text,
            fontStyle: 'bold'
        }).setOrigin(0.5);

        this.ui.subtitle = this.add.text(0, 0, 'A medieval board of feuds and fortune', {
            fontFamily: 'Georgia, serif',
            fontSize: '30px',
            color: COLORS.text,
            align: 'center'
        }).setOrigin(0.5);

        this.ui.formTitle = this.add.text(0, 0, 'Prepare your profile', {
            fontFamily: 'Georgia, serif',
            fontSize: '48px',
            color: COLORS.lightText,
            fontStyle: 'bold'
        }).setOrigin(0.5);

        this.ui.formHint = this.add.text(0, 0, 'Choose how you will appear in the lobby before the match begins.', {
            fontFamily: 'Arial, sans-serif',
            fontSize: '24px',
            color: '#E9F2F9',
            align: 'center',
            wordWrap: { width: 720 }
        }).setOrigin(0.5);

        this.ui.identityCard = this.rexUI.add.roundRectangle(0, 0, 0, 0, 24, COLORS.card, 0.94)
            .setStrokeStyle(4, COLORS.panelShadow, 0.55);
        this.ui.preferencesCard = this.rexUI.add.roundRectangle(0, 0, 0, 0, 24, COLORS.card, 0.94)
            .setStrokeStyle(4, COLORS.panelShadow, 0.55);

        this.ui.identityTitle = this.add.text(0, 0, 'Nickname', {
            fontFamily: 'Georgia, serif',
            fontSize: '32px',
            color: COLORS.lightText,
            fontStyle: 'bold'
        }).setOrigin(0.5);

        this.ui.preferencesTitle = this.add.text(0, 0, 'Identity settings', {
            fontFamily: 'Georgia, serif',
            fontSize: '32px',
            color: COLORS.lightText,
            fontStyle: 'bold'
        }).setOrigin(0.5);

        this.nicknameField = this.createInputField('Enter your nickname', 28);
        this.ui.nicknameError = this.add.text(0, 0, '', {
            fontFamily: 'Arial, sans-serif',
            fontSize: '22px',
            color: '#FFD7D7',
            wordWrap: { width: 680 }
        }).setOrigin(0.5, 0);

        this.religionGroup = this.createToggleGroup({
            title: 'Religion',
            options: RELIGION_OPTIONS,
            selectedValue: this.religion,
            onChange: (value) => {
                this.religion = value;
            }
        });

        this.genderGroup = this.createToggleGroup({
            title: 'Gender',
            options: GENDER_OPTIONS,
            selectedValue: this.gender,
            onChange: (value) => {
                this.gender = value;
            }
        });

        this.ui.formError = this.add.text(0, 0, '', {
            fontFamily: 'Arial, sans-serif',
            fontSize: '24px',
            color: '#FFE6E6',
            align: 'center',
            wordWrap: { width: 720 }
        }).setOrigin(0.5);

        this.submitButton = this.createButton('LOBBIES', () => this.handleContinue());
    }

    createHiddenNicknameInput() {
        this.nicknameDomInput = this.add.dom(-1000, -1000, 'input');
        const input = this.nicknameDomInput.node;
        input.type = 'text';
        input.maxLength = this.nicknameField.maxLength;
        input.value = this.nickname;
        input.autocomplete = 'nickname';
        input.spellcheck = false;
        input.setAttribute('autocapitalize', 'none');
        input.setAttribute('enterkeyhint', 'go');
        input.setAttribute('aria-label', 'Nickname');
        input.style.position = 'absolute';
        input.style.opacity = '0';
        input.style.pointerEvents = 'none';
        input.style.width = '1px';
        input.style.height = '1px';
        input.style.border = '0';
        input.style.padding = '0';

        input.addEventListener('input', this.handleNicknameInput);
        input.addEventListener('blur', this.handleDomBlur);
        input.addEventListener('keydown', this.handleDomKeydown);
    }

    createInputField(placeholder, maxLength) {
        const background = this.rexUI.add.roundRectangle(0, 0, 680, 88, 20, COLORS.inputFill, 1)
            .setStrokeStyle(5, COLORS.panelStroke, 0.95);

        const text = this.add.text(0, 0, placeholder, {
            fontFamily: 'Arial, sans-serif',
            fontSize: '30px',
            color: COLORS.placeholderText
        }).setOrigin(0, 0.5);

        const indicator = this.add.text(0, 0, 'Tap to type', {
            fontFamily: 'Arial, sans-serif',
            fontSize: '22px',
            color: '#7A2727'
        }).setOrigin(1, 0.5);

        const label = this.rexUI.add.label({
            x: 0,
            y: 0,
            width: 680,
            height: 88,
            background,
            text,
            icon: indicator,
            align: 'left',
            space: {
                left: 24,
                right: 24,
                top: 16,
                bottom: 16,
                icon: 16
            }
        }).layout().setInteractive({ useHandCursor: true, pixelPerfect: false });

        label.on('pointerdown', () => this.focusNicknameField(true));

        return { container: label, background, text, indicator, placeholder, maxLength };
    }

    createToggleGroup({ title, options, selectedValue, onChange }) {
        const titleText = this.add.text(0, 0, title, {
            fontFamily: 'Georgia, serif',
            fontSize: '28px',
            color: COLORS.lightText,
            fontStyle: 'bold'
        }).setOrigin(0.5);

        const errorText = this.add.text(0, 0, '', {
            fontFamily: 'Arial, sans-serif',
            fontSize: '20px',
            color: '#FFD7D7',
            wordWrap: { width: 680 }
        }).setOrigin(0.5, 0);

        const buttons = options.map((option) => this.createOptionButton(option, selectedValue, () => {
            onChange(option.value);
            this.setToggleGroupValue(group, option.value);
        }));

        const group = { titleText, errorText, buttons, onChange, options, selectedValue };
        this.setToggleGroupValue(group, selectedValue, false);
        return group;
    }

    createOptionButton(option, selectedValue, onClick) {
        const background = this.rexUI.add.roundRectangle(0, 0, 190, 68, 16, COLORS.optionFill, 1)
            .setStrokeStyle(4, COLORS.panelStroke, 1);

        const text = this.add.text(0, 0, option.label, {
            fontFamily: 'Georgia, serif',
            fontSize: '28px',
            color: COLORS.text,
            fontStyle: 'bold'
        }).setOrigin(0.5);

        const button = this.rexUI.add.label({
            x: 0,
            y: 0,
            width: 190,
            height: 68,
            background,
            text,
            align: 'center'
        }).layout().setInteractive({ useHandCursor: true, pixelPerfect: false });

        const buttonData = { option, button, background, text, selected: option.value === selectedValue };

        button.on('pointerover', () => {
            if (!buttonData.selected) {
                background.setFillStyle(COLORS.optionHover, 1);
            } else {
                background.setFillStyle(COLORS.optionSelectedHover, 1);
            }
        });

        button.on('pointerout', () => {
            this.applyOptionButtonState(buttonData, buttonData.selected);
        });

        button.on('pointerdown', () => {
            this.focusNicknameField(false);
            onClick();
        });

        this.applyOptionButtonState(buttonData, buttonData.selected);
        return buttonData;
    }

    createButton(label, onClick) {
        const background = this.rexUI.add.roundRectangle(0, 0, 360, 92, 18, COLORS.buttonFill, 1)
            .setStrokeStyle(7, COLORS.panelStroke, 1);

        const text = this.add.text(0, 0, label, {
            fontFamily: 'Georgia, serif',
            fontSize: '38px',
            color: COLORS.text,
            fontStyle: 'bold'
        }).setOrigin(0.5);

        const button = this.rexUI.add.label({
            x: 0,
            y: 0,
            width: 360,
            height: 92,
            background,
            text,
            align: 'center'
        }).layout().setInteractive({ useHandCursor: true, pixelPerfect: false });

        const buttonData = { button, background, text, disabled: false };

        button.on('pointerover', () => {
            if (!buttonData.disabled) {
                background.setFillStyle(COLORS.buttonHover, 1);
            }
        });

        button.on('pointerout', () => {
            this.applySubmitButtonState();
        });

        button.on('pointerdown', () => {
            this.focusNicknameField(false);
            onClick();
        });

        this.tweens.add({
            targets: button,
            scaleX: 1.02,
            scaleY: 1.02,
            duration: 1000,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.InOut'
        });

        return buttonData;
    }

    layoutUI(size) {
        const width = size.width;
        const height = size.height;
        const centerX = width / 2;
        const centerY = height / 2;
        const panelWidth = Math.min(width * 0.62, 920);
        const panelHeight = Math.min(height * 0.82, 860);
        const cardWidth = panelWidth - 110;
        const cardX = centerX;
        const topY = centerY - panelHeight / 2;

        this.ui.background.setPosition(centerX, centerY).setSize(width, height);
        this.ui.panelShadow.setPosition(centerX + 12, centerY + 18).setSize(panelWidth, panelHeight);
        this.ui.panel.setPosition(centerX, centerY).setSize(panelWidth, panelHeight);

        this.ui.title.setPosition(centerX, topY + 92);
        this.ui.subtitle.setPosition(centerX, topY + 152);
        this.ui.formTitle.setPosition(centerX, topY + 230);
        this.ui.formHint.setPosition(centerX, topY + 282).setWordWrapWidth(cardWidth - 30);

        this.ui.identityCard.setPosition(cardX, topY + 408).setSize(cardWidth, 190);
        this.ui.identityTitle.setPosition(cardX, topY + 352);
        this.nicknameField.container.setPosition(cardX, topY + 410);
        this.ui.nicknameError.setPosition(cardX, topY + 468).setWordWrapWidth(cardWidth - 36);

        this.ui.preferencesCard.setPosition(cardX, topY + 630).setSize(cardWidth, 254);
        this.ui.preferencesTitle.setPosition(cardX, topY + 536);

        this.layoutToggleGroup(this.religionGroup, cardX, topY + 596, cardWidth);
        this.layoutToggleGroup(this.genderGroup, cardX, topY + 700, cardWidth);

        this.ui.formError.setPosition(centerX, topY + panelHeight - 120).setWordWrapWidth(cardWidth - 30);
        this.submitButton.button.setPosition(centerX, topY + panelHeight - 52);
    }

    layoutToggleGroup(group, centerX, y, cardWidth) {
        group.titleText.setPosition(centerX, y);

        const buttonWidth = 190;
        const buttonGap = 18;
        const totalWidth = (group.buttons.length * buttonWidth) + ((group.buttons.length - 1) * buttonGap);
        const startX = centerX - (totalWidth / 2) + (buttonWidth / 2);
        const buttonsY = y + 54;

        group.buttons.forEach((buttonData, index) => {
            buttonData.button.setPosition(startX + index * (buttonWidth + buttonGap), buttonsY);
        });

        group.errorText.setPosition(centerX, y + 96).setWordWrapWidth(cardWidth - 36);
    }

    handleResize(gameSize) {
        this.layoutUI(gameSize);
    }

    handleEnterSubmit(event) {
        if (event.repeat) {
            return;
        }

        if (this.nicknameDomInput?.node && document.activeElement === this.nicknameDomInput.node) {
            return;
        }

        this.handleContinue();
    }

    handleDomKeydown = (event) => {
        if (event.key === 'Enter') {
            event.preventDefault();
            this.handleContinue();
        }
    };

    handleNicknameInput = (event) => {
        this.nickname = event.target.value.slice(0, this.nicknameField.maxLength);
        if (event.target.value !== this.nickname) {
            event.target.value = this.nickname;
        }

        this.updateNicknameDisplay();
        this.updateFormState();
    };

    handleDomBlur = () => {
        this.activeInputKey = null;
        this.updateInputFocusState();
    };

    focusNicknameField(shouldFocusDom = true) {
        this.activeInputKey = 'nickname';
        this.updateInputFocusState();

        if (shouldFocusDom && this.nicknameDomInput?.node) {
            this.nicknameDomInput.node.focus();
        }
    }

    updateNicknameDisplay() {
        const hasValue = Boolean(this.nickname.trim());
        this.nicknameField.text.setText(hasValue ? this.nickname : this.nicknameField.placeholder);
        this.nicknameField.text.setColor(hasValue ? COLORS.text : COLORS.placeholderText);
        this.nicknameField.indicator.setText(this.activeInputKey === 'nickname' ? 'Typing…' : 'Tap to type');
    }

    updateInputFocusState() {
        const isFocused = this.activeInputKey === 'nickname';
        this.nicknameField.background.setStrokeStyle(5, isFocused ? COLORS.panelShadow : COLORS.panelStroke, 1);
        this.nicknameField.indicator.setText(isFocused ? 'Typing…' : 'Tap to type');
    }

    setToggleGroupValue(group, value, updateForm = true) {
        group.selectedValue = value;
        group.buttons.forEach((buttonData) => {
            const isSelected = buttonData.option.value === value;
            buttonData.selected = isSelected;
            this.applyOptionButtonState(buttonData, isSelected);
        });

        if (updateForm) {
            this.updateFormState();
        }
    }

    applyOptionButtonState(buttonData, isSelected) {
        if (isSelected) {
            buttonData.background.setFillStyle(COLORS.optionSelected, 1);
            buttonData.background.setStrokeStyle(4, 0xffffff, 0.95);
            buttonData.text.setColor(COLORS.selectedText);
        } else {
            buttonData.background.setFillStyle(COLORS.optionFill, 1);
            buttonData.background.setStrokeStyle(4, COLORS.panelStroke, 1);
            buttonData.text.setColor(COLORS.text);
        }
    }

    validateForm() {
        const errors = {};

        if (!this.nickname.trim()) {
            errors.nickname = 'Nickname is required.';
        }

        if (!this.religion) {
            errors.religion = 'Choose one religion option.';
        }

        if (!this.gender) {
            errors.gender = 'Choose one gender option.';
        }

        return errors;
    }

    updateFormState() {
        const errors = this.validateForm();
        const showErrors = this.hasAttemptedSubmit;
        const hasErrors = Object.keys(errors).length > 0;

        this.ui.nicknameError.setText(showErrors ? (errors.nickname ?? '') : '');
        this.religionGroup.errorText.setText(showErrors ? (errors.religion ?? '') : '');
        this.genderGroup.errorText.setText(showErrors ? (errors.gender ?? '') : '');
        this.ui.formError.setText(showErrors && hasErrors ? 'Please correct the highlighted fields before continuing.' : '');

        this.nicknameField.background
            .setFillStyle(showErrors && errors.nickname ? COLORS.errorFill : COLORS.inputFill, 1)
            .setStrokeStyle(5, showErrors && errors.nickname ? COLORS.error : (this.activeInputKey === 'nickname' ? COLORS.panelShadow : COLORS.panelStroke), 1);

        this.religionGroup.titleText.setColor(showErrors && errors.religion ? '#FFE6E6' : COLORS.lightText);
        this.genderGroup.titleText.setColor(showErrors && errors.gender ? '#FFE6E6' : COLORS.lightText);

        this.submitButton.disabled = hasErrors;
        this.applySubmitButtonState();
    }

    applySubmitButtonState() {
        const isDisabled = this.submitButton.disabled;
        this.submitButton.background.setFillStyle(isDisabled ? COLORS.buttonDisabled : COLORS.buttonFill, 1);
        this.submitButton.background.setStrokeStyle(7, isDisabled ? COLORS.panelShadow : COLORS.panelStroke, 1);
        this.submitButton.button.setAlpha(isDisabled ? 0.82 : 1);
    }

    handleContinue() {
        this.hasAttemptedSubmit = true;
        this.updateFormState();

        if (this.submitButton.disabled) {
            if (!this.nickname.trim()) {
                this.focusNicknameField(true);
            }

            this.bumpInvalidFeedback();
            return;
        }

        this.scene.start('LobbyList', {
            displayName: this.nickname.trim(),
            isMan: this.gender === 'Male',
            isMuslim: this.religion === 'Islam'
        });
    }

    bumpInvalidFeedback() {
        this.tweens.killTweensOf(this.ui.formError);
        this.ui.formError.setAlpha(1);
        this.tweens.add({
            targets: [this.ui.formError, this.nicknameField.container],
            x: '+=10',
            duration: 70,
            yoyo: true,
            repeat: 1
        });
    }

    handleShutdown() {
        this.scale.off('resize', this.handleResize, this);
        this.input.keyboard?.off('keydown-ENTER', this.handleEnterSubmit, this);

        if (this.nicknameDomInput?.node) {
            this.nicknameDomInput.node.removeEventListener('input', this.handleNicknameInput);
            this.nicknameDomInput.node.removeEventListener('blur', this.handleDomBlur);
            this.nicknameDomInput.node.removeEventListener('keydown', this.handleDomKeydown);
            this.nicknameDomInput.node.blur();
        }
    }
}
