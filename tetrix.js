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

    const modeMarathon = document.getElementById('modeMarathon');
    const modeSprint = document.getElementById('modeSprint');
    const modeUltra = document.getElementById('modeUltra');
    const timerGroup = document.getElementById('timerGroup');
    const timerLabel = document.getElementById('timerLabel');
    const timerDisplay = document.getElementById('timerDisplay');
    const linesOrScoreLabel = document.getElementById('linesOrScoreLabel');

    const currentCanvas = document.getElementById('currentCanvas');
    const holdCanvas = document.getElementById('holdCanvas');
    const nextQueueContainer = document.getElementById('nextQueueContainer');
    const nextQueueLabel = document.getElementById('nextQueueLabel');
    const scoreDisplay = document.getElementById('scoreDisplay');
    const highScoreDisplay = document.getElementById('highScoreDisplay');
    const speedMetricDisplay = document.getElementById('speedMetricDisplay');
    const multiplierDisplay = document.getElementById('multiplierDisplay');

    const ctx = canvas.getContext('2d');
    const BLOCK_SIZE = 30;

    function setupResponsivePanel() {
        if (window.innerWidth <= 900) {
            controlsPanel.hidden = true;
            togglePanelButton.textContent = 'Show Panel';
        } else {
            controlsPanel.hidden = false;
            togglePanelButton.textContent = 'Hide Panel';
        }
    }
    setupResponsivePanel();

    const STORAGE_KEYS = {
        CONFIG: 'hx_tetrix_config',
        WEIGHTS: 'hx_tetrix_weights',
        KEYBINDS: 'hx_tetrix_keybinds',
        VOLUME: 'hx_tetrix_volume',
        MUSIC: 'hx_tetrix_music',
        HIGHSCORE: 'hx_tetrix_highscore',
        SPRINT_BEST: 'hx_tetrix_sprint_best',
        ULTRA_BEST: 'hx_tetrix_ultra_best'
    };

    const DEFAULT_CONFIG = {
        boardWidth: 10,
        boardHeight: 23,
        previewCount: 5
    };

    const DEFAULT_WEIGHTS = [20, 20, 20, 20, 20, 20, 20];

    const DEFAULT_KEYBINDS = {
        moveLeft: ['ArrowLeft'],
        moveRight: ['ArrowRight'],
        softDrop: ['ArrowDown'],
        rotate: ['ArrowUp'],
        hardDrop: [' '],
        hold: ['c', 'C'],
        pause: ['p', 'P'],
        bestMatch: ['Enter']
    };

    function loadPersistedData() {
        let config = { ...DEFAULT_CONFIG };
        let loadedWeights = [...DEFAULT_WEIGHTS];
        let keybinds = { ...DEFAULT_KEYBINDS };

        try {
            const savedConfig = JSON.parse(localStorage.getItem(STORAGE_KEYS.CONFIG));
            if (savedConfig && typeof savedConfig === 'object') {
                if (Number.isInteger(savedConfig.boardWidth) && savedConfig.boardWidth >= 4 && savedConfig.boardWidth <= 20) {
                    config.boardWidth = savedConfig.boardWidth;
                }
                if (Number.isInteger(savedConfig.boardHeight) && savedConfig.boardHeight >= 6 && savedConfig.boardHeight <= 30) {
                    config.boardHeight = savedConfig.boardHeight;
                }
                if (Number.isInteger(savedConfig.previewCount) && savedConfig.previewCount >= 1 && savedConfig.previewCount <= 10) {
                    config.previewCount = savedConfig.previewCount;
                }
            }
        } catch (e) {}

        try {
            const savedWeights = JSON.parse(localStorage.getItem(STORAGE_KEYS.WEIGHTS));
            if (Array.isArray(savedWeights) && savedWeights.length === 7) {
                loadedWeights = savedWeights.map(w => (Number.isFinite(w) && w >= 0 ? w : 20));
            }
        } catch (e) {}

        try {
            const savedKeybinds = JSON.parse(localStorage.getItem(STORAGE_KEYS.KEYBINDS));
            if (savedKeybinds && typeof savedKeybinds === 'object') {
                keybinds = { ...DEFAULT_KEYBINDS, ...savedKeybinds };
            }
        } catch (e) {}

        return { config, weights: loadedWeights, keybinds };
    }

    const persisted = loadPersistedData();
    let boardWidth = persisted.config.boardWidth;
    let boardHeight = persisted.config.boardHeight;
    let previewCount = persisted.config.previewCount;
    let weights = persisted.weights;
    let keybinds = persisted.keybinds;

    function saveDimensionsAndQueue() {
        try {
            localStorage.setItem(STORAGE_KEYS.CONFIG, JSON.stringify({ boardWidth, boardHeight, previewCount }));
        } catch (e) {}
    }

    function saveWeights() {
        try {
            localStorage.setItem(STORAGE_KEYS.WEIGHTS, JSON.stringify(weights));
        } catch (e) {}
    }

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
    let audioVolume = Number(localStorage.getItem(STORAGE_KEYS.VOLUME));
    audioVolume = Number.isFinite(audioVolume) ? Math.min(1, Math.max(0, audioVolume)) : defaultVolume;
    let musicEnabled = localStorage.getItem(STORAGE_KEYS.MUSIC) === 'on';

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

    const baseSoundVolumes = { move: 0.25, rotate: 0.35, drop: 0.45, clear: 0.55, gameOver: 0.6 };

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
                const p = sound.play();
                if (p) p.catch(() => playSyntheticSound(type));
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
        }
    }

    applyAudioSettings();

    if (musicToggleBtn) {
        musicToggleBtn.addEventListener('click', () => {
            initAudio();
            musicEnabled = !musicEnabled;
            if (musicEnabled) music.play().catch(() => {});
            else music.pause();
            localStorage.setItem(STORAGE_KEYS.MUSIC, musicEnabled ? 'on' : 'off');
            applyAudioSettings();
        });
    }

    if (volumeSlider) {
        volumeSlider.addEventListener('input', (e) => {
            audioVolume = parseFloat(e.target.value);
            localStorage.setItem(STORAGE_KEYS.VOLUME, String(audioVolume));
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
    const COLORS = [null, '#38bdf8', '#facc15', '#c084fc', '#4ade80', '#f87171', '#3b82f6', '#f97316'];

    let gameMode = 'marathon';
    let modeStartTime = 0;
    let modeElapsedTime = 0;
    const SPRINT_TARGET_LINES = 40;
    const ULTRA_DURATION_MS = 120000;

    let dropIntervalMs = 500;
    let isPaused = false;
    let isGameOver = false;
    let gameResultText = 'GAME OVER';

    let showShadow = false;
    let showBestMatch = false;
    let autoPlay = true;

    function syncVisualAssistsUI() {
        if (toggleShadowBtn) {
            toggleShadowBtn.classList.toggle('active', showShadow);
            toggleShadowBtn.textContent = showShadow ? 'Shadow ON' : 'Shadow OFF';
        }
        if (toggleProposalBtn) {
            toggleProposalBtn.classList.toggle('active', showBestMatch);
            toggleProposalBtn.textContent = showBestMatch ? 'Best Match ON' : 'Best Match OFF';
        }
    }

    function setAutoPlay(val) {
        autoPlay = val;
        if (autoPlayBtn) {
            autoPlayBtn.classList.toggle('active', autoPlay);
            autoPlayBtn.textContent = autoPlay ? 'Auto-Play ON' : 'Auto-Play OFF';
        }
        if (autoPlayStatus) {
            autoPlayStatus.textContent = autoPlay ? 'ON' : 'OFF';
        }
        if (autoPlay && currentShape) {
            triggerBestPlacementCalculation(currentShape);
        }
    }

    // Explicit Auto-Play toggle listener
    if (autoPlayBtn) {
        autoPlayBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            initAudio();
            setAutoPlay(!autoPlay);
        });
    }

    let board = Array.from({ length: boardHeight }, () => Array(boardWidth).fill(0));
    let currentShape = null;
    let currentShapeIndex = 0;
    let nextShapesQueue = [];
    let heldShapeIndex = -1;
    let hasSwapped = false;

    let currentX = 0;
    let currentY = 0;
    let score = 0;
    let totalLinesCleared = 0;
    let gameLevel = 1;
    let lastMultiplier = 1;
    let bestProposal = null;

    function getHighScoreKey() {
        if (gameMode === 'sprint') return STORAGE_KEYS.SPRINT_BEST;
        if (gameMode === 'ultra') return STORAGE_KEYS.ULTRA_BEST;
        return STORAGE_KEYS.HIGHSCORE;
    }

    function getHighScore() {
        const key = getHighScoreKey();
        const saved = localStorage.getItem(key);
        if (!saved) return 0;
        return gameMode === 'sprint' ? parseFloat(saved) : parseInt(saved, 10);
    }

    let solverWorker = null;
    let currentCalcId = 0;

    const solverWorkerScript = `
        function rotateMatrix(matrix) {
            if (!matrix || matrix.length === 0) return matrix;
            return matrix[0].map((_, index) => matrix.map(row => row[index]).reverse());
        }

        function checkCollision(shape, targetX, targetY, board, boardWidth, boardHeight) {
            if (!shape) return false;
            for (let y = 0; y < shape.length; y++) {
                for (let x = 0; x < shape[y].length; x++) {
                    if (shape[y][x] !== 0) {
                        const newX = targetX + x;
                        const newY = targetY + y;
                        if (newX < 0 || newX >= boardWidth) return true;
                        if (newY >= boardHeight) return true;
                        if (newY >= 0 && board[newY] && board[newY][newX] !== 0) return true;
                    }
                }
            }
            return false;
        }

        self.onmessage = function(e) {
            const { calcId, baseShape, board, boardWidth, boardHeight } = e.data;
            if (!baseShape || !board) {
                self.postMessage({ calcId, bestTarget: null });
                return;
            }

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
                    if (checkCollision(shape, x, 0, board, boardWidth, boardHeight)) continue;
                    let y = 0;
                    while (!checkCollision(shape, x, y + 1, board, boardWidth, boardHeight)) y++;

                    const simBoard = board.map(row => [...row]);
                    let placementValid = true;

                    for (let sy = 0; sy < shape.length; sy++) {
                        for (let sx = 0; sx < shape[sy].length; sx++) {
                            if (shape[sy][sx] !== 0) {
                                const by = y + sy;
                                const bx = x + sx;
                                if (by >= 0 && by < boardHeight && bx >= 0 && bx < boardWidth) simBoard[by][bx] = 1;
                                else placementValid = false;
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
            self.postMessage({ calcId, bestTarget });
        };
    `;

    try {
        const blob = new Blob([solverWorkerScript], { type: 'application/javascript' });
        solverWorker = new Worker(URL.createObjectURL(blob));
        solverWorker.onmessage = function(e) {
            const { calcId, bestTarget } = e.data;
            if (calcId === currentCalcId) {
                bestProposal = bestTarget;
            }
        };
    } catch (err) {
        solverWorker = null;
    }

    function triggerBestPlacementCalculation(shape) {
        if (!shape || isGameOver) {
            bestProposal = null;
            return;
        }
        currentCalcId++;
        if (solverWorker) {
            solverWorker.postMessage({
                calcId: currentCalcId,
                baseShape: shape,
                board: board,
                boardWidth: boardWidth,
                boardHeight: boardHeight
            });
        }
    }

    let shakeDurationRemaining = 0;
    const SHAKE_TOTAL_DURATION = 140;
    const SHAKE_INTENSITY = 4;
    let flashDurationRemaining = 0;
    const FLASH_DURATION = 120;
    const FLASH_MAX_OPACITY = 0.30;
    let clearingLines = [];
    let clearAnimationTimer = 0;
    const CLEAR_ANIMATION_MS = 140;

    let lockDelayMs = 500;
    let isLocked = false;
    let lastLockTime = 0;
    let dropAccumulator = 0;
    let lastTimestamp = performance.now();

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
            this.vy += 0.25;
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
                if (this.particles[i].life <= 0) this.particles.splice(i, 1);
            }
        }

        draw(targetCtx) {
            this.particles.forEach(p => p.draw(targetCtx));
        }
    }

    const particleSystem = new ParticleSystem();

    function onGameplayInput() {
        initAudio();
        if (autoPlay) {
            setAutoPlay(false);
        }
    }

    function checkAndUpdateHighScore() {
        const key = getHighScoreKey();
        if (gameMode === 'sprint') {
            const currentBest = getHighScore();
            const timeTakenSec = modeElapsedTime / 1000;
            if (currentBest === 0 || timeTakenSec < currentBest) {
                localStorage.setItem(key, timeTakenSec.toFixed(2));
            }
        } else {
            const currentBest = getHighScore();
            if (score > currentBest) {
                localStorage.setItem(key, String(score));
            }
        }
    }

    function resizeCanvas() {
        canvas.width = boardWidth * BLOCK_SIZE;
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

    function drawPieceToCanvas(targetCanvas, shapeIndex, cellSize = 10) {
        if (!targetCanvas) return;
        const targetCtx = targetCanvas.getContext('2d');
        targetCtx.clearRect(0, 0, targetCanvas.width, targetCanvas.height);
        if (shapeIndex < 0 || shapeIndex >= SHAPES.length) return;

        const shape = SHAPES[shapeIndex];
        const color = COLORS[shapeIndex + 1];
        const offX = Math.floor((targetCanvas.width - shape[0].length * cellSize) / 2);
        const offY = Math.floor((targetCanvas.height - shape.length * cellSize) / 2);

        for (let y = 0; y < shape.length; y++) {
            for (let x = 0; x < shape[y].length; x++) {
                if (shape[y][x] !== 0) {
                    targetCtx.fillStyle = color;
                    targetCtx.fillRect(offX + x * cellSize + 1, offY + y * cellSize + 1, cellSize - 2, cellSize - 2);
                }
            }
        }
    }

    function formatTime(ms) {
        const totalSec = Math.floor(ms / 1000);
        const mins = Math.floor(totalSec / 60);
        const secs = totalSec % 60;
        return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }

    function updateDOMHud() {
        const best = getHighScore();
        if (gameMode === 'sprint') {
            linesOrScoreLabel.textContent = 'LINES LEFT';
            scoreDisplay.textContent = String(Math.max(0, SPRINT_TARGET_LINES - totalLinesCleared)).padStart(2, '0');
            highScoreDisplay.textContent = best > 0 ? `${best}s` : '--';
        } else {
            linesOrScoreLabel.textContent = 'SCORE';
            scoreDisplay.textContent = String(score).padStart(6, '0');
            highScoreDisplay.textContent = String(best).padStart(6, '0');
        }

        speedMetricDisplay.textContent = `${String(dropIntervalMs).padStart(4, '0')} ms`;
        multiplierDisplay.textContent = `x${lastMultiplier}`;

        if (gameMode === 'sprint') {
            timerGroup.style.display = 'flex';
            timerLabel.textContent = 'ELAPSED';
            timerDisplay.textContent = formatTime(modeElapsedTime);
        } else if (gameMode === 'ultra') {
            timerGroup.style.display = 'flex';
            timerLabel.textContent = 'REMAINING';
            const remaining = Math.max(0, ULTRA_DURATION_MS - modeElapsedTime);
            timerDisplay.textContent = formatTime(remaining);
        } else {
            timerGroup.style.display = 'none';
        }

        drawPieceToCanvas(currentCanvas, currentShapeIndex, 10);
        drawPieceToCanvas(holdCanvas, heldShapeIndex, 10);

        if (nextQueueLabel) nextQueueLabel.textContent = `Next (${previewCount})`;
        if (nextQueueContainer) {
            nextQueueContainer.innerHTML = '';
            for (let i = 0; i < previewCount; i++) {
                const shapeIdx = nextShapesQueue[i];
                const box = document.createElement('div');
                box.className = 'next-item-box';
                const itemCanvas = document.createElement('canvas');
                itemCanvas.width = 60;
                itemCanvas.height = 26;
                drawPieceToCanvas(itemCanvas, shapeIdx, 7);
                box.appendChild(itemCanvas);
                nextQueueContainer.appendChild(box);
            }
        }
    }

    function updateQueueUI() {
        if (queueDisplay) {
            queueDisplay.textContent = `${previewCount} ${previewCount === 1 ? 'shape' : 'shapes'}`;
        }
        updateDOMHud();
    }

    function changeQueueSize(delta) {
        previewCount = Math.min(10, Math.max(1, previewCount + delta));
        saveDimensionsAndQueue();
        updateQueueUI();
    }

    if (queueMinusBtn) queueMinusBtn.addEventListener('click', () => changeQueueSize(-1));
    if (queuePlusBtn) queuePlusBtn.addEventListener('click', () => changeQueueSize(1));

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
        return Math.max(6, (boardHeight - highestBlockRow) + 3);
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

        saveDimensionsAndQueue();
        resizeCanvas();
        updateDimensionUI();
        triggerBestPlacementCalculation(currentShape);
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

        saveDimensionsAndQueue();
        resizeCanvas();
        updateDimensionUI();
        triggerBestPlacementCalculation(currentShape);
    }

    if (widthMinusBtn) widthMinusBtn.addEventListener('click', () => changeWidth(-1));
    if (widthPlusBtn) widthPlusBtn.addEventListener('click', () => changeWidth(1));
    if (heightMinusBtn) heightMinusBtn.addEventListener('click', () => changeHeight(-1));
    if (heightPlusBtn) heightPlusBtn.addEventListener('click', () => changeHeight(1));

    if (toggleShadowBtn) {
        toggleShadowBtn.addEventListener('click', () => {
            showShadow = !showShadow;
            syncVisualAssistsUI();
        });
    }

    if (toggleProposalBtn) {
        toggleProposalBtn.addEventListener('click', () => {
            showBestMatch = !showBestMatch;
            syncVisualAssistsUI();
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

        if (totalWeight <= 0) {
            chartContext.fillStyle = '#30363d';
            chartContext.fillRect(chartLeft, chartTop, chartWidth - chartLeft * 2, chartAreaHeight);
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
            input.onchange = (e) => updateWeight(index, parseInt(e.target.value, 10));

            const btnPlus = document.createElement('button');
            btnPlus.className = 'step-btn';
            btnPlus.textContent = '+';
            btnPlus.onclick = () => updateWeight(index, weights[index] + 5);

            const pct = document.createElement('span');
            pct.className = 'percentage-display';
            pct.textContent = `${totalWeight > 0 ? ((weights[index] / totalWeight) * 100).toFixed(1) : 0}%`;

            row.append(label, btnMinus, input, btnPlus, pct);
            weightsContainer.appendChild(row);
        });

        drawWeightsChart();
    }

    function updateWeight(index, value) {
        weights[index] = Math.max(0, isNaN(value) ? 0 : value);
        saveWeights();
        renderProbabilityControls();
    }

    if (resetWeightsButton) {
        resetWeightsButton.addEventListener('click', () => {
            weights = [...DEFAULT_WEIGHTS];
            saveWeights();
            renderProbabilityControls();
        });
    }

    function setDropSpeed(newSpeed) {
        dropIntervalMs = Math.min(1000, Math.max(100, newSpeed));
        if (speedDisplay) speedDisplay.textContent = `${dropIntervalMs} ms`;
        updateDOMHud();
    }

    if (speedDownBtn) speedDownBtn.addEventListener('click', () => setDropSpeed(dropIntervalMs + 50));
    if (speedUpBtn) speedUpBtn.addEventListener('click', () => setDropSpeed(dropIntervalMs - 50));

    function togglePause() {
        if (isGameOver) return;
        isPaused = !isPaused;
        if (pauseButton) pauseButton.textContent = isPaused ? 'Resume (P)' : 'Pause (P)';
    }

    function triggerGameOver(customText = 'GAME OVER') {
        isGameOver = true;
        gameResultText = customText;
        checkAndUpdateHighScore();
        playSound('gameOver');
        shakeDurationRemaining = 0;
        updateDOMHud();
    }

    function resetGame(startAutoPlay = true) {
        board = Array.from({ length: boardHeight }, () => Array(boardWidth).fill(0));
        score = 0;
        totalLinesCleared = 0;
        lastMultiplier = 1;
        isPaused = false;
        isGameOver = false;
        gameResultText = 'GAME OVER';
        heldShapeIndex = -1;
        hasSwapped = false;
        shakeDurationRemaining = 0;
        flashDurationRemaining = 0;
        clearingLines = [];
        clearAnimationTimer = 0;
        dropAccumulator = 0;
        modeStartTime = performance.now();
        modeElapsedTime = 0;

        setAutoPlay(startAutoPlay);

        nextShapesQueue = [];
        fillQueue();
        spawnShape();

        updateDimensionUI();
        updateQueueUI();
        syncVisualAssistsUI();
        updateDOMHud();
    }

    function setGameMode(newMode) {
        gameMode = newMode;
        [modeMarathon, modeSprint, modeUltra].forEach(btn => btn.classList.remove('active'));
        if (newMode === 'marathon') modeMarathon.classList.add('active');
        else if (newMode === 'sprint') modeSprint.classList.add('active');
        else if (newMode === 'ultra') modeUltra.classList.add('active');
        resetGame(true);
    }

    if (modeMarathon) modeMarathon.addEventListener('click', () => setGameMode('marathon'));
    if (modeSprint) modeSprint.addEventListener('click', () => setGameMode('sprint'));
    if (modeUltra) modeUltra.addEventListener('click', () => setGameMode('ultra'));

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
                    if (newX < 0 || newX >= boardWidth) return true;
                    if (newY >= boardHeight) return true;
                    if (newY >= 0 && board[newY] && board[newY][newX] !== 0) return true;
                }
            }
        }
        return false;
    }

    function spawnShape() {
        fillQueue();
        if (nextShapesQueue.length === 0) nextShapesQueue.push(getRandomShapeIndex());
        currentShapeIndex = nextShapesQueue.shift();
        fillQueue();

        if (currentShapeIndex === undefined || currentShapeIndex >= SHAPES.length) currentShapeIndex = 0;
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

        triggerBestPlacementCalculation(currentShape);
        updateDOMHud();
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
        clearingLines = [];
        for (let y = 0; y < boardHeight; y++) {
            if (!board[y].includes(0)) clearingLines.push(y);
        }

        if (clearingLines.length > 0) {
            clearAnimationTimer = CLEAR_ANIMATION_MS;
            playSound('clear');
            shakeDurationRemaining = SHAKE_TOTAL_DURATION;
            flashDurationRemaining = FLASH_DURATION;

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
        score += points[Math.min(count, 4) - 1] || 800;
        totalLinesCleared += count;
        gameLevel = Math.floor(totalLinesCleared / 10) + 1;
        dropIntervalMs = Math.max(100, 500 - (gameLevel - 1) * 50);
        lastMultiplier = count > 1 ? count : 1;

        clearingLines = [];

        if (gameMode === 'sprint' && totalLinesCleared >= SPRINT_TARGET_LINES) {
            triggerGameOver('SPRINT CLEAR!');
            return;
        }

        spawnShape();
        updateDOMHud();
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
        if (currentShapeIndex === 1) return;

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
                triggerBestPlacementCalculation(currentShape);
                playSound('rotate');
                hasSwapped = false;
                isLocked = false;
                lastLockTime = 0;
                return;
            }
        }
    }

    function holdPiece() {
        if (hasSwapped || !currentShape || isPaused || isGameOver) return;
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
            triggerBestPlacementCalculation(currentShape);
        }
        hasSwapped = true;
        updateDOMHud();
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

        modeElapsedTime += deltaMs;
        if (gameMode === 'ultra' && modeElapsedTime >= ULTRA_DURATION_MS) {
            triggerGameOver('TIME UP!');
            return;
        }

        if (clearingLines.length > 0) {
            clearAnimationTimer -= deltaMs;
            if (clearAnimationTimer <= 0) finalizeLineClears();
            return;
        }

        dropAccumulator += deltaMs;
        if (dropAccumulator >= dropIntervalMs) {
            dropAccumulator %= dropIntervalMs;

            if (autoPlay) {
                if (bestProposal) applyBestMatch();
                else dropShape();
            } else if (currentShape) {
                if (!checkCollision(currentShape, currentX, currentY + 1)) {
                    currentY++;
                    hasSwapped = false;
                    isLocked = false;
                    lastLockTime = 0;
                } else {
                    const now = Date.now();
                    if (!isLocked) {
                        isLocked = true;
                        lastLockTime = now;
                    } else if (now - lastLockTime >= lockDelayMs) {
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

        if (shakeDurationRemaining > 0) {
            const shakeFactor = shakeDurationRemaining / SHAKE_TOTAL_DURATION;
            const offsetX = (Math.random() - 0.5) * SHAKE_INTENSITY * shakeFactor * 2;
            const offsetY = (Math.random() - 0.5) * SHAKE_INTENSITY * shakeFactor * 2;
            ctx.translate(offsetX, offsetY);
            shakeDurationRemaining = Math.max(0, shakeDurationRemaining - deltaMs);
        }

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        ctx.strokeStyle = '#161c24';
        ctx.lineWidth = 1;
        for (let x = 0; x <= canvas.width; x += BLOCK_SIZE) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, canvas.height);
            ctx.stroke();
        }
        for (let y = 0; y <= canvas.height; y += BLOCK_SIZE) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(canvas.width, y);
            ctx.stroke();
        }

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

        if (isGameOver) {
            ctx.fillStyle = 'rgba(9, 13, 18, 0.85)';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            const cardW = Math.min(230, canvas.width - 20);
            const cardH = 145;
            const cardX = (canvas.width - cardW) / 2;
            const cardY = (canvas.height - cardH) / 2;

            ctx.fillStyle = '#161b22';
            ctx.strokeStyle = gameResultText.includes('CLEAR') ? '#3fb950' : '#f85149';
            ctx.lineWidth = 1.5;
            ctx.fillRect(cardX, cardY, cardW, cardH);
            ctx.strokeRect(cardX, cardY, cardW, cardH);

            ctx.textAlign = 'center';
            ctx.fillStyle = gameResultText.includes('CLEAR') ? '#3fb950' : '#f85149';
            ctx.font = '700 16px -apple-system, sans-serif';
            ctx.fillText(gameResultText, canvas.width / 2, cardY + 28);

            ctx.fillStyle = '#8b949e';
            ctx.font = '11px -apple-system, sans-serif';
            ctx.fillText(gameMode === 'sprint' ? 'TIME' : 'FINAL SCORE', canvas.width / 2, cardY + 50);

            ctx.fillStyle = '#f0f6fc';
            ctx.font = '700 18px ui-monospace, monospace';
            const displayVal = gameMode === 'sprint' ? `${(modeElapsedTime / 1000).toFixed(2)}s` : String(score);
            ctx.fillText(displayVal, canvas.width / 2, cardY + 70);

            ctx.fillStyle = '#58a6ff';
            ctx.font = '11px -apple-system, sans-serif';
            ctx.fillText('Click Restart to Play Again', canvas.width / 2, cardY + 115);
            ctx.textAlign = 'left';

        } else if (isPaused) {
            ctx.fillStyle = 'rgba(9, 13, 18, 0.75)';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = '#f0f6fc';
            ctx.font = '600 16px -apple-system, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('PAUSED', canvas.width / 2, canvas.height / 2);
            ctx.textAlign = 'left';
        }

        if (flashDurationRemaining > 0) {
            const progress = flashDurationRemaining / FLASH_DURATION;
            const alpha = Math.pow(progress, 2) * FLASH_MAX_OPACITY;
            ctx.fillStyle = `rgba(224, 242, 254, ${alpha})`;
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            flashDurationRemaining = Math.max(0, flashDurationRemaining - deltaMs);
        }

        particleSystem.draw(ctx);
        ctx.restore();
    }

    function mainGameLoop(timestamp) {
        const deltaMs = Math.min(timestamp - lastTimestamp, 50);
        lastTimestamp = timestamp;

        updateLogic(deltaMs);
        draw(deltaMs);
        updateDOMHud();

        requestAnimationFrame(mainGameLoop);
    }

    function matchesKeybind(eventKey, bindList) {
        return Array.isArray(bindList) && bindList.includes(eventKey);
    }

    document.addEventListener('keydown', (e) => {
        if (matchesKeybind(e.key, keybinds.pause)) {
            togglePause();
            return;
        }

        if (isPaused || isGameOver || !currentShape || clearingLines.length > 0) return;

        const isGameplayKey = Object.values(keybinds).some(list => list.includes(e.key));
        if (isGameplayKey) onGameplayInput();

        if (matchesKeybind(e.key, keybinds.moveLeft)) {
            if (!checkCollision(currentShape, currentX - 1, currentY)) {
                currentX--;
                playSound('move');
                hasSwapped = false;
                isLocked = false;
            }
        } else if (matchesKeybind(e.key, keybinds.moveRight)) {
            if (!checkCollision(currentShape, currentX + 1, currentY)) {
                currentX++;
                playSound('move');
                hasSwapped = false;
                isLocked = false;
            }
        } else if (matchesKeybind(e.key, keybinds.softDrop)) {
            if (!checkCollision(currentShape, currentX, currentY + 1)) {
                currentY++;
            }
        } else if (matchesKeybind(e.key, keybinds.rotate)) {
            rotateShape();
        } else if (matchesKeybind(e.key, keybinds.hardDrop)) {
            e.preventDefault();
            dropShape();
        } else if (matchesKeybind(e.key, keybinds.bestMatch)) {
            e.preventDefault();
            applyBestMatch();
        } else if (matchesKeybind(e.key, keybinds.hold)) {
            holdPiece();
        }
    });

    document.querySelectorAll('.touch-btn').forEach(btn => {
        const action = btn.getAttribute('data-action');
        btn.addEventListener('touchstart', (e) => {
            e.preventDefault();
            onGameplayInput();
            if (isPaused || isGameOver) return;

            switch (action) {
                case 'moveLeft':
                    if (!checkCollision(currentShape, currentX - 1, currentY)) {
                        currentX--;
                        playSound('move');
                        hasSwapped = false;
                    }
                    break;
                case 'moveRight':
                    if (!checkCollision(currentShape, currentX + 1, currentY)) {
                        currentX++;
                        playSound('move');
                        hasSwapped = false;
                    }
                    break;
                case 'softDrop':
                    if (!checkCollision(currentShape, currentX, currentY + 1)) currentY++;
                    break;
                case 'rotate':
                    rotateShape();
                    break;
                case 'hardDrop':
                    dropShape();
                    break;
                case 'hold':
                    holdPiece();
                    break;
                case 'bestMatch':
                    applyBestMatch();
                    break;
            }
        }, { passive: false });
    });

    let touchStartX = 0;
    let touchStartY = 0;
    let touchStartTime = 0;

    canvas.addEventListener('touchstart', (e) => {
        if (e.touches.length === 1) {
            touchStartX = e.touches[0].clientX;
            touchStartY = e.touches[0].clientY;
            touchStartTime = performance.now();
        }
    }, { passive: true });

    canvas.addEventListener('touchend', (e) => {
        if (isPaused || isGameOver || !currentShape) return;
        onGameplayInput();

        const touchEndX = e.changedTouches[0].clientX;
        const touchEndY = e.changedTouches[0].clientY;
        const dx = touchEndX - touchStartX;
        const dy = touchEndY - touchStartY;
        const duration = performance.now() - touchStartTime;

        if (Math.hypot(dx, dy) < 15 && duration < 250) {
            rotateShape();
            return;
        }

        if (Math.abs(dx) > Math.abs(dy)) {
            if (dx > 30 && !checkCollision(currentShape, currentX + 1, currentY)) {
                currentX++;
                playSound('move');
            } else if (dx < -30 && !checkCollision(currentShape, currentX - 1, currentY)) {
                currentX--;
                playSound('move');
            }
        } else {
            if (dy > 30) {
                dropShape();
            }
        }
    }, { passive: true });

    if (pauseButton) {
        pauseButton.addEventListener('click', () => {
            initAudio();
            togglePause();
        });
    }

    if (togglePanelButton && controlsPanel) {
        togglePanelButton.addEventListener('click', () => {
            const isHidden = !controlsPanel.hidden;
            controlsPanel.hidden = isHidden;
            togglePanelButton.textContent = isHidden ? 'Show Panel' : 'Hide Panel';
        });
    }

    if (restartButton) {
        restartButton.addEventListener('click', () => {
            initAudio();
            resetGame(true);
        });
    }

    renderProbabilityControls();
    resetGame(true);
    requestAnimationFrame(mainGameLoop);
});