const SERVER_BASE_URL = 'https://localhost:7049';
const LOBBIES_ENDPOINT = `${SERVER_BASE_URL}/api/lobbies`;

async function parseResponse(response) {
    if (response.ok) {
        if (response.status === 204) {
            return null;
        }

        return response.json();
    }

    let payload = null;
    try {
        payload = await response.json();
    } catch {
        payload = null;
    }

    const message = payload?.error ?? payload?.title ?? `Request failed with status ${response.status}`;
    throw new Error(message);
}

export async function getLobbies(search = '') {
    const url = search
        ? `${LOBBIES_ENDPOINT}?search=${encodeURIComponent(search)}`
        : LOBBIES_ENDPOINT;

    const response = await fetch(url);
    return parseResponse(response);
}

export async function createLobby(payload) {
    const response = await fetch(LOBBIES_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });

    return parseResponse(response);
}

export async function getLobby(lobbyId) {
    const response = await fetch(`${LOBBIES_ENDPOINT}/${lobbyId}`);
    return parseResponse(response);
}

export async function joinLobby(lobbyId, payload) {
    const response = await fetch(`${LOBBIES_ENDPOINT}/${lobbyId}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });

    return parseResponse(response);
}

export async function leaveLobby(lobbyId, payload) {
    const response = await fetch(`${LOBBIES_ENDPOINT}/${lobbyId}/leave`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });

    return parseResponse(response);
}

export async function setLobbyStatus(lobbyId, status) {
    const response = await fetch(`${LOBBIES_ENDPOINT}/${lobbyId}/status/${status}`, {
        method: 'POST'
    });

    return parseResponse(response);
}
