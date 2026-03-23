import { lobbyApi } from '../network/lobbyApi.js';
import { lobbyHubClient } from '../network/lobbyHubClient.js';
import { getOrCreateProfile } from '../network/profileStorage.js';

const PANEL_COLOR = 0x4682b4;
const PANEL_STROKE = 0x2b5e8a;
const SURFACE_COLOR = 0x9cbfd9;
const SURFACE_HOVER_COLOR = 0x8fa9bf;
const SURFACE_DISABLED_COLOR = 0x6d9dc5;
const CARD_COLOR = 0xd5e6f5;
const CARD_STROKE = 0x5d87aa;
const CARD_MUTED_COLOR = 0xbdd3e6;
const TEXT_COLOR = '#FF0000';
const SUBTLE_TEXT_COLOR = '#214c74';
const ONLINE_COLOR = 0x43aa6b;
const OFFLINE_COLOR = 0xc44545;
const OWNER_BADGE_COLOR = 0xf6bd60;
const STATUS_PANEL_WIDTH = 940;
const PLAYERS_PANEL_WIDTH = 940;
const BUTTON_WIDTH = 220;
const BUTTON_HEIGHT = 62;
const BUTTON_SPACING = 26;

export class LobbyRoom extends Phaser.Scene {
    constructor() {
        super('LobbyRoom');
        this.unsubscribers = [];
        this.playerRows = [];
    }

    preload() {
        this.load.scenePlugin({
            key: 'rexuiplugin',
            url: 'plugins/rexuiplugin.min.js',
            sceneKey: 'rexUI'
        });
    }

    create(data) {
        this.profile = getOrCreateProfile();
        this.lobbyId = data.lobbyId;

        const { width, height } = this.scale.gameSize;
        this.add.rectangle(width / 2, height / 2, width, height, PANEL_COLOR, 1)
            .setOrigin(0.5)
            .setStrokeStyle(10, PANEL_STROKE, 1);

        this.title = this.add.text(width / 2, 64, 'Lobby', {
            fontFamily: 'Georgia, serif',
            fontSize: '52px',
            color: TEXT_COLOR,
            fontStyle: 'bold'
        }).setOrigin(0.5);

        this.statusPanel = this.createPanel(width / 2, 150, STATUS_PANEL_WIDTH, 92, 24, SURFACE_COLOR, 0.94);
        this.statusText = this.add.text(width / 2 - STATUS_PANEL_WIDTH / 2 + 30, 132, '', {
            fontFamily: 'Georgia, serif',
            fontSize: '27px',
            color: TEXT_COLOR,
            fontStyle: 'bold'
        }).setOrigin(0, 0);
        this.statusHintText = this.add.text(width / 2 - STATUS_PANEL_WIDTH / 2 + 30, 170, '', {
            fontFamily: 'Arial, sans-serif',
            fontSize: '18px',
            color: SUBTLE_TEXT_COLOR,
            fontStyle: 'bold'
        }).setOrigin(0, 0);

        this.playersPanel = this.createPanel(width / 2, 405, PLAYERS_PANEL_WIDTH, 375, 28, SURFACE_COLOR, 0.92);
        this.playersPanelTitle = this.add.text(width / 2 - PLAYERS_PANEL_WIDTH / 2 + 30, 232, 'Players', {
            fontFamily: 'Georgia, serif',
            fontSize: '34px',
            color: TEXT_COLOR,
            fontStyle: 'bold'
        }).setOrigin(0, 0);
        this.playersPanelSubtitle = this.add.text(width / 2 - PLAYERS_PANEL_WIDTH / 2 + 30, 272, 'Owner marked with crown. Connected players get a subtle accent.', {
            fontFamily: 'Arial, sans-serif',
            fontSize: '18px',
            color: SUBTLE_TEXT_COLOR,
            fontStyle: 'bold'
        }).setOrigin(0, 0);

        this.playersListContainer = this.add.container(width / 2 - PLAYERS_PANEL_WIDTH / 2 + 30, 320);
        this.actionButtonsContainer = this.add.container(width / 2, 650);

        this.messageText = this.add.text(width / 2, height - 42, '', {
            fontFamily: 'Arial, sans-serif',
            fontSize: '22px',
            color: TEXT_COLOR,
            fontStyle: 'bold',
            align: 'center'
        }).setOrigin(0.5);

        //this.backBtn = this.createButton(1130, 86, BUTTON_WIDTH, BUTTON_HEIGHT, 'BACK', () => this.goBack());
        this.startBtn = this.createButton(0, 0, BUTTON_WIDTH, BUTTON_HEIGHT, 'START', () => this.startLobby());
        this.leaveBtn = this.createButton(0, 0, BUTTON_WIDTH, BUTTON_HEIGHT, 'LEAVE', () => this.leaveLobby());
        this.joinBtn = this.createButton(0, 0, BUTTON_WIDTH, BUTTON_HEIGHT, 'JOIN', () => this.joinLobby());
        this.actionButtonsContainer.add([this.startBtn, this.leaveBtn, this.joinBtn]);

        this.bootstrap();

        this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.cleanupSubscriptions());
        this.events.once(Phaser.Scenes.Events.DESTROY, () => this.cleanupSubscriptions());
    }

    async bootstrap() {
        try {
            const lobby = await lobbyApi.details(this.lobbyId);
            this.applyLobby(lobby);
            await this.connectToUpdates();
            this.showMessage('');
        } catch (e) {
            this.showMessage(e.message);
        }
    }

    async connectToUpdates() {
        this.cleanupSubscriptions();

        this.unsubscribers = [
            lobbyHubClient.on('lobbyUpdated', (lobby) => {
                if (lobby.lobbyId === this.lobbyId) {
                    this.applyLobby(lobby);
                }
            }),
            lobbyHubClient.on('lobbyDeleted', (lobbyId) => {
                if (lobbyId === this.lobbyId) {
                    this.showMessage('Lobby was closed.');
                    this.goBack();
                }
            }),
            lobbyHubClient.on('reconnecting', () => {
                this.showMessage('Connection lost. Reconnecting...');
            }),
            lobbyHubClient.on('reconnected', async () => {
                this.showMessage('Connection restored.');
                await lobbyHubClient.subscribeLobby(this.lobbyId);
            }),
            lobbyHubClient.on('error', () => {
                this.showMessage('Realtime connection closed. Refreshing failed.');
            })
        ];

        await lobbyHubClient.connect();
        await lobbyHubClient.subscribeLobby(this.lobbyId);
    }

    applyLobby(lobby) {
        this.lobby = lobby;
        const isMember = this.isCurrentUserMember();
        const hasFreeSlots = this.lobby.currentPlayers < this.lobby.maxPlayers;
        const isOwner = this.lobby.ownerPlayerId === this.profile.playerId;
        const canStart = this.lobby.status === 1;

        if (isMember && (this.lobby.status === 2 || this.lobby.status === 3)) {
            this.openGame();
            return;
        }

        this.title.setText(`Lobby: ${this.lobby.name}`);
        this.statusText.setText(`Status: ${this.getLobbyStatusText(this.lobby.status)} · ${this.lobby.currentPlayers}/${this.lobby.maxPlayers} players`);
        this.statusHintText.setText(this.getLobbyHintText(this.lobby));
        this.renderPlayersList(this.lobby.players || []);

        this.leaveBtn.setVisible(isMember);
        this.startBtn.setVisible(isOwner);
        this.setButtonDisabled(this.startBtn, !canStart);

        this.joinBtn.setVisible(!isMember);
        this.setButtonDisabled(this.joinBtn, !hasFreeSlots);
        this.layoutActionButtons();
        if (!isMember && !hasFreeSlots) {
            this.showMessage('Lobby is already full. No free slots left.');
        }
    }

    renderPlayersList(players) {
        this.playersListContainer.removeAll(true);
        this.playerRows = [];

        if (!players.length) {
            const emptyCard = this.createPlayerRow({ displayName: 'No players yet', isConnected: false }, 0, true);
            this.playersListContainer.add(emptyCard);
            this.playerRows.push(emptyCard);
            return;
        }

        players.forEach((player, index) => {
            const row = this.createPlayerRow(player, index, false);
            this.playersListContainer.add(row);
            this.playerRows.push(row);
        });
    }

    createPlayerRow(player, index, isPlaceholder) {
        const rowY = index * 68;
        const container = this.add.container(0, rowY);
        const isCurrentPlayer = !isPlaceholder && player.playerId === this.profile.playerId;
        const isOwner = Boolean(player.isOwner);
        const isOnline = Boolean(player.isConnected);
        const fillColor = isPlaceholder
            ? CARD_MUTED_COLOR
            : isCurrentPlayer
                ? 0xe7f0fa
                : isOnline
                    ? CARD_COLOR
                    : 0xc8d9e8;
        const strokeColor = isCurrentPlayer
            ? PANEL_STROKE
            : isOnline
                ? ONLINE_COLOR
                : CARD_STROKE;
        const rowBackground = this.rexUI.add.roundRectangle(0, 0, PLAYERS_PANEL_WIDTH - 60, 56, 18, fillColor, 0.98)
            .setStrokeStyle(4, strokeColor, isPlaceholder ? 0.35 : 1)
            .setOrigin(0, 0);

        const iconBackground = this.add.circle(28, 28, 18, isOwner ? OWNER_BADGE_COLOR : PANEL_STROKE, isPlaceholder ? 0.5 : 1)
            .setStrokeStyle(3, 0xffffff, isPlaceholder ? 0.25 : 0.8);
        const iconText = this.add.text(28, 28, isOwner ? '♛' : '👤', {
            fontFamily: 'Arial, sans-serif',
            fontSize: '22px',
            color: isOwner ? '#6e3f00' : '#ffffff',
            fontStyle: 'bold'
        }).setOrigin(0.5);

        const nameText = this.add.text(60, 14, player.displayName || 'Player', {
            fontFamily: 'Georgia, serif',
            fontSize: '24px',
            color: isPlaceholder ? SUBTLE_TEXT_COLOR : TEXT_COLOR,
            fontStyle: 'bold'
        }).setOrigin(0, 0);

        const metaParts = [];
        if (isCurrentPlayer) {
            metaParts.push('you');
        }
        if (isOwner) {
            metaParts.push('owner');
        }

        const metaText = this.add.text(60, 34, metaParts.join(' • '), {
            fontFamily: 'Arial, sans-serif',
            fontSize: '16px',
            color: SUBTLE_TEXT_COLOR,
            fontStyle: 'bold'
        }).setOrigin(0, 0);

        const presenceDot = this.add.circle(PLAYERS_PANEL_WIDTH - 96, 28, 8, isOnline ? ONLINE_COLOR : OFFLINE_COLOR, isPlaceholder ? 0.3 : 0.95)
            .setStrokeStyle(2, 0xffffff, isPlaceholder ? 0.15 : 0.6);

        container.add([rowBackground, iconBackground, iconText, nameText, metaText, presenceDot]);
        return container;
    }

    getLobbyHintText(lobby) {
        if (lobby.status === 1) {
            return 'The lobby is ready to launch. The owner can start the match.';
        }

        if (lobby.currentPlayers >= lobby.maxPlayers) {
            return 'All slots are occupied. Only listed players can continue here.';
        }

        return 'Invite players or join the room. Connected players update here in realtime.';
    }

    isCurrentUserMember() {
        return this.lobby?.players?.some(player => player.playerId === this.profile.playerId) ?? false;
    }

    async startLobby() {
        try {
            await lobbyApi.start(this.lobbyId, { playerId: this.profile.playerId });
        } catch (e) {
            this.showMessage(e.message);
        }
    }

    async leaveLobby() {
        try {
            await lobbyApi.leave(this.lobbyId, { playerId: this.profile.playerId });
            this.goBack();
        } catch (e) {
            this.showMessage(e.message);
        }
    }

    async joinLobby() {
        if (this.lobby.currentPlayers >= this.lobby.maxPlayers) {
            this.showMessage('Lobby is already full. No free slots left.');
            return;
        }

        try {
            const password = this.lobby.accessType === 1 ? window.prompt('Password:') : null;
            await lobbyApi.join(this.lobbyId, {
                playerId: this.profile.playerId,
                displayName: this.profile.displayName,
                isMan: this.profile.isMan,
                isMuslim: this.profile.isMuslim,
                password
            });
        } catch (e) {
            if (e.code === 'lobby_full') {
                try {
                    const lobby = await lobbyApi.details(this.lobbyId);
                    this.applyLobby(lobby);
                } catch {
                    // ignore refresh errors and keep the friendly full lobby message
                }

                this.showMessage(e.message);
                return;
            }

            this.showMessage(e.message);
        }
    }

    openGame() {
        if (this.scene.isActive('Board')) {
            return;
        }

        this.scene.start('Board', { sessionId: this.lobbyId, playerId: this.profile.playerId });
    }

    goBack() {
        this.scene.start('LobbyList', this.profile);
    }

    cleanupSubscriptions() {
        this.unsubscribers.forEach(unsubscribe => unsubscribe());
        this.unsubscribers = [];

        if (this.lobbyId) {
            lobbyHubClient.unsubscribeLobby(this.lobbyId).catch(() => { });
        }
    }

    getLobbyStatusText(status) {
        const map = {
            0: 'Waiting for players',
            1: 'Ready',
            2: 'Launching',
            3: 'In progress',
            4: 'Completed'
        };

        return map[status] ?? 'Unknown';
    }

    createPanel(x, y, width, height, radius = 20, fillColor = SURFACE_COLOR, fillAlpha = 1) {
        return this.rexUI.add.roundRectangle(0, 0, width, height, radius, fillColor, fillAlpha)
            .setStrokeStyle(6, PANEL_STROKE, 1)
            .setPosition(x, y)
            .setOrigin(0.5);
    }

    layoutActionButtons() {
        const visibleButtons = [this.startBtn, this.leaveBtn, this.joinBtn].filter(button => button?.visible);

        const totalWidth = visibleButtons.length > 0
            ? (visibleButtons.length * BUTTON_WIDTH) + ((visibleButtons.length - 1) * BUTTON_SPACING)
            : 0;
        let currentX = -totalWidth / 2 + BUTTON_WIDTH / 2;

        [this.startBtn, this.leaveBtn, this.joinBtn].forEach(button => {
            if (!button) {
                return;
            }

            if (!button.visible) {
                button.setPosition(0, 0);
                return;
            }

            button.setPosition(currentX, 0);
            currentX += BUTTON_WIDTH + BUTTON_SPACING;
        });
    }

    createButton(x, y, width, height, label, onClick) {
        const background = this.rexUI.add.roundRectangle(0, 0, width, height, 16, SURFACE_COLOR, 1)
            .setStrokeStyle(6, PANEL_STROKE, 1);

        const text = this.add.text(0, 0, label, {
            fontFamily: 'Georgia, serif',
            fontSize: '24px',
            color: TEXT_COLOR,
            fontStyle: 'bold',
        }).setOrigin(0.5);

        const button = this.rexUI.add.label({
            x,
            y,
            width,
            height,
            background,
            text,
            align: 'center'
        }).layout().setInteractive({ useHandCursor: true });

        button.on('pointerover', () => {
            if (!button.input?.enabled) {
                return;
            }

            background.setFillStyle(SURFACE_HOVER_COLOR, 1);
        });
        button.on('pointerout', () => {
            background.setFillStyle(SURFACE_COLOR, 1);
        });
        button.on('pointerdown', () => {
            if (button.input?.enabled) {
                onClick();
            }
        });

        button.buttonBackground = background;
        button.buttonText = text;

        return button;
    }

    setButtonDisabled(button, disabled) {
        if (!button?.buttonBackground) {
            return;
        }

        button.disableInteractive();
        if (!disabled) {
            button.setInteractive({ useHandCursor: true });
        }

        button.buttonBackground.setFillStyle(disabled ? SURFACE_DISABLED_COLOR : SURFACE_COLOR, 1);
        button.buttonText.setAlpha(disabled ? 0.55 : 1);
    }

    showMessage(msg) {
        this.messageText.setText(msg || '');
    }
}
