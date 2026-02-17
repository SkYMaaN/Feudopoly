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

        this.addBoard();
        this.buildCells();

        for (let i = 0; i < this.maxPlayers; i++) {
            this.addPlayer(i);
        }
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

        sprite.on('pointerdown', () => {
            this.movePlayer(userId, 1);
        });

        this.players.push({ userId, sprite, currentPosition: startPosition, isAlive: true });

        this.applyStackOffsets(startPosition);
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


    movePlayer(userId, steps) {
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
                    if (steps > 0) moveOne();
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
