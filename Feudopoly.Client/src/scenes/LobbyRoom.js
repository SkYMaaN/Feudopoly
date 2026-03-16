import { lobbyApi } from '../network/lobbyApi.js';
import { lobbyHubClient } from '../network/lobbyHubClient.js';
import { getOrCreateProfile } from '../network/profileStorage.js';

export class LobbyRoom extends Phaser.Scene {
    constructor() {
        super('LobbyRoom');
        this.unsubscribers = [];
    }

    create(data) {
        this.profile = getOrCreateProfile();
        this.lobbyId = data.lobbyId;

        const { width, height } = this.scale.gameSize;
        this.add.rectangle(width / 2, height / 2, width, height, 0x4682b4, 1).setOrigin(0.5).setStrokeStyle(10, 0x2b5e8a, 1);
        this.title = this.add.text(width / 2, 70, 'Lobby', { fontFamily: 'Georgia, serif', fontSize: '56px', color: '#FF0000' }).setOrigin(0.5);
        this.statusText = this.add.text(100, 150, '', { fontSize: '30px', color: '#FF0000' });
        this.playersText = this.add.text(100, 210, '', { fontSize: '28px', color: '#FF0000' });
        this.messageText = this.add.text(width / 2, height - 50, '', { fontSize: '24px', color: '#FF0000' }).setOrigin(0.5);

        this.backBtn = this.createButton(1700, 80, 260, 64, 'BACK', () => this.goBack());
        this.leaveBtn = this.createButton(1700, 160, 260, 64, 'LEAVE', () => this.leaveLobby());
        this.joinBtn = this.createButton(1700, 160, 260, 64, 'JOIN', () => this.joinLobby());
        this.startBtn = this.createButton(1700, 240, 260, 64, 'START', () => this.startLobby());
        this.playBtn = this.createButton(1700, 320, 260, 64, 'OPEN GAME', () => this.openGame());

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

        this.title.setText(`Lobby: ${this.lobby.name}`);
        this.statusText.setText(`Status: ${this.lobby.status} | ${this.lobby.currentPlayers}/${this.lobby.maxPlayers}`);
        this.playersText.setText(this.lobby.players.map(p => `${p.isOwner ? '👑 ' : ''}${p.displayName}${p.isConnected ? ' (online)' : ''}`).join('\n'));

        this.leaveBtn.setVisible(isMember);
        this.startBtn.setVisible(isMember && isOwner);
        this.setButtonDisabled(this.startBtn, !canStart);
        this.playBtn.setVisible(isMember && (this.lobby.status === 2 || this.lobby.status === 3));

        this.joinBtn.setVisible(!isMember);
        this.setButtonDisabled(this.joinBtn, !hasFreeSlots);
        if (!isMember && !hasFreeSlots) {
            this.showMessage('Lobby is full. Join is unavailable.');
        }
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
            this.showMessage('Lobby is full.');
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
            this.showMessage(e.message);
        }
    }

    openGame() {
        this.scene.start('Board', { sessionId: this.lobbyId, playerId: this.profile.playerId });
    }

    goBack() {
        this.scene.start('LobbyList', this.profile);
    }

    cleanupSubscriptions() {
        this.unsubscribers.forEach(unsubscribe => unsubscribe());
        this.unsubscribers = [];

        if (this.lobbyId) {
            lobbyHubClient.unsubscribeLobby(this.lobbyId).catch(() => {});
        }
    }

    createButton(x, y, width, height, label, onClick) {
        const rect = this.add.rectangle(x, y, width, height, 0x9cbfd9, 1)
            .setStrokeStyle(6, 0x2b5e8a, 1)
            .setInteractive({ useHandCursor: true });

        const text = this.add.text(x, y, label, {
            fontFamily: 'Georgia, serif',
            fontSize: '26px',
            color: '#FF0000',
            fontStyle: 'bold',
        }).setOrigin(0.5);

        rect.on('pointerover', () => {
            if (!rect.input?.enabled) {
                return;
            }

            rect.setFillStyle(0x8FA9BF, 1);
        });
        rect.on('pointerout', () => {
            rect.setFillStyle(0x9cbfd9, 1);
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

        button.buttonRect.setFillStyle(disabled ? 0x6d9dc5 : 0x4682b4, 1);
        button.buttonText.setAlpha(disabled ? 0.55 : 1);
    }

    showMessage(msg) { this.messageText.setText(msg || ''); }
}
