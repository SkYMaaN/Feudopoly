import { gameHubClient } from '../network/gameHubClient.js';

export class Board extends Phaser.Scene {
    COLOR_MAIN = 0x4e342e;
    COLOR_LIGHT = 0x7b5e57;
    COLOR_DARK = 0x260e04;

    maxPlayers = 4;
    startCellIndex = 0;

    constructor() {
        super('Board');
    }

    preload() {
        this.load.image('board', 'assets/boards/board1.jpg');
        this.load.image('token', 'assets/textures/game_token.png');
        this.load.audio('stepSfx', 'assets/sfx/token_step.mp3');

        for (let i = 1; i < 21; i++) {
            this.load.image(`bg${i}`, `assets/backgrounds/${i}.png`);
        }

        this.load.scenePlugin({
            key: 'rexuiplugin',
            url: "plugins/rexuiplugin.min.js",
            sceneKey: 'rexUI'
        });
    }

    async create(data) {
        const { width, height } = this.scale.gameSize;

        this.stepSfx = this.sound.add('stepSfx', { volume: 0.1 });

        this.players = [];
        this.localPlayerId = null;
        this.activeTurnPlayerId = null;
        this.lastRollValue = 0;
        this.isRolling = false;
        this.animatingPlayerId = null;

        this.addBoard();
        this.buildCells();
        this.setCellBackgrounds();
        this.addMedievalAtmosphere();
        this.createDiceUI();
        this.createTurnUI();
        this.createStatusText();

        this.registerHubEvents();

        this.notificationTextBox = this.createTextBox(this, width / 2, height / 2,
            {
                width: 500,
                height: 150,
                title: ''
            }
        )
            .setOrigin(0.5)
            .setVisible(false);

        this.input.on('pointerdown', () => {
            if (!this.notificationTextBox.visible) {
                return;
            }

            this.notificationTextBox.stop(true).setVisible(false);
        });

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
            gameHubClient.on('turnBegan', (payload) => {
                this.turnBegan(payload);
            }),
            gameHubClient.on('turnEnded', (payload) => {
                this.turnEnded(payload);
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
        /*this.rollButton.setVisible(false);
        this.rollButton.disableInteractive();
        this.rollButtonBackground.setFillStyle(0x555555, 1);
        this.turnOverlay.setVisible(false);
        return;*/

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


        if (isLocalTurn) {
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

    turnBegan(payload) {
        console.log('Turn Began: ' + JSON.stringify(payload));

        this.notificationTextBox
            .setVisible(true)
            .stop(true);

        const titleEl = this.notificationTextBox.getElement('title');
        if (titleEl) {
            titleEl.setText(payload.title ?? '');
        }

        this.notificationTextBox
            .setText('')
            .layout()
            .start(payload.description ?? '', 30);

        gameHubClient.finishTurn(this.sessionId);
    }

    turnEnded(payload) {
        console.log('Turn Ended: ' + JSON.stringify(payload));
    }

    playDiceResult(payload) {
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
                await gameHubClient.beginTurn(this.sessionId);
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

        const d = 60;
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

        // Под твою новую картинку (9x8 => 10 вертикальных линий, 9 горизонтальных)
        const xLines = [55, 205, 356, 502, 657, 803, 951, 1101, 1253, 1410];
        const yLines = [40, 160, 294, 411, 546, 659, 800, 914, 1052];

        const xMid = (i) => (xLines[i] + xLines[i + 1]) / 2;
        const yMid = (i) => (yLines[i] + yLines[i + 1]) / 2;

        const W = xLines.length - 1; // 9
        const H = yLines.length - 1; // 8

        const left = 0, right = W - 1;
        const top = 0, bottom = H - 1;

        const centers = [];

        // 0..8: нижний ряд (справа -> влево), включая оба угла
        for (let x = right; x >= left; x--) {
            centers.push({ tx: xMid(x), ty: yMid(bottom) });
        }

        // 9..15: левая колонка (снизу -> вверх), без нижнего угла, с верхним
        for (let y = bottom - 1; y >= top; y--) {
            centers.push({ tx: xMid(left), ty: yMid(y) });
        }

        // 16..23: верхний ряд (слева -> вправо), без левого угла, с правым
        for (let x = left + 1; x <= right; x++) {
            centers.push({ tx: xMid(x), ty: yMid(top) });
        }

        // 24..29: правая колонка (сверху -> вниз), без верхнего и нижнего углов
        for (let y = top + 1; y <= bottom - 1; y++) {
            centers.push({ tx: xMid(right), ty: yMid(y) });
        }

        // 30 клеток: индексы 0..29
        this.cells = centers.map(p => ({ x: toWorldX(p.tx), y: toWorldY(p.ty) }));
    }

    setCellBackgrounds() {
        for (let i = 1; i < this.cells.length; i++) {
            let cell = this.cells[i];
            const img = this.add.image(cell.x, cell.y, `bg${i}`).setOrigin(0.5);

            img.setDisplaySize(145, 120);
        }
    }

    createTextBox(scene, x, y, config) {
        var width = Phaser.Utils.Objects.GetValue(config, 'width', 0);
        var height = Phaser.Utils.Objects.GetValue(config, 'height', 0);
        var wrapWidth = Phaser.Utils.Objects.GetValue(config, 'wrapWidth', 0);
        var fixedWidth = Phaser.Utils.Objects.GetValue(config, 'fixedWidth', 0);
        var fixedHeight = Phaser.Utils.Objects.GetValue(config, 'fixedHeight', 0);
        var titleText = Phaser.Utils.Objects.GetValue(config, 'title', undefined);
        var typingMode = Phaser.Utils.Objects.GetValue(config, 'typingMode', 'page');
        var maxLines = (width > 0) ? 0 : 3;

        var textBox = scene.rexUI.add.textBox({
            x: x, y: y,
            width: width, height: height,

            typingMode: typingMode,

            background: scene.rexUI.add.roundRectangle({ radius: 20, color: this.COLOR_MAIN, strokeColor: this.COLOR_LIGHT, strokeWidth: 2 }),

            /*icon: scene.rexUI.add.transitionImagePack({
                width: 40, height: 40,
                key: 'portraits', frame: 'A-smile'
            }),*/

            // text: getBuiltInText(scene, wrapWidth, fixedWidth, fixedHeight),
            text: this.getBBcodeText(scene, wrapWidth, fixedWidth, fixedHeight, maxLines),
            expandTextWidth: (width > 0),
            expandTextHeight: (height > 0),

            action: scene.rexUI.add.aioSpinner({
                width: 30, height: 30,
                duration: 1000,
                animationMode: 'ball'
            }).setVisible(false),

            title: (titleText) ? scene.add.text(0, 0, titleText, { fontSize: '24px', }) : undefined,

            separator: (titleText) ? scene.rexUI.add.roundRectangle({ height: 3, color: this.COLOR_DARK }) : undefined,

            space: {
                left: 20, right: 20, top: 20, bottom: 20,

                icon: 10, text: 10,

                separator: 6,
            },

            align: {
                title: 'center',
                action: 'bottom'
            }
        })
            .setOrigin(0)
            .layout();

        textBox
            .setInteractive()
            .on('pointerdown', function () {
                if (typingMode === 'page') {

                    var icon = this.getElement('action');
                    icon.stop().setVisible(false);
                    this.resetChildVisibleState(icon);

                    if (this.isTyping) {
                        this.stop(true);
                    } else {
                        this.typeNextPage();
                    }
                }
            }, textBox)
            .on('pageend', function () {
                if (this.isLastPage) {
                    return;
                }

                var icon = this.getElement('action');
                icon.setVisible(true).start();
                this.resetChildVisibleState(icon);

            }, textBox)
            .on('complete', function () {
                console.log('all pages typing complete')
            })

        return textBox;
    }

    getBuiltInText(scene, wrapWidth, fixedWidth, fixedHeight) {
        return scene.add.text(0, 0, '', {
            fontSize: '20px',
            wordWrap: {
                width: wrapWidth
            },
            maxLines: 3
        })
            .setFixedSize(fixedWidth, fixedHeight);
    }

    getBBcodeText(scene, wrapWidth, fixedWidth, fixedHeight) {
        return scene.rexUI.add.BBCodeText(0, 0, '', {
            fixedWidth: fixedWidth,
            fixedHeight: fixedHeight,

            fontSize: '20px',
            wrap: {
                mode: 'word',
                width: wrapWidth
            },
            maxLines: 3
        })
    }
}
