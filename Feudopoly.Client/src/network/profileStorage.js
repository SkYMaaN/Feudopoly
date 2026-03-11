const KEY = 'feudopoly.playerProfile';

export function getOrCreateProfile() {
    const raw = localStorage.getItem(KEY);
    if (raw) {
        return JSON.parse(raw);
    }

    const profile = { playerId: crypto.randomUUID() };
    localStorage.setItem(KEY, JSON.stringify(profile));
    return profile;
}

export function saveProfile(data) {
    const profile = { ...getOrCreateProfile(), ...data };
    localStorage.setItem(KEY, JSON.stringify(profile));
    return profile;
}
