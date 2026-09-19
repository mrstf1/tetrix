document.addEventListener('DOMContentLoaded', () => {
    const canvas = document.getElementById('tetrisCanvas');
    if (!canvas) return;

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

    const ctx = canvas.getContext('2d');
    const BLOCK_SIZE = 30;
    const SIDEBAR_WIDTH = 6;

    let boardWidth = 10;
    let boardHeight = 23;
    let previewCount = 5;

    // Web Audio synthesizer engine (fallback & zero-latency audio without DOM crashes)
    let audioCtx = null;
    function initAudio() {
        if (!audioCtx) {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            if (AudioContext) audioCtx = new AudioContext();
        }
        if (audioCtx && audioCtx.state === 'suspended') {
            audioCtx.resume();
        }
    }

    const defaultVolume = 0.4;
    let audioVolume = Number(localStorage.getItem('hx_tetrix_volume'));
    audioVolume = Number.isFinite(audioVolume) ? Math.min(1, Math.max(0, audioVolume)) : defaultVolume;
    let musicEnabled = localStorage.getItem('hx_tetrix_music') === 'on';

    const sounds = {
        move: new Audio('sounds/tone1.ogg'),
        rotate: new Audio('sounds/powerUp7.ogg'),
        drop: new Audio('sounds/lowRandom.ogg'),
        clear: new Audio('sounds/laser3.ogg'),
        gameOver: new Audio('sounds/twoTone2.ogg')
    };

    const music = new Audio('sounds/powerUp7.ogg');
    music.loop = true;
    music.preload = 'auto';

    const baseSoundVolumes = {
        move: 0.25,
        rotate: 0.35,
        drop: 0.45,
        clear: 0.55,
        gameOver: 0.6
    };

    function playTone(freq, type = 'sine', duration = 0.1, gainVal = 0.2) {
        initAudio();
        if (!audioCtx) return;
        try {
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.type = type;
            osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
            gain.gain.setValueAtTime(gainVal * audioVolume, audioCtx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.start();
            osc.stop(audioCtx.currentTime + duration);
        } catch (e) {}
    }

    function playSound(type) {
        initAudio();
        const sound = sounds[type];
        if (sound) {
            try {
                sound.currentTime = 0;
                sound.volume = Math.min(1, (baseSoundVolumes[type] || 0.4) * (audioVolume / defaultVolume));
                const promise = sound.play();
                if (promise) promise.catch(() => playSyntheticSound(type));
            } catch (e) {
                playSyntheticSound(type);
            }
        } else {
            playSyntheticSound(type);
        }
    }

    function playSyntheticSound(type) {
        switch (type) {
            case 'move': playTone(300, 'triangle', 0.05, 0.15); break;
            case 'rotate': playTone(450, 'sine', 0.08, 0.25); break;
            case 'drop': playTone(180, 'square', 0.12, 0.2); break;
            case 'clear': playTone(650, 'sawtooth', 0.25, 0.35); break;
            case 'gameOver': playTone(120, 'sawtooth', 0.5, 0.4); break;
        }
    }

    const musicToggleBtn = document.getElementById('musicToggleBtn');
    const volumeSlider = document.getElementById('volumeSlider');
    const volumeValue = document.getElementById('volumeValue');

    function applyAudioSettings() {
        music.volume = audioVolume;
        Object.entries(sounds).forEach(([name, sound]) => {
            sound.volume = Math.min(1, baseSoundVolumes[name] * (audioVolume / defaultVolume));
        });
        if (volumeSlider) volumeSlider.value = String(audioVolume);
        if (volumeValue) volumeValue.textContent = `${Math.round(audioVolume * 100)}%`;
        if (musicToggleBtn) {
            musicToggleBtn.textContent = musicEnabled ? 'ON' : 'OFF';
            musicToggleBtn.classList.toggle('active', musicEnabled);
            musicToggleBtn.setAttribute('aria-pressed', String(musicEnabled));
        }
    }

    applyAudioSettings();

    if (musicToggleBtn) {
        musicToggleBtn.addEventListener('click', () => {
            initAudio();
            musicEnabled = !musicEnabled;
            if (musicEnabled) {
                music.play().catch(() => {});
            } else {
                music.pause();
            }
            localStorage.setItem('hx_tetrix_music', musicEnabled ? 'on' : 'off');
            applyAudioSettings();
        });
    }

    if (volumeSlider) {
        volumeSlider.addEventListener('input', (e) => {
            audioVolume = parseFloat(e.target.value);
            localStorage.setItem('hx_tetrix_volume', String(audioVolume));
            applyAudioSettings();
        });
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

    const SHAPES = [
        [[1, 1, 1, 1]],        // 0: I
        [[1, 1], [1, 1]],      // 1: O
        [[0, 1, 0], [1, 1, 1]],// 2: T
        [[1, 1, 0], [0, 1, 1]],// 3: S
        [[0, 1, 1], [1, 1, 0]],// 4: Z
        [[1, 0, 0], [1, 1, 1]],// 5: J
        [[0, 0, 1], [1, 1, 1]] // 6: L
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
    let bestProposal = null;

    // Shake, Line-clearing delay & Flash FX state
    let shakeDurationRemaining = 0;
    const SHAKE_TOTAL_DURATION = 140;
    const SHAKE_INTENSITY = 4;

    // Softened flash values
    let flashDurationRemaining = 0;
    const FLASH_DURATION = 120;
    const FLASH_MAX_OPACITY = 0.30;

    let clearingLines = [];
    let clearAnimationTimer = 0;
    const CLEAR_ANIMATION_MS = 140;

    let autoPlay = true;
    let lastInputTime = Date.now();
    let lockDelayMs = 500;
    let isLocked = false;
    let lastLockTime = 0;
    let dropAccumulator = 0;
    let lastTimestamp = performance.now();

    // Square Particles System
    class Particle {
        constructor(x, y, color) {
            this.x = x;
            this.y = y;
            this.color = color;
            this.vx = (Math.random() - 0.5) * 8;
            this.vy = (Math.random() - 0.8) * 8;
            this.life = 1.0;
            this.decay = 0.02 + Math.random() * 0.025;
            this.size = 2.5 + Math.random() * 4.5;
            this.angle = Math.random() * Math.PI * 2;
            this.vRot = (Math.random() - 0.5) * 0.25;
        }

        update() {
            this.x += this.vx;
            this.y += this.vy;
            this.vy += 0.25; // Gravity
            this.angle += this.vRot;
            this.life = Math.max(0, this.life - this.decay);
        }

        draw(targetCtx) {
            targetCtx.save();
            targetCtx.globalAlpha = Math.max(0, this.life);
            targetCtx.fillStyle = this.color;
            targetCtx.translate(this.x, this.y);
            targetCtx.rotate(this.angle);
            targetCtx.fillRect(-this.size, -this.size, this.size * 2, this.size * 2);
            targetCtx.restore();
        }
    }

    class ParticleSystem {
        constructor() {
            this.particles = [];
        }

        emit(x, y, color, count = 10) {
            for (let i = 0; i < count; i++) {
                this.particles.push(new Particle(x, y, color));
            }
        }

        update() {
            for (let i = this.particles.length - 1; i >= 0; i--) {
                this.particles[i].update();
                if (this.particles[i].life <= 0) {
                    this.particles.splice(i, 1);
                }
            }
        }

        draw(targetCtx) {
            this.particles.forEach(p => p.draw(targetCtx));
        }
    }

    const particleSystem = new ParticleSystem();

    function updateLastInput() {
        initAudio();
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
            toggleShadowBtn.blur();
            updateLastInput();
        });
    }

    if (toggleProposalBtn) {
        toggleProposalBtn.addEventListener('click', () => {
            showBestMatch = !showBestMatch;
            toggleProposalBtn.classList.toggle('active', showBestMatch);
            toggleProposalBtn.textContent = showBestMatch ? 'Best Match ON' : 'Best Match OFF';
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
        if (pauseButton) pauseButton.blur();
    }

    function triggerGameOver() {
        isGameOver = true;
        checkAndUpdateHighScore();
        playSound('gameOver');
        shakeDurationRemaining = 0;
    }

    function resetGame() {
        board = Array.from({ length: boardHeight }, () => Array(boardWidth).fill(0));
        score = 0;
        isPaused = false;
        isGameOver = false;
        heldShapeIndex = -1;
        hasSwapped = false;
        shakeDurationRemaining = 0;
        flashDurationRemaining = 0;
        clearingLines = [];
        clearAnimationTimer = 0;
        dropAccumulator = 0;

        nextShapesQueue = [];
        fillQueue();
        spawnShape();

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
                    // Placed piece collision
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

        currentShape = null;

        // Detect full lines for flash and destruction animation
        clearingLines = [];
        for (let y = 0; y < boardHeight; y++) {
            if (!board[y].includes(0)) {
                clearingLines.push(y);
            }
        }

        if (clearingLines.length > 0) {
            clearAnimationTimer = CLEAR_ANIMATION_MS;
            playSound('clear');
            shakeDurationRemaining = SHAKE_TOTAL_DURATION;
            flashDurationRemaining = FLASH_DURATION;

            // Emit particles immediately from clearing lines
            clearingLines.forEach(lineY => {
                for (let x = 0; x < boardWidth; x++) {
                    const color = COLORS[board[lineY][x]] || '#ffffff';
                    particleSystem.emit(x * BLOCK_SIZE + BLOCK_SIZE / 2, lineY * BLOCK_SIZE + BLOCK_SIZE / 2, color, 8);
                }
            });
        } else {
            spawnShape();
        }
    }

    function finalizeLineClears() {
        if (clearingLines.length === 0) return;

        const count = clearingLines.length;
        clearingLines.sort((a, b) => a - b).forEach(lineY => {
            board.splice(lineY, 1);
            board.unshift(Array(boardWidth).fill(0));
        });

        const points = [100, 300, 500, 800];
        const scoreGain = points[Math.min(count, 4) - 1] || 800;
        score += scoreGain;
        checkAndUpdateHighScore();

        totalLinesCleared += count;
        gameLevel = Math.floor(totalLinesCleared / 10) + 1;
        dropIntervalMs = Math.max(100, 500 - (gameLevel - 1) * 50);
        lastMultiplier = count > 1 ? count : 1;

        clearingLines = [];
        spawnShape();
    }

    function dropShape() {
        if (!currentShape || isPaused || isGameOver || clearingLines.length > 0) return;
        currentY = getShadowY();
        playSound('drop');
        mergeShape();
        hasSwapped = false;
        isLocked = false;
        lastLockTime = 0;
    }

    function applyBestMatch() {
        if (!currentShape || isPaused || isGameOver || !bestProposal || clearingLines.length > 0) return;

        if (checkCollision(bestProposal.shape, bestProposal.x, bestProposal.y)) {
            dropShape();
            return;
        }

        currentShape = bestProposal.shape;
        currentX = bestProposal.x;
        currentY = bestProposal.y;
        playSound('drop');
        mergeShape();
        hasSwapped = false;
        isLocked = false;
        lastLockTime = 0;
    }

    // Standard Super Rotation System (SRS) Wall Kicks
    const KICKS_NORMAL = {
        '0->1': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
        '1->0': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
        '1->2': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
        '2->1': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
        '2->3': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
        '3->2': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
        '3->0': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
        '0->3': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]]
    };

    const KICKS_I = {
        '0->1': [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],
        '1->0': [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
        '1->2': [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]],
        '2->1': [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
        '2->3': [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
        '3->2': [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],
        '3->0': [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
        '0->3': [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]]
    };

    let currentRotationState = 0;

    function rotateShape() {
        if (!currentShape || isPaused || isGameOver || clearingLines.length > 0) return;
        if (currentShapeIndex === 1) return; // O-piece does not rotate

        const rotated = rotateMatrix(currentShape);
        const nextRotationState = (currentRotationState + 1) % 4;
        const transitionKey = `${currentRotationState}->${nextRotationState}`;
        const kickTable = currentShapeIndex === 0 ? KICKS_I : KICKS_NORMAL;
        const kicks = kickTable[transitionKey] || [[0, 0], [-1, 0], [1, 0], [0, -1], [0, 1]];

        for (const [offsetX, offsetY] of kicks) {
            if (!checkCollision(rotated, currentX + offsetX, currentY - offsetY)) {
                currentX += offsetX;
                currentY -= offsetY;
                currentShape = rotated;
                currentRotationState = nextRotationState;
                bestProposal = computeBestPlacement(currentShape);
                playSound('rotate');
                hasSwapped = false;
                isLocked = false;
                lastLockTime = 0;
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

    function updateLogic(deltaMs) {
        if (isPaused || isGameOver) return;

        const currentTime = Date.now();

        // Line clear completion check
        if (clearingLines.length > 0) {
            clearAnimationTimer -= deltaMs;
            if (clearAnimationTimer <= 0) {
                finalizeLineClears();
            }
            return;
        }

        // Idle Auto-Play Check (30 seconds)
        if (!autoPlay && (currentTime - lastInputTime > 30000)) {
            autoPlay = true;
            if (autoPlayBtn) {
                autoPlayBtn.classList.add('active');
                autoPlayBtn.textContent = 'Auto-Play ON';
                if (autoPlayStatus) autoPlayStatus.textContent = 'ON';
            }
        }

        dropAccumulator += deltaMs;
        if (dropAccumulator >= dropIntervalMs) {
            dropAccumulator %= dropIntervalMs;

            if (autoPlay) {
                if (bestProposal) {
                    applyBestMatch();
                } else {
                    dropShape();
                }
            } else if (currentShape) {
                if (!checkCollision(currentShape, currentX, currentY + 1)) {
                    currentY++;
                    hasSwapped = false;
                    isLocked = false;
                    lastLockTime = 0;
                } else {
                    if (!isLocked) {
                        isLocked = true;
                        lastLockTime = currentTime;
                    } else if (currentTime - lastLockTime >= lockDelayMs) {
                        mergeShape();
                        isLocked = false;
                    }
                }
            }
        }
    }

    function draw(deltaMs) {
        particleSystem.update();

        ctx.save();

        // Screen Shake calculation
        if (shakeDurationRemaining > 0) {
            const shakeFactor = shakeDurationRemaining / SHAKE_TOTAL_DURATION;
            const offsetX = (Math.random() - 0.5) * SHAKE_INTENSITY * shakeFactor * 2;
            const offsetY = (Math.random() - 0.5) * SHAKE_INTENSITY * shakeFactor * 2;
            ctx.translate(offsetX, offsetY);
            shakeDurationRemaining = Math.max(0, shakeDurationRemaining - deltaMs);
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

        // 2. Placed Blocks & Clearing Flash Highlights
        for (let y = 0; y < boardHeight; y++) {
            const isClearing = clearingLines.includes(y);
            for (let x = 0; x < boardWidth; x++) {
                if (board[y][x] !== 0) {
                    if (isClearing) {
                        ctx.fillStyle = '#ffffff';
                        ctx.fillRect(x * BLOCK_SIZE + 1, y * BLOCK_SIZE + 1, BLOCK_SIZE - 2, BLOCK_SIZE - 2);
                    } else {
                        drawBlock(x * BLOCK_SIZE, y * BLOCK_SIZE, COLORS[board[y][x]]);
                    }
                }
            }
        }

        // 3. Best Match Outline
        if (showBestMatch && bestProposal && bestProposal.shape && !isGameOver && clearingLines.length === 0) {
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
        if (currentShape && !isGameOver && clearingLines.length === 0) {
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

        hudY += currentBoxHeight + 16;

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

        hudY += holdBoxHeight + 16;

        // Lookahead Queue
        ctx.fillStyle = '#8b949e';
        ctx.font = '600 11px -apple-system, sans-serif';
        ctx.fillText(`NEXT (${previewCount})`, hudX, hudY);

        hudY += 6;

        let nextItemHeight, nextBlockSize, boxGap;
        if (previewCount <= 2) {
            nextItemHeight = 36;
            nextBlockSize = 11;
            boxGap = 8;
        } else if (previewCount <= 4) {
            nextItemHeight = 28;
            nextBlockSize = 9;
            boxGap = 6;
        } else {
            nextItemHeight = 22;
            nextBlockSize = 7;
            boxGap = 4;
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

        // Keys Card
        const statsBottom = boardHeight * BLOCK_SIZE - 18;
        const keysY = statsBottom - 220;
        ctx.fillStyle = '#161b22';
        ctx.fillRect(hudX - 6, keysY - 14, 160, 78);
        ctx.strokeStyle = '#30363d';
        ctx.strokeRect(hudX - 6, keysY - 14, 160, 78);

        ctx.fillStyle = '#8b949e';
        ctx.font = '600 12px -apple-system, sans-serif';
        ctx.fillText('KEYS', hudX, keysY);

        ctx.fillStyle = '#c9d1d9';
        ctx.font = '600 11px ui-monospace, monospace';
        ctx.fillText('← → MOVE ↑ ROTATE', hudX, keysY + 15);
        ctx.fillText('↓ SOFT DROP SPACE DROP', hudX, keysY + 30);
        ctx.fillText('C HOLD P PAUSE', hudX, keysY + 45);
        ctx.fillText('ENTER BEST MATCH', hudX, keysY + 56);

        ctx.strokeStyle = '#30363d';
        ctx.beginPath();
        ctx.moveTo(hudX, statsBottom - 148);
        ctx.lineTo(hudX + 148, statsBottom - 148);
        ctx.stroke();

        // Metrics
        hudY = statsBottom - 132;
        ctx.fillStyle = '#8b949e';
        ctx.font = '600 11px -apple-system, sans-serif';
        ctx.fillText('SCORE', hudX, hudY);

        hudY += 16;
        ctx.fillStyle = '#f0f6fc';
        ctx.font = '600 14px ui-monospace, monospace';
        ctx.fillText(String(score).padStart(6, '0'), hudX, hudY);
        
        ctx.fillStyle = '#f85149';
        ctx.font = '600 11px ui-monospace, monospace';
        ctx.fillText(`x${lastMultiplier}`, hudX + 90, hudY);

        hudY = statsBottom - 84;
        ctx.fillStyle = '#8b949e';
        ctx.font = '600 11px -apple-system, sans-serif';
        ctx.fillText('★ BEST', hudX, hudY);

        hudY = statsBottom - 66;
        ctx.fillStyle = '#f0f6fc';
        ctx.font = '600 14px ui-monospace, monospace';
        ctx.fillText(String(highScore).padStart(6, '0'), hudX, hudY);

        hudY = statsBottom - 30;
        ctx.fillStyle = '#8b949e';
        ctx.font = '600 11px -apple-system, sans-serif';
        ctx.fillText('SPEED', hudX, hudY);

        hudY = statsBottom;
        ctx.fillStyle = '#f0f6fc';
        ctx.font = '600 14px ui-monospace, monospace';
        ctx.fillText(`${String(dropIntervalMs).padStart(4, '0')} ms`, hudX, hudY);

        // Game Over & Paused Overlays
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

        // Toned-down, smoothly eased playfield-only flash
        if (flashDurationRemaining > 0) {
            const progress = flashDurationRemaining / FLASH_DURATION;
            // Quadratic easing for a soft, natural fade
            const alpha = Math.pow(progress, 2) * FLASH_MAX_OPACITY;
            ctx.fillStyle = `rgba(224, 242, 254, ${alpha})`;
            ctx.fillRect(0, 0, playfieldPixelWidth, boardHeight * BLOCK_SIZE);
            flashDurationRemaining = Math.max(0, flashDurationRemaining - deltaMs);
        }

        particleSystem.draw(ctx);
        ctx.restore();
    }

    // Continuous 60/120Hz Animation & Game Loop
    function mainGameLoop(timestamp) {
        const deltaMs = Math.min(timestamp - lastTimestamp, 50);
        lastTimestamp = timestamp;

        updateLogic(deltaMs);
        draw(deltaMs);

        requestAnimationFrame(mainGameLoop);
    }

    document.addEventListener('keydown', (e) => {
        if (e.key === 'p' || e.key === 'P') {
            togglePause();
            return;
        }

        if (isPaused || isGameOver || !currentShape || clearingLines.length > 0) return;
        updateLastInput();

        switch (e.key) {
            case 'ArrowLeft':
                if (!checkCollision(currentShape, currentX - 1, currentY)) {
                    currentX--;
                    playSound('move');
                    hasSwapped = false;
                    isLocked = false;
                    lastLockTime = 0;
                }
                break;
            case 'ArrowRight':
                if (!checkCollision(currentShape, currentX + 1, currentY)) {
                    currentX++;
                    playSound('move');
                    hasSwapped = false;
                    isLocked = false;
                    lastLockTime = 0;
                }
                break;
            case 'ArrowDown':
                if (!checkCollision(currentShape, currentX, currentY + 1)) {
                    currentY++;
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
                    playSound('rotate');
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

    renderProbabilityControls();
    resetGame();
    requestAnimationFrame(mainGameLoop);
});