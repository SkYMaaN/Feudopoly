import { lobbyApi } from '../network/lobbyApi.js';
import { getOrCreateProfile, saveProfile } from '../network/profileStorage.js';

export class LobbyList extends Phaser.Scene {
    constructor() {
        super('LobbyList');
        this.search = '';
        this.rows = [];
    }

    create(data) {
        const { width, height } = this.scale.gameSize;
        this.profile = saveProfile({
            ...getOrCreateProfile(),
            displayName: data.displayName,
            isMan: data.isMan,
            isMuslim: data.isMuslim
        });

        this.add.rectangle(width / 2, height / 2, width, height, 0x1a1207, 1);
        this.add.text(width / 2, 60, 'Lobbies', { fontFamily: 'Georgia, serif', fontSize: '62px', color: '#f2e4c3' }).setOrigin(0.5);

        this.searchText = this.add.text(80, 130, 'Search: ', { fontSize: '28px', color: '#ffffff' });
        this.messageText = this.add.text(width / 2, height - 40, '', { fontSize: '24px', color: '#ffd9a0' }).setOrigin(0.5);

        this.createButton(1700, 70, 260, 60, 'BACK', () => this.scene.start('Start'));
        this.createButton(1700, 150, 260, 60, 'REFRESH', () => this.loadLobbies());
        this.createButton(1700, 230, 260, 60, 'CREATE', () => this.createLobby());

        this.listContainer = this.add.container(70, 190);
        this.input.keyboard.on('keydown', (e) => this.onKey(e));
        this.loadLobbies();
    }

    async loadLobbies() {
        try {
            this.lobbies = await lobbyApi.list(this.search);
            this.renderRows();
            this.showMessage('');
        } catch (e) {
            this.showMessage(e.message);
        }
    }

    renderRows() {
        this.listContainer.removeAll(true);
        this.rows = [];

        this.searchText.setText(`Search: ${this.search || '-'}`);

        this.lobbies.forEach((lobby, idx) => {
            const y = idx * 75;
            const bg = this.add.rectangle(0, y, 1500, 64, 0x2d1f11, 0.95).setOrigin(0, 0);
            const text = this.add.text(20, y + 16,
                `${lobby.name} | ${lobby.currentPlayers}/${lobby.maxPlayers} | ${lobby.status} | ${lobby.accessType}`,
                { fontSize: '26px', color: '#f2e4c3' });
            const joinBtn = this.createButton(1400, y + 32, 180, 50, 'JOIN', async () => this.joinLobby(lobby));
            this.listContainer.add([bg, text, joinBtn]);
            this.rows.push({ bg, text, joinBtn });
        });
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
            this.loadLobbies();
            return;
        }
        if (event.key.length === 1 && this.search.length < 32) {
            this.search += event.key;
            this.loadLobbies();
        }
    }

    createButton(x, y, width, height, label, onClick) {
        const rect = this.add.rectangle(x, y, width, height, 0x6f4b23, 1)
            .setStrokeStyle(6, 0xc89b58, 1)
            .setInteractive({ useHandCursor: true });

        const text = this.add.text(x, y, label, {
            fontFamily: 'Georgia, serif',
            fontSize: '26px',
            color: '#f2e4c3',
            stroke: '#3a230c',
            strokeThickness: 6,
            fontStyle: 'bold'
        }).setOrigin(0.5);

        rect.on('pointerover', () => rect.setFillStyle(0x3E5A2E, 1));
        rect.on('pointerout', () => rect.setFillStyle(0x6f4b23, 1));
        rect.on('pointerdown', onClick);

        const container = this.add.container(0, 0, [rect, text]).setSize(width, height);
        
        return container;
    }

    showMessage(msg) { this.messageText.setText(msg || ''); }
}
