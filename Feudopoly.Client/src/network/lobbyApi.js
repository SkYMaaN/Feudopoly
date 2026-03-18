import { backendBaseUrl } from '../config.js';

async function request(path, method = 'GET', body = null) {
    const requestOptions = { method };

    if (body) {
        requestOptions.headers = { 'Content-Type': 'application/json' };
        requestOptions.body = JSON.stringify(body);
    }

    const response = await fetch(`${backendBaseUrl}${path}`, requestOptions);

    if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.message || `Request failed (${response.status})`);
    }

    if (response.status === 204) {
        return null;
    }

    return response.json();
}

export const lobbyApi = {
    list(search = '') { return request(`/api/lobbies?search=${encodeURIComponent(search)}`); },
    details(lobbyId) { return request(`/api/lobbies/${lobbyId}`); },
    create(payload) { return request('/api/lobbies', 'POST', payload); },
    join(lobbyId, payload) { return request(`/api/lobbies/${lobbyId}/join`, 'POST', payload); },
    leave(lobbyId, payload) { return request(`/api/lobbies/${lobbyId}/leave`, 'POST', payload); },
    start(lobbyId, payload) { return request(`/api/lobbies/${lobbyId}/start`, 'POST', payload); }
};
