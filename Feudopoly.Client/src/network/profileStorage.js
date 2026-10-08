const KEY = 'feudopoly.playerProfile';

export function getOrCreateProfile() {
    const raw = localStorage.getItem(KEY);
    const profile = raw ? JSON.parse(raw) : { playerId: crypto.randomUUID() };

    // Secret proving to the server that requests for this playerId come from this browser.
    if (!profile.playerKey) {
        profile.playerKey = `${crypto.randomUUID()}${crypto.randomUUID()}`.replaceAll('-', '');
        localStorage.setItem(KEY, JSON.stringify(profile));
    }

    return profile;
}

export function saveProfile(data) {
    const profile = { ...getOrCreateProfile(), ...data };
    localStorage.setItem(KEY, JSON.stringify(profile));
    return profile;
}
