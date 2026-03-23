import { lobbyApi } from '../network/lobbyApi.js';
import { lobbyHubClient } from '../network/lobbyHubClient.js';
import { getOrCreateProfile, saveProfile } from '../network/profileStorage.js';

const LOBBY_MODAL_DEPTH = 200;
const OVERLAY_COLOR = 0x0d1b2a;
const PANEL_COLOR = 0x4682b4;
const PANEL_STROKE = 0x2b5e8a;
const BUTTON_COLOR = 0x9cbfd9;
const BUTTON_HOVER_COLOR = 0x8fa9bf;
const BUTTON_ACTIVE_COLOR = 0xd5e6f5;
const BUTTON_DISABLED_COLOR = 0x6d9dc5;
const ACTIVE_TOGGLE_BORDER_COLOR = 0xff0000;
const ACCESS_OPEN_COLORS = {
    defaultFill: 0x9fd9b7,
    hoverFill: 0x88cda6,
    activeFill: 0x43aa6b,
    disabledFill: 0x7fa08b,
    activeTextColor: '#ffffff',
    inactiveTextColor: '#184d32'
};
const ACCESS_CLOSED_COLORS = {
    defaultFill: 0xe2a2a2,
    hoverFill: 0xd48f8f,
    activeFill: 0xc44545,
    disabledFill: 0x9e7f7f,
    activeTextColor: '#ffffff',
    inactiveTextColor: '#6e1e1e'
};
const DISABLED_INPUT_FILL = 0xd7dee6;
const TEXT_COLOR = '#FF0000';
const INPUT_TEXT_COLOR = '#1d3557';
const PLACEHOLDER_COLOR = '#8a4f4f';
const ERROR_COLOR = '#ffe082';
const FOCUSED_STROKE = 0x214c74;

export class LobbyList extends Phaser.Scene {
    constructor() {
        super('LobbyList');
        this.search = '';
        this.rows = [];
        this.lobbies = [];
        this.hubUnsubscribers = [];
        this.modalElements = [];
        this.modalFields = [];
        this.modalOpen = false;
        this.createLobbyState = this.getDefaultCreateLobbyState();
    }

    preload() {
        this.load.scenePlugin({
            key: 'rexuiplugin',
            url: 'plugins/rexuiplugin.min.js',
            sceneKey: 'rexUI'
        });
    }

    create(data) {
        const { width, height } = this.scale.gameSize;
        this.profile = saveProfile({
            ...getOrCreateProfile(),
            displayName: data.displayName,
            isMan: data.isMan,
            isMuslim: data.isMuslim
        });

        this.add.rectangle(width / 2, height / 2, width, height, 0x4682b4, 1).setOrigin(0.5).setStrokeStyle(10, 0x2b5e8a, 1);
        this.add.text(width / 2, 60, 'Lobby List', { fontFamily: 'Georgia, serif', fontSize: '62px', color: TEXT_COLOR }).setOrigin(0.5);

        /*this.add.text(200, 130, 'Search', {
            fontFamily: 'Georgia, serif',
            fontSize: '30px',
            color: TEXT_COLOR,
            fontStyle: 'bold'
        }).setOrigin(0.5);*/

        this.searchField = this.createSearchField({
            x: 300,
            y: 150,
            width: 500,
            height: 58,
            placeholder: 'Search one lobby...',
            value: this.search,
            maxLength: 32,
            onChange: (value) => {
                this.search = value;
                this.renderRows();
            }
        });

        this.messageText = this.add.text(width / 2, height - 40, '', { fontSize: '24px', color: TEXT_COLOR }).setOrigin(0.5);

        //this.createButton(1700, 70, 260, 60, 'BACK', () => this.scene.start('Start'));
        this.createButton(1700, 70, 260, 60, 'REFRESH', () => this.syncLobbies());
        this.createButton(1700, 150, 260, 60, 'CREATE', () => this.openCreateLobbyModal());

        this.listContainer = this.add.container(70, 250);
        this.input.keyboard.on('keydown', (e) => this.onKey(e));

        this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.cleanupHub, this);
        this.events.once(Phaser.Scenes.Events.DESTROY, this.cleanupHub, this);
        this.scale.on(Phaser.Scale.Events.RESIZE, this.handleResize, this);

        this.bootLobbyRealtime();
        this.time.delayedCall(60, () => {
            if (data.openCreateLobbyModal) {
                this.openCreateLobbyModal();
                return;
            }

            this.focusField(this.searchField);
        });
    }

    async bootLobbyRealtime() {
        await this.syncLobbies();

        try {
            this.registerHubHandlers();
            await lobbyHubClient.connect();
            await lobbyHubClient.subscribeLobbyList();
            this.showMessage('');
        } catch (e) {
            this.showMessage(`Realtime disabled: ${e.message}`);
        }
    }

    registerHubHandlers() {
        this.hubUnsubscribers.forEach(unsubscribe => unsubscribe());
        this.hubUnsubscribers = [
            lobbyHubClient.on('lobbyListChanged', (lobby) => {
                this.upsertLobby(lobby);
                this.renderRows();
            }),
            lobbyHubClient.on('lobbyListDeleted', (lobbyId) => {
                this.removeLobby(lobbyId);
                this.renderRows();
            }),
            lobbyHubClient.on('reconnecting', () => {
                this.showMessage('Realtime reconnecting...');
            }),
            lobbyHubClient.on('reconnected', async () => {
                await lobbyHubClient.subscribeLobbyList();
                await this.syncLobbies();
                this.showMessage('');
            }),
            lobbyHubClient.on('error', () => {
                this.showMessage('Realtime connection closed. Press Refresh to sync.');
            })
        ];
    }

    async syncLobbies() {
        try {
            this.lobbies = await lobbyApi.list(this.search);
            this.renderRows();
            this.showMessage('');
        } catch (e) {
            this.showMessage(e.message);
        }
    }

    upsertLobby(lobby) {
        const idx = this.lobbies.findIndex(item => item.lobbyId === lobby.lobbyId);
        if (idx === -1) {
            this.lobbies.push(lobby);
            return;
        }

        this.lobbies[idx] = lobby;
    }

    removeLobby(lobbyId) {
        this.lobbies = this.lobbies.filter(lobby => lobby.lobbyId !== lobbyId);
    }

    renderRows() {
        this.listContainer.removeAll(true);
        this.rows = [];

        const normalizedSearch = this.search.trim().toLowerCase();
        const visibleLobbies = this.lobbies.filter(lobby => !normalizedSearch || lobby.name.toLowerCase().includes(normalizedSearch));

        visibleLobbies.forEach((lobby, idx) => {
            const y = idx * 75;
            const hasFreeSlots = lobby.currentPlayers < lobby.maxPlayers;
            const bg = this.add.rectangle(0, y, 1275, 64, 0x7faed3, 0.95).setOrigin(0, 0);
            const text = this.add.text(20, y + 16,
                `\'${lobby.name}\' | [${lobby.currentPlayers}/${lobby.maxPlayers}]  ${this.getLobbyStatusText(lobby.status)} | ${lobby.accessType == 1 ? 'Private' : 'Public'}`,
                { fontSize: '26px', color: TEXT_COLOR });
            const detailsBtn = this.createButton(1000, y + 32, 150, 40, 'DETAILS', () => this.openLobby(lobby));
            const joinBtn = this.createButton(1170, y + 32, 150, 40, 'JOIN', async () => this.joinLobby(lobby));
            this.setButtonDisabled(joinBtn, !hasFreeSlots);
            this.listContainer.add([bg, text, detailsBtn, joinBtn]);
            this.rows.push({ bg, text, detailsBtn, joinBtn });
        });
    }

    getLobbyStatusText(statusNumber) {
        const statuses = {
            0: 'Waiting for players',
            1: 'Ready',
            2: 'Launching',
            3: 'In progress',
            4: 'Completed'
        };

        return statuses[statusNumber] ?? 'Unknown status';
    }

    getDefaultCreateLobbyState() {
        return {
            name: '',
            password: '',
            accessType: 0,
            maxPlayers: 4,
            errors: {},
            formError: '',
            submitting: false
        };
    }

    openCreateLobbyModal() {
        if (this.modalOpen) {
            return;
        }

        this.modalOpen = true;
        this.createLobbyState = this.getDefaultCreateLobbyState();
        this.showMessage('');

        const { width, height } = this.scale.gameSize;
        const panelWidth = Math.min(width * 0.7, 860);
        const panelHeight = Math.min(height * 0.74, 770);
        const centerX = width / 2;
        const centerY = height / 2;
        const layout = this.getCreateLobbyLayout(panelWidth, panelHeight);

        this.modalBackdrop = this.add.rectangle(centerX, centerY, width, height, OVERLAY_COLOR, 0.72)
            .setDepth(LOBBY_MODAL_DEPTH)
            .setInteractive();

        const panelBackground = this.rexUI.add.roundRectangle(0, 0, panelWidth, panelHeight, 28, PANEL_COLOR, 0.98)
            .setStrokeStyle(8, PANEL_STROKE, 1);
        const panel = this.rexUI.add.label({
            x: centerX,
            y: centerY,
            width: panelWidth,
            height: panelHeight,
            background: panelBackground,
            align: 'center'
        }).layout().setDepth(LOBBY_MODAL_DEPTH + 1);

        const title = this.add.text(centerX, centerY - panelHeight / 2 + 56, 'Create lobby', {
            fontFamily: 'Georgia, serif',
            fontSize: `${layout.titleFontSize}px`,
            color: TEXT_COLOR,
            fontStyle: 'bold'
        }).setOrigin(0.5).setDepth(LOBBY_MODAL_DEPTH + 2);

        const subtitle = this.add.text(centerX, centerY - panelHeight / 2 + 102, 'Set lobby parameters.', {
            fontFamily: 'Georgia, serif',
            fontSize: `${layout.subtitleFontSize}px`,
            color: '#ffe7cf',
            align: 'center'
        }).setOrigin(0.5).setDepth(LOBBY_MODAL_DEPTH + 2);

        this.formErrorText = this.add.text(centerX, centerY - panelHeight / 2 + 128, '', {
            fontFamily: 'Arial, sans-serif',
            fontSize: `${layout.errorFontSize}px`,
            color: ERROR_COLOR,
            align: 'center',
            wordWrap: { width: panelWidth - layout.paddingX * 2 }
        }).setOrigin(0.5).setDepth(LOBBY_MODAL_DEPTH + 2);

        this.nameField = this.createModalTextField({
            key: 'name',
            label: 'Lobby name',
            placeholder: 'Enter lobby name',
            type: 'text',
            maxLength: 32,
            x: centerX,
            labelY: centerY - panelHeight / 2 + 155,
            inputY: centerY - panelHeight / 2 + 210,
            width: panelWidth - layout.paddingX * 2,
            height: layout.inputHeight,
            fontSize: layout.inputFontSize,
            errorFontSize: layout.errorFontSize
        });

        this.playersField = this.createPlayersCountField({
            x: centerX,
            labelY: centerY - panelHeight / 2 + 288,
            controlY: centerY - panelHeight / 2 + 343,
            width: panelWidth - layout.paddingX * 2,
            height: layout.inputHeight,
            fontSize: layout.inputFontSize,
            errorFontSize: layout.errorFontSize
        });

        this.accessTypeField = this.createAccessTypeField({
            x: centerX,
            labelY: centerY - panelHeight / 2 + 403,
            controlY: centerY - panelHeight / 2 + 459,
            width: panelWidth - layout.paddingX * 2,
            height: layout.inputHeight,
            fontSize: layout.inputFontSize,
            errorFontSize: layout.errorFontSize
        });

        this.passwordField = this.createModalTextField({
            key: 'password',
            label: 'Password',
            placeholder: 'Minimum 3 characters',
            type: 'password',
            maxLength: 32,
            x: centerX,
            labelY: centerY - panelHeight / 2 + 550,
            inputY: centerY - panelHeight / 2 + 605,
            width: panelWidth - layout.paddingX * 2,
            height: layout.inputHeight,
            fontSize: layout.inputFontSize,
            errorFontSize: layout.errorFontSize
        });

        this.backModalButton = this.createModalButton(centerX - panelWidth * 0.18, centerY + panelHeight / 2 - 55, layout.buttonWidth, layout.buttonHeight, 'BACK', () => this.closeCreateLobbyModal());
        this.createModalButtonControl = this.createModalButton(centerX + panelWidth * 0.18, centerY + panelHeight / 2 - 55, layout.buttonWidth, layout.buttonHeight, 'CREATE', () => this.submitCreateLobby());

        this.modalElements = [
            this.modalBackdrop,
            panel,
            title,
            subtitle,
            this.formErrorText,
            ...this.nameField.displayObjects,
            ...this.playersField.displayObjects,
            ...this.accessTypeField.displayObjects,
            ...this.passwordField.displayObjects,
            this.backModalButton,
            this.createModalButtonControl
        ];
        this.modalFields = [this.nameField, this.passwordField];

        this.refreshCreateLobbyForm();
        this.setCreateLobbySubmitting(false);
        this.time.delayedCall(60, () => this.focusModalField(this.nameField));
    }

    getCreateLobbyLayout(panelWidth, panelHeight) {
        return {
            paddingX: Math.max(48, Math.round(panelWidth * 0.08)),
            titleFontSize: panelWidth < 700 ? 34 : 42,
            subtitleFontSize: panelWidth < 700 ? 18 : 22,
            inputHeight: panelHeight < 640 ? 58 : 64,
            inputFontSize: panelWidth < 700 ? 24 : 28,
            errorFontSize: panelWidth < 700 ? 18 : 20,
            buttonWidth: panelWidth < 700 ? 220 : 250,
            buttonHeight: 64
        };
    }

    createModalTextField(config) {
        const label = this.add.text(config.x - config.width / 2, config.labelY, config.label, {
            fontFamily: 'Georgia, serif',
            fontSize: `${config.fontSize}px`,
            color: TEXT_COLOR,
            fontStyle: 'bold'
        }).setOrigin(0, 0.5).setDepth(LOBBY_MODAL_DEPTH + 2);

        const background = this.rexUI.add.roundRectangle(0, 0, config.width, config.height, 16, 0xffffff, 1)
            .setStrokeStyle(5, PANEL_STROKE, 0.95);
        const shell = this.rexUI.add.label({
            x: config.x,
            y: config.inputY,
            width: config.width,
            height: config.height,
            background,
            align: 'center'
        }).layout().setDepth(LOBBY_MODAL_DEPTH + 1);

        const dom = this.add.dom(config.x - config.width / 2 + 100, config.inputY - 10).createFromHTML(`
            <input
                class="lobby-modal-input"
                type="${config.type}"
                maxlength="${config.maxLength}"
                placeholder="${config.placeholder}"
                autocomplete="off"
                autocapitalize="none"
                spellcheck="false"
            />
        `).setDepth(LOBBY_MODAL_DEPTH + 2);

        const input = dom.node.querySelector('input');
        Object.assign(input.style, {
            width: `${config.width - 30}px`,
            height: `${config.height - 18}px`,
            border: '0',
            outline: 'none',
            background: 'transparent',
            color: INPUT_TEXT_COLOR,
            fontFamily: 'Arial, sans-serif',
            fontSize: `${config.fontSize}px`,
            textAlign: 'left',
            padding: '0 4px',
            borderRadius: '12px'
        });

        if (config.type === 'password') {
            input.setAttribute('inputmode', 'text');
        }

        input.addEventListener('input', () => {
            this.createLobbyState[config.key] = input.value;
            this.createLobbyState.formError = '';
            this.validateCreateLobbyField(config.key);
            this.refreshCreateLobbyForm();
        });

        input.addEventListener('focus', () => this.setFieldFocused(background, true));
        input.addEventListener('blur', () => {
            this.setFieldFocused(background, false);
            this.validateCreateLobbyField(config.key);
            this.refreshCreateLobbyForm();
        });

        shell.setInteractive({ useHandCursor: true });
        shell.on('pointerdown', () => {
            if (!this.createLobbyState.submitting && !input.disabled) {
                input.focus();
            }
        });

        const errorText = this.add.text(config.x - config.width / 2 + 10, config.inputY + config.height / 2 + 5, '', {
            fontFamily: 'Arial, sans-serif',
            fontSize: `${config.errorFontSize}px`,
            color: ERROR_COLOR,
            wordWrap: { width: config.width }
        }).setOrigin(0, 0).setDepth(LOBBY_MODAL_DEPTH + 2);

        return {
            key: config.key,
            container: shell,
            background,
            dom,
            input,
            errorText,
            displayObjects: [label, shell, dom, errorText]
        };
    }

    createPlayersCountField(config) {
        const label = this.add.text(config.x - config.width / 2, config.labelY, 'Players count', {
            fontFamily: 'Georgia, serif',
            fontSize: `${config.fontSize}px`,
            color: TEXT_COLOR,
            fontStyle: 'bold'
        }).setOrigin(0, 0.5).setDepth(LOBBY_MODAL_DEPTH + 2);

        const controlWidth = Math.min(config.width, 520);
        const minusButton = this.createStepperButton(config.x - controlWidth / 2 + 22, config.controlY, 84, config.height, '−', () => this.adjustPlayersCount(-1));
        const plusButton = this.createStepperButton(config.x + controlWidth / 2 - 22, config.controlY, 84, config.height, '+', () => this.adjustPlayersCount(1));

        const valueBackground = this.rexUI.add.roundRectangle(0, 0, controlWidth - 220, config.height, 16, 0xffffff, 1)
            .setStrokeStyle(5, PANEL_STROKE, 0.95);
        const valueContainer = this.rexUI.add.label({
            x: config.x,
            y: config.controlY,
            width: controlWidth - 180,
            height: config.height,
            background: valueBackground,
            align: 'center'
        }).layout().setDepth(LOBBY_MODAL_DEPTH + 1);
        const valueText = this.add.text(config.x, config.controlY - 4, String(this.createLobbyState.maxPlayers), {
            fontFamily: 'Georgia, serif',
            fontSize: `${config.fontSize + 6}px`,
            color: INPUT_TEXT_COLOR,
            fontStyle: 'bold'
        }).setOrigin(0.5).setDepth(LOBBY_MODAL_DEPTH + 2);
        const hintText = this.add.text(config.x, config.controlY + 18, 'Use − / + to pick a value from 1 to 4', {
            fontFamily: 'Arial, sans-serif',
            fontSize: `${Math.max(16, config.errorFontSize - 2)}px`,
            color: PLACEHOLDER_COLOR
        }).setOrigin(0.5).setDepth(LOBBY_MODAL_DEPTH + 2);

        const errorText = this.add.text(config.x - config.width / 2, config.controlY + config.height / 2 + 24, '', {
            fontFamily: 'Arial, sans-serif',
            fontSize: `${config.errorFontSize}px`,
            color: ERROR_COLOR,
            wordWrap: { width: config.width }
        }).setOrigin(0, 0).setDepth(LOBBY_MODAL_DEPTH + 2);

        return {
            valueBackground,
            valueText,
            errorText,
            minusButton,
            plusButton,
            displayObjects: [label, valueContainer, valueText, hintText, minusButton, plusButton, errorText]
        };
    }


    createAccessTypeField(config) {
        const label = this.add.text(config.x - config.width / 2, config.labelY, 'Lobby access', {
            fontFamily: 'Georgia, serif',
            fontSize: `${config.fontSize}px`,
            color: TEXT_COLOR,
            fontStyle: 'bold'
        }).setOrigin(0, 0.5).setDepth(LOBBY_MODAL_DEPTH + 2);

        const groupWidth = Math.min(config.width, 560);
        const buttonGap = 24;
        const buttonWidth = Math.floor((groupWidth - buttonGap) / 2);
        const openButton = this.createModalToggleButton(
            config.x - (buttonWidth + buttonGap) / 2,
            config.controlY,
            buttonWidth,
            config.height,
            'OPEN',
            this.createLobbyState.accessType === 0,
            () => this.setLobbyAccessType(0),
            ACCESS_OPEN_COLORS
        );
        const closedButton = this.createModalToggleButton(
            config.x + (buttonWidth + buttonGap) / 2,
            config.controlY,
            buttonWidth,
            config.height,
            'CLOSED',
            this.createLobbyState.accessType === 1,
            () => this.setLobbyAccessType(1),
            ACCESS_CLOSED_COLORS
        );

        const hintText = this.add.text(config.x, config.controlY + config.height / 2 + 12, 'Open lobbies do not require a password. Closed lobbies require one.', {
            fontFamily: 'Arial, sans-serif',
            fontSize: `${Math.max(16, config.errorFontSize - 2)}px`,
            color: PLACEHOLDER_COLOR,
            align: 'center',
            wordWrap: { width: config.width }
        }).setOrigin(0.5, 0).setDepth(LOBBY_MODAL_DEPTH + 2);

        return {
            openButton,
            closedButton,
            hintText,
            displayObjects: [label, openButton, closedButton, hintText]
        };
    }

    createStepperButton(x, y, width, height, label, onClick) {
        const background = this.rexUI.add.roundRectangle(0, 0, width, height, 16, BUTTON_COLOR, 1)
            .setStrokeStyle(5, PANEL_STROKE, 1);
        const text = this.add.text(0, -2, label, {
            fontFamily: 'Georgia, serif',
            fontSize: '44px',
            color: TEXT_COLOR,
            fontStyle: 'bold'
        }).setOrigin(0.5);
        const button = this.rexUI.add.label({
            x,
            y,
            width,
            height,
            background,
            text,
            align: 'center'
        }).layout().setDepth(LOBBY_MODAL_DEPTH + 2).setInteractive({ useHandCursor: true });

        button.on('pointerover', () => {
            if (!button.input?.enabled) {
                return;
            }

            if (button.toggleColors) {
                this.applyToggleButtonVisualState(button, { useHover: true });
                return;
            }

            background.setFillStyle(BUTTON_HOVER_COLOR, 1);
        });
        button.on('pointerout', () => {
            if (button.toggleColors) {
                this.applyToggleButtonVisualState(button);
                return;
            }

            background.setFillStyle(button.isActive ? BUTTON_ACTIVE_COLOR : BUTTON_COLOR, 1);
        });
        button.on('pointerdown', () => {
            if (!button.input?.enabled) {
                return;
            }

            onClick();
        });

        button.buttonBackground = background;
        button.buttonText = text;
        return button;
    }

    createModalToggleButton(x, y, width, height, label, isActive, onClick, colorSet) {
        const button = this.createModalButton(x, y, width, height, label, onClick);
        button.isActive = isActive;
        button.isDisabled = false;
        button.toggleColors = colorSet;
        this.applyToggleButtonState(button, isActive);
        return button;
    }

    applyToggleButtonState(button, isActive) {
        if (!button?.buttonBackground) {
            return;
        }

        button.isActive = isActive;
        this.applyToggleButtonVisualState(button, { useHover: false });
    }

    applyToggleButtonVisualState(button, { useHover = false } = {}) {
        if (!button?.buttonBackground) {
            return;
        }

        const colors = button.toggleColors;
        const fillColor = button.isDisabled
            ? (colors?.disabledFill ?? BUTTON_DISABLED_COLOR)
            : useHover
                ? (colors?.hoverFill ?? BUTTON_HOVER_COLOR)
                : button.isActive
                    ? (colors?.activeFill ?? BUTTON_ACTIVE_COLOR)
                    : (colors?.defaultFill ?? BUTTON_COLOR);
        const textColor = button.isActive
            ? (colors?.activeTextColor ?? TEXT_COLOR)
            : (colors?.inactiveTextColor ?? TEXT_COLOR);
        const strokeColor = button.isActive
            ? ACTIVE_TOGGLE_BORDER_COLOR
            : PANEL_STROKE;

        button.buttonBackground.setFillStyle(fillColor, 1);
        button.buttonBackground.setStrokeStyle(6, strokeColor, 1);
        button.buttonText.setColor(textColor);
        button.buttonText.setAlpha(button.isDisabled ? 0.6 : (button.isActive ? 1 : 0.92));
    }

    createModalButton(x, y, width, height, label, onClick) {
        const background = this.rexUI.add.roundRectangle(0, 0, width, height, 16, BUTTON_COLOR, 1)
            .setStrokeStyle(6, PANEL_STROKE, 1);

        const buttonText = this.add.text(0, 0, label, {
            fontFamily: 'Georgia, serif',
            fontSize: '28px',
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
        }).layout().setDepth(LOBBY_MODAL_DEPTH + 2).setInteractive({ useHandCursor: true });

        button.on('pointerover', () => {
            if (!button.input?.enabled) {
                return;
            }

            if (button.toggleColors) {
                this.applyToggleButtonVisualState(button, { useHover: true });
                return;
            }

            background.setFillStyle(BUTTON_HOVER_COLOR, 1);
        });
        button.on('pointerout', () => {
            if (button.toggleColors) {
                this.applyToggleButtonVisualState(button);
                return;
            }

            background.setFillStyle(button.isActive ? BUTTON_ACTIVE_COLOR : BUTTON_COLOR, 1);
        });
        button.on('pointerdown', () => {
            if (!button.input?.enabled) {
                return;
            }

            onClick();
        });

        button.buttonBackground = background;
        button.buttonText = buttonText;
        return button;
    }

    createSearchField(config) {
        const background = this.rexUI.add.roundRectangle(0, 0, config.width, config.height, 16, 0x9cbfd9, 1)
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
                class="lobby-search-input"
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
            color: 'red',
            fontFamily: 'Arial, sans-serif',
            fontSize: '30px',
            textAlign: 'left',
            padding: '0 4px',
            borderRadius: '12px'
        });

        input.addEventListener('input', () => config.onChange?.(input.value));
        input.addEventListener('focus', () => this.setFieldFocused(background, true));
        input.addEventListener('blur', () => this.setFieldFocused(background, false));
        input.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                this.syncLobbies();
            }
        });

        shell.setInteractive({ useHandCursor: true });
        shell.on('pointerdown', () => input.focus());

        return { container: shell, background, dom, input };
    }

    focusField(field) {
        if (field?.input && !field.input.disabled) {
            field.input.focus();
        }
    }

    focusModalField(field) {
        if (!field?.input || this.createLobbyState.submitting || field.input.disabled) {
            return;
        }

        field.input.focus();
    }

    setFieldFocused(background, isFocused) {
        background?.setStrokeStyle(5, isFocused ? FOCUSED_STROKE : PANEL_STROKE, 1);
    }

    setLobbyAccessType(accessType) {
        if (this.createLobbyState.submitting || this.createLobbyState.accessType === accessType) {
            return;
        }

        this.createLobbyState.accessType = accessType;
        this.createLobbyState.formError = '';
        this.validateCreateLobbyField('password');
        this.refreshCreateLobbyForm();

        if (accessType === 0) {
            this.passwordField?.input?.blur();
        } else {
            this.focusModalField(this.passwordField);
        }
    }

    adjustPlayersCount(delta) {
        if (this.createLobbyState.submitting) {
            return;
        }

        const nextValue = Phaser.Math.Clamp(this.createLobbyState.maxPlayers + delta, 1, 4);
        this.createLobbyState.maxPlayers = nextValue;
        this.validateCreateLobbyField('maxPlayers');
        this.refreshCreateLobbyForm();
    }

    validateCreateLobbyField(fieldName) {
        const errors = { ...this.createLobbyState.errors };
        const { name, password, maxPlayers, accessType } = this.createLobbyState;

        if (fieldName === 'name') {
            const trimmedName = name.trim();
            if (!trimmedName) {
                errors.name = 'Lobby name is required.';
            } else {
                delete errors.name;
            }
        }

        if (fieldName === 'password') {
            const trimmedPassword = password.trim();
            if (accessType === 1 && trimmedPassword.length < 3) {
                errors.password = 'Password is required for a closed lobby and must contain at least 3 characters.';
            } else {
                delete errors.password;
            }
        }

        if (fieldName === 'maxPlayers') {
            if (!Number.isInteger(maxPlayers) || maxPlayers < 1 || maxPlayers > 4) {
                errors.maxPlayers = 'Players count must stay between 1 and 4.';
            } else {
                delete errors.maxPlayers;
            }
        }

        this.createLobbyState.errors = errors;
        return !errors[fieldName];
    }

    validateCreateLobbyForm() {
        this.validateCreateLobbyField('name');
        this.validateCreateLobbyField('password');
        this.validateCreateLobbyField('maxPlayers');

        const hasErrors = Object.keys(this.createLobbyState.errors).length > 0;
        this.createLobbyState.formError = hasErrors ? 'Please fix the highlighted fields before creating the lobby.' : '';
        this.refreshCreateLobbyForm();

        return !hasErrors;
    }

    refreshCreateLobbyForm() {
        if (!this.modalOpen) {
            return;
        }

        this.nameField.input.value = this.createLobbyState.name;
        this.passwordField.input.value = this.createLobbyState.password;
        this.playersField.valueText.setText(String(1));

        this.applyToggleButtonState(this.accessTypeField?.openButton, this.createLobbyState.accessType === 0);
        this.applyToggleButtonState(this.accessTypeField?.closedButton, this.createLobbyState.accessType === 1);
        this.passwordField.input.disabled = this.createLobbyState.submitting || this.createLobbyState.accessType === 0;
        this.passwordField.input.style.opacity = this.passwordField.input.disabled ? '0.65' : '1';
        this.passwordField.input.style.cursor = this.passwordField.input.disabled ? 'not-allowed' : 'text';
        this.passwordField.background.setFillStyle(this.createLobbyState.accessType === 0 ? DISABLED_INPUT_FILL : 0xffffff, 1);

        this.nameField.errorText.setText(this.createLobbyState.errors.name || '');
        this.passwordField.errorText.setText(this.createLobbyState.errors.password || '');
        this.playersField.errorText.setText(this.createLobbyState.errors.maxPlayers || '');
        this.formErrorText.setText(this.createLobbyState.formError || '');
    }

    setCreateLobbySubmitting(submitting) {
        this.createLobbyState.submitting = submitting;

        const applyButtonState = (button, disabled) => {
            if (!button) {
                return;
            }

            button.disableInteractive();
            button.isDisabled = disabled;
            if (!disabled) {
                button.setInteractive({ useHandCursor: true });
            }

            if (button.toggleColors) {
                this.applyToggleButtonVisualState(button);
                return;
            }

            button.buttonBackground.setFillStyle(disabled ? BUTTON_DISABLED_COLOR : (button.isActive ? BUTTON_ACTIVE_COLOR : BUTTON_COLOR), 1);
            button.buttonText.setAlpha(disabled ? 0.55 : 1);
        };

        applyButtonState(this.backModalButton, submitting);
        applyButtonState(this.createModalButtonControl, submitting);
        applyButtonState(this.playersField?.minusButton, submitting);
        applyButtonState(this.playersField?.plusButton, submitting);
        applyButtonState(this.accessTypeField?.openButton, submitting);
        applyButtonState(this.accessTypeField?.closedButton, submitting);

        this.modalFields.forEach((field) => {
            if (!field?.input) {
                return;
            }

            field.input.disabled = submitting;
            field.input.style.opacity = submitting ? '0.75' : '1';
        });

        if (this.createModalButtonControl?.buttonText) {
            this.createModalButtonControl.buttonText.setText(submitting ? 'CREATING...' : 'CREATE');
        }

        this.refreshCreateLobbyForm();
    }

    async submitCreateLobby() {
        if (this.createLobbyState.submitting) {
            return;
        }

        this.createLobbyState.name = this.nameField.input.value;
        this.createLobbyState.password = this.passwordField.input.value;

        if (!this.validateCreateLobbyForm()) {
            if (this.createLobbyState.errors.name) {
                this.focusModalField(this.nameField);
            } else if (this.createLobbyState.errors.password) {
                this.focusModalField(this.passwordField);
            }
            return;
        }

        this.setCreateLobbySubmitting(true);
        this.createLobbyState.formError = '';
        this.refreshCreateLobbyForm();

        try {
            const lobby = await lobbyApi.create({
                name: this.createLobbyState.name.trim(),
                accessType: this.createLobbyState.accessType,
                password: this.createLobbyState.accessType === 1 ? this.createLobbyState.password.trim() : null,
                maxPlayers: this.createLobbyState.maxPlayers,
                creatorId: this.profile.playerId,
                creatorName: this.profile.displayName,
                isMan: this.profile.isMan,
                isMuslim: this.profile.isMuslim
            });

            this.closeCreateLobbyModal();
            this.scene.start('LobbyRoom', { lobbyId: lobby.lobbyId });
        } catch (e) {
            this.createLobbyState.formError = e.message || 'Failed to create lobby.';
            this.formErrorText.setColor(ERROR_COLOR);
            this.refreshCreateLobbyForm();
        } finally {
            if (this.modalOpen) {
                this.setCreateLobbySubmitting(false);
            }
        }
    }

    closeCreateLobbyModal() {
        if (!this.modalOpen) {
            return;
        }

        this.modalFields.forEach((field) => field?.input?.blur());
        this.modalElements.forEach((element) => element?.destroy());
        this.modalElements = [];
        this.modalFields = [];
        this.modalBackdrop = null;
        this.formErrorText = null;
        this.nameField = null;
        this.playersField = null;
        this.passwordField = null;
        this.accessTypeField = null;
        this.backModalButton = null;
        this.createModalButtonControl = null;
        this.createLobbyState = this.getDefaultCreateLobbyState();
        this.modalOpen = false;
    }

    openLobby(lobby) {
        this.scene.start('LobbyRoom', { lobbyId: lobby.lobbyId });
    }

    async joinLobby(lobby) {
        if (lobby.currentPlayers >= lobby.maxPlayers) {
            this.showMessage('Lobby is already full. No free slots left.');
            return;
        }

        try {
            const password = lobby.accessType === 1 ? window.prompt('Password:') : null;
            await lobbyApi.join(lobby.lobbyId, {
                playerId: this.profile.playerId,
                displayName: this.profile.displayName,
                isMan: this.profile.isMan,
                isMuslim: this.profile.isMuslim,
                password
            });
            this.scene.start('LobbyRoom', { lobbyId: lobby.lobbyId });
        } catch (e) {
            if (e.code === 'lobby_full') {
                await this.syncLobbies();
                this.showMessage(e.message);
                return;
            }

            this.showMessage(e.message);
        }
    }

    onKey(event) {
        if (this.modalOpen) {
            if (event.key === 'Escape') {
                this.closeCreateLobbyModal();
            }
            return;
        }

        if (event.key === 'Escape') {
            this.searchField?.input?.blur();
        }
    }

    handleResize() {
        if (!this.modalOpen) {
            return;
        }

        const preservedState = {
            ...this.createLobbyState,
            errors: { ...this.createLobbyState.errors },
            name: this.nameField?.input?.value ?? this.createLobbyState.name,
            password: this.passwordField?.input?.value ?? this.createLobbyState.password,
            accessType: this.createLobbyState.accessType
        };

        this.closeCreateLobbyModal();
        this.openCreateLobbyModal();
        this.createLobbyState = preservedState;
        this.refreshCreateLobbyForm();
        this.setCreateLobbySubmitting(false);
    }

    async cleanupHub() {
        this.scale.off(Phaser.Scale.Events.RESIZE, this.handleResize, this);
        this.closeCreateLobbyModal();
        this.searchField?.input?.blur();
        this.searchField?.container?.destroy();
        this.searchField?.dom?.destroy();
        this.searchField = null;

        this.hubUnsubscribers.forEach(unsubscribe => unsubscribe());
        this.hubUnsubscribers = [];

        try {
            await lobbyHubClient.unsubscribeLobbyList();
        } catch {
            // ignore network teardown errors
        }

        await lobbyHubClient.disconnect();
    }

    createButton(x, y, width, height, label, onClick) {
        const rect = this.add.rectangle(x, y, width, height, BUTTON_COLOR, 1)
            .setStrokeStyle(6, PANEL_STROKE, 1)
            .setInteractive({ useHandCursor: true });

        const text = this.add.text(x, y, label, {
            fontFamily: 'Georgia, serif',
            fontSize: '26px',
            color: TEXT_COLOR,
            fontStyle: 'bold'
        }).setOrigin(0.5);

        rect.on('pointerover', () => {
            if (!rect.input?.enabled) {
                return;
            }

            rect.setFillStyle(BUTTON_HOVER_COLOR, 1);
        });
        rect.on('pointerout', () => {
            rect.setFillStyle(rect.input?.enabled ? BUTTON_COLOR : BUTTON_DISABLED_COLOR, 1);
        });
        rect.on('pointerdown', () => {
            if (rect.input?.enabled) {
                onClick();
            }
        });

        const container = this.add.container(0, 0, [rect, text]).setSize(width, height);
        container.buttonRect = rect;
        container.buttonText = text;

        return container;
    }

    setButtonDisabled(button, disabled) {
        if (!button?.buttonRect) {
            return;
        }

        button.buttonRect.disableInteractive();
        if (!disabled) {
            button.buttonRect.setInteractive({ useHandCursor: true });
        }

        button.buttonRect.setFillStyle(disabled ? BUTTON_DISABLED_COLOR : BUTTON_COLOR, 1);
        button.buttonText.setAlpha(disabled ? 0.55 : 1);
    }

    showMessage(msg) { this.messageText.setText(msg || ''); }
}
