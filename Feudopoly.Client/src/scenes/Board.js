import { gameHubClient } from '../network/gameHubClient.js';
import { getOrCreateProfile } from '../network/profileStorage.js';

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
        this.load.audio('diceRollSfx', 'assets/sfx/dice_roll.mp3');

        this.load.image('deathScreen', 'assets/backgrounds/death_screen.png');
        this.load.video('startGameIntroVideo', 'assets/videos/StartGameIntro.mp4');

        for (let i = 0; i < 30; i++) {
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
        this.diceRollSfx = this.sound.add('diceRollSfx', { volume: 0.2, loop: true });

        this.players = [];
        this.localPlayerId = null;
        this.activeTurnPlayerId = null;
        this.lastRollValue = 0;
        this.isTurnInProgress = false;
        this.isRolling = false;
        this.animatingPlayerId = null;
        this.diceRotationTween = null;
        this.diceSpinState = { x: 0, y: 0, z: 0 };
        this.diceRollDurationMs = 3200;
        this.pendingRepeatRoll = false;
        this.turnRequiresChosenPlayer = false;
        this.isEventRollPhase = false;
        this.pendingEventRollPlayerIds = [];
        this.turnBeganClickHandler = null;
        this.turnBeganCountdownEvent = null;
        this.turnResultDismissHandler = null;
        this.notificationDismissHandler = null;
        this.isTurnResultNotificationActive = false;
        this.hasShownStartGameIntro = false;
        this.localPlayerIsDead = false;
        this.localPlayerIsSpectator = false;
        this.localPlayerIsWinner = false;
        this.isDeathChoicePending = false;
        this.isProcessingDeathChoice = false;
        this.isVictoryChoicePending = false;
        this.isProcessingVictoryChoice = false;
        this.hasExitedMatch = false;
        this.isLeavingMatch = false;
        this.isInGameMenuOpen = false;

        this.addBoard();
        this.buildCells();
        this.setCellBackgrounds();
        this.addMedievalAtmosphere();
        this.createDiceUI();
        this.createTurnUI();
        this.createStatusText();
        this.createPlayersListUI();
        this.createInGameMenuUI();
        this.createDeathScreenUI();
        this.createVictoryScreenUI();

        this.registerHubEvents();

        this.notificationTextBox = this.createTextBox(this, width / 2, height / 2 - 50,
            {
                width: 600,
                height: 250,
                title: 'sad'
            }
        )
            .setOrigin(0.5)
            .setDepth(2100)
            .setVisible(false);

        this.notificationVideo = this.add.video(width / 2, height / 2 - 160, 'startGameIntroVideo')
            .setDepth(2090)
            .setVisible(false)
            .setMute(false)
            .setLoop(false)
            .setScale(0.6);

        try {
            this.sessionId = data?.sessionId ?? crypto.randomUUID();
            const playerId = data?.playerId;

            await gameHubClient.connect();
            await gameHubClient.joinGame(this.sessionId, playerId);
            this.setStatus(`Joined session ${this.sessionId}.`);
            this.showStartGameIntro();
        } catch (error) {
            console.error(error);
            this.setStatus(`SignalR error: ${error.message ?? 'Unknown error'}`);
        }
    }

    createInGameMenuUI() {
        const { width } = this.scale.gameSize;

        this.menuToggleButtonBackground = this.rexUI.add.roundRectangle(0, 0, 220, 66, 16, 0x6f4b23, 1)
            .setStrokeStyle(4, 0xc89b58, 1);

        this.menuToggleButtonText = this.add.text(0, 0, 'Menu', {
            fontFamily: 'Arial, sans-serif',
            fontSize: '30px',
            color: '#ffffff',
            fontStyle: 'bold'
        }).setOrigin(0.5);

        this.menuToggleButton = this.rexUI.add.label({
            x: width - 140,
            y: 64,
            width: 220,
            height: 66,
            background: this.menuToggleButtonBackground,
            text: this.menuToggleButtonText,
            align: 'center'
        }).layout().setDepth(1700).setInteractive({ useHandCursor: true });

        this.menuToggleButton.on('pointerover', () => {
            if (this.menuToggleButton.input?.enabled) {
                this.menuToggleButtonBackground.setFillStyle(0x83592b, 1);
            }
        });

        this.menuToggleButton.on('pointerout', () => {
            this.menuToggleButtonBackground.setFillStyle(0x6f4b23, 1);
        });

        this.menuToggleButton.on('pointerdown', (_pointer, _localX, _localY, event) => {
            event?.stopPropagation?.();
            this.toggleInGameMenu();
        });

        this.inGameMenuContainer = this.add.container(width - 400, 128)
            .setDepth(1710)
            .setVisible(false);

        const menuBackground = this.add.rectangle(0, 0, 360, 210, 0x2d2018, 0.96)
            .setStrokeStyle(4, 0xc89b58, 1)
            .setOrigin(0, 0);

        const menuTitle = this.add.text(180, 36, 'Player actions', {
            fontFamily: 'Arial, sans-serif',
            fontSize: '30px',
            color: '#ffe066',
            stroke: '#000000',
            strokeThickness: 6,
            fontStyle: 'bold'
        }).setOrigin(0.5);

        const leaveMatchButtonBg = this.rexUI.add.roundRectangle(0, 0, 300, 64, 14, 0x4a1e16, 1)
            .setStrokeStyle(3, 0xb86b4f, 1);

        this.leaveMatchMenuButtonText = this.add.text(0, 0, 'Disconnect', {
            fontFamily: 'Arial, sans-serif',
            fontSize: '28px',
            color: '#ffe6de',
            fontStyle: 'bold'
        }).setOrigin(0.5);

        this.leaveMatchMenuButton = this.rexUI.add.label({
            x: 180,
            y: 100,
            width: 180,
            height: 64,
            background: leaveMatchButtonBg,
            text: this.leaveMatchMenuButtonText,
            align: 'center'
        }).layout().setInteractive({ useHandCursor: true });

        this.leaveMatchMenuButton.on('pointerover', () => {
            if (this.leaveMatchMenuButton.input?.enabled) {
                leaveMatchButtonBg.setFillStyle(0x6a2b1f, 1);
            }
        });

        this.leaveMatchMenuButton.on('pointerout', () => {
            leaveMatchButtonBg.setFillStyle(0x4a1e16, 1);
        });

        this.leaveMatchMenuButton.on('pointerdown', (_pointer, _localX, _localY, event) => {
            event?.stopPropagation?.();
            this.leaveCurrentMatch();
        });

        const closeHint = this.add.text(180, 180, 'Click Menu button again to close', {
            fontFamily: 'Arial, sans-serif',
            fontSize: '18px',
            color: '#d7ccc8',
            fontStyle: 'italic'
        }).setOrigin(0.5);

        [menuBackground, menuTitle, closeHint].forEach(gameObject => {
            gameObject.setInteractive({ useHandCursor: false });
            gameObject.on('pointerdown', (_pointer, _localX, _localY, event) => {
                event?.stopPropagation?.();
            });
        });

        this.inGameMenuContainer.add([menuBackground, menuTitle, this.leaveMatchMenuButton, closeHint]);

        this.menuToggleKey = this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);
        this.menuToggleKey?.on('down', () => this.toggleInGameMenu());
    }

    toggleInGameMenu(forceVisible = null) {
        if (!this.inGameMenuContainer || this.hasExitedMatch) {
            return;
        }

        const shouldOpen = forceVisible ?? !this.isInGameMenuOpen;
        this.isInGameMenuOpen = shouldOpen;
        this.inGameMenuContainer.setVisible(shouldOpen);
        this.menuToggleButtonText.setText(shouldOpen ? 'Close' : 'Menu');
        this.menuToggleButtonBackground.setFillStyle(shouldOpen ? 0x83592b : 0x6f4b23, 1);
    }

    async leaveCurrentMatch() {
        if (this.isLeavingMatch || this.hasExitedMatch) {
            return;
        }

        this.isLeavingMatch = true;
        this.toggleInGameMenu(false);

        try {
            await gameHubClient.leaveGame(this.sessionId);
            this.hasExitedMatch = true;
            this.scene.start('LobbyList', getOrCreateProfile());
        } catch (error) {
            this.isLeavingMatch = false;
            this.setStatus(error?.message ?? 'Failed to leave the match.');
        }
    }

    showStartGameIntro() {
        if (this.hasShownStartGameIntro) {
            return;
        }

        this.hasShownStartGameIntro = true;
        this.showNotification({
            title: 'Introduction',
            text: 'Listen to the narrator before your first move.',
            videoKey: 'startGameIntroVideo',
            typingSpeed: 25
        });
    }

    registerHubEvents() {
        this.unsubscribeHandlers = [
            gameHubClient.on('joined', ({ playerId, state }) => {
                this.localPlayerId = String(playerId);
                this.applyState(state);
                this.applyStackOffsets(0);
            }),
            gameHubClient.on('stateUpdated', (state) => {
                this.applyState(state);
            }),
            gameHubClient.on('diceRolled', (payload) => {
                this.playDiceResult(payload);
            }),
            gameHubClient.on('eventDiceRolled', (payload) => {
                this.playDiceResult({ ...payload, isEventPhaseRoll: true });
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
        this.isTurnInProgress = Boolean(state.isTurnInProgress);
        this.isEventRollPhase = Boolean(state.isEventRollPhase);
        this.pendingEventRollPlayerIds = Array.isArray(state.pendingEventRollPlayerIds)
            ? state.pendingEventRollPlayerIds.map(id => String(id))
            : [];

        const incomingIds = new Set(state.players.map(player => String(player.playerId)));

        this.players.filter(player => !incomingIds.has(String(player.playerId)))
            .forEach(player => {
                player.container.destroy();
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
            player.isDead = Boolean(playerState.isDead);
            player.isSpectator = Boolean(playerState.isSpectator);
            player.isWinner = Boolean(playerState.isWinner);

            // To prevent double animation from two web socket events.
            // Local player is already animated by DiceRolled/EventDiceRolled payloads.
            if (this.localPlayerId === playerId && (this.isTurnInProgress || this.isRolling)) {
                return;
            }

            const steps = this.getStepsToPosition(player.currentPosition, playerState.position, false);

            if (steps === 0) {
                return;
            }

            this.animatingPlayerId = playerId;
            this.isRolling = true;

            this.movePlayer(playerId, steps, playerState.position, () => {
                this.isRolling = false;
                this.animatingPlayerId = null;
                this.refreshTurnUI();
            });

        });

        const localState = state.players.find(player => String(player.playerId) === String(this.localPlayerId ?? ""));
        if (!localState && this.localPlayerId && !this.hasExitedMatch) {
            this.hasExitedMatch = true;
            this.setStatus("You left this match.");
            this.scene.start("LobbyList", getOrCreateProfile());
            return;
        }

        this.localPlayerIsDead = Boolean(localState?.isDead);
        this.localPlayerIsSpectator = Boolean(localState?.isSpectator);
        this.localPlayerIsWinner = Boolean(localState?.isWinner);

        this.isDeathChoicePending = this.localPlayerIsDead && !this.localPlayerIsSpectator;
        this.isVictoryChoicePending = this.localPlayerIsWinner && !this.localPlayerIsSpectator;

        if (!this.isDeathChoicePending) {
            this.isProcessingDeathChoice = false;
        }

        if (!this.isVictoryChoicePending) {
            this.isProcessingVictoryChoice = false;
        }

        const shouldDelayVictoryScreen = this.isVictoryChoicePending
            && this.isRolling
            && String(this.animatingPlayerId ?? '') === String(this.localPlayerId ?? '');

        if (this.isVictoryChoicePending && !shouldDelayVictoryScreen) {
            this.hideDeathScreen();
            this.showVictoryScreen();
        } else if (this.isDeathChoicePending) {
            this.hideVictoryScreen();
            this.showDeathScreen();
        } else {
            this.hideDeathScreen();
            this.hideVictoryScreen();
        }

        this.updateDeathChoiceButtons();
        this.updateVictoryChoiceButtons();

        if (!this.isRolling) {
            this.refreshTurnUI();
        }

        this.updatePlayersListUI(state.players);
    }

    createPlayer(playerId, displayName, startPosition) {
        const cell = this.cells[startPosition] ?? this.cells[0];

        const container = this.add.container(cell.x, cell.y);

        const outline = this.add.sprite(0, 0, 'token')
            .setOrigin(0.5)
            .setScale(0.065)
            .setTint(0xFFD700)
            .setAlpha(1)
            .setBlendMode(Phaser.BlendModes.ADD);

        const sprite = this.add.sprite(0, 0, 'token')
            .setOrigin(0.5)
            .setScale(0.05);

        sprite.setTint(this.getPlayerColor(playerId));
        sprite.setInteractive({ useHandCursor: true });
        outline.setInteractive({ useHandCursor: true });

        container.add([outline, sprite]);

        this.tweens.add({
            targets: outline,
            alpha: { from: 0.8, to: 1 },
            scale: { from: 0.06, to: 0.065 },
            duration: 900,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut'
        });

        return {
            playerId,
            displayName,
            container,
            sprite,
            outline,
            currentPosition: startPosition,
            isConnected: true,
            isDead: false,
            isSpectator: false,
            isWinner: false
        };
    }

    getPlayerColor(playerId) {
        const palette = [
            0xFF6B6B,
            0x4ECDC4,
            0xFFD166,
            0x6A9FFB,
            0xC77DFF,
            0x95D36E,
            0xF4A261,
            0xF28482
        ];

        let hash = 0;
        const value = String(playerId ?? '');

        for (let i = 0; i < value.length; i += 1) {
            hash = ((hash << 5) - hash) + value.charCodeAt(i);
            hash |= 0;
        }

        return palette[Math.abs(hash) % palette.length];
    }

    createPlayersListUI() {
        const bounds = this.board.getBounds();
        const tex = this.textures.get('board').getSourceImage();
        const texW = tex.width;
        const texH = tex.height;

        const toWorldX = (tx) => bounds.x + (tx / texW) * bounds.width;
        const toWorldY = (ty) => bounds.y + (ty / texH) * bounds.height;

        const xLines = [55, 205, 356, 502, 657, 803, 951, 1101, 1253, 1407];
        const yLines = [40, 160, 294, 411, 546, 659, 800, 914, 1052];

        const innerLeft = toWorldX(xLines[1]);
        const innerTop = toWorldY(yLines[1]);
        const innerRight = toWorldX(xLines[xLines.length - 2]);
        const innerBottom = toWorldY(yLines[yLines.length - 2]);

        const padding = 10;
        const panelWidth = Math.min(200, Math.max(340, innerRight - innerLeft - (padding * 2)));
        const panelHeight = Math.min(160, Math.max(180, innerBottom - innerTop - (padding * 2)));

        this.playersListContainer = this.add.container(innerLeft + padding, innerTop + padding).setDepth(860);

        const panel = this.add.rectangle(0, 0, panelWidth, panelHeight, 0x000000, 0.3)
            .setStrokeStyle(3, 0xc89b58, 0.75)
            .setOrigin(0, 0);

        const title = this.add.text(40, 0, 'Players', {
            fontFamily: 'Arial, sans-serif',
            fontSize: '24px',
            color: '#ffe066',
            stroke: '#000000',
            strokeThickness: 8,
            fontStyle: 'bold'
        }).setOrigin(0, 0);

        this.playersListRowsContainer = this.add.container(5, 35);

        this.playersListContainer.add([panel, title, this.playersListRowsContainer]);
    }

    updatePlayersListUI(playersState) {
        if (!this.playersListRowsContainer) {
            return;
        }

        this.playersListRowsContainer.removeAll(true);

        if (!playersState.length) {
            return;
        }

        const rowHeight = 25;

        playersState.forEach((playerState, index) => {
            const playerId = String(playerState.playerId);
            const nickname = playerState.displayName ?? 'Player';
            const colorValue = this.getPlayerColor(playerId);
            const colorHex = `#${colorValue.toString(16).padStart(6, '0')}`;

            const rowY = index * rowHeight;
            const nicknameText = this.add.text(0, rowY, nickname, {
                fontFamily: 'Arial, sans-serif',
                fontSize: '20px',
                color: colorHex,
                stroke: '#000000',
                strokeThickness: 6,
                fontStyle: 'bold'
            }).setOrigin(0, 0);

            const isSpectator = Boolean(playerState.isSpectator);

            this.playersListRowsContainer.add(nicknameText);

            if (isSpectator) {
                nicknameText.setText(`${nickname} (spectator)`);
            }

            if (Boolean(playerState.isWinner)) {
                nicknameText.setText(`${nickname} (winner)`);
            }

            const isDead = Boolean(
                playerState.isDead
                || playerState.dead
                || playerState.isAlive === false
                || playerState.status === 'dead'
            );

            if (isDead) {
                const textWidth = nicknameText.width;
                const strikeLine = this.add.line(0, rowY, 0, 0, textWidth, 0, 0xff2e2e)
                    .setLineWidth(6)
                    .setOrigin(0, 0.5);

                this.playersListRowsContainer.add(strikeLine);
            }
        });
    }

    refreshTurnUI() {
        if (this.isTurnResultNotificationActive) {
            const isLocalTurnAgain = this.activeTurnPlayerId === this.localPlayerId && !this.isTurnInProgress;
            if (isLocalTurnAgain) {
                this.hideTurnResultNotification();
            } else {
                this.turnOverlay.setVisible(false);
                return;
            }
        }

        if (this.players.length === 0) {
            this.turnOverlay.setVisible(false);
            return;
        }

        const current = this.players.find(player => player.playerId === this.activeTurnPlayerId) ?? this.players[0];
        const activeTurnPlayerId = current?.playerId ?? this.activeTurnPlayerId;
        const isLocalTurn = String(activeTurnPlayerId ?? '') === String(this.localPlayerId ?? '');
        const mustRollForEvent = this.isEventRollPhase && this.pendingEventRollPlayerIds.includes(String(this.localPlayerId ?? ''));
        const canRoll = !this.localPlayerIsDead && !this.localPlayerIsSpectator && !this.localPlayerIsWinner
            && !this.isTurnInProgress && (mustRollForEvent || (!this.isEventRollPhase && isLocalTurn));

        if (isLocalTurn && this.isTurnInProgress) {
            return;
        }

        this.turnTitleText.setText(this.isEventRollPhase ? 'Event roll phase' : `${current?.displayName ?? 'Player'} turn`);

        if (mustRollForEvent) {
            this.hideNotification();
            this.turnSubtitleText.setText('Event requires your roll. Throw the dice!');
        } else if (this.pendingRepeatRoll) {
            this.hideNotification();
            this.turnSubtitleText.setText('You got a repeat roll. Throw again!');
        } else if (this.isEventRollPhase) {
            this.turnSubtitleText.setText('Waiting for other players to finish event rolls...');
        } else if (isLocalTurn) {
            this.hideNotification();
            this.turnSubtitleText.setText('It is your turn. Roll the dice!');
        } else {
            this.turnSubtitleText.setText("Waiting for opponent's move...");
        }

        if (canRoll) {
            this.rollButton.setVisible(true);
            this.rollButton.setInteractive({ useHandCursor: true });
            this.rollButtonBackground.setFillStyle(0x3E5A2E, 1);
            this.rollButtonText.setText(this.pendingRepeatRoll || mustRollForEvent ? 'Roll again!' : 'Roll!');
        }
        else {
            this.rollButton.setVisible(false);
            this.rollButton.disableInteractive();
            this.rollButtonBackground.setFillStyle(0x555555, 1);
            this.rollButtonText.setText(this.pendingRepeatRoll || mustRollForEvent ? 'Roll again!' : 'Roll!');
        }

        this.turnOverlay.setVisible(true);
    }

    async requestRoll() {
        const current = this.players.find(player => player.playerId === this.activeTurnPlayerId) ?? this.players[0];
        const isLocalTurn = current?.playerId === this.localPlayerId;
        const mustRollForEvent = this.isEventRollPhase && this.pendingEventRollPlayerIds.includes(String(this.localPlayerId ?? ''));
        const canRoll = !this.localPlayerIsDead && !this.localPlayerIsSpectator && !this.localPlayerIsWinner
            && !this.isTurnInProgress && (mustRollForEvent || (!this.isEventRollPhase && isLocalTurn));

        if (this.isRolling || !canRoll) {
            return;
        }

        try {
            this.isRolling = true;
            this.animatingPlayerId = this.localPlayerId;
            this.pendingRepeatRoll = false;
            this.turnOverlay.setVisible(false);

            this.diceHintText.setVisible(false);
            this.showDice('?');
            this.startDiceRollingLoop();
            this.diceRollSfx?.play();

            await new Promise(resolve => setTimeout(resolve, this.diceRollDurationMs - 200));

            await gameHubClient.rollDice(this.sessionId);
        } catch (error) {
            console.error(error);
            this.setStatus(`Roll failed: ${error.message ?? 'Unknown error'}`);
            this.stopDiceRotationTween();
            this.diceRollSfx?.stop();
            this.hideDice();
            this.isRolling = false;
            this.animatingPlayerId = null;
            this.turnOverlay.setVisible(true);
        }
    }

    turnBegan(payload) {
        console.log('Turn Began:\n' + JSON.stringify(payload, null, 2));

        this.stopTurnBeganCountdown();
        this.hideTurnResultNotification();
        this.hideDeathScreen();
        this.hideVictoryScreen();
        this.turnRequiresChosenPlayer = this.eventRequiresChosenPlayer(payload);

        let notificationText = payload.description ?? '';

        if (this.turnRequiresChosenPlayer) {
            notificationText += ' Choose player.';
        }

        this.showNotification({
            title: payload.title ?? '',
            text: notificationText,
            typingSpeed: 30
        });

        const finishTurnFromTurnStart = (_pointer, currentlyOver) => {
            const chosenPlayerId = this.turnRequiresChosenPlayer
                ? this.resolveChosenPlayerId(currentlyOver)
                : null;

            if (this.turnRequiresChosenPlayer && !chosenPlayerId) {
                this.setStatus('Choose another alive player token to continue.');
                return;
            }

            this.stopTurnBeganCountdown();
            this.hideNotification();
            gameHubClient.finishTurn(this.sessionId, chosenPlayerId);

            if (this.turnBeganClickHandler) {
                this.input.off('pointerdown', this.turnBeganClickHandler);
                this.turnBeganClickHandler = null;
            }
        };

        this.turnBeganClickHandler = finishTurnFromTurnStart;

        this.input.on('pointerdown', this.turnBeganClickHandler);

        this.startTurnBeganCountdown(30000, finishTurnFromTurnStart);
    }

    turnEnded(payload) {
        console.log('Turn Ended:\n' + JSON.stringify(payload, null, 2));

        this.pendingRepeatRoll = Boolean(payload?.repeatTurn);

        if (payload?.isEventRollPhase) {
            this.pendingRepeatRoll = false;
            this.pendingEventRollPlayerIds = this.pendingEventRollPlayerIds
                .filter(playerId => playerId !== String(this.localPlayerId ?? ''));

            if (payload?.eventRollCompleted) {
                this.isEventRollPhase = false;
            }
        }

        this.turnRequiresChosenPlayer = false;

        const didLocalPlayerDie = this.didLocalPlayerDie(payload);

        if (didLocalPlayerDie) {
            this.hideVictoryScreen();
            this.showDeathScreen();
        } else if (!this.isVictoryChoicePending) {
            this.hideDeathScreen();
        }

        if (this.turnBeganClickHandler) {
            this.input.off('pointerdown', this.turnBeganClickHandler);
            this.turnBeganClickHandler = null;
        }

        this.stopTurnBeganCountdown();

        const hasResultEntries = Array.isArray(payload?.entries) && payload.entries.length > 0;
        const shouldSuppressTurnResult = (payload?.isEventRollPhase && !payload?.eventRollCompleted && !hasResultEntries) || didLocalPlayerDie || this.isVictoryChoicePending;

        if (!shouldSuppressTurnResult) {
            this.showTurnResultNotification(payload);
        } else {
            this.hideTurnResultNotification();
            this.refreshTurnUI();
        }

        //this.refreshTurnUI();
    }

    showTurnResultNotification(payload) {
        const eventTitle = payload?.event?.title ?? 'Turn result';
        const eventDescription = payload?.event?.description ?? '';

        const hasDiceEntries = Array.isArray(payload?.entries)
            && payload.entries.some(entry => Number(entry?.roll) > 0);

        const entriesText = Array.isArray(payload?.entries)
            ? payload.entries
                .map(entry => {
                    const playerId = String(entry?.playerId ?? '');
                    const playerName = this.players.find(player => player.playerId === playerId)?.displayName ?? 'Player';
                    const outcomeText = entry?.outcome?.text ?? '';
                    const roll = Number(entry?.roll ?? 0);

                    if (roll > 0) {
                        return `${playerName}: 🎲 ${roll}${outcomeText ? ` — ${outcomeText}` : ''}`;
                    }

                    return outcomeText ? `${playerName}: ${outcomeText}` : '';
                })
                .filter(Boolean)
                .join('\n')
            : '';

        if (!hasDiceEntries) {
            return;
        }

        this.showNotification({
            title: eventTitle,
            text: entriesText,
            typingSpeed: 30
        });

        this.isTurnResultNotificationActive = true;

        if (this.turnResultDismissHandler) {
            this.input.off('pointerdown', this.turnResultDismissHandler);
        }

        this.turnResultDismissHandler = () => {
            this.hideTurnResultNotification();
            this.refreshTurnUI();
        };

        this.input.once('pointerdown', this.turnResultDismissHandler);
    }

    hideTurnResultNotification() {
        this.isTurnResultNotificationActive = false;
        this.hideNotification();

        if (this.turnResultDismissHandler) {
            this.input.off('pointerdown', this.turnResultDismissHandler);
            this.turnResultDismissHandler = null;
        }
    }

    eventRequiresChosenPlayer(payload) {
        const chosenTarget = 'ChosenPlayer';

        const fixedRequiresChoice = Array.isArray(payload?.fixedOutcomes)
            && payload.fixedOutcomes.some(outcome => outcome?.target === chosenTarget || outcome?.target === 1);

        const rollRequiresChoice = Array.isArray(payload?.rollOutcomes)
            && payload.rollOutcomes.some(item => item?.outcome?.target === chosenTarget || item?.outcome?.target === 1);

        return fixedRequiresChoice || rollRequiresChoice;
    }

    showNotification({ title = '', text = '', videoKey = null, typingSpeed = 30 } = {}) {
        const { width, height } = this.scale.gameSize;
        const hasVideo = Boolean(videoKey);

        if (this.notificationDismissHandler) {
            this.input.off('pointerdown', this.notificationDismissHandler);
        }

        this.notificationDismissHandler = () => {
            this.hideNotification();
        };

        this.input.once('pointerdown', this.notificationDismissHandler);

        this.notificationTextBox
            .setPosition(width / 2, hasVideo ? height - 180 : height / 2)
            .setVisible(true)
            .stop(true);
        this.notificationTextBox.getElement('title')?.setText(title);
        this.notificationTextBox.setText('').layout().start(text, typingSpeed);

        if (!this.notificationVideo) {
            return;
        }

        if (hasVideo) {
            this.notificationVideo
                .setPosition(width / 2, height / 2 - 180)
                .setVisible(true)
                .setDepth(2090)
                .stop();

            this.notificationVideo.play(false);
            return;
        }

        this.notificationVideo.stop();
        this.notificationVideo.setVisible(false);
    }

    hideNotification() {
        this.notificationTextBox?.setVisible(false).stop(true);
        this.updateTurnStartActionText();

        if (this.notificationDismissHandler) {
            this.input.off('pointerdown', this.notificationDismissHandler);
            this.notificationDismissHandler = null;
        }

        if (this.notificationVideo) {
            this.notificationVideo.stop();
            this.notificationVideo.setVisible(false);
        }
    }

    startTurnBeganCountdown(durationMs, finishTurnFromTurnStart) {
        const durationSeconds = Math.ceil(durationMs / 1000);
        const deadline = Date.now() + durationMs;

        this.updateTurnStartActionText(durationSeconds);

        this.turnBeganCountdownEvent = this.time.addEvent({
            delay: 1000,
            loop: true,
            callback: () => {
                if (this.turnBeganClickHandler !== finishTurnFromTurnStart) {
                    this.stopTurnBeganCountdown();
                    return;
                }

                const secondsLeft = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
                this.updateTurnStartActionText(secondsLeft);

                if (secondsLeft <= 0) {
                    finishTurnFromTurnStart();
                }
            }
        });
    }

    stopTurnBeganCountdown() {
        if (this.turnBeganCountdownEvent) {
            this.turnBeganCountdownEvent.remove(false);
            this.turnBeganCountdownEvent = null;
        }

        this.updateTurnStartActionText();
    }

    updateTurnStartActionText(secondsLeft = null) {
        const actionText = this.notificationTextBox?.getElement('action');
        if (!actionText?.setText) {
            return;
        }

        const suffix = Number.isInteger(secondsLeft) ? ` (${secondsLeft})` : '';
        actionText.setText(`Click to continue${suffix}`);
        this.notificationTextBox.layout();
    }

    resolveChosenPlayerId(currentlyOver) {
        if (Array.isArray(currentlyOver)) {
            for (const gameObject of currentlyOver) {
                const hit = this.players.find(player => player.sprite === gameObject || player.outline === gameObject);
                if (hit && hit.playerId !== this.localPlayerId && !hit.isDead && !hit.isSpectator && !hit.isWinner) {
                    console.log('Selected playerId: ' + hit.playerId);
                    return hit.playerId;
                }
            }
        }

        const candidates = this.players.filter(player => player.playerId !== this.localPlayerId && !player.isDead && !player.isSpectator && !player.isWinner);
        if (candidates.length === 1) {
            return candidates[0].playerId;
        }

        return null;
    }

    didLocalPlayerDie(payload) {
        const localId = String(this.localPlayerId ?? '');
        if (!localId || !Array.isArray(payload?.entries)) {
            return false;
        }

        return payload.entries.some(entry => {
            const entryPlayerId = String(entry?.playerId ?? '');
            const kind = entry?.outcome?.kind;

            return entryPlayerId === localId && (kind === 'Eliminate' || kind === 5);
        });
    }

    createDeathScreenUI() {
        this.deathScreen = this.createEndgameScreenUI({
            key: 'death',
            backgroundKey: 'deathScreen',
            title: 'YOU DIED',
            subtitle: 'The darkness has consumed your fate.',
            backgroundTint: 0xaa2222,
            shadeColor: 0x000000,
            shadeAlpha: 0.45,
            pulseColor: 0x7a0000,
            pulseAlpha: { from: 0.1, to: 0.32 },
            titleStyle: {
                color: '#ff1f1f',
                stroke: '#120000'
            },
            subtitleStyle: {
                color: '#ffe6e6',
                stroke: '#000000'
            },
            buttonTheme: {
                baseStyle: {
                    fill: 0x250202,
                    fillAlpha: 0.9,
                    stroke: 0x9b1111,
                    strokeAlpha: 0.95,
                    textColor: '#ffdede',
                    textAlpha: 1,
                    glow: 0.35,
                    textStroke: '#1a0000',
                    textShadow: '#3a0000'
                },
                hoverStyle: {
                    fill: 0x430707,
                    fillAlpha: 0.95,
                    stroke: 0xd12b2b,
                    strokeAlpha: 1,
                    textColor: '#fff1f1',
                    textAlpha: 1,
                    glow: 0.6,
                    textStroke: '#1a0000',
                    textShadow: '#4d0000'
                },
                activeStyle: {
                    fill: 0x170000,
                    fillAlpha: 1,
                    stroke: 0x7c0808,
                    strokeAlpha: 1,
                    textColor: '#ffc7c7',
                    textAlpha: 1,
                    glow: 0.22,
                    textStroke: '#1a0000',
                    textShadow: '#2b0000'
                },
                disabledStyle: {
                    fill: 0x120404,
                    fillAlpha: 0.72,
                    stroke: 0x4a1a1a,
                    strokeAlpha: 0.8,
                    textColor: '#8d6666',
                    textAlpha: 0.72,
                    glow: 0,
                    textStroke: '#1a0000',
                    textShadow: '#130000'
                }
            },
            particleKey: 'deathFogParticle',
            particleColor: 0x8f0a0a,
            particleConfig: {
                lifespan: 1900,
                speedX: { min: -55, max: 55 },
                speedY: { min: -35, max: 35 },
                scale: { start: 0.28, end: 1.5 },
                alpha: { start: 0.38, end: 0 },
                quantity: 3
            },
            primaryAction: {
                label: 'Stay as spectator',
                onClick: () => this.chooseStayAsSpectator()
            },
            secondaryAction: {
                label: 'Leave match',
                onClick: () => this.chooseLeaveAfterDeath()
            }
        });
    }

    createVictoryScreenUI() {
        this.victoryScreen = this.createEndgameScreenUI({
            key: 'victory',
            backgroundKey: 'deathScreen',
            title: 'YOU WON',
            subtitle: 'You completed the circle and claimed victory.',
            backgroundTint: 0x3cd39f,
            shadeColor: 0x06271f,
            shadeAlpha: 0.28,
            pulseColor: 0x37c787,
            pulseAlpha: { from: 0.08, to: 0.24 },
            titleStyle: {
                color: '#f7ffb0',
                stroke: '#124c2f'
            },
            subtitleStyle: {
                color: '#e9fff5',
                stroke: '#082116'
            },
            buttonTheme: {
                baseStyle: {
                    fill: 0x133b2e,
                    fillAlpha: 0.92,
                    stroke: 0x63f0bf,
                    strokeAlpha: 0.95,
                    textColor: '#f2ffe9',
                    textAlpha: 1,
                    glow: 0.4,
                    textStroke: '#082116',
                    textShadow: '#0f4f35'
                },
                hoverStyle: {
                    fill: 0x1b5a45,
                    fillAlpha: 0.96,
                    stroke: 0x9cffdb,
                    strokeAlpha: 1,
                    textColor: '#ffffff',
                    textAlpha: 1,
                    glow: 0.62,
                    textStroke: '#082116',
                    textShadow: '#1c6f4e'
                },
                activeStyle: {
                    fill: 0x0b241c,
                    fillAlpha: 1,
                    stroke: 0x3acb93,
                    strokeAlpha: 1,
                    textColor: '#dfffe8',
                    textAlpha: 1,
                    glow: 0.25,
                    textStroke: '#082116',
                    textShadow: '#0c3b28'
                },
                disabledStyle: {
                    fill: 0x10231c,
                    fillAlpha: 0.72,
                    stroke: 0x35584b,
                    strokeAlpha: 0.8,
                    textColor: '#7aa18f',
                    textAlpha: 0.72,
                    glow: 0,
                    textStroke: '#082116',
                    textShadow: '#0a1712'
                }
            },
            particleKey: 'victorySparkParticle',
            particleColor: 0xffef8f,
            particleConfig: {
                lifespan: 1500,
                speedX: { min: -45, max: 45 },
                speedY: { min: -140, max: -60 },
                scale: { start: 0.18, end: 0.02 },
                alpha: { start: 0.8, end: 0 },
                quantity: 2,
                rotate: { min: 0, max: 180 }
            },
            primaryAction: {
                label: 'Stay as spectator',
                onClick: () => this.chooseStayAfterVictory()
            },
            secondaryAction: {
                label: 'Leave match',
                onClick: () => this.chooseLeaveAfterVictory()
            }
        });
    }

    createEndgameScreenUI(config) {
        const { width, height } = this.scale.gameSize;
        const container = this.add.container(width / 2, height / 2)
            .setDepth(1800)
            .setVisible(false)
            .setAlpha(0);

        const background = this.add.image(0, 0, config.backgroundKey).setOrigin(0.5);
        const bgScale = Math.max(width / background.width, height / background.height);
        background.setScale(bgScale);
        background.setTint(config.backgroundTint);

        const shade = this.add.rectangle(0, 0, width, height, config.shadeColor, config.shadeAlpha).setOrigin(0.5);
        const pulse = this.add.rectangle(0, 0, width, height, config.pulseColor, config.pulseAlpha.from).setOrigin(0.5);

        const scanlines = this.add.graphics();
        scanlines.fillStyle(0x000000, config.key === 'victory' ? 0.07 : 0.12);
        for (let y = -height / 2; y < height / 2; y += 7) {
            scanlines.fillRect(-width / 2, y, width, 2);
        }

        const title = this.add.text(0, -70, config.title, {
            fontFamily: 'Arial Black, Arial, sans-serif',
            fontSize: '132px',
            color: config.titleStyle.color,
            stroke: config.titleStyle.stroke,
            strokeThickness: 14,
            fontStyle: 'bold'
        }).setOrigin(0.5);

        const subtitle = this.add.text(0, 72, config.subtitle, {
            fontFamily: 'Arial, sans-serif',
            fontSize: '38px',
            color: config.subtitleStyle.color,
            stroke: config.subtitleStyle.stroke,
            strokeThickness: 8,
            align: 'center'
        }).setOrigin(0.5);

        const primaryButton = this.createEndgameActionButton(
            -200,
            height / 2 - 110,
            340,
            72,
            config.primaryAction.label,
            config.primaryAction.onClick,
            config.buttonTheme
        );
        const secondaryButton = this.createEndgameActionButton(
            200,
            height / 2 - 110,
            340,
            72,
            config.secondaryAction.label,
            config.secondaryAction.onClick,
            config.buttonTheme
        );

        container.add([
            background,
            shade,
            pulse,
            scanlines,
            title,
            subtitle,
            primaryButton,
            secondaryButton
        ]);

        const pulseTween = this.tweens.add({
            targets: pulse,
            alpha: config.pulseAlpha,
            duration: config.key === 'victory' ? 780 : 620,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut',
            paused: true
        });

        const flickerTween = this.tweens.add({
            targets: [title, subtitle],
            alpha: config.key === 'victory' ? { from: 0.82, to: 1 } : { from: 0.7, to: 1 },
            duration: config.key === 'victory' ? 260 : 180,
            yoyo: true,
            repeat: -1,
            ease: config.key === 'victory' ? 'Sine.easeInOut' : 'Stepped',
            paused: true
        });

        const shakeTween = this.tweens.add({
            targets: container,
            x: container.x + (config.key === 'victory' ? 4 : 7),
            y: container.y + (config.key === 'victory' ? 2 : 4),
            duration: config.key === 'victory' ? 90 : 56,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.InOut',
            paused: true
        });

        if (!this.textures.exists(config.particleKey)) {
            const particleTexture = this.make.graphics({ x: 0, y: 0, add: false });
            particleTexture.fillStyle(config.particleColor, 1);
            particleTexture.fillCircle(22, 22, config.key === 'victory' ? 12 : 22);
            particleTexture.generateTexture(config.particleKey, 44, 44);
            particleTexture.destroy();
        }

        const particles = this.add.particles(0, 0, config.particleKey, {
            x: { min: -width / 2, max: width / 2 },
            y: { min: -height / 2, max: height / 2 },
            blendMode: 'ADD',
            emitting: false,
            ...config.particleConfig
        }).setDepth(1);

        container.add(particles);

        return {
            container,
            title,
            subtitle,
            primaryButton,
            secondaryButton,
            pulseTween,
            flickerTween,
            shakeTween,
            particles,
            config
        };
    }

    createEndgameActionButton(x, y, width, height, label, onClick, theme) {
        const { baseStyle, hoverStyle, activeStyle, disabledStyle } = theme;
        const rect = this.add.rectangle(x, y, width, height, baseStyle.fill, baseStyle.fillAlpha)
            .setStrokeStyle(5, baseStyle.stroke, baseStyle.strokeAlpha)
            .setInteractive({ useHandCursor: true });

        const glow = this.add.rectangle(x, y, width + 14, height + 14, baseStyle.stroke, baseStyle.glow)
            .setBlendMode(Phaser.BlendModes.ADD);

        const text = this.add.text(x, y, label, {
            fontFamily: 'Arial Black, Arial, sans-serif',
            fontSize: '30px',
            color: baseStyle.textColor,
            fontStyle: 'bold',
            stroke: baseStyle.textStroke,
            strokeThickness: 6,
            align: 'center'
        }).setOrigin(0.5);

        const applyStyle = (style) => {
            rect.setFillStyle(style.fill, style.fillAlpha);
            rect.setStrokeStyle(5, style.stroke, style.strokeAlpha);
            glow.setFillStyle(style.stroke, style.glow);
            text.setColor(style.textColor);
            text.setAlpha(style.textAlpha);
            text.setShadow(0, 3, style.textShadow, 8, true, true);
        };

        applyStyle(baseStyle);

        rect.on('pointerover', () => {
            if (!rect.input?.enabled || rect.getData('isDisabled')) {
                return;
            }

            applyStyle(hoverStyle);
        });
        rect.on('pointerout', () => {
            if (rect.getData('isDisabled')) {
                applyStyle(disabledStyle);
                return;
            }

            applyStyle(baseStyle);
        });
        rect.on('pointerdown', () => {
            if (!rect.input?.enabled || rect.getData('isDisabled')) {
                return;
            }

            applyStyle(activeStyle);
        });
        rect.on('pointerup', () => {
            if (!rect.input?.enabled || rect.getData('isDisabled')) {
                return;
            }

            applyStyle(hoverStyle);
            onClick();
        });

        const button = this.add.container(0, 0, [glow, rect, text]).setSize(width, height);
        button.buttonRect = rect;
        button.buttonText = text;
        button.buttonGlow = glow;
        button.buttonStyles = { baseStyle, disabledStyle, applyStyle };
        return button;
    }

    setEndgameActionButtonDisabled(button, disabled) {
        if (!button?.buttonRect) {
            return;
        }

        button.buttonRect.disableInteractive();
        button.buttonRect.setData('isDisabled', disabled);
        if (!disabled) {
            button.buttonRect.setInteractive({ useHandCursor: true });
        }

        const style = disabled
            ? button.buttonStyles.disabledStyle
            : button.buttonStyles.baseStyle;
        button.buttonStyles.applyStyle(style);
    }

    updateDeathChoiceButtons() {
        const showActions = this.isDeathChoicePending;
        this.deathScreen?.primaryButton?.setVisible(showActions);
        this.deathScreen?.secondaryButton?.setVisible(showActions);

        const disableActions = !showActions || this.isProcessingDeathChoice;
        this.setEndgameActionButtonDisabled(this.deathScreen?.primaryButton, disableActions);
        this.setEndgameActionButtonDisabled(this.deathScreen?.secondaryButton, disableActions);
    }

    updateVictoryChoiceButtons() {
        const showActions = this.isVictoryChoicePending;
        const canStayAsSpectator = this.hasOtherLivingPlayers();

        this.victoryScreen?.primaryButton?.setVisible(showActions && canStayAsSpectator);
        this.victoryScreen?.secondaryButton?.setVisible(showActions);

        this.setEndgameActionButtonDisabled(
            this.victoryScreen?.primaryButton,
            !showActions || !canStayAsSpectator || this.isProcessingVictoryChoice
        );
        this.setEndgameActionButtonDisabled(
            this.victoryScreen?.secondaryButton,
            !showActions || this.isProcessingVictoryChoice
        );
    }

    hasOtherLivingPlayers() {
        return this.players.some(player => player.playerId !== this.localPlayerId && !player.isDead && !player.isSpectator && !player.isWinner);
    }

    async chooseStayAsSpectator() {
        if (!this.isDeathChoicePending || this.isProcessingDeathChoice) {
            return;
        }

        this.isProcessingDeathChoice = true;
        this.updateDeathChoiceButtons();

        try {
            await gameHubClient.becomeSpectator(this.sessionId);
            this.setStatus('You are now a spectator until this match ends.');
        } catch (error) {
            this.setStatus(error?.message ?? 'Failed to switch to spectator mode.');
            this.isProcessingDeathChoice = false;
            this.updateDeathChoiceButtons();
        }
    }

    async chooseLeaveAfterDeath() {
        if (!this.isDeathChoicePending || this.isProcessingDeathChoice) {
            return;
        }

        this.isProcessingDeathChoice = true;
        this.updateDeathChoiceButtons();

        await this.leaveCurrentMatch();
        if (!this.hasExitedMatch) {
            this.isProcessingDeathChoice = false;
            this.updateDeathChoiceButtons();
        }
    }

    async chooseStayAfterVictory() {
        if (!this.isVictoryChoicePending || this.isProcessingVictoryChoice || !this.hasOtherLivingPlayers()) {
            return;
        }

        this.isProcessingVictoryChoice = true;
        this.updateVictoryChoiceButtons();

        try {
            await gameHubClient.becomeSpectator(this.sessionId);
            this.setStatus('Victory is yours. You are now watching as a spectator.');
        } catch (error) {
            this.setStatus(error?.message ?? 'Failed to switch to spectator mode.');
            this.isProcessingVictoryChoice = false;
            this.updateVictoryChoiceButtons();
        }
    }

    async chooseLeaveAfterVictory() {
        if (!this.isVictoryChoicePending || this.isProcessingVictoryChoice) {
            return;
        }

        this.isProcessingVictoryChoice = true;
        this.updateVictoryChoiceButtons();

        await this.leaveCurrentMatch();
        if (!this.hasExitedMatch) {
            this.isProcessingVictoryChoice = false;
            this.updateVictoryChoiceButtons();
        }
    }

    showDeathScreen() {
        this.showEndgameScreen(this.deathScreen, {
            title: 'YOU DIED',
            subtitle: 'The darkness has consumed your fate.'
        });
    }

    hideDeathScreen() {
        this.hideEndgameScreen(this.deathScreen);
    }

    showVictoryScreen() {
        this.showEndgameScreen(this.victoryScreen, {
            title: 'YOU WON',
            subtitle: this.hasOtherLivingPlayers()
                ? 'You completed the circle. Stay and watch or leave the lobby.'
                : 'You completed the circle. No living players remain.'
        });
    }

    hideVictoryScreen() {
        this.hideEndgameScreen(this.victoryScreen);
    }

    showEndgameScreen(screen, { title, subtitle }) {
        if (!screen?.container) {
            return;
        }

        screen.title.setText(title);
        screen.subtitle.setText(subtitle);
        screen.container.setVisible(true);
        screen.container.setPosition(this.scale.gameSize.width / 2, this.scale.gameSize.height / 2);

        this.tweens.killTweensOf(screen.container);
        screen.container.setAlpha(0);

        this.tweens.add({
            targets: screen.container,
            alpha: 1,
            duration: 260,
            ease: 'Quad.Out'
        });

        screen.pulseTween?.resume();
        screen.flickerTween?.resume();
        screen.shakeTween?.resume();
        screen.particles?.start();
    }

    hideEndgameScreen(screen) {
        if (!screen?.container || !screen.container.visible) {
            return;
        }

        screen.pulseTween?.pause();
        screen.flickerTween?.pause();
        screen.shakeTween?.pause();
        screen.particles?.stop();

        this.tweens.killTweensOf(screen.container);
        this.tweens.add({
            targets: screen.container,
            alpha: 0,
            duration: 180,
            onComplete: () => {
                screen.container.setVisible(false);
                screen.container.setPosition(this.scale.gameSize.width / 2, this.scale.gameSize.height / 2);
            }
        });
    }

    playDiceResult(payload) {
        const player = this.players.find(item => item.playerId === String(payload.playerId));
        if (!player) {
            return;
        }

        if (payload?.isEventPhaseRoll && String(payload.playerId) === String(this.localPlayerId)) {
            this.pendingEventRollPlayerIds = this.pendingEventRollPlayerIds
                .filter(id => id !== String(this.localPlayerId));
        }

        const steps = this.getStepsToPosition(player.currentPosition, payload.newPosition, !payload?.isEventPhaseRoll);
        this.animatingPlayerId = player.playerId;

        this.turnOverlay.setVisible(false);
        this.diceHintText.setVisible(true);
        this.showDice(payload.rollValue);

        this.animateDiceToValue(payload.rollValue);
        this.diceRollSfx?.stop();

        this.movePlayer(player.playerId, steps, payload.newPosition, async () => {
            this.hideDice();

            try {
                if (!payload?.isEventPhaseRoll && !payload?.completedWinningLap) {
                    await gameHubClient.beginTurn(this.sessionId);
                }
            } catch (error) {
                console.error(error);
                this.setStatus(`Turn completion failed: ${error.message ?? 'Unknown error'}`);
            } finally {
                this.isRolling = false;
                this.animatingPlayerId = null;

                if (payload?.completedWinningLap && this.isVictoryChoicePending) {
                    this.hideDeathScreen();
                    this.showVictoryScreen();
                    this.updateVictoryChoiceButtons();
                }

                this.refreshTurnUI();
            }
        });
    }


    getStepsToPosition(fromPosition, toPosition, preferForward = false) {
        const total = this.cells.length;
        const normalizedForward = (toPosition - fromPosition + total) % total;

        if (preferForward) {
            return normalizedForward;
        }

        if (normalizedForward === 0) {
            return 0;
        }

        const backward = normalizedForward - total;
        return Math.abs(backward) < normalizedForward ? backward : normalizedForward;
    }

    showDice(rollValue) {
        this.diceContainer.setVisible(true);
        this.diceContainer.setScale(0.2);
        this.diceContainer.setAlpha(0);

        this.diceSpinState.x = this.diceSpinState.x % (Math.PI * 2);
        this.diceSpinState.y = this.diceSpinState.y % (Math.PI * 2);
        this.diceSpinState.z = this.diceSpinState.z % (Math.PI * 2);

        this.renderDice3D();
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
        this.stopDiceRotationTween();

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
                targets: player.container,
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

        if (steps === 0) {
            player.currentPosition = finalPosition;
            this.applyStackOffsets(player.currentPosition);
            onComplete?.();
            return;
        }

        const total = this.cells.length;
        const stepDirection = steps > 0 ? 1 : -1;
        let remainingSteps = Math.abs(steps);

        const moveOne = () => {
            player.currentPosition = (player.currentPosition + stepDirection + total) % total;
            const point = this.cells[player.currentPosition];

            this.stepSfx?.play();

            this.tweens.add({
                targets: player.container,
                x: point.x,
                y: point.y,
                duration: 500,
                delay: 100,
                onComplete: () => {
                    remainingSteps -= 1;
                    if (remainingSteps > 0) {
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

        this.diceShadow = this.add.ellipse(10, 90, 210, 70, 0x000000, 0.3);
        this.diceShadow.setScale(1.05, 0.8);

        this.diceGraphics = this.add.graphics();

        this.diceValueText = this.add.text(0, -158, '1', {
            fontFamily: 'Arial, sans-serif',
            fontSize: '68px',
            color: '#ffffff',
            stroke: '#000000',
            strokeThickness: 8,
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

        this.diceContainer.add([this.diceShadow, this.diceGraphics, this.diceValueText, this.diceHintText, this.diceTimerText]);

        this.diceFaceValues = {
            px: 3,
            nx: 4,
            py: 1,
            ny: 6,
            pz: 2,
            nz: 5
        };

        this.renderDice3D();
    }

    stopDiceRotationTween() {
        if (this.diceRotationTween) {
            this.diceRotationTween.stop();
            this.diceRotationTween = null;
        }
    }

    startDiceRollingLoop() {
        this.stopDiceRotationTween();

        const state = this.diceSpinState;
        const fullTurn = Math.PI * 2;

        // One long tween avoids per-loop restart jitter and keeps the roll smooth.
        this.diceRotationTween = this.tweens.add({
            targets: state,
            x: state.x + Phaser.Math.FloatBetween(1.6, 2.2) * fullTurn,
            y: state.y + Phaser.Math.FloatBetween(1.9, 2.6) * fullTurn,
            z: state.z + Phaser.Math.FloatBetween(1.2, 1.8) * fullTurn,
            duration: this.diceRollDurationMs,
            ease: 'Sine.InOut',
            onUpdate: () => this.renderDice3D()
        });
    }

    animateDiceToValue(value) {
        this.stopDiceRotationTween();

        const target = this.getTargetDiceRotation(value);
        const state = this.diceSpinState;

        this.diceRotationTween = this.tweens.add({
            targets: state,
            x: target.x,
            y: target.y,
            z: target.z,
            duration: 200,
            ease: 'Cubic.Out',
            onUpdate: () => this.renderDice3D(),
            onComplete: () => {
                this.diceRotationTween = null;
                this.renderDice3D();
            }
        });
    }

    getTargetDiceRotation(value) {
        // Face values are mapped to cube normals in diceFaceValues.
        // We settle with the rolled value facing the camera (+Z) so the visible face
        // always matches the SignalR hub result.
        const base = {
            1: { x: Math.PI / 2, y: 0, z: 0 },
            2: { x: 0, y: 0, z: 0 },
            3: { x: 0, y: -Math.PI / 2, z: 0 },
            4: { x: 0, y: Math.PI / 2, z: 0 },
            5: { x: 0, y: Math.PI, z: 0 },
            6: { x: -Math.PI / 2, y: 0, z: 0 }
        };

        const destination = base[value] ?? base[1];
        const fullTurn = Math.PI * 2;

        return {
            x: destination.x + Phaser.Math.Between(2, 4) * fullTurn,
            y: destination.y + Phaser.Math.Between(2, 4) * fullTurn,
            z: destination.z + Phaser.Math.Between(1, 3) * fullTurn
        };
    }

    renderDice3D() {
        if (!this.diceGraphics) {
            return;
        }

        const g = this.diceGraphics;
        g.clear();

        const size = 100;
        const cameraZ = 5.2;
        const perspective = 220;
        const rot = this.diceSpinState;

        const points = {
            nnn: [-1, -1, -1],
            nnp: [-1, -1, 1],
            npn: [-1, 1, -1],
            npp: [-1, 1, 1],
            pnn: [1, -1, -1],
            pnp: [1, -1, 1],
            ppn: [1, 1, -1],
            ppp: [1, 1, 1]
        };

        const rotate = ([x, y, z]) => {
            const cx = Math.cos(rot.x), sx = Math.sin(rot.x);
            const cy = Math.cos(rot.y), sy = Math.sin(rot.y);
            const cz = Math.cos(rot.z), sz = Math.sin(rot.z);

            let y1 = y * cx - z * sx;
            let z1 = y * sx + z * cx;
            let x1 = x;

            let x2 = x1 * cy + z1 * sy;
            let z2 = -x1 * sy + z1 * cy;
            let y2 = y1;

            return {
                x: (x2 * cz - y2 * sz) * size,
                y: (x2 * sz + y2 * cz) * size,
                z: z2
            };
        };

        const projected = Object.fromEntries(Object.entries(points).map(([k, p]) => {
            const rp = rotate(p);
            const scale = perspective / (cameraZ - rp.z);
            return [k, {
                x: rp.x * scale / 130,
                y: rp.y * scale / 130,
                z: rp.z,
                world: rp
            }];
        }));

        const faces = [
            { key: 'py', verts: ['npp', 'ppp', 'ppn', 'npn'], normal: [0, 1, 0] },
            { key: 'ny', verts: ['nnp', 'pnp', 'pnn', 'nnn'], normal: [0, -1, 0] },
            { key: 'px', verts: ['pnp', 'ppp', 'ppn', 'pnn'], normal: [1, 0, 0] },
            { key: 'nx', verts: ['nnp', 'npp', 'npn', 'nnn'], normal: [-1, 0, 0] },
            { key: 'pz', verts: ['npp', 'ppp', 'pnp', 'nnp'], normal: [0, 0, 1] },
            { key: 'nz', verts: ['npn', 'ppn', 'pnn', 'nnn'], normal: [0, 0, -1] }
        ];

        const rotateNormal = (n) => rotate(n);

        const visibleFaces = faces
            .map(face => {
                const normal = rotateNormal(face.normal);
                return {
                    ...face,
                    normal,
                    depth: face.verts.reduce((sum, v) => sum + projected[v].z, 0) / face.verts.length
                };
            })
            .filter(face => face.normal.z > -0.08)
            .sort((a, b) => a.depth - b.depth);

        visibleFaces.forEach(face => {
            const shade = Phaser.Math.Clamp(0.55 + face.normal.z * 0.42, 0.28, 0.95);
            const color = Phaser.Display.Color.GetColor(255 * shade, 248 * shade, 236 * shade);

            g.fillStyle(color, 1);
            g.lineStyle(3, 0x111111, 0.45);

            g.beginPath();
            g.moveTo(projected[face.verts[0]].x, projected[face.verts[0]].y);
            for (let i = 1; i < face.verts.length; i++) {
                g.lineTo(projected[face.verts[i]].x, projected[face.verts[i]].y);
            }
            g.closePath();
            g.fillPath();
            g.strokePath();

            this.drawFacePips(g, face, projected);
        });
    }

    drawFacePips(graphics, face, projectedPoints) {
        const value = this.diceFaceValues[face.key] ?? 1;
        const [v0, v1, v2, v3] = face.verts.map(v => projectedPoints[v]);

        const bilinear = (u, v) => {
            const a = Phaser.Math.Linear(v0.x, v1.x, u);
            const b = Phaser.Math.Linear(v3.x, v2.x, u);
            const c = Phaser.Math.Linear(v0.y, v1.y, u);
            const d = Phaser.Math.Linear(v3.y, v2.y, u);

            return {
                x: Phaser.Math.Linear(a, b, v),
                y: Phaser.Math.Linear(c, d, v)
            };
        };

        const positions = {
            1: [[0.5, 0.5]],
            2: [[0.3, 0.3], [0.7, 0.7]],
            3: [[0.3, 0.3], [0.5, 0.5], [0.7, 0.7]],
            4: [[0.3, 0.3], [0.7, 0.3], [0.3, 0.7], [0.7, 0.7]],
            5: [[0.3, 0.3], [0.7, 0.3], [0.5, 0.5], [0.3, 0.7], [0.7, 0.7]],
            6: [[0.3, 0.25], [0.7, 0.25], [0.3, 0.5], [0.7, 0.5], [0.3, 0.75], [0.7, 0.75]]
        };

        graphics.fillStyle(0x111111, 0.95);
        positions[value].forEach(([u, v]) => {
            const point = bilinear(u, v);
            graphics.fillCircle(point.x, point.y, 7);
        });
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
        const xLines = [55, 205, 356, 502, 657, 803, 951, 1101, 1253, 1407];
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
        for (let i = 0; i < this.cells.length; i++) {
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

            action: scene.add.text(0, 0, 'Click to continue', {
                fontFamily: 'Arial, sans-serif',
                fontSize: '18px',
                fontStyle: 'italic',
                color: '#d7ccc8'
            }),

            title: (titleText) ? scene.add.text(0, 0, titleText, { fontSize: '30px', }) : undefined,

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
                    if (this.isTyping) {
                        this.stop(true);
                    } else {
                        this.typeNextPage();
                    }
                }
            }, textBox)
            .on('complete', function () {
                console.log('all pages typing complete')
            })

        return textBox;
    }

    getBuiltInText(scene, wrapWidth, fixedWidth, fixedHeight) {
        return scene.add.text(0, 0, '', {
            fontSize: '24px',
            wordWrap: {
                width: wrapWidth
            },
            maxLines: 3
        })
            .setFixedSize(fixedWidth, fixedHeight);
    }

    getBBcodeText(scene, wrapWidth, fixedWidth, fixedHeight, maxLines = 0) {
        const textConfig = {
            fixedWidth: fixedWidth,
            fixedHeight: fixedHeight,

            fontSize: '24px',
            wrap: {
                mode: 'word',
                width: wrapWidth
            }
        };

        if (maxLines > 0) {
            textConfig.maxLines = maxLines;
        }

        return scene.rexUI.add.BBCodeText(0, 0, '', textConfig)
    }
}
