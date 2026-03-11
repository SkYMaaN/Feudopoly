const HUB_PATH = '/hubs/lobby';
const ServerBaseUrl = 'https://localhost:7049';

export class LobbyHubClient {
    constructor() {
        this.connection = null;
        this.handlers = {
            lobbyUpdated: [],
            lobbyDeleted: [],
            lobbyListChanged: [],
            lobbyListDeleted: [],
            reconnected: [],
            reconnecting: [],
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

        this.connection = new signalR.HubConnectionBuilder()
            .withUrl(`${ServerBaseUrl}${HUB_PATH}`)
            .withAutomaticReconnect([0, 2000, 5000, 10000])
            .configureLogging(signalR.LogLevel.Warning)
            .build();

        this.connection.on('LobbyUpdated', (lobby) => this.emit('lobbyUpdated', lobby));
        this.connection.on('LobbyDeleted', (lobbyId) => this.emit('lobbyDeleted', lobbyId));
        this.connection.on('LobbyListChanged', (lobby) => this.emit('lobbyListChanged', lobby));
        this.connection.on('LobbyListDeleted', (lobbyId) => this.emit('lobbyListDeleted', lobbyId));
        this.connection.onreconnected(() => this.emit('reconnected'));
        this.connection.onreconnecting((error) => this.emit('reconnecting', error));
        this.connection.onclose((error) => this.emit('error', error ?? new Error('Connection closed.')));

        await this.connection.start();
    }

    async subscribeLobbyList() {
        await this.connection.invoke('SubscribeLobbyList');
    }

    async unsubscribeLobbyList() {
        if (!this.connection || this.connection.state !== signalR.HubConnectionState.Connected) {
            return;
        }

        await this.connection.invoke('UnsubscribeLobbyList');
    }

    async subscribeLobby(lobbyId) {
        await this.connection.invoke('SubscribeLobby', lobbyId);
    }

    async unsubscribeLobby(lobbyId) {
        if (!this.connection || this.connection.state !== signalR.HubConnectionState.Connected) {
            return;
        }

        await this.connection.invoke('UnsubscribeLobby', lobbyId);
    }

    async disconnect() {
        if (!this.connection) {
            return;
        }

        await this.connection.stop();
        this.connection = null;
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

export const lobbyHubClient = new LobbyHubClient();
