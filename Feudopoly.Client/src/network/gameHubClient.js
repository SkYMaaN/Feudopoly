const HUB_PATH = '/hubs/game';

export class GameHubClient {
    constructor() {
        this.connection = null;
        this.handlers = {
            joined: [],
            stateUpdated: [],
            playerJoined: [],
            playerLeft: [],
            diceRolled: [],
            error: []
        };
    }

    async connect(serverBaseUrl) {
        if (!window.signalR) {
            throw new Error('SignalR script is not loaded.');
        }

        if (this.connection && this.connection.state === signalR.HubConnectionState.Connected) {
            return;
        }

        const hubUrl = `${serverBaseUrl.replace(/\/$/, '')}${HUB_PATH}`;

        this.connection = new signalR.HubConnectionBuilder()
            .withUrl(hubUrl)
            .withAutomaticReconnect([0, 2000, 5000, 10000])
            .configureLogging(signalR.LogLevel.Warning)
            .build();

        this.connection.on('Joined', (playerId, state) => {
            this.emit('joined', { playerId, state });
        });

        this.connection.on('StateUpdated', (state) => {
            this.emit('stateUpdated', state);
        });

        this.connection.on('PlayerJoined', (state) => {
            this.emit('playerJoined', state);
        });

        this.connection.on('PlayerLeft', (playerId) => {
            this.emit('playerLeft', playerId);
        });

        this.connection.on('DiceRolled', (payload) => {
            this.emit('diceRolled', payload);
        });

        this.connection.onclose((error) => {
            this.emit('error', error ?? new Error('Connection closed.'));
        });

        await this.connection.start();
    }

    async joinGame(sessionId, displayName) {
        await this.connection.invoke('JoinGame', sessionId, displayName);
    }

    async rollDice(sessionId) {
        await this.connection.invoke('RollDice', sessionId);
    }

    async syncState(sessionId) {
        await this.connection.invoke('SyncState', sessionId);
    }

    on(eventName, handler) {
        if (!this.handlers[eventName]) {
            throw new Error(`Unknown event name: ${eventName}`);
        }

        this.handlers[eventName].push(handler);

        return () => {
            this.handlers[eventName] = this.handlers[eventName].filter(item => item !== handler);
        };
    }

    emit(eventName, payload) {
        this.handlers[eventName]?.forEach(handler => handler(payload));
    }
}

export const gameHubClient = new GameHubClient();
