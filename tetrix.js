document.addEventListener('DOMContentLoaded', () => {
    const canvas = document.getElementById('tetrisCanvas');
    const restartButton = document.getElementById('restartButton');
    const pauseButton = document.getElementById('pauseButton');
    const togglePanelButton = document.getElementById('togglePanelButton');
    const controlsPanel = document.getElementById('controlsPanel');
    const speedDownBtn = document.getElementById('speedDownBtn');
    const speedUpBtn = document.getElementById('speedUpBtn');
    const speedDisplay = document.getElementById('speedDisplay');
    const weightsContainer = document.getElementById('weightsContainer');
    const weightsChart = document.getElementById('weightsChart');
    const resetWeightsButton = document.getElementById('resetWeightsButton');
    const toggleShadowBtn = document.getElementById('toggleShadowBtn');
    const toggleProposalBtn = document.getElementById('toggleProposalBtn');
    const autoPlayBtn = document.getElementById('autoPlayBtn');
    const autoPlayStatus = document.getElementById('autoPlayStatus');

    let lockDelayMs = 500;
    let isLocked = false;
    let lastLockTime = 0;

    const sounds = {
        move: new Audio('sounds/tone1.ogg'),
        rotate: new Audio('sounds/powerUp7.ogg'),
        drop: new Audio('sounds/lowRandom.ogg'),
        clear: new Audio('sounds/laser3.ogg'),
        gameOver: new Audio('sounds/twoTone2.ogg')
    };

    sounds.move.volume = 0.25;
    sounds.rotate.volume = 0.35;
    sounds.drop.volume = 0.45;
    sounds.clear.volume = 0.55;
    sounds.gameOver.volume = 0.6;

    Object.values(sounds).forEach(sound => { sound.preload = 'auto'; });

    function playSound(sound) {
        if (!sound) return;
        const playback = sound.cloneNode();
        playback.volume = sound.volume;
        playback.play().catch(() => {});
    }

    const widthMinusBtn = document.getElementById('widthMinusBtn');
    const widthPlusBtn = document.getElementById('widthPlusBtn');
    const widthDisplay = document.getElementById('widthDisplay');
    const heightMinusBtn = document.getElementById('heightMinusBtn');
    const heightPlusBtn = document.getElementById('heightPlusBtn');
    const heightDisplay = document.getElementById('heightDisplay');

    const queueMinusBtn = document.getElementById('queueMinusBtn');
    const queuePlusBtn = document.getElementById('queuePlusBtn');
    const queueDisplay = document.getElementById('queueDisplay');

    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const BLOCK_SIZE = 30;
    const SIDEBAR_WIDTH = 6;

    let boardWidth = 10;
    let boardHeight = 23;
    let previewCount = 5;

    const SHAPES = [
        [[1, 1, 1, 1]],        // I
        [[1, 1], [1, 1]],      // O
        [[0, 1, 0], [1, 1, 1]],// T
        [[1, 1, 0], [0, 1, 1]],// S
        [[0, 1, 1], [1, 1, 0]],// Z
        [[1, 0, 0], [1, 1, 1]],// J
        [[0, 0, 1], [1, 1, 1]] // L
    ];

    const SHAPE_NAMES = ['I-Piece', 'O-Piece', 'T-Piece', 'S-Piece', 'Z-Piece', 'J-Piece', 'L-Piece'];

    const COLORS = [
        null,
        '#38bdf8', // Cyan
        '#facc15', // Yellow
        '#c084fc', // Lavender
        '#4ade80', // Mint
        '#f87171', // Coral
        '#3b82f6', // Blue
        '#f97316'  // Orange
    ];

    const DEFAULT_WEIGHTS = [20, 20, 20, 20, 20, 20, 20];
    let weights = [...DEFAULT_WEIGHTS];
    let dropIntervalMs = 500;
    let isPaused = false;
    let isGameOver = false;
    let showShadow = true;
    let showBestMatch = true;

    let board = Array.from({ length: boardHeight }, () => Array(boardWidth).fill(0));
    let currentShape = null;
    let currentShapeIndex = 0;
    let nextShapesQueue = [];
    let heldShapeIndex = -1;
    let hasSwapped = false;

    let currentX = 0;
    let currentY = 0;
    let score = 0;
    let highScore = parseInt(localStorage.getItem('hx_tetrix_highscore') || '0', 10);
    let totalLinesCleared = 0;
    let gameLevel = 1;
    let lastMultiplier = 1;
    let gameInterval = null;
    let bestProposal = null;

    // Shake and effects state
    let shakeDurationRemaining = 0;
    const SHAKE_TOTAL_DURATION = 120;
    const SHAKE_INTENSITY = 4;
    let lastFrameTime = performance.now();

    let autoPlay = true;
    let lastInputTime = Date.now();

    function updateLastInput() {
        lastInputTime = Date.now();
    }

    function checkAndUpdateHighScore() {
        if (score > highScore) {
            highScore = score;
            try {
                localStorage.setItem('hx_tetrix_highscore', String(highScore));
            } catch (e) {}
        }
    }

    function resizeCanvas() {
        canvas.width = (boardWidth + SIDEBAR_WIDTH) * BLOCK_SIZE;
        canvas.height = boardHeight * BLOCK_SIZE;
    }

    resizeCanvas();

    function getRandomShapeIndex() {
        const totalWeight = weights.reduce((sum, w) => sum + w, 0);
        if (totalWeight <= 0) return 0;

        let random = Math.random() * totalWeight;
        for (let i = 0; i < weights.length; i++) {
            if (random < weights[i]) return i;
            random -= weights[i];
        }
        return weights.length - 1;
    }

    function fillQueue() {
        while (nextShapesQueue.length < 10) {
            nextShapesQueue.push(getRandomShapeIndex());
        }
    }

    function updateQueueUI() {
        if (queueDisplay) {
            queueDisplay.textContent = `${previewCount} ${previewCount === 1 ? 'shape' : 'shapes'}`;
        }
    }

    function changeQueueSize(delta) {
        previewCount = Math.min(10, Math.max(1, previewCount + delta));
        updateQueueUI();
        draw();
    }

    if (queueMinusBtn) queueMinusBtn.addEventListener('click', () => { changeQueueSize(-1); queueMinusBtn.blur(); updateLastInput(); });
    if (queuePlusBtn) queuePlusBtn.addEventListener('click', () => { changeQueueSize(1); queuePlusBtn.blur(); updateLastInput(); });

    function getMinAllowedWidth() {
        let maxCol = 3;
        for (let y = 0; y < boardHeight; y++) {
            for (let x = 0; x < boardWidth; x++) {
                if (board[y][x] !== 0) maxCol = Math.max(maxCol, x + 1);
            }
        }
        return Math.max(4, maxCol);
    }

    function getMinAllowedHeight() {
        let highestBlockRow = boardHeight;
        for (let y = 0; y < boardHeight; y++) {
            for (let x = 0; x < boardWidth; x++) {
                if (board[y][x] !== 0) highestBlockRow = Math.min(highestBlockRow, y);
            }
        }
        const occupiedHeight = boardHeight - highestBlockRow;
        return Math.max(6, occupiedHeight + 3);
    }

    function updateDimensionUI() {
        if (widthDisplay) widthDisplay.textContent = `${boardWidth} cols`;
        if (heightDisplay) heightDisplay.textContent = `${boardHeight} rows`;
    }

    function changeWidth(delta) {
        if (delta < 0) {
            const minW = getMinAllowedWidth();
            if (boardWidth <= minW) return;
            boardWidth--;
            board = board.map(row => row.slice(0, boardWidth));
            if (currentShape && currentX + currentShape[0].length > boardWidth) {
                currentX = Math.max(0, boardWidth - currentShape[0].length);
            }
        } else if (delta > 0) {
            boardWidth++;
            board = board.map(row => {
                const newRow = Array(boardWidth).fill(0);
                for (let x = 0; x < row.length; x++) newRow[x] = row[x];
                return newRow;
            });
            if (currentShape) {
                currentX = Math.floor(boardWidth / 2) - Math.floor(currentShape[0].length / 2);
            }
        }

        resizeCanvas();
        updateDimensionUI();
        bestProposal = computeBestPlacement(currentShape);
        draw();
    }

    function changeHeight(delta) {
        if (delta < 0) {
            const minH = getMinAllowedHeight();
            if (boardHeight <= minH) return;
            boardHeight--;
            board.shift();
            if (currentY > 0) currentY--;
        } else if (delta > 0) {
            boardHeight++;
            board.unshift(Array(boardWidth).fill(0));
            currentY++;
        }

        resizeCanvas();
        updateDimensionUI();
        bestProposal = computeBestPlacement(currentShape);
        draw();
    }

    if (widthMinusBtn) widthMinusBtn.addEventListener('click', () => { changeWidth(-1); widthMinusBtn.blur(); updateLastInput(); });
    if (widthPlusBtn) widthPlusBtn.addEventListener('click', () => { changeWidth(1); widthPlusBtn.blur(); updateLastInput(); });
    if (heightMinusBtn) heightMinusBtn.addEventListener('click', () => { changeHeight(-1); heightMinusBtn.blur(); updateLastInput(); });
    if (heightPlusBtn) heightPlusBtn.addEventListener('click', () => { changeHeight(1); heightPlusBtn.blur(); updateLastInput(); });

    if (toggleShadowBtn) {
        toggleShadowBtn.addEventListener('click', () => {
            showShadow = !showShadow;
            toggleShadowBtn.classList.toggle('active', showShadow);
            toggleShadowBtn.textContent = showShadow ? 'Shadow ON' : 'Shadow OFF';
            draw();
            toggleShadowBtn.blur();
            updateLastInput();
        });
    }

    if (toggleProposalBtn) {
        toggleProposalBtn.addEventListener('click', () => {
            showBestMatch = !showBestMatch;
            toggleProposalBtn.classList.toggle('active', showBestMatch);
            toggleProposalBtn.textContent = showBestMatch ? 'Best Match ON' : 'Best Match OFF';
            draw();
            toggleProposalBtn.blur();
            updateLastInput();
        });
    }

    function drawWeightsChart() {
        if (!weightsChart) return;

        const chartContext = weightsChart.getContext('2d');
        const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
        const chartWidth = weightsChart.width;
        const chartHeight = weightsChart.height;
        const chartLeft = 10;
        const chartTop = 18;
        const chartBottom = chartHeight - 28;
        const chartAreaHeight = chartBottom - chartTop;
        const columnGap = 8;
        const columnWidth = (chartWidth - chartLeft * 2 - columnGap * (weights.length - 1)) / weights.length;
        const maxWeight = Math.max(...weights, 1);

        chartContext.clearRect(0, 0, chartWidth, chartHeight);
        chartContext.font = '600 10px -apple-system, sans-serif';
        chartContext.textBaseline = 'alphabetic';

        if (totalWeight <= 0) {
            chartContext.fillStyle = '#30363d';
            chartContext.fillRect(chartLeft, chartTop, chartWidth - chartLeft * 2, chartAreaHeight);
            chartContext.fillStyle = '#8b949e';
            chartContext.textAlign = 'center';
            chartContext.fillText('No weights', chartWidth / 2, chartHeight / 2);
            return;
        }

        weights.forEach((weight, index) => {
            const x = chartLeft + index * (columnWidth + columnGap);
            const columnHeight = chartAreaHeight * (weight / maxWeight);
            const y = chartBottom - columnHeight;
            const percentage = (weight / totalWeight) * 100;

            chartContext.fillStyle = '#30363d';
            chartContext.fillRect(x, chartTop, columnWidth, chartAreaHeight);
            chartContext.fillStyle = COLORS[index + 1];
            chartContext.fillRect(x, y, columnWidth, columnHeight);

            chartContext.fillStyle = COLORS[index + 1];
            chartContext.textAlign = 'center';
            chartContext.fillText(`${percentage.toFixed(0)}%`, x + columnWidth / 2, Math.max(12, y - 4));
            chartContext.fillStyle = '#8b949e';
            chartContext.fillText(SHAPE_NAMES[index].replace('-Piece', ''), x + columnWidth / 2, chartHeight - 9);
        });
    }

    function renderProbabilityControls() {
        if (!weightsContainer) return;
        weightsContainer.innerHTML = '';
        const totalWeight = weights.reduce((sum, w) => sum + w, 0);

        SHAPE_NAMES.forEach((name, index) => {
            const row = document.createElement('div');
            row.className = 'weight-row';

            const label = document.createElement('span');
            label.className = 'piece-label';
            label.style.color = COLORS[index + 1];
            label.textContent = name;

            const btnMinus = document.createElement('button');
            btnMinus.className = 'step-btn';
            btnMinus.textContent = '−';
            btnMinus.onclick = () => updateWeight(index, weights[index] - 5);

            const input = document.createElement('input');
            input.type = 'number';
            input.className = 'weight-input';
            input.min = '0';
            input.max = '100';
            input.value = weights[index];
            input.onchange = (e) => {
                updateWeight(index, parseInt(e.target.value, 10));
                updateLastInput();
            };

            const btnPlus = document.createElement('button');
            btnPlus.className = 'step-btn';
            btnPlus.textContent = '+';
            btnPlus.onclick = () => updateWeight(index, weights[index] + 5);

            const pct = document.createElement('span');
            pct.className = 'percentage-display';
            const percentage = totalWeight > 0 ? ((weights[index] / totalWeight) * 100).toFixed(1) : 0;
            pct.textContent = `${percentage}%`;

            row.append(label, btnMinus, input, btnPlus, pct);
            weightsContainer.appendChild(row);
        });

        drawWeightsChart();
    }

    function updateWeight(index, value) {
        weights[index] = Math.max(0, isNaN(value) ? 0 : value);
        renderProbabilityControls();
    }

    if (resetWeightsButton) {
        resetWeightsButton.addEventListener('click', () => {
            weights = [...DEFAULT_WEIGHTS];
            renderProbabilityControls();
            resetWeightsButton.blur();
            updateLastInput();
        });
    }

    if (autoPlayBtn) {
        autoPlayBtn.addEventListener('click', () => {
            autoPlay = !autoPlay;
            autoPlayBtn.classList.toggle('active', autoPlay);
            autoPlayBtn.textContent = autoPlay ? 'Auto-Play ON' : 'Auto-Play OFF';
            if (autoPlayStatus) autoPlayStatus.textContent = autoPlay ? 'ON' : 'OFF';
            updateLastInput();
        });
    }

    function setDropSpeed(newSpeed) {
        dropIntervalMs = Math.min(1000, Math.max(100, newSpeed));
        if (speedDisplay) speedDisplay.textContent = `${dropIntervalMs} ms`;
        if (!isPaused && !isGameOver && gameInterval) {
            clearInterval(gameInterval);
            gameInterval = setInterval(update, dropIntervalMs);
        }
    }

    if (speedDownBtn) {
        speedDownBtn.addEventListener('click', () => {
            setDropSpeed(dropIntervalMs + 50);
            speedDownBtn.blur();
            updateLastInput();
        });
    }

    if (speedUpBtn) {
        speedUpBtn.addEventListener('click', () => {
            setDropSpeed(dropIntervalMs - 50);
            speedUpBtn.blur();
            updateLastInput();
        });
    }

    function togglePause() {
        if (isGameOver) return;
        isPaused = !isPaused;
        if (pauseButton) pauseButton.textContent = isPaused ? 'Resume (P)' : 'Pause (P)';

        if (isPaused) {
            clearInterval(gameInterval);
            gameInterval = null;
            draw();
        } else {
            gameInterval = setInterval(update, dropIntervalMs);
        }
        if (pauseButton) pauseButton.blur();
    }

    function triggerGameOver() {
        isGameOver = true;
        checkAndUpdateHighScore();
        playSound(sounds.gameOver);
        if (gameInterval) clearInterval(gameInterval);
        gameInterval = null;
        shakeDurationRemaining = 0;
        draw();
    }

    function resetGame() {
        board = Array.from({ length: boardHeight }, () => Array(boardWidth).fill(0));
        score = 0;
        isPaused = false;
        isGameOver = false;
        heldShapeIndex = -1;
        hasSwapped = false;
        shakeDurationRemaining = 0;

        nextShapesQueue = [];
        fillQueue();
        spawnShape();

        if (gameInterval) clearInterval(gameInterval);
        gameInterval = setInterval(update, dropIntervalMs);
        updateDimensionUI();
        updateQueueUI();
    }

    function rotateMatrix(matrix) {
        if (!matrix || matrix.length === 0) return matrix;
        return matrix[0].map((_, index) => matrix.map(row => row[index]).reverse());
    }

    function checkCollision(shape, targetX, targetY) {
        if (!shape) return false;

        for (let y = 0; y < shape.length; y++) {
            for (let x = 0; x < shape[y].length; x++) {
                if (shape[y][x] !== 0) {
                    const newX = targetX + x;
                    const newY = targetY + y;

                    // Lateral boundaries
                    if (newX < 0 || newX >= boardWidth) return true;
                    // Floor boundary
                    if (newY >= boardHeight) return true;
                    // Placed piece collision (ignore off-screen negative Y values during spawn)
                    if (newY >= 0 && board[newY] && board[newY][newX] !== 0) {
                        return true;
                    }
                }
            }
        }
        return false;
    }

    function computeBestPlacement(baseShape) {
        if (!baseShape || isGameOver) return null;

        let bestScore = -Infinity;
        let bestTarget = null;

        const rotations = [];
        let curr = baseShape;
        for (let r = 0; r < 4; r++) {
            rotations.push({ shape: curr, rot: r });
            curr = rotateMatrix(curr);
        }

        for (const { shape, rot } of rotations) {
            const shapeW = shape[0].length;
            for (let x = 0; x <= boardWidth - shapeW; x++) {
                if (checkCollision(shape, x, 0)) continue;

                let y = 0;
                while (!checkCollision(shape, x, y + 1)) y++;

                const simBoard = board.map(row => [...row]);
                let placementValid = true;

                for (let sy = 0; sy < shape.length; sy++) {
                    for (let sx = 0; sx < shape[sy].length; sx++) {
                        if (shape[sy][sx] !== 0) {
                            const by = y + sy;
                            const bx = x + sx;
                            if (by >= 0 && by < boardHeight && bx >= 0 && bx < boardWidth) {
                                simBoard[by][bx] = 1;
                            } else {
                                placementValid = false;
                            }
                        }
                    }
                }

                if (!placementValid) continue;

                let linesCleared = 0;
                for (let r = 0; r < boardHeight; r++) {
                    if (!simBoard[r].includes(0)) linesCleared++;
                }

                let holes = 0;
                const colHeights = new Array(boardWidth).fill(0);
                for (let c = 0; c < boardWidth; c++) {
                    let blockSeen = false;
                    for (let r = 0; r < boardHeight; r++) {
                        if (simBoard[r][c] !== 0) {
                            if (!blockSeen) {
                                colHeights[c] = boardHeight - r;
                                blockSeen = true;
                            }
                        } else if (blockSeen) {
                            holes++;
                        }
                    }
                }

                let roughness = 0;
                for (let c = 0; c < boardWidth - 1; c++) {
                    roughness += Math.abs(colHeights[c] - colHeights[c + 1]);
                }

                const aggregateHeight = colHeights.reduce((acc, h) => acc + h, 0);
                const scoreEvaluation = (linesCleared * 40.0) - (aggregateHeight * 0.5) - (holes * 9.0) - (roughness * 1.5) + (y * 1.2);

                if (scoreEvaluation > bestScore) {
                    bestScore = scoreEvaluation;
                    bestTarget = { x, y, rotation: rot, shape };
                }
            }
        }

        return bestTarget;
    }

    function spawnShape() {
        fillQueue();
        if (nextShapesQueue.length === 0) {
            nextShapesQueue.push(getRandomShapeIndex());
        }
        currentShapeIndex = nextShapesQueue.shift();
        fillQueue();

        if (currentShapeIndex === undefined || currentShapeIndex >= SHAPES.length) {
            currentShapeIndex = 0;
        }

        currentShape = SHAPES[currentShapeIndex];
        
        if (!currentShape || !currentShape[0]) {
            triggerGameOver();
            return;
        }

        currentX = Math.floor(boardWidth / 2) - Math.floor(currentShape[0].length / 2);
        currentY = 0;

        if (checkCollision(currentShape, currentX, currentY)) {
            triggerGameOver();
            return;
        }

        try {
            bestProposal = computeBestPlacement(currentShape);
        } catch (e) {
            bestProposal = null;
        }

        draw();
    }

    function getShadowY() {
        if (!currentShape) return currentY;
        let shadowY = currentY;
        while (!checkCollision(currentShape, currentX, shadowY + 1)) shadowY++;
        return shadowY;
    }

    function mergeShape() {
        if (!currentShape) return;
        const pieceId = currentShapeIndex + 1;

        for (let y = 0; y < currentShape.length; y++) {
            for (let x = 0; x < currentShape[y].length; x++) {
                if (currentShape[y][x] !== 0) {
                    const newX = currentX + x;
                    const newY = currentY + y;
                    if (newY >= 0 && newY < boardHeight && newX >= 0 && newX < boardWidth) {
                        board[newY][newX] = pieceId;
                    }
                }
            }
        }

        let clearedLines = 0;
        for (let y = boardHeight - 1; y >= 0; y--) {
            if (!board[y].includes(0)) {
                board.splice(y, 1);
                board.unshift(Array(boardWidth).fill(0));
                clearedLines++;
                y++;
            }
        }

        if (clearedLines > 0) {
            const points = [100, 300, 500, 800];
            const scoreGain = points[Math.min(clearedLines, 4) - 1] || 800;
            score += scoreGain;
            checkAndUpdateHighScore();

            totalLinesCleared += clearedLines;
            gameLevel = Math.floor(totalLinesCleared / 10) + 1;
            dropIntervalMs = Math.max(100, 500 - (gameLevel - 1) * 50);
            lastMultiplier = clearedLines > 1 ? clearedLines : 1;
            
            playSound(sounds.clear);
            // Cap shake duration cleanly to avoid infinite accumulation
            shakeDurationRemaining = SHAKE_TOTAL_DURATION;
        }
        currentShape = null;
    }

    function dropShape() {
        if (!currentShape || isPaused || isGameOver) return;
        currentY = getShadowY();
        playSound(sounds.drop);
        mergeShape();
        spawnShape();
        hasSwapped = false;
        isLocked = false;
        lastLockTime = 0;
    }

    function applyBestMatch() {
        if (!currentShape || isPaused || isGameOver || !bestProposal) return;

        // Verify that target coordinates and matrix do not collide
        if (checkCollision(bestProposal.shape, bestProposal.x, bestProposal.y)) {
            dropShape();
            return;
        }

        currentShape = bestProposal.shape;
        currentX = bestProposal.x;
        currentY = bestProposal.y;
        playSound(sounds.drop);
        mergeShape();
        spawnShape();
        hasSwapped = false;
        isLocked = false;
        lastLockTime = 0;
    }

    function rotateShape() {
        if (!currentShape || isPaused || isGameOver) return;
        const rotated = rotateMatrix(currentShape);
        
        const kicks = [
            [0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], 
            [1, 1], [-1, 1], [1, -1], [-1, -1]
        ];

        for (const [offsetX, offsetY] of kicks) {
            if (!checkCollision(rotated, currentX + offsetX, currentY + offsetY)) {
                currentX += offsetX;
                currentY += offsetY;
                currentShape = rotated;
                bestProposal = computeBestPlacement(currentShape);
                playSound(sounds.rotate);
                hasSwapped = false;
                isLocked = false;
                lastLockTime = 0;
                draw();
                return;
            }
        }
    }

    function drawBlock(x, y, color, alpha = 1.0) {
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.fillStyle = color;
        ctx.fillRect(x + 1, y + 1, BLOCK_SIZE - 2, BLOCK_SIZE - 2);

        ctx.fillStyle = 'rgba(255, 255, 255, 0.18)';
        ctx.fillRect(x + 1, y + 1, BLOCK_SIZE - 2, 2);
        ctx.fillRect(x + 1, y + 1, 2, BLOCK_SIZE - 2);

        ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
        ctx.fillRect(x + 1, y + BLOCK_SIZE - 3, BLOCK_SIZE - 2, 2);
        ctx.fillRect(x + BLOCK_SIZE - 3, y + 1, 2, BLOCK_SIZE - 2);
        ctx.restore();
    }

    function draw() {
        const now = performance.now();
        const delta = Math.min(now - lastFrameTime, 100);
        lastFrameTime = now;

        ctx.save();

        // Screen Shake calculation using real elapsed time
        if (shakeDurationRemaining > 0) {
            const shakeFactor = shakeDurationRemaining / SHAKE_TOTAL_DURATION;
            const offsetX = (Math.random() - 0.5) * SHAKE_INTENSITY * shakeFactor * 2;
            const offsetY = (Math.random() - 0.5) * SHAKE_INTENSITY * shakeFactor * 2;
            ctx.translate(offsetX, offsetY);
            shakeDurationRemaining = Math.max(0, shakeDurationRemaining - delta);
        }

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const playfieldPixelWidth = boardWidth * BLOCK_SIZE;

        // 1. Grid
        ctx.strokeStyle = '#161c24';
        ctx.lineWidth = 1;
        for (let x = 0; x <= playfieldPixelWidth; x += BLOCK_SIZE) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, boardHeight * BLOCK_SIZE);
            ctx.stroke();
        }
        for (let y = 0; y <= boardHeight * BLOCK_SIZE; y += BLOCK_SIZE) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(playfieldPixelWidth, y);
            ctx.stroke();
        }

        // Title Watermark
        ctx.save();
        ctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
        ctx.font = '700 28px ui-monospace, monospace';
        ctx.textAlign = 'center';
        ctx.fillText('HX.MX.TETRIX', playfieldPixelWidth / 2, 40);
        ctx.restore();

        // 2. Placed Blocks
        for (let y = 0; y < boardHeight; y++) {
            for (let x = 0; x < boardWidth; x++) {
                if (board[y][x] !== 0) {
                    drawBlock(x * BLOCK_SIZE, y * BLOCK_SIZE, COLORS[board[y][x]]);
                }
            }
        }

        // 3. Best Match Outline
        if (showBestMatch && bestProposal && bestProposal.shape && !isGameOver) {
            ctx.save();
            ctx.strokeStyle = '#58a6ff';
            ctx.fillStyle = 'rgba(88, 166, 255, 0.08)';
            ctx.lineWidth = 1.5;
            ctx.setLineDash([4, 4]);

            for (let y = 0; y < bestProposal.shape.length; y++) {
                for (let x = 0; x < bestProposal.shape[y].length; x++) {
                    if (bestProposal.shape[y][x] !== 0) {
                        const px = (bestProposal.x + x) * BLOCK_SIZE;
                        const py = (bestProposal.y + y) * BLOCK_SIZE;
                        ctx.fillRect(px + 2, py + 2, BLOCK_SIZE - 4, BLOCK_SIZE - 4);
                        ctx.strokeRect(px + 2, py + 2, BLOCK_SIZE - 4, BLOCK_SIZE - 4);
                    }
                }
            }
            ctx.restore();
        }

        // 4. Ghost Shadow & Active Shape
        if (currentShape && !isGameOver) {
            if (showShadow) {
                const shadowY = getShadowY();
                for (let y = 0; y < currentShape.length; y++) {
                    for (let x = 0; x < currentShape[y].length; x++) {
                        if (currentShape[y][x] !== 0) {
                            drawBlock((currentX + x) * BLOCK_SIZE, (shadowY + y) * BLOCK_SIZE, '#484f58', 0.25);
                        }
                    }
                }
            }

            for (let y = 0; y < currentShape.length; y++) {
                for (let x = 0; x < currentShape[y].length; x++) {
                    if (currentShape[y][x] !== 0) {
                        drawBlock((currentX + x) * BLOCK_SIZE, (currentY + y) * BLOCK_SIZE, COLORS[currentShapeIndex + 1]);
                    }
                }
            }
        }

        // 5. Sidebar Background
        ctx.fillStyle = '#11161d';
        ctx.fillRect(playfieldPixelWidth, 0, SIDEBAR_WIDTH * BLOCK_SIZE, boardHeight * BLOCK_SIZE);

        ctx.strokeStyle = '#21262d';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(playfieldPixelWidth, 0);
        ctx.lineTo(playfieldPixelWidth, boardHeight * BLOCK_SIZE);
        ctx.stroke();

        const hudX = playfieldPixelWidth + 16;
        let hudY = 16;

        // Current Shape Card
        ctx.fillStyle = '#8b949e';
        ctx.font = '600 11px -apple-system, sans-serif';
        ctx.fillText('CURRENT', hudX, hudY);

        hudY += 6;
        const currentBoxHeight = 40;
        ctx.fillStyle = '#161b22';
        ctx.fillRect(hudX, hudY, 148, currentBoxHeight);
        ctx.strokeStyle = '#30363d';
        ctx.strokeRect(hudX, hudY, 148, currentBoxHeight);

        if (currentShape && !isGameOver) {
            const curBlockSize = 12;
            const curColor = COLORS[currentShapeIndex + 1];
            const cOffX = hudX + (148 - currentShape[0].length * curBlockSize) / 2;
            const cOffY = hudY + (currentBoxHeight - currentShape.length * curBlockSize) / 2;

            for (let sy = 0; sy < currentShape.length; sy++) {
                for (let sx = 0; sx < currentShape[sy].length; sx++) {
                    if (currentShape[sy][sx] !== 0) {
                        ctx.fillStyle = curColor;
                        ctx.fillRect(cOffX + sx * curBlockSize + 1, cOffY + sy * curBlockSize + 1, curBlockSize - 2, curBlockSize - 2);
                    }
                }
            }
        }

        hudY += currentBoxHeight + 10;

        // HOLD BLOCK
        ctx.fillStyle = '#8b949e';
        ctx.font = '600 11px -apple-system, sans-serif';
        ctx.fillText('HOLD', hudX, hudY);

        hudY += 6;
        const holdBoxHeight = 40;
        ctx.fillStyle = '#161b22';
        ctx.fillRect(hudX, hudY, 148, holdBoxHeight);
        ctx.strokeStyle = '#30363d';
        ctx.strokeRect(hudX, hudY, 148, holdBoxHeight);

        if (heldShapeIndex !== -1 && !isGameOver) {
            const holdPiece = SHAPES[heldShapeIndex];
            const holdColor = COLORS[heldShapeIndex + 1];
            const hBlockSize = 12;
            const hOffX = hudX + (148 - holdPiece[0].length * hBlockSize) / 2;
            const hOffY = hudY + (holdBoxHeight - holdPiece.length * hBlockSize) / 2;

            for (let sy = 0; sy < holdPiece.length; sy++) {
                for (let sx = 0; sx < holdPiece[sy].length; sx++) {
                    if (holdPiece[sy][sx] !== 0) {
                        ctx.fillStyle = holdColor;
                        ctx.fillRect(hOffX + sx * hBlockSize + 1, hOffY + sy * hBlockSize + 1, hBlockSize - 2, hBlockSize - 2);
                    }
                }
            }
        }

        hudY += holdBoxHeight + 10;

        // Lookahead Queue (1 to 10)
        ctx.fillStyle = '#8b949e';
        ctx.font = '600 11px -apple-system, sans-serif';
        ctx.fillText(`NEXT (${previewCount})`, hudX, hudY);

        hudY += 6;

        let nextItemHeight, nextBlockSize, boxGap;
        if (previewCount <= 2) {
            nextItemHeight = 36;
            nextBlockSize = 11;
            boxGap = 4;
        } else if (previewCount <= 4) {
            nextItemHeight = 28;
            nextBlockSize = 9;
            boxGap = 3;
        } else {
            nextItemHeight = 22;
            nextBlockSize = 7;
            boxGap = 2;
        }

        for (let i = 0; i < previewCount; i++) {
            const nextIdx = nextShapesQueue[i];
            const nextPiece = SHAPES[nextIdx];
            const nextPieceColor = COLORS[nextIdx + 1];

            ctx.fillStyle = '#161b22';
            ctx.fillRect(hudX, hudY, 148, nextItemHeight);
            ctx.strokeStyle = '#21262d';
            ctx.strokeRect(hudX, hudY, 148, nextItemHeight);

            const pOffX = hudX + (148 - nextPiece[0].length * nextBlockSize) / 2;
            const pOffY = hudY + (nextItemHeight - nextPiece.length * nextBlockSize) / 2;

            for (let sy = 0; sy < nextPiece.length; sy++) {
                for (let sx = 0; sx < nextPiece[sy].length; sx++) {
                    if (nextPiece[sy][sx] !== 0) {
                        ctx.fillStyle = nextPieceColor;
                        ctx.fillRect(pOffX + sx * nextBlockSize + 1, pOffY + sy * nextBlockSize + 1, nextBlockSize - 2, nextBlockSize - 2);
                    }
                }
            }
            hudY += nextItemHeight + boxGap;
        }

        // Stats & Indicators
        hudY += 10;
        ctx.fillStyle = '#8b949e';
        ctx.font = '600 11px -apple-system, sans-serif';
        ctx.fillText('SCORE', hudX, hudY);

        hudY += 16;
        ctx.fillStyle = '#f0f6fc';
        ctx.font = '600 16px ui-monospace, monospace';
        ctx.fillText(String(score).padStart(6, '0'), hudX, hudY);
        
        ctx.fillStyle = '#f85149';
        ctx.font = '600 11px ui-monospace, monospace';
        ctx.fillText(`x${lastMultiplier}`, hudX + 90, hudY);

        // High Score Metric
        hudY += 16;
        ctx.fillStyle = '#e3b341';
        ctx.font = '600 10px -apple-system, sans-serif';
        ctx.fillText('★ BEST', hudX, hudY);

        hudY += 14;
        ctx.fillStyle = '#e3b341';
        ctx.font = '600 13px ui-monospace, monospace';
        ctx.fillText(String(highScore).padStart(6, '0'), hudX, hudY);

        hudY += 16;
        ctx.fillStyle = '#8b949e';
        ctx.font = '600 11px -apple-system, sans-serif';
        ctx.fillText('SPEED', hudX, hudY);

        hudY += 16;
        ctx.fillStyle = '#f0f6fc';
        ctx.font = '600 14px ui-monospace, monospace';
        ctx.fillText(`${String(dropIntervalMs).padStart(4, '0')} ms`, hudX, hudY);

        // Overlays
        if (isGameOver) {
            ctx.fillStyle = 'rgba(9, 13, 18, 0.85)';
            ctx.fillRect(0, 0, playfieldPixelWidth, boardHeight * BLOCK_SIZE);

            const cardW = Math.min(230, playfieldPixelWidth - 20);
            const cardH = 145;
            const cardX = (playfieldPixelWidth - cardW) / 2;
            const cardY = (boardHeight * BLOCK_SIZE - cardH) / 2;

            ctx.fillStyle = '#161b22';
            ctx.strokeStyle = '#f85149';
            ctx.lineWidth = 1.5;
            ctx.fillRect(cardX, cardY, cardW, cardH);
            ctx.strokeRect(cardX, cardY, cardW, cardH);

            ctx.textAlign = 'center';
            ctx.fillStyle = '#f85149';
            ctx.font = '700 16px -apple-system, sans-serif';
            ctx.fillText('GAME OVER', playfieldPixelWidth / 2, cardY + 28);

            ctx.fillStyle = '#8b949e';
            ctx.font = '11px -apple-system, sans-serif';
            ctx.fillText('FINAL SCORE', playfieldPixelWidth / 2, cardY + 50);

            ctx.fillStyle = '#f0f6fc';
            ctx.font = '700 18px ui-monospace, monospace';
            ctx.fillText(String(score), playfieldPixelWidth / 2, cardY + 70);

            ctx.fillStyle = '#e3b341';
            ctx.font = '600 11px ui-monospace, monospace';
            ctx.fillText(`BEST: ${String(highScore)}`, playfieldPixelWidth / 2, cardY + 92);

            ctx.fillStyle = '#58a6ff';
            ctx.font = '11px -apple-system, sans-serif';
            ctx.fillText('Click Restart to Play Again', playfieldPixelWidth / 2, cardY + 120);
            ctx.textAlign = 'left';

        } else if (isPaused) {
            ctx.fillStyle = 'rgba(9, 13, 18, 0.75)';
            ctx.fillRect(0, 0, playfieldPixelWidth, boardHeight * BLOCK_SIZE);
            ctx.fillStyle = '#f0f6fc';
            ctx.font = '600 16px -apple-system, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('PAUSED', playfieldPixelWidth / 2, (boardHeight * BLOCK_SIZE) / 2);
            ctx.textAlign = 'left';
        }
        ctx.restore();
    }

    document.addEventListener('keydown', (e) => {
        if (e.key === 'p' || e.key === 'P') {
            togglePause();
            return;
        }

        if (isPaused || isGameOver || !currentShape) return;
        updateLastInput();

        switch (e.key) {
            case 'ArrowLeft':
                if (!checkCollision(currentShape, currentX - 1, currentY)) {
                    currentX--;
                    playSound(sounds.move);
                    hasSwapped = false;
                    isLocked = false;
                    lastLockTime = 0;
                    draw();
                }
                break;
            case 'ArrowRight':
                if (!checkCollision(currentShape, currentX + 1, currentY)) {
                    currentX++;
                    playSound(sounds.move);
                    hasSwapped = false;
                    isLocked = false;
                    lastLockTime = 0;
                    draw();
                }
                break;
            case 'ArrowDown':
                if (!checkCollision(currentShape, currentX, currentY + 1)) {
                    currentY++;
                    draw();
                }
                break;
            case 'ArrowUp':
                rotateShape();
                break;
            case ' ':
                e.preventDefault();
                dropShape();
                break;
            case 'Enter':
                e.preventDefault();
                applyBestMatch();
                break;
            case 'c':
            case 'C':
                if (!hasSwapped) {
                    playSound(sounds.rotate);
                    if (heldShapeIndex === -1) {
                        heldShapeIndex = currentShapeIndex;
                        spawnShape();
                    } else {
                        const temp = currentShapeIndex;
                        currentShapeIndex = heldShapeIndex;
                        heldShapeIndex = temp;

                        currentShape = SHAPES[currentShapeIndex];
                        currentX = Math.floor(boardWidth / 2) - Math.floor(currentShape[0].length / 2);
                        currentY = 0;
                        bestProposal = computeBestPlacement(currentShape);
                        draw();
                    }
                    hasSwapped = true;
                }
                break;
        }
    });

    if (pauseButton) pauseButton.addEventListener('click', () => {
        togglePause();
        updateLastInput();
    });
    if (togglePanelButton && controlsPanel) {
        togglePanelButton.addEventListener('click', () => {
            const panelVisible = !controlsPanel.hidden;
            controlsPanel.hidden = panelVisible;
            togglePanelButton.textContent = panelVisible ? 'Show Panel' : 'Hide Panel';
            togglePanelButton.setAttribute('aria-expanded', String(!panelVisible));
            togglePanelButton.blur();
            updateLastInput();
        });
    }
    if (restartButton) {
        restartButton.addEventListener('click', () => {
            resetGame();
            restartButton.blur();
            updateLastInput();
        });
    }

    function update() {
        if (isPaused || isGameOver || !currentShape) return;

        const currentTime = Date.now();

        // Handle Idle Auto-Play (30s)
        if (!autoPlay && (currentTime - lastInputTime > 30000)) {
            autoPlay = true;
            if (autoPlayBtn) {
                autoPlayBtn.classList.add('active');
                autoPlayBtn.textContent = 'Auto-Play ON';
                if (autoPlayStatus) autoPlayStatus.textContent = 'ON';
            }
        }

        // Handle Auto-Play behavior
        if (autoPlay) {
            if (bestProposal && !isGameOver && !isPaused) {
                applyBestMatch();
            } else if (!bestProposal && !isGameOver && !isPaused) {
                dropShape();
            }
        } else {
            if (!checkCollision(currentShape, currentX, currentY + 1)) {
                currentY++;
                hasSwapped = false;
                isLocked = false;
                lastLockTime = 0;
            } else {
                if (!isLocked) {
                    isLocked = true;
                    lastLockTime = currentTime;
                } else {
                    if (currentTime - lastLockTime >= lockDelayMs) {
                        mergeShape();
                        spawnShape();
                        isLocked = false;
                    }
                }
            }
        }
        draw();
    }

    renderProbabilityControls();
    resetGame();
});