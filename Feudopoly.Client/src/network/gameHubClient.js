const HUB_PATH = '/hubs/game';
const ServerBaseUrl = "https://localhost:7049";

export class GameHubClient {
    constructor() {
        this.connection = null;
        this.handlers = {
            joined: [],
            stateUpdated: [],
            playerJoined: [],
            playerLeft: [],
            diceRolled: [],
            turnBegan: [],
            turnEnded: [],
            eventDiceRolled: [],
            error: []
        };
    }

    async connect() {

        if (!window.signalR) {
            throw new Error('SignalR script is not loaded.');
        }

        if (this.connection && this.connection.state === signalR.HubConnectionState.Connected) {
            return;
        }

        const hubUrl = `${ServerBaseUrl}${HUB_PATH}`;

        console.log("Hub Url: " + hubUrl);

        this.connection = new signalR.HubConnectionBuilder()
            .withUrl(hubUrl)
            .withAutomaticReconnect([0, 2000, 5000, 10000])
            .configureLogging(signalR.LogLevel.Warning)
            .build();

        // FOR DEBUG!
        this.connection.serverTimeoutInMilliseconds = 1000 * 60 * 30;

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

        this.connection.on('TurnBegan', (payload) => {
            this.emit('turnBegan', payload);
        });

        this.connection.on('TurnEnded', (payload) => {
            this.emit('turnEnded', payload);
        });

        this.connection.on('EventDiceRolled', (payload) => {
            this.emit('eventDiceRolled', payload);
        });

        this.connection.onclose((error) => {
            this.emit('error', error ?? new Error('Connection closed.'));
        });

        await this.connection.start();
    }

    async joinGame(sessionId, displayName, isMan, isMuslim) {
        await this.connection.invoke('JoinGame', sessionId, displayName, isMan, isMuslim);
    }

    async rollDice(sessionId) {
        await this.connection.invoke('RollDice', sessionId);
    }

    async beginTurn(sessionId) {
        await this.connection.invoke('BeginTurn', sessionId);
    }

    async finishTurn(sessionId, chosenPlayerId = null) {
        await this.connection.invoke('FinishTurn', sessionId, chosenPlayerId);
    }

    async rollEventDice(sessionId) {
        await this.connection.invoke('RollEventDice', sessionId);
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
