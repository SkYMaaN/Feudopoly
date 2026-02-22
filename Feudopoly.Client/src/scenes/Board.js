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

        this.load.scenePlugin({
            key: 'rexuiplugin',
            url: "plugins/rexuiplugin.min.js",
            sceneKey: 'rexUI'
        });
    }

    async create(data) {
        this.stepSfx = this.sound.add('stepSfx', { volume: 0.1 });

        this.players = [];
        this.localPlayerId = null;
        this.activeTurnPlayerId = null;
        this.lastRollValue = 0;
        this.isRolling = false;
        this.animatingPlayerId = null;

        this.addBoard();
        this.buildCells();
        this.addMedievalAtmosphere();
        this.createDiceUI();
        this.createTurnUI();
        this.createStatusText();

        this.registerHubEvents();

        try {
            this.sessionId = data?.sessionId ?? crypto.randomUUID();
            const displayName = data?.displayName?.trim() || `Player-${Math.floor(Math.random() * 999)}`;
            const mode = data?.mode === "join" ? "join" : "create";

            console.log(`Session (${mode}): ${this.sessionId} \nPlayer: ${displayName}`);

            await gameHubClient.connect();
            await gameHubClient.joinGame(this.sessionId, displayName);
            this.setStatus(`${mode === "create" ? "Created" : "Joined"} session ${this.sessionId}.`);
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
        console.log('Apply state event!');
        if (!state || !Array.isArray(state.players)) {
            return;
        }

        this.activeTurnPlayerId = state.activeTurnPlayerId ? String(state.activeTurnPlayerId) : null;
        this.lastRollValue = state.lastRollValue ?? 0;

        const incomingIds = new Set(state.players.map(player => String(player.playerId)));

        this.players.filter(player => !incomingIds.has(String(player.playerId)))
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
            player.isConnected = playerState.isConnected;

            // To prevent double animation from two web socket events. Active Turn Player moving by diceRolled event.
            if (this.localPlayerId != playerId) {
                const steps = this.getStepsToPosition(player.currentPosition, playerState.position);

                if (steps > 0) {
                    this.animatingPlayerId = playerId;
                    this.isRolling = true;

                    this.movePlayer(playerId, steps, playerState.position, () => {
                        this.isRolling = false;
                        this.animatingPlayerId = null;
                        this.refreshTurnUI();
                    });
                }
            }
        });

        if (!this.isRolling) {
            this.refreshTurnUI();
        }
    }

    createPlayer(playerId, displayName, startPosition) {
        const cell = this.cells[startPosition] ?? this.cells[0];

        const sprite = this.add.sprite(cell.x, cell.y, 'token')
            .setOrigin(0.5)
            .setScale(0.05);

        const color = Phaser.Display.Color.RandomRGB().color;
        sprite.setTint(color);

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


        console.log('this.animatingPlayerId: ' + this.animatingPlayerId);
        console.log('this.rolling?: ' + this.isRolling);
        if (isLocalTurn && this.animatingPlayerId == null) {
            this.rollButton.setVisible(true);
            this.rollButton.setInteractive({ useHandCursor: true });
            this.rollButtonBackground.setFillStyle(0x3E5A2E, 1);
        }
        else {
            this.rollButton.setVisible(false);
            this.rollButton.disableInteractive();
            this.rollButtonBackground.setFillStyle(0x555555, 1);
        }

        this.turnOverlay.setVisible(true);
    }

    async requestRoll() {
        if (this.isRolling) {
            return;
        }

        try {
            this.isRolling = true;
            this.animatingPlayerId = this.localPlayerId;
            this.turnOverlay.setVisible(false);

            this.diceHintText.setVisible(false);
            this.showDice('?');
            this.diceShakingTween.play();

            await new Promise(resolve => setTimeout(resolve, 3000));

            await gameHubClient.rollDice(this.sessionId);
        } catch (error) {
            console.error(error);
            this.setStatus(`Roll failed: ${error.message ?? 'Unknown error'}`);
            this.diceShakingTween.stop();
            this.hideDice();
            this.isRolling = false;
            this.animatingPlayerId = null;
            this.turnOverlay.setVisible(true);
        }
    }

    playDiceResult(payload) {
        console.log('Dice result event!');

        const player = this.players.find(item => item.playerId === String(payload.playerId));
        if (!player) {
            return;
        }

        const steps = this.getStepsToPosition(player.currentPosition, payload.newPosition);
        this.animatingPlayerId = player.playerId;

        this.turnOverlay.setVisible(false);
        this.diceShakingTween.stop();
        this.diceHintText.setVisible(true);
        this.showDice(payload.rollValue);

        this.movePlayer(player.playerId, steps, payload.newPosition, async () => {
            this.hideDice();

            try {
                await gameHubClient.completeTurn(this.sessionId);
            } catch (error) {
                console.error(error);
                this.setStatus(`Turn completion failed: ${error.message ?? 'Unknown error'}`);
            } finally {
                this.isRolling = false;
                this.animatingPlayerId = null;
                this.refreshTurnUI();
            }
        });
    }


    getStepsToPosition(fromPosition, toPosition) {
        const total = this.cells.length;
        return (toPosition - fromPosition + total) % total;
    }

    showDice(rollValue) {
        this.diceContainer.setVisible(true);
        this.diceContainer.setScale(0.2);
        this.diceContainer.setAlpha(0);
        this.diceContainer.setAngle(0);
        this.diceValueText.setText(String(rollValue));
        this.diceHintText.setText(`The bones have spoken: ${rollValue}`);
        this.diceTimerText.setText('');

        this.tweens.add({
            targets: this.diceContainer,
            alpha: 1,
            scale: 1,
            duration: 580,
            ease: 'Back.Out'
        });
    }

    hideDice() {
        this.tweens.add({
            targets: this.diceContainer,
            alpha: 0,
            scale: 0.6,
            duration: 460,
            onComplete: () => this.diceContainer.setVisible(false)
        });
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
                duration: 500,
                delay: 100,
                onComplete: () => {
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

        this.applyStackOffsets(player.currentPosition);
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
        this.diceContainer.setAngle(0);

        this.diceShakingTween = this.tweens.add({
            targets: this.diceContainer,
            angle: { from: -12, to: 12 },
            duration: 90,
            ease: 'Sine.InOut',
            yoyo: true,
            repeat: -1,
            paused: true,
            persist: true
        });

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

        this.rollButtonBackground = this.rexUI.add.roundRectangle(0, 0, 460, 110, 18, 0x6f4b23, 1)
            .setStrokeStyle(7, 0xc89b58, 1);

        this.rollButtonText = this.add.text(0, 0, 'Roll!', {
            fontFamily: 'Arial, sans-serif',
            fontSize: '42px',
            color: '#ffffff',
            fontStyle: 'bold'
        }).setOrigin(0.5);

        this.rollButton = this.rexUI.add.label({
            x: 0,
            y: 120,
            width: 460,
            height: 110,
            background: this.rollButtonBackground,
            text: this.rollButtonText,
            align: 'center'
        }).layout().setInteractive({ useHandCursor: true });

        this.rollButton.on('pointerover', () => {
            if (this.rollButton.input?.enabled) {
                this.rollButtonBackground.setFillStyle(0x3E5A2E, 1);
            }
        });

        this.rollButton.on('pointerout', () => {
            const isEnabled = this.rollButton.input?.enabled;
            this.rollButtonBackground.setFillStyle(isEnabled ? 0x83592b : 0x555555, 1);
        });

        this.rollButton.on('pointerdown', () => {
            this.requestRoll();
        });

        this.turnOverlay.add([dim, this.turnTitleText, this.turnSubtitleText, this.rollButton]);
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
