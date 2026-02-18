// "Every great game begins with a single scene. Let's make this one unforgettable!"
export class Board extends Phaser.Scene {
    maxPlayers = 4;
    columns = 9;
    rows = 6;
    startCellIndex = 21;

    constructor() {
        super('Board');
    }

    preload() {
        this.load.image('board', 'assets/boards/board1.png');
        this.load.image('token', 'assets/textures/game_token.png');
        this.load.audio('stepSfx', 'assets/sfx/token_step.mp3');
    }

    create() {
        this.stepSfx = this.sound.add('stepSfx', { volume: 0.1 });

        this.players = []; // {userId, sprite, currentPosition, isAlive}
        this.isRolling = false;
        this.activeTurnIndex = 0;
        this.rollValue = 1;

        this.addBoard();
        this.buildCells();
        this.addMedievalAtmosphere();

        for (let i = 0; i < this.maxPlayers; i++) {
            this.addPlayer(i);
        }

        this.createDiceUI();
        this.createTurnUI();
        this.startTurn(0);
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

    addPlayer(userId) {
        if (this.players.length >= this.maxPlayers) {
            console.warn(`Session is full! Player '${userId}' was kicked.`);
            return;
        }

        const startPosition = 0;

        const sprite = this.add.sprite(this.cells[startPosition].x, this.cells[startPosition].y, 'token')
            .setOrigin(0.5)
            .setScale(0.05)
            .setInteractive();

        this.players.push({ userId, sprite, currentPosition: startPosition, isAlive: true });

        this.applyStackOffsets(startPosition);
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

        this.diceHintText = this.add.text(0, 150, 'Нажми в любом месте, чтобы остановить', {
            fontFamily: 'Arial, sans-serif',
            fontSize: '30px',
            color: '#f5f5f5',
            stroke: '#000000',
            strokeThickness: 6,
            align: 'center'
        }).setOrigin(0.5);

        this.diceTimerText = this.add.text(0, 198, '30', {
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

        this.turnSubtitleText = this.add.text(0, -15, 'Твой ход! Нажми кнопку, чтобы начать ролл', {
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

        this.rollButtonText = this.add.text(0, 120, 'КЛИК ДЛЯ РОЛЛА', {
            fontFamily: 'Arial, sans-serif',
            fontSize: '42px',
            color: '#ffffff',
            fontStyle: 'bold'
        }).setOrigin(0.5);

        this.rollButton.on('pointerdown', () => {
            if (this.isRolling) {
                return;
            }

            this.turnOverlay.setVisible(false);
            this.startDiceRoll();
        });

        this.turnOverlay.add([dim, this.turnTitleText, this.turnSubtitleText, this.rollButton, this.rollButtonText]);
    }

    startTurn(index) {
        this.activeTurnIndex = index % this.players.length;
        const current = this.players[this.activeTurnIndex];

        this.turnTitleText.setText(`ХОД ИГРОКА ${current.userId + 1}`);
        this.turnOverlay.setVisible(true);
        this.turnOverlay.setAlpha(1);

        this.tweens.killTweensOf(this.turnTitleText);
        this.turnTitleText.setScale(0.7);

        this.tweens.add({
            targets: this.turnTitleText,
            scale: 1.08,
            duration: 600,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.InOut'
        });
    }

    startDiceRoll() {
        this.isRolling = true;
        this.rollValue = Phaser.Math.Between(1, 6);

        this.diceContainer.setVisible(true);
        this.diceContainer.setScale(0.2);
        this.diceContainer.setAlpha(0);
        this.diceContainer.setAngle(0);
        this.diceValueText.setText(String(this.rollValue));
        this.diceHintText.setText('Нажми в любом месте, чтобы остановить');
        this.diceTimerText.setText('30');

        this.tweens.add({
            targets: this.diceContainer,
            alpha: 1,
            scale: 1,
            duration: 220,
            ease: 'Back.Out'
        });

        this.rollStartMs = this.time.now;

        this.rollLoopTimer = this.time.addEvent({
            delay: 80,
            loop: true,
            callback: () => {
                this.rollValue = Phaser.Math.Between(1, 6);
                this.diceValueText.setText(String(this.rollValue));

                const leftSec = Math.max(0, Math.ceil((30000 - (this.time.now - this.rollStartMs)) / 1000));
                this.diceTimerText.setText(`${leftSec}`);

                this.tweens.add({
                    targets: this.diceContainer,
                    angle: Phaser.Math.Between(-16, 16),
                    duration: 70,
                    yoyo: true,
                    ease: 'Sine.InOut'
                });
            }
        });

        this.rollTimeout = this.time.delayedCall(30000, () => {
            this.stopDiceRoll('timeout');
        });

        this.stopRollHandler = () => {
            this.stopDiceRoll('click');
        };

        this.time.delayedCall(140, () => {
            this.input.once('pointerdown', this.stopRollHandler, this);
        });
    }

    stopDiceRoll(reason) {
        if (!this.isRolling) {
            return;
        }

        this.isRolling = false;

        this.rollLoopTimer?.remove(false);
        this.rollTimeout?.remove(false);

        if (this.stopRollHandler) {
            this.input.off('pointerdown', this.stopRollHandler, this);
            this.stopRollHandler = null;
        }

        this.diceHintText.setText(reason === 'timeout'
            ? `Время вышло! Выпало: ${this.rollValue}`
            : `Выпало: ${this.rollValue}`);

        this.time.delayedCall(300, () => {
            this.tweens.add({
                targets: this.diceContainer,
                alpha: 0,
                scale: 0.5,
                duration: 200,
                onComplete: () => {
                    this.diceContainer.setVisible(false);

                    const currentUserId = this.players[this.activeTurnIndex].userId;
                    this.movePlayer(currentUserId, this.rollValue, () => {
                        const nextTurn = (this.activeTurnIndex + 1) % this.players.length;
                        this.startTurn(nextTurn);
                    });
                }
            });
        });
    }

    applyStackOffsets(cellIndex) {
        const stack = this.players.filter(p => p.currentPosition === cellIndex);
        const base = this.cells[cellIndex];

        const d = 72;
        const cols = 2;
        const rows = 2;

        stack.forEach((player, n) => {
            const col = n % cols;
            const row = Math.floor(n / cols);

            if (row >= rows) return;

            const dx = col * d - d / 2;
            const dy = row * d - d / 2;


            this.tweens.add({
                targets: player.sprite,
                x: base.x + dx,
                y: base.y + dy,
                duration: 360,
            });
        });
    }


    movePlayer(userId, steps, onComplete) {
        if (steps <= 0 || steps > this.cells.length) {
            console.error('Wrong distance!');
            return;
        }

        const player = this.players.find(t => t.userId === userId);
        if (!player) {
            return;
        }

        const n = this.cells.length;

        const moveOne = () => {
            player.currentPosition = (player.currentPosition + 1) % n;
            const newPosition = this.cells[player.currentPosition];

            this.stepSfx?.play();

            this.tweens.add({
                targets: player.sprite,
                x: newPosition.x,
                y: newPosition.y,
                duration: 500,
                onComplete: () => {
                    this.applyStackOffsets(player.currentPosition);

                    steps--;
                    if (steps > 0) {
                        moveOne();
                    } else {
                        onComplete?.();
                    }
                }
            });
        };

        //recursion!
        if (steps > 0) {
            moveOne();
        }
    }

    addBoard() {
        const { width, height } = this.scale.gameSize;

        const tex = this.textures.get('board').getSourceImage(); // 1536x1024

        this.board = this.add.image(width / 2, height / 2, 'board')
            .setOrigin(0.5);

        // единый коэффициент (сохраняем пропорции)
        const scale = Math.min(width / tex.width, height / tex.height);
        this.board.setScale(scale);
    }

    buildCells() {
        // 1) границы доски на экране
        const b = this.board.getBounds();

        // 2) размер исходной текстуры
        const tex = this.textures.get('board').getSourceImage();
        const texW = tex.width;   // 1536
        const texH = tex.height;  // 1024

        // 3) перевод из координат текстуры -> в мир
        const toWorldX = (tx) => b.x + (tx / texW) * b.width;
        const toWorldY = (ty) => b.y + (ty / texH) * b.height;

        // 4) линии разметки (в пикселях ТЕКСТУРЫ 1536x1024)
        // Подогнать 1 раз — дальше всё будет идеально при любом масштабе.
        const xLines = [60, 221, 370, 525, 681, 838, 995, 1150, 1307, 1475];
        const yLines = [20, 56, 217, 361, 505, 648, 791, 935];

        const centers = [];

        // верхний ряд (включая углы)
        const topY = (yLines[1] + yLines[2]) / 2;
        for (let i = 0; i < xLines.length - 1; i++) {
            centers.push({ tx: (xLines[i] + xLines[i + 1]) / 2, ty: topY });
        }

        // правый столбец (без углов)
        const rightX = (xLines[xLines.length - 2] + xLines[xLines.length - 1]) / 2;
        for (let i = 2; i < yLines.length - 2; i++) {
            centers.push({ tx: rightX, ty: (yLines[i] + yLines[i + 1]) / 2 });
        }

        // нижний ряд (включая углы), справа -> налево
        const bottomY = (yLines[yLines.length - 2] + yLines[yLines.length - 1]) / 2;
        for (let i = xLines.length - 2; i >= 0; i--) {
            centers.push({ tx: (xLines[i] + xLines[i + 1]) / 2, ty: bottomY });
        }

        // левый столбец (без углов), снизу -> вверх
        const leftX = (xLines[0] + xLines[1]) / 2;
        for (let i = yLines.length - 3; i >= 2; i--) {
            centers.push({ tx: leftX, ty: (yLines[i] + yLines[i + 1]) / 2 });
        }

        // 5) сохраняем и рисуем
        const cells = centers.map(p => ({ x: toWorldX(p.tx), y: toWorldY(p.ty) }));

        this.cells = cells.slice(this.startCellIndex).concat(cells.slice(0, this.startCellIndex));

        // debug: точки
        //const g = this.add.graphics().lineStyle(2, 0xff0000, 1);
        //this.cells.forEach(p => g.strokeCircle(p.x, p.y, 10));

        // пример: поставить фишки в эти центры
        // this.cells.forEach(p => this.add.sprite(p.x, p.y, 'token').setScale(0.05));
    }

    drawDebugPoints(x, y) {
        const g = this.add.graphics();
        g.lineStyle(2, 0xff0000, 1);
        g.strokeCircle(x, y, 16);
    }
}
