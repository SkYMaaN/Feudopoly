export const BUTTON_CLICK_KEY = 'button_click';

const BUTTON_CLICK_PATH = 'assets/sfx/button_click.wav';
const BUTTON_CLICK_VOLUME = 0.45;

export function preloadButtonClick(scene) {
    if (!scene.cache.audio.exists(BUTTON_CLICK_KEY)) {
        scene.load.audio(BUTTON_CLICK_KEY, BUTTON_CLICK_PATH);
    }
}

export function playButtonClick(scene) {
    if (!scene?.sound || !scene.cache.audio.exists(BUTTON_CLICK_KEY)) {
        return;
    }

    scene.sound.play(BUTTON_CLICK_KEY, { volume: BUTTON_CLICK_VOLUME });
}
