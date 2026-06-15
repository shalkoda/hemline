// Trend map renderer
let frames = [];
let currentFrameIndex = 0;
let isPlaying = false;
let animationId = null;
let useReach = false;

const canvas = document.getElementById('trendMap');
const ctx = canvas.getContext('2d');
const playPauseBtn = document.getElementById('playPause');
const scrubber = document.getElementById('seasonScrubber');
const currentSeasonSpan = document.getElementById('currentSeason');
const sizeToggle = document.getElementById('sizeToggle');
const sizeModeSpan = document.getElementById('sizeMode');
const trendingList = document.getElementById('trendingList');

// Resize canvas to fit container
function resizeCanvas() {
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * window.devicePixelRatio;
    canvas.height = rect.height * window.devicePixelRatio;
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    canvas.style.width = rect.width + 'px';
    canvas.style.height = rect.height + 'px';
}

window.addEventListener('resize', () => {
    resizeCanvas();
    render();
});

// Fetch frames from API
async function loadFrames() {
    try {
        const response = await fetch('/api/frames');
        frames = await response.json();
        scrubber.max = frames.length - 1;
        render();
        updateTrendingList();
    } catch (error) {
        console.error('Failed to load frames:', error);
    }
}

// Hex to RGB
function hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
    } : { r: 255, g: 255, b: 255 };
}

// Desaturate color based on momentum
function adjustColorForMomentum(hex, momentum) {
    const rgb = hexToRgb(hex);
    const saturation = Math.max(0.3, Math.min(1.0, 0.7 + momentum * 0.6));

    // Convert to grayscale for low momentum
    const gray = (rgb.r + rgb.g + rgb.b) / 3;
    const r = Math.round(rgb.r * saturation + gray * (1 - saturation));
    const g = Math.round(rgb.g * saturation + gray * (1 - saturation));
    const b = Math.round(rgb.b * saturation + gray * (1 - saturation));

    return { r, g, b };
}

// Draw a single trend
function drawTrend(trend, prevPositions = []) {
    const rect = canvas.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;

    const x = trend.x * width;
    const y = trend.y * height;

    const size = useReach ? trend.reach : trend.weight;
    const baseRadius = Math.max(20, size * 80);

    const rgb = adjustColorForMomentum(trend.color, trend.momentum);

    // Set blend mode to additive (lighter)
    ctx.globalCompositeOperation = 'lighter';

    // Draw trail from previous positions
    if (prevPositions.length > 0) {
        ctx.globalAlpha = 0.15;
        prevPositions.forEach((pos, i) => {
            const trailX = pos.x * width;
            const trailY = pos.y * height;
            const alpha = (i + 1) / prevPositions.length * 0.3;

            const gradient = ctx.createRadialGradient(trailX, trailY, 0, trailX, trailY, baseRadius * 0.5);
            gradient.addColorStop(0, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`);
            gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');

            ctx.fillStyle = gradient;
            ctx.fillRect(0, 0, width, height);
        });
    }

    // Draw halo (all looks, soft glow)
    ctx.globalAlpha = 0.25;
    const haloGradient = ctx.createRadialGradient(x, y, 0, x, y, baseRadius * 1.5);
    haloGradient.addColorStop(0, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.4)`);
    haloGradient.addColorStop(0.6, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.1)`);
    haloGradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = haloGradient;
    ctx.fillRect(0, 0, width, height);

    // Draw core (major houses, bright center)
    const coreSize = baseRadius * trend.major_share;
    ctx.globalAlpha = 0.7;
    const coreGradient = ctx.createRadialGradient(x, y, 0, x, y, coreSize);
    coreGradient.addColorStop(0, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.9)`);
    coreGradient.addColorStop(0.5, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.5)`);
    coreGradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = coreGradient;
    ctx.fillRect(0, 0, width, height);

    // Reset composite operation
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1.0;

    // Draw label
    ctx.fillStyle = '#e8e8e8';
    ctx.font = '11px SF Mono, Monaco, monospace';
    ctx.textAlign = 'center';
    ctx.fillText(trend.name, x, y + baseRadius * 1.8);
}

// Render current frame
function render() {
    if (frames.length === 0) return;

    const rect = canvas.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;

    // Clear with dark background
    ctx.fillStyle = '#08080d';
    ctx.fillRect(0, 0, width, height);

    const currentFrame = frames[currentFrameIndex];

    // Build trend history for trails
    const trendHistory = {};
    for (let i = Math.max(0, currentFrameIndex - 2); i < currentFrameIndex; i++) {
        frames[i].trends.forEach(trend => {
            if (!trendHistory[trend.id]) {
                trendHistory[trend.id] = [];
            }
            trendHistory[trend.id].push({ x: trend.x, y: trend.y });
        });
    }

    // Sort trends by size (draw larger ones first, smaller on top)
    const sortedTrends = [...currentFrame.trends].sort((a, b) => {
        const sizeA = useReach ? a.reach : a.weight;
        const sizeB = useReach ? b.reach : b.weight;
        return sizeB - sizeA;
    });

    // Draw all trends
    sortedTrends.forEach(trend => {
        const prevPositions = trendHistory[trend.id] || [];
        drawTrend(trend, prevPositions);
    });

    // Update season display
    currentSeasonSpan.textContent = currentFrame.season;
}

// Update trending list
function updateTrendingList() {
    if (frames.length === 0) return;

    const currentFrame = frames[currentFrameIndex];
    const topTrends = [...currentFrame.trends]
        .sort((a, b) => b.momentum - a.momentum)
        .slice(0, 5);

    trendingList.innerHTML = topTrends.map(trend => {
        const indicator = trend.momentum > 0 ? '↑' : trend.momentum < 0 ? '↓' : '−';
        const momentumClass = trend.momentum > 0 ? 'up' : 'down';

        return `
            <li>
                <span class="trend-color" style="background: ${trend.color}"></span>
                <span class="trend-name">${trend.name}</span>
                <span class="momentum-indicator ${momentumClass}">${indicator}</span>
            </li>
        `;
    }).join('');
}

// Animation loop
function animate() {
    if (!isPlaying) return;

    currentFrameIndex++;
    if (currentFrameIndex >= frames.length) {
        currentFrameIndex = 0;
    }

    scrubber.value = currentFrameIndex;
    render();
    updateTrendingList();

    animationId = setTimeout(() => {
        requestAnimationFrame(animate);
    }, 1500);
}

// Controls
playPauseBtn.addEventListener('click', () => {
    isPlaying = !isPlaying;
    playPauseBtn.textContent = isPlaying ? '⏸' : '▶';

    if (isPlaying) {
        animate();
    } else if (animationId) {
        clearTimeout(animationId);
        animationId = null;
    }
});

scrubber.addEventListener('input', (e) => {
    currentFrameIndex = parseInt(e.target.value);
    render();
    updateTrendingList();

    if (isPlaying) {
        isPlaying = false;
        playPauseBtn.textContent = '▶';
        if (animationId) {
            clearTimeout(animationId);
            animationId = null;
        }
    }
});

sizeToggle.addEventListener('change', (e) => {
    useReach = e.target.checked;
    sizeModeSpan.textContent = useReach ? 'reach' : 'adoption';
    render();
});

// Font switcher
const fontSelect = document.getElementById('fontSelect');
if (fontSelect) {
    fontSelect.addEventListener('change', (e) => {
        const body = document.body;
        body.classList.remove('font-space', 'font-playfair');
        if (e.target.value === 'space') {
            body.classList.add('font-space');
        } else if (e.target.value === 'playfair') {
            body.classList.add('font-playfair');
        }
    });
}

// Initialize
resizeCanvas();
loadFrames();
