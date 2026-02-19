import { gameHubClient } from '../network/gameHubClient.js';

export class Board extends Phaser.Scene {
    maxPlayers = 4;
    startCellIndex = 21;

    constructor() {
        super('Board');
    }

    preload() {
        this.load.image('board', 'assets/boards/board1.png');
        this.load.image('token', 'assets/textures/game_token.png');
        this.load.audio('stepSfx', 'assets/sfx/token_step.mp3');
    }

    async create(data) {
        this.stepSfx = this.sound.add('stepSfx', { volume: 0.1 });

        this.players = [];
        this.localPlayerId = null;
        this.activeTurnPlayerId = null;
        this.lastRollValue = 0;
        this.isRolling = false;
        this.pendingRollPayload = null;
        this.diceShakeTween = null;
        this.diceFaceTimer = null;
        this.diceRevealTimer = null;
        this.diceCountdownTimer = null;
        this.diceSecondsLeft = 0;
        this.diceRevealHandler = null;

        this.addBoard();
        this.buildCells();
        this.addMedievalAtmosphere();
        this.createDiceUI();
        this.createTurnUI();
        this.createStatusText();

        this.registerHubEvents();

        try {
            const requestedSessionId = data?.sessionId?.trim();
            this.sessionId = data?.mode === 'join' && requestedSessionId
                ? requestedSessionId
                : crypto.randomUUID();
            const testDisplayName = "HeroZero123";
            console.log("Using session id: " + this.sessionId);

            await gameHubClient.connect();
            await gameHubClient.joinGame(this.sessionId, testDisplayName);
            this.setStatus(`Connected to ${this.sessionId}.`);
        } catch (error) {
            console.error(error);
            this.setStatus(`SignalR error: ${error.message ?? 'Unknown error'}`);
        }
    }

    registerHubEvents() {
        this.unsubscribeHandlers = [
            gameHubClient.on('joined', ({ playerId, state }) => {
                this.localPlayerId = String(playerId);
                this.applyState(state);
            }),
            gameHubClient.on('stateUpdated', (state) => {
                this.applyState(state);
            }),
            gameHubClient.on('diceRolled', (payload) => {
                this.playDiceResult(payload);
            }),
            gameHubClient.on('error', (error) => {
                this.setStatus(`Connection lost: ${error?.message ?? 'Unknown issue'}`);
            })
        ];
    }

    createStatusText() {
        const { width } = this.scale.gameSize;

        this.statusText = this.add.text(width / 2, 28, 'Connecting to server...', {
            fontFamily: 'Arial, sans-serif',
            fontSize: '28px',
            color: '#ffffff',
            stroke: '#000000',
            strokeThickness: 6
        }).setOrigin(0.5).setDepth(1100);
    }

    setStatus(text) {
        this.statusText?.setText(text);
    }

    applyState(state) {
        if (!state || !Array.isArray(state.players)) {
            return;
        }

        const incomingIds = new Set(state.players.map(player => String(player.playerId)));

        this.players
            .filter(player => !incomingIds.has(String(player.playerId)))
            .forEach(player => {
                player.sprite.destroy();
            });

        this.players = this.players.filter(player => incomingIds.has(String(player.playerId)));

        state.players.forEach((playerState, index) => {
            const playerId = String(playerState.playerId);
            let player = this.players.find(item => item.playerId === playerId);

            if (!player) {
                player = this.createPlayer(playerId, playerState.displayName, playerState.position);
                this.players.push(player);
            }

            player.displayName = playerState.displayName;
            player.currentPosition = playerState.position;
            player.isConnected = playerState.isConnected;

            if (!this.isRolling) {
                const destination = this.cells[player.currentPosition];
                player.sprite.setPosition(destination.x, destination.y);
            }

            this.applyStackOffsets(player.currentPosition);
        });

        this.activeTurnPlayerId = state.activeTurnPlayerId ? String(state.activeTurnPlayerId) : null;
        this.lastRollValue = state.lastRollValue ?? 0;

        this.refreshTurnUI();
    }

    createPlayer(playerId, displayName, startPosition) {
        const cell = this.cells[startPosition] ?? this.cells[0];

        const sprite = this.add.sprite(cell.x, cell.y, 'token')
            .setOrigin(0.5)
            .setScale(0.05);

        return {
            playerId,
            displayName,
            sprite,
            currentPosition: startPosition,
            isConnected: true
        };
    }

    refreshTurnUI() {
        if (this.players.length === 0) {
            this.turnOverlay.setVisible(false);
            return;
        }

        const current = this.players.find(player => player.playerId === this.activeTurnPlayerId) ?? this.players[0];
        const isLocalTurn = current?.playerId === this.localPlayerId;

        this.turnTitleText.setText(`${current?.displayName ?? 'Player'} turn`);
        this.turnSubtitleText.setText(isLocalTurn
            ? 'Your turn! Press Roll to cast the dice.'
            : 'Waiting for opponent move...');

        this.rollButton.disableInteractive();
        this.rollButton.setFillStyle(isLocalTurn ? 0x3a86ff : 0x555555, 1);

        if (isLocalTurn) {
            this.rollButton.setInteractive({ useHandCursor: true });
        }

        this.turnOverlay.setVisible(true);
    }

    async requestRoll() {
        if (this.isRolling) {
            return;
        }

        try {
            this.turnOverlay.setVisible(false);
            await gameHubClient.rollDice(this.sessionId);
        } catch (error) {
            console.error(error);
            this.setStatus(`Roll failed: ${error.message ?? 'Unknown error'}`);
            this.turnOverlay.setVisible(true);
        }
    }

    playDiceResult(payload) {
        const player = this.players.find(item => item.playerId === String(payload.playerId));
        if (!player) {
            return;
        }

        this.isRolling = true;
        this.pendingRollPayload = payload;

        this.showDiceSuspense();
    }

    showDiceSuspense() {
        this.clearDiceTimers();

        this.diceContainer.setVisible(true);
        this.diceContainer.setScale(0.2);
        this.diceContainer.setAlpha(0);
        this.diceValueText.setText('1');
        this.diceHintText.setText('Shaking dice... Tap anywhere to reveal!');

        this.diceSecondsLeft = 30;
        this.updateDiceCountdownText();

        this.diceFaceTimer = this.time.addEvent({
            delay: 90,
            loop: true,
            callback: () => {
                this.diceValueText.setText(String(Phaser.Math.Between(1, 6)));
            }
        });

        this.diceCountdownTimer = this.time.addEvent({
            delay: 1000,
            loop: true,
            callback: () => {
                this.diceSecondsLeft = Math.max(0, this.diceSecondsLeft - 1);
                this.updateDiceCountdownText();
            }
        });

        this.diceRevealTimer = this.time.delayedCall(30000, () => {
            this.revealDiceResult();
        });

        this.diceRevealHandler = () => this.revealDiceResult();
        this.input.on('pointerdown', this.diceRevealHandler);

        this.diceShakeTween = this.tweens.add({
            targets: this.diceContainer,
            alpha: 1,
            scale: 1,
            duration: 380,
            ease: 'Back.Out',
            onComplete: () => {
                this.diceShakeTween = this.tweens.add({
                    targets: this.diceContainer,
                    angle: { from: -8, to: 8 },
                    duration: 120,
                    yoyo: true,
                    repeat: -1,
                    ease: 'Sine.InOut'
                });
            }
        });
    }

    updateDiceCountdownText() {
        this.diceTimerText.setText(`Auto reveal in ${this.diceSecondsLeft}s`);
    }

    revealDiceResult() {
        if (!this.pendingRollPayload) {
            return;
        }

        const payload = this.pendingRollPayload;
        const player = this.players.find(item => item.playerId === String(payload.playerId));
        if (!player) {
            this.pendingRollPayload = null;
            this.clearDiceTimers();
            this.hideDice();
            this.isRolling = false;
            this.refreshTurnUI();
            return;
        }

        this.clearDiceTimers();
        this.diceContainer.setAngle(0);
        this.diceValueText.setText(String(payload.rollValue));
        this.diceHintText.setText(`The bones have spoken: ${payload.rollValue}`);
        this.diceTimerText.setText('');

        const steps = this.calculateSteps(player.currentPosition, payload.newPosition);
        this.pendingRollPayload = null;

        this.time.delayedCall(420, () => {
            this.movePlayer(player.playerId, steps, payload.newPosition, () => {
                this.hideDice();
                this.isRolling = false;
                this.refreshTurnUI();
            });
        });
    }

    calculateSteps(from, to) {
        const total = this.cells.length;
        if (to >= from) {
            return to - from;
        }

        return total - from + to;
    }

    hideDice() {
        this.clearDiceTimers();

        this.tweens.add({
            targets: this.diceContainer,
            alpha: 0,
            scale: 0.6,
            angle: 0,
            duration: 260,
            onComplete: () => this.diceContainer.setVisible(false)
        });
    }

    clearDiceTimers() {
        if (this.diceRevealHandler) {
            this.input.off('pointerdown', this.diceRevealHandler);
            this.diceRevealHandler = null;
        }

        this.diceShakeTween?.stop();
        this.diceShakeTween = null;
        this.diceFaceTimer?.remove();
        this.diceFaceTimer = null;
        this.diceRevealTimer?.remove();
        this.diceRevealTimer = null;
        this.diceCountdownTimer?.remove();
        this.diceCountdownTimer = null;
    }

    applyStackOffsets(cellIndex) {
        const stack = this.players.filter(player => player.currentPosition === cellIndex);
        const base = this.cells[cellIndex];

        const d = 72;
        stack.forEach((player, n) => {
            const col = n % 2;
            const row = Math.floor(n / 2);
            if (row >= 2) {
                return;
            }

            const dx = col * d - d / 2;
            const dy = row * d - d / 2;

            this.tweens.add({
                targets: player.sprite,
                x: base.x + dx,
                y: base.y + dy,
                duration: 260
            });
        });
    }

    movePlayer(playerId, steps, finalPosition, onComplete) {
        const player = this.players.find(item => item.playerId === playerId);
        if (!player) {
            onComplete?.();
            return;
        }

        if (steps <= 0) {
            player.currentPosition = finalPosition;
            this.applyStackOffsets(player.currentPosition);
            onComplete?.();
            return;
        }

        const total = this.cells.length;

        const moveOne = () => {
            player.currentPosition = (player.currentPosition + 1) % total;
            const point = this.cells[player.currentPosition];

            this.stepSfx?.play();

            this.tweens.add({
                targets: player.sprite,
                x: point.x,
                y: point.y,
                duration: 300,
                onComplete: () => {
                    this.applyStackOffsets(player.currentPosition);

                    steps -= 1;
                    if (steps > 0) {
                        moveOne();
                        return;
                    }

                    player.currentPosition = finalPosition;
                    this.applyStackOffsets(player.currentPosition);
                    onComplete?.();
                }
            });
        };

        moveOne();
    }

    addMedievalAtmosphere() {
        const { width, height } = this.scale.gameSize;

        const vignette = this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.2)
            .setDepth(20)
            .setBlendMode(Phaser.BlendModes.MULTIPLY);

        this.tweens.add({
            targets: vignette,
            alpha: { from: 0.15, to: 0.25 },
            duration: 2400,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.InOut'
        });
    }

    createDiceUI() {
        const { width, height } = this.scale.gameSize;

        this.diceContainer = this.add.container(width / 2, height / 2);
        this.diceContainer.setDepth(1000);
        this.diceContainer.setVisible(false);

        const shadow = this.add.rectangle(8, 8, 220, 220, 0x000000, 0.35);
        const bg = this.add.rectangle(0, 0, 220, 220, 0xffffff, 0.97);
        const border = this.add.rectangle(0, 0, 220, 220);
        border.setStrokeStyle(10, 0x202020, 1);

        this.diceValueText = this.add.text(0, 0, '1', {
            fontFamily: 'Arial, sans-serif',
            fontSize: '120px',
            color: '#111111',
            fontStyle: 'bold'
        }).setOrigin(0.5);

        this.diceHintText = this.add.text(0, 150, 'Waiting for dice result...', {
            fontFamily: 'Arial, sans-serif',
            fontSize: '30px',
            color: '#f5f5f5',
            stroke: '#000000',
            strokeThickness: 6,
            align: 'center'
        }).setOrigin(0.5);

        this.diceTimerText = this.add.text(0, 198, '', {
            fontFamily: 'Arial, sans-serif',
            fontSize: '26px',
            color: '#ffffff',
            stroke: '#000000',
            strokeThickness: 5,
            align: 'center'
        }).setOrigin(0.5);

        this.diceContainer.add([shadow, bg, border, this.diceValueText, this.diceHintText, this.diceTimerText]);
    }

    createTurnUI() {
        const { width, height } = this.scale.gameSize;

        this.turnOverlay = this.add.container(width / 2, height / 2);
        this.turnOverlay.setDepth(900);

        const dim = this.add.rectangle(0, 0, width, height, 0x000000, 0.7).setOrigin(0.5);

        this.turnTitleText = this.add.text(0, -110, '', {
            fontFamily: 'Arial, sans-serif',
            fontSize: '74px',
            color: '#ffe066',
            stroke: '#000000',
            strokeThickness: 10,
            fontStyle: 'bold',
            align: 'center'
        }).setOrigin(0.5);

        this.turnSubtitleText = this.add.text(0, -15, 'Waiting for players...', {
            fontFamily: 'Arial, sans-serif',
            fontSize: '38px',
            color: '#ffffff',
            stroke: '#000000',
            strokeThickness: 8,
            align: 'center'
        }).setOrigin(0.5);

        this.rollButton = this.add.rectangle(0, 120, 460, 110, 0x3a86ff, 1)
            .setStrokeStyle(6, 0xffffff, 1)
            .setInteractive({ useHandCursor: true });

        this.rollButtonText = this.add.text(0, 120, 'Roll!', {
            fontFamily: 'Arial, sans-serif',
            fontSize: '42px',
            color: '#ffffff',
            fontStyle: 'bold'
        }).setOrigin(0.5);

        this.rollButton.on('pointerdown', () => {
            this.requestRoll();
        });

        this.turnOverlay.add([dim, this.turnTitleText, this.turnSubtitleText, this.rollButton, this.rollButtonText]);
    }

    addBoard() {
        const { width, height } = this.scale.gameSize;

        const tex = this.textures.get('board').getSourceImage();

        this.board = this.add.image(width / 2, height / 2, 'board')
            .setOrigin(0.5);

        const scale = Math.min(width / tex.width, height / tex.height);
        this.board.setScale(scale);
    }

    buildCells() {
        const bounds = this.board.getBounds();

        const tex = this.textures.get('board').getSourceImage();
        const texW = tex.width;
        const texH = tex.height;

        const toWorldX = (tx) => bounds.x + (tx / texW) * bounds.width;
        const toWorldY = (ty) => bounds.y + (ty / texH) * bounds.height;

        const xLines = [60, 221, 370, 525, 681, 838, 995, 1150, 1307, 1475];
        const yLines = [20, 56, 217, 361, 505, 648, 791, 935];

        const centers = [];

        const topY = (yLines[1] + yLines[2]) / 2;
        for (let i = 0; i < xLines.length - 1; i++) {
            centers.push({ tx: (xLines[i] + xLines[i + 1]) / 2, ty: topY });
        }

        const rightX = (xLines[xLines.length - 2] + xLines[xLines.length - 1]) / 2;
        for (let i = 2; i < yLines.length - 2; i++) {
            centers.push({ tx: rightX, ty: (yLines[i] + yLines[i + 1]) / 2 });
        }

        const bottomY = (yLines[yLines.length - 2] + yLines[yLines.length - 1]) / 2;
        for (let i = xLines.length - 2; i >= 0; i--) {
            centers.push({ tx: (xLines[i] + xLines[i + 1]) / 2, ty: bottomY });
        }

        const leftX = (xLines[0] + xLines[1]) / 2;
        for (let i = yLines.length - 3; i >= 2; i--) {
            centers.push({ tx: leftX, ty: (yLines[i] + yLines[i + 1]) / 2 });
        }

        const cells = centers.map(point => ({ x: toWorldX(point.tx), y: toWorldY(point.ty) }));
        this.cells = cells.slice(this.startCellIndex).concat(cells.slice(0, this.startCellIndex));
    }
}
