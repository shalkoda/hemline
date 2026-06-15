// Trend map renderer
let frames = [];
let currentFrameIndex = 0;
let isPlaying = false;
let animationId = null;
let useReach = false;

// Interpolation state
let animPos = 0;         // continuous float position (e.g. 1.4 = between frame 1 and 2)
let animStartTime = null;
const SEASON_DURATION = 1800; // ms per season transition

const canvas = document.getElementById('trendMap');
const ctx = canvas.getContext('2d');
const playPauseBtn = document.getElementById('playPause');
const scrubber = document.getElementById('seasonScrubber');
const currentSeasonSpan = document.getElementById('currentSeason');
const sizeToggle = document.getElementById('sizeToggle');
const sizeModeSpan = document.getElementById('sizeMode');
const trendingList = document.getElementById('trendingList');
const timelineEl = document.getElementById('timeline');

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
    renderAt(animPos);
});

// Fetch frames from API
async function loadFrames() {
    try {
        const response = await fetch('/api/frames');
        frames = await response.json();
        scrubber.max = frames.length - 1;
        animPos = 0;
        buildTimeline();
        renderAt(0);
        updateTrendingList(0);
    } catch (error) {
        console.error('Failed to load frames:', error);
    }
}

// Build timeline season labels
function buildTimeline() {
    if (!timelineEl || frames.length === 0) return;
    timelineEl.innerHTML = '';
    frames.forEach((frame, i) => {
        const span = document.createElement('span');
        span.className = 'season';
        span.textContent = frame.season;
        span.dataset.index = i;
        timelineEl.appendChild(span);
    });
    updateTimeline(0);
}

// Update timeline shading based on continuous float position
function updateTimeline(pos) {
    if (!timelineEl) return;
    const seasons = timelineEl.querySelectorAll('.season');
    seasons.forEach((el, i) => {
        const dist = Math.abs(i - pos);
        const opacity = Math.max(0.18, 1 - dist * 0.55);
        el.style.color = `rgba(232, 232, 232, ${opacity.toFixed(3)})`;
    });
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
    const gray = (rgb.r + rgb.g + rgb.b) / 3;
    const r = Math.round(rgb.r * saturation + gray * (1 - saturation));
    const g = Math.round(rgb.g * saturation + gray * (1 - saturation));
    const b = Math.round(rgb.b * saturation + gray * (1 - saturation));
    return { r, g, b };
}

// Linear interpolation
function lerp(a, b, t) {
    return a + (b - a) * t;
}

// Ease in-out cubic
function easeInOut(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

// Build an interpolated trend list between two frames at blend factor t (0–1)
function interpolateFrame(frameA, frameB, t) {
    const et = easeInOut(t);
    const trendsB = {};
    frameB.trends.forEach(tr => { trendsB[tr.id] = tr; });

    return frameA.trends.map(trA => {
        const trB = trendsB[trA.id];
        if (!trB) return { ...trA };
        return {
            ...trA,
            x: lerp(trA.x, trB.x, et),
            y: lerp(trA.y, trB.y, et),
            weight: lerp(trA.weight, trB.weight, et),
            reach: lerp(trA.reach, trB.reach, et),
            major_share: lerp(trA.major_share, trB.major_share, et),
            momentum: lerp(trA.momentum, trB.momentum, et),
        };
    });
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

    // Halo
    ctx.globalAlpha = 0.25;
    const haloGradient = ctx.createRadialGradient(x, y, 0, x, y, baseRadius * 1.5);
    haloGradient.addColorStop(0, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.4)`);
    haloGradient.addColorStop(0.6, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.1)`);
    haloGradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = haloGradient;
    ctx.fillRect(0, 0, width, height);

    // Core
    const coreSize = baseRadius * trend.major_share;
    ctx.globalAlpha = 0.7;
    const coreGradient = ctx.createRadialGradient(x, y, 0, x, y, coreSize);
    coreGradient.addColorStop(0, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.9)`);
    coreGradient.addColorStop(0.5, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.5)`);
    coreGradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = coreGradient;
    ctx.fillRect(0, 0, width, height);

    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1.0;

    // Label
    ctx.fillStyle = '#e8e8e8';
    ctx.font = '11px "Space Grotesk", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(trend.name, x, y + baseRadius * 1.8);
}

// Render at a continuous float position (e.g. 1.4 = blending frames 1→2 at 40%)
function renderAt(pos) {
    if (frames.length === 0) return;

    const rect = canvas.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;

    ctx.fillStyle = '#08080d';
    ctx.fillRect(0, 0, width, height);

    const idxA = Math.min(Math.floor(pos), frames.length - 1);
    const idxB = Math.min(idxA + 1, frames.length - 1);
    const t = pos - idxA;

    // Build interpolated trends
    const trends = idxA === idxB ? frames[idxA].trends : interpolateFrame(frames[idxA], frames[idxB], t);

    // Build trail history from previous integer frames
    const trendHistory = {};
    for (let i = Math.max(0, idxA - 2); i < idxA; i++) {
        frames[i].trends.forEach(tr => {
            if (!trendHistory[tr.id]) trendHistory[tr.id] = [];
            trendHistory[tr.id].push({ x: tr.x, y: tr.y });
        });
    }

    // Draw larger blobs first
    const sorted = [...trends].sort((a, b) => {
        return (useReach ? b.reach : b.weight) - (useReach ? a.reach : a.weight);
    });

    sorted.forEach(trend => {
        drawTrend(trend, trendHistory[trend.id] || []);
    });

    // Season label: show A until we're past midpoint, then B
    const displayFrame = t < 0.5 ? frames[idxA] : frames[idxB];
    currentSeasonSpan.textContent = displayFrame.season;
}

// Update trending list
function updateTrendingList(frameIdx) {
    if (frames.length === 0) return;
    const idx = Math.round(frameIdx ?? currentFrameIndex);
    const frame = frames[Math.min(idx, frames.length - 1)];
    const topTrends = [...frame.trends]
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

// Animation loop using requestAnimationFrame for smooth interpolation
function animate(timestamp) {
    if (!isPlaying) return;

    if (animStartTime === null) {
        animStartTime = timestamp;
    }

    const elapsed = timestamp - animStartTime;
    const progress = Math.min(elapsed / SEASON_DURATION, 1);

    // Interpolate animPos from currentFrameIndex toward next
    const targetIndex = currentFrameIndex + 1;
    animPos = currentFrameIndex + progress;

    renderAt(animPos);
    scrubber.value = animPos;
    updateTimeline(animPos);

    if (progress < 1) {
        animationId = requestAnimationFrame(animate);
    } else {
        // Advance to next frame
        currentFrameIndex = targetIndex >= frames.length ? 0 : targetIndex;
        animPos = currentFrameIndex;
        animStartTime = null;
        updateTrendingList(currentFrameIndex);
        scrubber.value = animPos;
        updateTimeline(animPos);

        if (isPlaying) {
            animationId = requestAnimationFrame(animate);
        }
    }
}

// Controls
playPauseBtn.addEventListener('click', () => {
    isPlaying = !isPlaying;
    playPauseBtn.textContent = isPlaying ? '⏸' : '▶';

    if (isPlaying) {
        animStartTime = null;
        animationId = requestAnimationFrame(animate);
    } else {
        if (animationId) {
            cancelAnimationFrame(animationId);
            animationId = null;
        }
    }
});

scrubber.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    animPos = val;
    currentFrameIndex = Math.round(val);
    renderAt(val);
    updateTrendingList(val);
    updateTimeline(val);

    if (isPlaying) {
        isPlaying = false;
        playPauseBtn.textContent = '▶';
        if (animationId) {
            cancelAnimationFrame(animationId);
            animationId = null;
        }
    }
});

sizeToggle.addEventListener('change', (e) => {
    useReach = e.target.checked;
    sizeModeSpan.textContent = useReach ? 'reach' : 'adoption';
    renderAt(animPos);
});

// Initialize
resizeCanvas();
loadFrames();
