import { backendBaseUrl } from '../config.js';

const HUB_PATH = '/hubs/lobby';
const ServerTimeoutInMilliseconds = 45 * 1000;
const KeepAliveIntervalInMilliseconds = 15 * 1000;

export class LobbyHubClient {
    constructor() {
        this.connection = null;
        this.startPromise = null;
        this.handlers = {
            lobbyUpdated: [],
            lobbyDeleted: [],
            lobbyListChanged: [],
            lobbyListDeleted: [],
            error: []
        };
    }

    async connect() {
        if (!window.signalR) {
            throw new Error('SignalR script is not loaded.');
        }

        // Scenes share one connection; reuse it (or wait for it) instead of replacing it mid-start.
        if (this.connection) {
            await this.startPromise;
            return;
        }

        //console.log('SignalR BackendBaseUrl: ' + backendBaseUrl);

        const connection = new signalR.HubConnectionBuilder()
            .withUrl(`${backendBaseUrl}${HUB_PATH}`)
            .configureLogging(signalR.LogLevel.Warning)
            .build();

        this.connection = connection;

        this.connection.serverTimeoutInMilliseconds = ServerTimeoutInMilliseconds;
        this.connection.keepAliveIntervalInMilliseconds = KeepAliveIntervalInMilliseconds;

        this.connection.on('LobbyUpdated', (lobby) => this.emit('lobbyUpdated', lobby));
        this.connection.on('LobbyDeleted', (lobbyId) => this.emit('lobbyDeleted', lobbyId));
        this.connection.on('LobbyListChanged', (lobby) => this.emit('lobbyListChanged', lobby));
        this.connection.on('LobbyListDeleted', (lobbyId) => this.emit('lobbyListDeleted', lobbyId));
        this.connection.onclose((error) => {
            // Intentional disconnects clear this.connection first; only report unexpected drops.
            if (this.connection !== connection) {
                return;
            }

            this.connection = null;
            this.emit('error', error ?? new Error('Connection closed.'));
        });

        this.startPromise = connection.start();
        try {
            await this.startPromise;
        } catch (error) {
            if (this.connection === connection) {
                this.connection = null;
            }

            throw error;
        }
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

    // Members pass their credentials so the server can drop them from a waiting lobby if this connection is lost.
    async subscribeLobby(lobbyId, playerId = null, playerKey = null) {
        await this.connection.invoke('SubscribeLobby', lobbyId, playerId, playerKey);
    }

    async unsubscribeLobby(lobbyId) {
        if (!this.connection || this.connection.state !== signalR.HubConnectionState.Connected) {
            return;
        }

        await this.connection.invoke('UnsubscribeLobby', lobbyId);
    }

    async disconnect() {
        const connection = this.connection;
        if (!connection) {
            return;
        }

        this.connection = null;
        await connection.stop();
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
