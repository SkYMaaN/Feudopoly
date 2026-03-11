import { createLobby, getLobby, getLobbies, joinLobby, leaveLobby, setLobbyStatus } from '../network/lobbyApi.js';

const STATUS_LABELS = {
    0: 'Ожидание игроков',
    1: 'Готово',
    2: 'Запуск',
    3: 'Игра идёт',
    4: 'Завершено'
};

const ACCESS_LABELS = {
    0: 'Открытое',
    1: 'Закрытое'
};

export class Start extends Phaser.Scene {
    constructor() {
        super('Start');
        this.userId = localStorage.getItem('feudopoly_user_id') || crypto.randomUUID();
        localStorage.setItem('feudopoly_user_id', this.userId);
        this.currentLobby = null;
    }

    create() {
        const { width, height } = this.scale.gameSize;
        this.add.rectangle(width / 2, height / 2, width, height, 0x1a1207, 1).setOrigin(0.5);
        this.add.text(width / 2, 80, 'FEUDOPOLY LOBBIES', {
            fontFamily: 'Georgia, serif', fontSize: '68px', color: '#f2e4c3'
        }).setOrigin(0.5);

        this.createDomOverlay();
        this.loadLobbies();
        this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.destroyDomOverlay());
        this.events.once(Phaser.Scenes.Events.DESTROY, () => this.destroyDomOverlay());
    }

    createDomOverlay() {
        this.overlay = document.createElement('div');
        this.overlay.style.cssText = 'position:fixed;inset:0;display:flex;justify-content:center;align-items:flex-start;pointer-events:none;z-index:20;padding-top:140px;';

        this.panel = document.createElement('div');
        this.panel.style.cssText = 'width:1100px;max-height:760px;overflow:auto;background:rgba(35,22,12,.95);color:#f8e8c9;border:2px solid #8d6a3b;border-radius:14px;padding:18px;display:grid;grid-template-columns:1fr 1fr;gap:16px;pointer-events:auto;font-family:Arial,sans-serif;';
        this.overlay.appendChild(this.panel);
        document.body.appendChild(this.overlay);

        this.panel.innerHTML = `
        <section>
          <h3>Создание лобби</h3>
          <input id="displayName" placeholder="Ваш ник" style="width:100%;margin-bottom:8px;" />
          <input id="lobbyName" placeholder="Название лобби" style="width:100%;margin-bottom:8px;" />
          <select id="accessType" style="width:100%;margin-bottom:8px;">
            <option value="0">Открытое</option>
            <option value="1">Закрытое</option>
          </select>
          <input id="password" placeholder="Пароль" style="width:100%;margin-bottom:8px;display:none;" />
          <select id="maxPlayers" style="width:100%;margin-bottom:8px;">
            <option value="2">2</option><option value="3">3</option><option value="4" selected>4</option>
          </select>
          <button id="createLobbyBtn">Создать</button>
          <p id="message"></p>
          <hr/>
          <div id="currentLobby"></div>
        </section>
        <section>
          <h3>Список лобби</h3>
          <input id="search" placeholder="Поиск по названию" style="width:100%;margin-bottom:8px;" />
          <button id="refreshBtn">Обновить</button>
          <div id="lobbyList" style="margin-top:10px;"></div>
        </section>`;

        this.messageEl = this.panel.querySelector('#message');
        this.currentLobbyEl = this.panel.querySelector('#currentLobby');
        this.lobbyListEl = this.panel.querySelector('#lobbyList');

        const accessSelect = this.panel.querySelector('#accessType');
        const passwordInput = this.panel.querySelector('#password');
        accessSelect.addEventListener('change', () => {
            passwordInput.style.display = accessSelect.value === '1' ? 'block' : 'none';
        });

        this.panel.querySelector('#createLobbyBtn').addEventListener('click', () => this.handleCreateLobby());
        this.panel.querySelector('#refreshBtn').addEventListener('click', () => this.loadLobbies());
        this.panel.querySelector('#search').addEventListener('input', () => this.loadLobbies());
    }

    destroyDomOverlay() {
        this.overlay?.remove();
        this.overlay = null;
    }

    showMessage(text, isError = false) {
        this.messageEl.textContent = text;
        this.messageEl.style.color = isError ? '#ff8f8f' : '#bdf0b7';
    }

    async handleCreateLobby() {
        const displayName = this.panel.querySelector('#displayName').value.trim();
        const name = this.panel.querySelector('#lobbyName').value.trim();
        const accessType = Number(this.panel.querySelector('#accessType').value);
        const password = this.panel.querySelector('#password').value;
        const maxPlayers = Number(this.panel.querySelector('#maxPlayers').value);

        if (!displayName || !name) {
            this.showMessage('Заполните ник и название лобби.', true);
            return;
        }

        if (accessType === 1 && !password.trim()) {
            this.showMessage('Для закрытого лобби обязателен пароль.', true);
            return;
        }

        try {
            const lobby = await createLobby({ name, accessType, password, maxPlayers, userId: this.userId, displayName });
            this.currentLobby = lobby;
            this.renderCurrentLobby();
            await this.loadLobbies();
            this.showMessage('Лобби создано.');
        } catch (error) {
            this.showMessage(error.message, true);
        }
    }

    async loadLobbies() {
        const search = this.panel.querySelector('#search').value.trim();

        try {
            const lobbies = await getLobbies(search);
            this.renderLobbyList(lobbies);
        } catch (error) {
            this.showMessage(error.message, true);
        }
    }

    renderLobbyList(lobbies) {
        this.lobbyListEl.innerHTML = '';

        lobbies.forEach((lobby) => {
            const row = document.createElement('div');
            row.style.cssText = 'border:1px solid #6f4b23;padding:8px;border-radius:8px;margin-bottom:8px;';
            row.innerHTML = `<strong>${lobby.name}</strong><br/>Игроки: ${lobby.currentPlayers}/${lobby.maxPlayers}<br/>Статус: ${STATUS_LABELS[lobby.status]}<br/>Доступ: ${ACCESS_LABELS[lobby.accessType]}`;

            const joinBtn = document.createElement('button');
            joinBtn.textContent = 'Присоединиться';
            joinBtn.onclick = async () => {
                try {
                    const displayName = this.panel.querySelector('#displayName').value.trim();
                    if (!displayName) {
                        this.showMessage('Введите ник перед входом в лобби.', true);
                        return;
                    }

                    const password = lobby.accessType === 1 ? prompt('Введите пароль лобби:') : '';
                    const details = await joinLobby(lobby.lobbyId, { userId: this.userId, displayName, password });
                    this.currentLobby = details;
                    this.renderCurrentLobby();
                    this.showMessage('Вы вошли в лобби.');
                    await this.loadLobbies();
                } catch (error) {
                    this.showMessage(error.message, true);
                }
            };

            row.appendChild(document.createElement('br'));
            row.appendChild(joinBtn);
            this.lobbyListEl.appendChild(row);
        });
    }

    renderCurrentLobby() {
        if (!this.currentLobby) {
            this.currentLobbyEl.innerHTML = '';
            return;
        }

        const me = this.currentLobby.players.find((player) => player.userId === this.userId);
        const isOwner = Boolean(me?.isOwner);

        this.currentLobbyEl.innerHTML = `<h4>Текущее лобби: ${this.currentLobby.name}</h4>
            <div>Статус: ${STATUS_LABELS[this.currentLobby.status]}</div>
            <div>Игроки:</div>
            <ul>${this.currentLobby.players.map((player) => `<li>${player.displayName}${player.isOwner ? ' (владелец)' : ''}</li>`).join('')}</ul>`;

        const refreshBtn = document.createElement('button');
        refreshBtn.textContent = 'Обновить лобби';
        refreshBtn.onclick = async () => {
            this.currentLobby = await getLobby(this.currentLobby.lobbyId);
            this.renderCurrentLobby();
            this.loadLobbies();
        };

        const leaveBtn = document.createElement('button');
        leaveBtn.textContent = 'Выйти из лобби';
        leaveBtn.onclick = async () => {
            try {
                await leaveLobby(this.currentLobby.lobbyId, { userId: this.userId });
                this.currentLobby = null;
                this.renderCurrentLobby();
                await this.loadLobbies();
                this.showMessage('Вы вышли из лобби.');
            } catch (error) {
                this.showMessage(error.message, true);
            }
        };

        this.currentLobbyEl.appendChild(refreshBtn);
        this.currentLobbyEl.appendChild(document.createTextNode(' '));
        this.currentLobbyEl.appendChild(leaveBtn);


        if (this.currentLobby.status === 3) {
            const openGameBtn = document.createElement('button');
            openGameBtn.textContent = 'Перейти в игру';
            openGameBtn.onclick = () => {
                this.scene.start('Board', {
                    mode: 'join',
                    displayName: this.panel.querySelector('#displayName').value.trim(),
                    sessionId: this.currentLobby.sessionId,
                    lobbyId: this.currentLobby.lobbyId,
                    isMan: true,
                    isMuslim: false
                });
            };

            this.currentLobbyEl.appendChild(document.createTextNode(' '));
            this.currentLobbyEl.appendChild(openGameBtn);
        }
        if (isOwner && this.currentLobby.status === 1) {
            const startBtn = document.createElement('button');
            startBtn.textContent = 'Запустить игру';
            startBtn.onclick = async () => {
                try {
                    await setLobbyStatus(this.currentLobby.lobbyId, 2);
                    await setLobbyStatus(this.currentLobby.lobbyId, 3);
                    this.scene.start('Board', {
                        mode: 'join',
                        displayName: this.panel.querySelector('#displayName').value.trim(),
                        sessionId: this.currentLobby.sessionId,
                        lobbyId: this.currentLobby.lobbyId,
                        isMan: true,
                        isMuslim: false
                    });
                } catch (error) {
                    this.showMessage(error.message, true);
                }
            };

            this.currentLobbyEl.appendChild(document.createTextNode(' '));
            this.currentLobbyEl.appendChild(startBtn);
        }
    }
}
