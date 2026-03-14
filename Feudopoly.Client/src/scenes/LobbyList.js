import { lobbyApi } from '../network/lobbyApi.js';
import { lobbyHubClient } from '../network/lobbyHubClient.js';
import { getOrCreateProfile, saveProfile } from '../network/profileStorage.js';

export class LobbyList extends Phaser.Scene {
    constructor() {
        super('LobbyList');
        this.search = '';
        this.rows = [];
        this.lobbies = [];
        this.hubUnsubscribers = [];
    }

    create(data) {
        const { width, height } = this.scale.gameSize;
        this.profile = saveProfile({
            ...getOrCreateProfile(),
            displayName: data.displayName,
            isMan: data.isMan,
            isMuslim: data.isMuslim
        });

        this.add.rectangle(width / 2, height / 2, width, height, 0x9cbfd9, 1);
        this.add.text(width / 2, 60, 'Lobbies', { fontFamily: 'Georgia, serif', fontSize: '62px', color: '#FF0000' }).setOrigin(0.5);

        this.searchText = this.add.text(80, 130, 'Search: ', { fontSize: '28px', color: '#FF0000' });
        this.messageText = this.add.text(width / 2, height - 40, '', { fontSize: '24px', color: '#FF0000' }).setOrigin(0.5);

        this.createButton(1700, 70, 260, 60, 'BACK', () => this.scene.start('Start'));
        this.createButton(1700, 150, 260, 60, 'REFRESH', () => this.syncLobbies());
        this.createButton(1700, 230, 260, 60, 'CREATE', () => this.createLobby());

        this.listContainer = this.add.container(70, 200);
        this.input.keyboard.on('keydown', (e) => this.onKey(e));

        this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.cleanupHub, this);
        this.events.once(Phaser.Scenes.Events.DESTROY, this.cleanupHub, this);

        this.bootLobbyRealtime();
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

        this.searchText.setText(`Search: ${this.search || '-'}`);
        const normalizedSearch = this.search.trim().toLowerCase();
        const visibleLobbies = this.lobbies.filter(lobby => !normalizedSearch || lobby.name.toLowerCase().includes(normalizedSearch));

        visibleLobbies.forEach((lobby, idx) => {
            const y = idx * 75;
            const bg = this.add.rectangle(0, y, 1275, 64, 0x7faed3, 0.95).setOrigin(0, 0);
            const text = this.add.text(20, y + 16,
                `\'${lobby.name}\' | [${lobby.currentPlayers}/${lobby.maxPlayers}]  ${this.getLobbyStatusText(lobby.status)} | ${lobby.accessType == 1 ? 'Private' : 'Public'}`,
                { fontSize: '26px', color: '#FF0000' });
            const detailsBtn = this.createButton(1000, y + 32, 150, 40, 'DETAILS', () => this.openLobby(lobby));
            const joinBtn = this.createButton(1170, y + 32, 150, 40, 'JOIN', async () => this.joinLobby(lobby));
            this.listContainer.add([bg, text, detailsBtn, joinBtn]);
            this.rows.push({ bg, text, detailsBtn, joinBtn });
        });
    }

    getLobbyStatusText(statusNumber) {
        const statuses = {
            0: "Waiting for players",
            1: "Ready",
            2: "Launching",
            3: "In progress",
            4: "Completed"
        };

        return statuses[statusNumber] ?? "Unknown status";
    }

    async createLobby() {
        try {
            const name = window.prompt('Lobby name:');
            if (!name) return;
            const isClosed = window.confirm('Closed lobby? OK = closed, Cancel = open');
            const maxPlayers = Number(window.prompt('Max players (2-4):', '4'));
            const password = isClosed ? window.prompt('Password:') : null;

            const lobby = await lobbyApi.create({
                name,
                accessType: isClosed ? 1 : 0,
                password,
                maxPlayers,
                creatorId: this.profile.playerId,
                creatorName: this.profile.displayName,
                isMan: this.profile.isMan,
                isMuslim: this.profile.isMuslim
            });

            this.scene.start('LobbyRoom', { lobbyId: lobby.lobbyId });
        } catch (e) {
            this.showMessage(e.message);
        }
    }

    openLobby(lobby) {
        this.scene.start('LobbyRoom', { lobbyId: lobby.lobbyId });
    }

    async joinLobby(lobby) {
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
            this.showMessage(e.message);
        }
    }

    onKey(event) {
        if (event.key === 'Backspace') {
            this.search = this.search.slice(0, -1);
            this.renderRows();
            return;
        }
        if (event.key.length === 1 && this.search.length < 32) {
            this.search += event.key;
            this.renderRows();
        }
    }

    async cleanupHub() {
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
        const rect = this.add.rectangle(x, y, width, height, 0x4682b4, 1)
            .setStrokeStyle(6, 0x2b5e8a, 1)
            .setInteractive({ useHandCursor: true });

        const text = this.add.text(x, y, label, {
            fontFamily: 'Georgia, serif',
            fontSize: '26px',
            color: '#FF0000',
            stroke: '#214c74',
            strokeThickness: 6,
            fontStyle: 'bold'
        }).setOrigin(0.5);

        rect.on('pointerover', () => rect.setFillStyle(0x2b5e8a, 1));
        rect.on('pointerout', () => rect.setFillStyle(0x4682b4, 1));
        rect.on('pointerdown', onClick);

        const container = this.add.container(0, 0, [rect, text]).setSize(width, height);

        return container;
    }

    showMessage(msg) { this.messageText.setText(msg || ''); }
}
