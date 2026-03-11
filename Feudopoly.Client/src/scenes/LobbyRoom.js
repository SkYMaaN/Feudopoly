import { lobbyApi } from '../network/lobbyApi.js';
import { getOrCreateProfile } from '../network/profileStorage.js';

export class LobbyRoom extends Phaser.Scene {
    constructor() {
        super('LobbyRoom');
    }

    create(data) {
        this.profile = getOrCreateProfile();
        this.lobbyId = data.lobbyId;

        const { width, height } = this.scale.gameSize;
        this.add.rectangle(width / 2, height / 2, width, height, 0x1a1207, 1);
        this.title = this.add.text(width / 2, 70, 'Lobby', { fontFamily: 'Georgia, serif', fontSize: '56px', color: '#f2e4c3' }).setOrigin(0.5);
        this.statusText = this.add.text(100, 150, '', { fontSize: '30px', color: '#ffffff' });
        this.playersText = this.add.text(100, 210, '', { fontSize: '28px', color: '#f2e4c3' });
        this.messageText = this.add.text(width / 2, height - 50, '', { fontSize: '24px', color: '#ffd9a0' }).setOrigin(0.5);

        this.createButton(1700, 80, 260, 64, 'BACK', () => this.scene.start('LobbyList', this.profile));
        this.createButton(1700, 160, 260, 64, 'LEAVE', () => this.leaveLobby());
        this.startBtn = this.createButton(1700, 240, 260, 64, 'START', () => this.startLobby());
        this.playBtn = this.createButton(1700, 320, 260, 64, 'OPEN GAME', () => this.openGame());

        this.refresh();
        this.timer = this.time.addEvent({ delay: 2000, loop: true, callback: () => this.refresh() });
    }

    async refresh() {
        try {
            this.lobby = await lobbyApi.details(this.lobbyId);
            this.title.setText(`Lobby: ${this.lobby.name}`);
            this.statusText.setText(`Status: ${this.lobby.status} | ${this.lobby.currentPlayers}/${this.lobby.maxPlayers}`);
            this.playersText.setText(this.lobby.players.map(p => `${p.isOwner ? '👑 ' : ''}${p.displayName}${p.isConnected ? ' (online)' : ''}`).join('\n'));
            const isOwner = this.lobby.ownerPlayerId === this.profile.playerId;
            this.startBtn.setVisible(isOwner);
            this.playBtn.setVisible(this.lobby.status === 2 || this.lobby.status === 3);
            this.showMessage('');
        } catch (e) {
            this.showMessage(e.message);
        }
    }

    async startLobby() {
        try {
            await lobbyApi.start(this.lobbyId, { playerId: this.profile.playerId });
            await this.refresh();
        } catch (e) {
            this.showMessage(e.message);
        }
    }

    async leaveLobby() {
        try {
            await lobbyApi.leave(this.lobbyId, { playerId: this.profile.playerId });
            this.scene.start('LobbyList', this.profile);
        } catch (e) {
            this.showMessage(e.message);
        }
    }

    openGame() {
        this.scene.start('Board', { sessionId: this.lobbyId, playerId: this.profile.playerId });
    }

    createButton(x, y, width, height, label, onClick) {
        const rect = this.add.rectangle(x, y, width, height, 0x6f4b23, 1).setStrokeStyle(3, 0xc89b58, 1).setInteractive({ useHandCursor: true });
        const text = this.add.text(x, y, label, { fontFamily: 'Georgia, serif', fontSize: '22px', color: '#f2e4c3' }).setOrigin(0.5);
        rect.on('pointerdown', onClick);
        return this.add.container(0, 0, [rect, text]);
    }

    showMessage(msg) { this.messageText.setText(msg || ''); }
}
