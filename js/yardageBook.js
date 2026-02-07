// Yardage Book modal - captures the actual game world rendering
// No separate re-rendering - just a screenshot of the 3D world from top-down view
import { getSlopeAt, findGreenFront, getTerrainAt, TerrainType, getElevationAt, setCourse } from './terrain.js';
import { golfer } from './golfer.js';
import { shotClubs } from './clubs.js';
import { treeProperties } from './trees.js';
import { 
    WORLD_SCALE, 
    clamp, 
    yardsToWorld,
    worldToYards,
    findCircleCentrelineIntersection,
    isPointInPolygon,
    distanceToSegment,
    lineSegmentIntersect
} from './utils.js';

let currentPage = 'hole'; // 'hole', 'golfer', 'green', 'clubs', or 'course'
let worldInstance = null; // Reference to the game world for capturing
let objectsToHideList = []; // Objects to hide during capture (aim line, ball, etc.)
let ballInstance = null; // Reference to the ball for position display

// Wind state - persists across yardage book opens
let windDirection = Math.floor(Math.random() * 360); // 0-359 degrees (0 = North)
let windSpeed = 5 + Math.floor(Math.random() * 10); // 5-15 mph
let lastWindChange = Date.now();
const WIND_CHANGE_INTERVAL = 60000; // Check for wind change every 60 seconds
const WIND_CHANGE_CHANCE = 0.3; // 30% chance to change when checked

// Get current wind (may randomly change)
export function getWind() {
    const now = Date.now();
    if (now - lastWindChange > WIND_CHANGE_INTERVAL) {
        lastWindChange = now;
        if (Math.random() < WIND_CHANGE_CHANCE) {
            // Randomly change direction, speed, or both
            const changeType = Math.random();
            if (changeType < 0.4) {
                // Change direction only (small adjustment)
                windDirection = (windDirection + Math.floor(Math.random() * 60) - 30 + 360) % 360;
            } else if (changeType < 0.7) {
                // Change speed only
                windSpeed = Math.max(0, Math.min(25, windSpeed + Math.floor(Math.random() * 8) - 4));
            } else {
                // Change both
                windDirection = (windDirection + Math.floor(Math.random() * 90) - 45 + 360) % 360;
                windSpeed = Math.max(0, Math.min(25, windSpeed + Math.floor(Math.random() * 10) - 5));
            }
        }
    }
    return { direction: windDirection, speed: windSpeed };
}

// Convert degrees to compass abbreviation
function degreesToCompass(degrees) {
    const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 
                        'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
    const index = Math.round(degrees / 22.5) % 16;
    return directions[index];
}

// Set the world instance (called from ui.js)
export function setYardageBookWorld(world) {
    worldInstance = world;
}

// Set objects to hide during capture
export function setObjectsToHide(objects) {
    objectsToHideList = objects || [];
}

// Set the ball instance (called from ui.js)
export function setYardageBookBall(ball) {
    ballInstance = ball;
}

// Convert world coordinates to screen position on the 2D canvas
// Applies rotation so tee is at bottom, hole at top
function worldToCapture(worldX, worldY, captureData) {
    const { centerWorld, rotationAngle, viewWidth, viewHeight, width, height } = captureData;
    
    // Offset from center
    const ox = worldX - centerWorld.x;
    const oy = worldY - centerWorld.y;
    
    // Apply rotation
    const cos = Math.cos(rotationAngle);
    const sin = Math.sin(rotationAngle);
    const rx = ox * cos + oy * sin;
    const ry = -ox * sin + oy * cos;
    
    // Convert to pixel coordinates
    const pxX = (rx / viewWidth + 0.5) * width;
    const pxY = (ry / viewHeight + 0.5) * height;
    
    return { x: pxX, y: pxY };
}

// Find where centreline intersects a zone (tee or green)
// Calculate reference points: front of tee and front of green
// Uses shared findGreenFront from terrain.js, tee front uses tee position
function calculateReferencePoints(hole) {
    return {
        teeFront: hole.tee ? { x: hole.tee.x, y: hole.tee.y } : null,
        greenFront: findGreenFront(hole)
    };
}

export function showYardageBook(hole) {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    
    const modal = document.createElement('div');
    modal.className = 'modal yardage-modal';
    
    renderPage(modal, hole);
    
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) overlay.remove();
    });
}

function renderPage(modal, hole) {
    if (currentPage === 'hole') {
        renderHolePage(modal, hole);
    } else if (currentPage === 'green') {
        renderGreenPage(modal, hole);
    } else if (currentPage === 'golfer') {
        renderGolferPage(modal, hole);
    } else if (currentPage === 'course') {
        renderCoursePage(modal, hole);
    } else {
        renderClubsPage(modal, hole);
    }
}

function renderHolePage(modal, hole) {
    modal.innerHTML = `
        <div class="yardage-header">
            <div class="modal-title">${hole.name} - Par ${hole.par}</div>
            <div class="yardage-tabs">
                <button class="yardage-tab-btn" id="green-tab">Green</button>
                <button class="yardage-tab-btn" id="clubs-tab">Clubs</button>
                <button class="yardage-tab-btn" id="golfer-tab">Golfer</button>
                <button class="yardage-tab-btn" id="course-tab">Course</button>
                <button class="yardage-close-btn" id="close-btn">✕</button>
            </div>
        </div>
        <div class="yardage-map-container">
            <div class="yardage-map-hole" id="yardage-map-hole">
                <div class="yardage-loading">Capturing view...</div>
            </div>
        </div>
    `;
    
    modal.querySelector('#close-btn').addEventListener('click', () => {
        modal.closest('.modal-overlay').remove();
    });
    modal.querySelector('#golfer-tab').addEventListener('click', () => {
        currentPage = 'golfer';
        renderPage(modal, hole);
    });
    modal.querySelector('#clubs-tab').addEventListener('click', () => {
        currentPage = 'clubs';
        renderPage(modal, hole);
    });
    modal.querySelector('#green-tab').addEventListener('click', () => {
        currentPage = 'green';
        renderPage(modal, hole);
    });
    modal.querySelector('#course-tab').addEventListener('click', () => {
        currentPage = 'course';
        renderPage(modal, hole);
    });
    
    // Capture the world view after a brief delay to let modal render
    requestAnimationFrame(() => {
        renderCapturedHoleMap(modal, hole);
    });
}

function renderCapturedHoleMap(modal, hole) {
    const mapContainer = modal.querySelector('#yardage-map-hole');
    if (!mapContainer) return;
    
    // Get container dimensions
    const containerRect = mapContainer.getBoundingClientRect();
    const width = Math.floor(containerRect.width) || 400;
    const height = Math.floor(containerRect.height) || 500;
    
    // Clear loading message
    mapContainer.innerHTML = '';
    
    // Get terrain data
    let terrain = null;
    let trees = null;
    if (worldInstance && worldInstance.course) {
        terrain = worldInstance.course.terrain;
        trees = worldInstance.course.trees;
    }
    
    // Calculate bounds for the hole
    const bounds = calculateHoleBounds2D(hole, terrain, trees);
    
    // Calculate rotation angle to orient tee at bottom, hole at top
    const teePos = hole.tee;
    const holePos = hole.hole;
    const dx = holePos.x - teePos.x;
    const dy = holePos.y - teePos.y;
    const rotationAngle = Math.atan2(dx, -dy);
    
    // Calculate view dimensions
    const boundsWidth = bounds.maxX - bounds.minX;
    const boundsHeight = bounds.maxY - bounds.minY;
    const aspect = width / height;
    
    let viewWidth, viewHeight;
    if (boundsWidth / boundsHeight > aspect) {
        viewWidth = boundsWidth * 1.1;
        viewHeight = viewWidth / aspect;
    } else {
        viewHeight = boundsHeight * 1.1;
        viewWidth = viewHeight * aspect;
    }
    
    const centerX = (bounds.minX + bounds.maxX) / 2;
    const centerY = (bounds.minY + bounds.maxY) / 2;
    
    // Create canvas for 2D rendering
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    canvas.style.cssText = 'position: absolute; left: 0; top: 0; width: 100%; height: 100%;';
    
    const ctx = canvas.getContext('2d');
    
    // Fill with light green (rough/grass base)
    ctx.fillStyle = '#90c090';
    ctx.fillRect(0, 0, width, height);
    
    // Helper to convert world coords to canvas coords (with rotation)
    function worldToCanvas(worldX, worldY) {
        // Offset from center
        const ox = worldX - centerX;
        const oy = worldY - centerY;
        
        // Apply rotation
        const cos = Math.cos(rotationAngle);
        const sin = Math.sin(rotationAngle);
        const rx = ox * cos + oy * sin;
        const ry = -ox * sin + oy * cos;
        
        // Convert to canvas coords
        const px = (rx / viewWidth + 0.5) * width;
        const py = (ry / viewHeight + 0.5) * height;
        
        return { x: px, y: py };
    }
    
    // Draw terrain features
    if (terrain) {
        // Draw fairway (lighter green than rough)
        ctx.fillStyle = '#b8e8b8';
        drawTerrainFeatures(ctx, terrain.fairway, worldToCanvas);
        
        // Draw tee box (same as fairway)
        ctx.fillStyle = '#b8e8b8';
        drawTerrainFeatures(ctx, terrain.teeBox, worldToCanvas);
        
        // Draw path (light tan/gray cart path)
        ctx.strokeStyle = '#c8c0b0';
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        drawPathFeatures(ctx, terrain.path, worldToCanvas, viewWidth, width);
        
        // Draw water (light blue)
        ctx.fillStyle = '#a0c8e8';
        drawTerrainFeatures(ctx, terrain.water, worldToCanvas);
        
        // Draw bunkers (light yellow/sand)
        ctx.fillStyle = '#e8dca0';
        drawTerrainFeatures(ctx, terrain.bunker, worldToCanvas);
        
        // Draw green (slightly different green)
        ctx.fillStyle = '#98e898';
        drawTerrainFeatures(ctx, terrain.green, worldToCanvas);
    }
    
    // Draw trees (flattened 2D canopy clusters with black dot for trunk)
    if (trees) {
        trees.forEach(tree => {
            const props = treeProperties[tree.type];
            if (!props) return;
            
            const pos = worldToCanvas(tree.x, tree.y);
            const canopyRadius = (props.canopyRadius.min + props.canopyRadius.max) / 2;
            const category = props.category;
            
            // Generate seed from tree position for consistent randomness
            const seed = Math.abs(tree.x * 1000 + tree.y * 7);
            
            // Draw flattened canopy clusters
            ctx.fillStyle = 'rgba(34, 85, 34, 0.5)';
            drawTree2DCanopy(ctx, pos, canopyRadius, category, seed, viewWidth, width, rotationAngle);
            
            // Black dot for trunk
            ctx.fillStyle = 'black';
            ctx.beginPath();
            ctx.arc(pos.x, pos.y, 2, 0, Math.PI * 2);
            ctx.fill();
        });
    }
    
    mapContainer.appendChild(canvas);
    
    // Store capture data for overlay positioning
    const captureData = {
        centerWorld: { x: centerX, y: centerY },
        rotationAngle: rotationAngle,
        viewWidth: viewWidth,
        viewHeight: viewHeight,
        width: width,
        height: height
    };
    
    // Add overlays (yardage markers, slope arrows, etc.)
    renderYardageOverlays(mapContainer, hole, captureData);
    
    // Add compass rose (top of map is north in elevation grid, but map is rotated)
    addCompassRose(mapContainer, rotationAngle);
}

// Calculate bounds for 2D rendering
function calculateHoleBounds2D(hole, terrain, trees, padding = 15) {
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    
    // Include tee and hole positions
    if (hole.tee) {
        minX = Math.min(minX, hole.tee.x);
        maxX = Math.max(maxX, hole.tee.x);
        minY = Math.min(minY, hole.tee.y);
        maxY = Math.max(maxY, hole.tee.y);
    }
    
    if (hole.hole) {
        minX = Math.min(minX, hole.hole.x);
        maxX = Math.max(maxX, hole.hole.x);
        minY = Math.min(minY, hole.hole.y);
        maxY = Math.max(maxY, hole.hole.y);
    }
    
    // Include terrain features
    if (terrain) {
        const allFeatures = [
            ...(terrain.fairway || []),
            ...(terrain.teeBox || []),
            ...(terrain.bunker || []),
            ...(terrain.water || []),
            ...(terrain.green || []),
            ...(terrain.outOfBounds || [])
        ];
        
        allFeatures.forEach(feature => {
            if (feature.shape === 'rect') {
                minX = Math.min(minX, feature.x);
                maxX = Math.max(maxX, feature.x + feature.width);
                minY = Math.min(minY, feature.y);
                maxY = Math.max(maxY, feature.y + feature.height);
            } else if (feature.shape === 'ellipse') {
                minX = Math.min(minX, feature.cx - feature.rx);
                maxX = Math.max(maxX, feature.cx + feature.rx);
                minY = Math.min(minY, feature.cy - feature.ry);
                maxY = Math.max(maxY, feature.cy + feature.ry);
            } else if (feature.shape === 'polygon' && feature.points) {
                feature.points.forEach(p => {
                    minX = Math.min(minX, p[0]);
                    maxX = Math.max(maxX, p[0]);
                    minY = Math.min(minY, p[1]);
                    maxY = Math.max(maxY, p[1]);
                });
            }
        });
        
        // Include paths
        if (terrain.path) {
            terrain.path.forEach(path => {
                if (path.points) {
                    path.points.forEach(p => {
                        minX = Math.min(minX, p[0]);
                        maxX = Math.max(maxX, p[0]);
                        minY = Math.min(minY, p[1]);
                        maxY = Math.max(maxY, p[1]);
                    });
                }
            });
        }
    }
    
    // Include trees
    if (trees) {
        trees.forEach(tree => {
            minX = Math.min(minX, tree.x - 5);
            maxX = Math.max(maxX, tree.x + 5);
            minY = Math.min(minY, tree.y - 5);
            maxY = Math.max(maxY, tree.y + 5);
        });
    }
    
    // Fallback
    if (minX === Infinity) {
        minX = 0; maxX = 100; minY = 0; maxY = 100;
    }
    
    // Add padding
    minX -= padding;
    maxX += padding;
    minY -= padding;
    maxY += padding;
    
    return { minX, maxX, minY, maxY };
}

// Seeded random for consistent tree canopy generation (matches trees.js)
function seededRandom(seed) {
    const x = Math.sin(seed * 9999) * 10000;
    return x - Math.floor(x);
}

// Draw flattened 2D tree canopy based on tree type
function drawTree2DCanopy(ctx, pos, canopyRadius, category, seed, viewWidth, canvasWidth, rotationAngle) {
    const scale = canvasWidth / viewWidth;
    
    if (category === 'tall_pine') {
        // Tall pines - sparse clusters at branch ends, mostly at top
        const branchCount = 4 + Math.floor(seededRandom(seed + 20) * 3);
        
        for (let i = 0; i < branchCount; i++) {
            const angle = seededRandom(seed + 40 + i) * Math.PI * 2 + rotationAngle;
            const branchLength = canopyRadius * (0.4 + seededRandom(seed + 50 + i) * 0.5);
            
            // 1-2 clusters per branch
            const clusterCount = 1 + Math.floor(seededRandom(seed + 70 + i) * 2);
            for (let j = 0; j < clusterCount; j++) {
                const clusterSize = canopyRadius * (0.25 + seededRandom(seed + 80 + i * 10 + j) * 0.3);
                const dist = branchLength * (0.6 + seededRandom(seed + 90 + i * 10 + j) * 0.4);
                
                const cx = pos.x + Math.cos(angle) * dist * scale;
                const cy = pos.y + Math.sin(angle) * dist * scale;
                const r = Math.max(clusterSize * scale, 3);
                
                ctx.beginPath();
                ctx.arc(cx, cy, r, 0, Math.PI * 2);
                ctx.fill();
            }
        }
        
        // Small top cluster
        const topSize = canopyRadius * 0.4;
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, Math.max(topSize * scale, 3), 0, Math.PI * 2);
        ctx.fill();
        
    } else if (category === 'short_pine') {
        // Short pines - denser, more clusters
        const branchCount = 5 + Math.floor(seededRandom(seed + 20) * 3);
        
        for (let i = 0; i < branchCount; i++) {
            const angle = seededRandom(seed + 40 + i) * Math.PI * 2 + rotationAngle;
            const branchLength = canopyRadius * (0.5 + seededRandom(seed + 50 + i) * 0.5);
            
            const clusterCount = 2 + Math.floor(seededRandom(seed + 70 + i) * 2);
            for (let j = 0; j < clusterCount; j++) {
                const clusterSize = canopyRadius * (0.3 + seededRandom(seed + 80 + i * 10 + j) * 0.3);
                const dist = branchLength * (0.5 + seededRandom(seed + 90 + i * 10 + j) * 0.5);
                
                const cx = pos.x + Math.cos(angle) * dist * scale;
                const cy = pos.y + Math.sin(angle) * dist * scale;
                const r = Math.max(clusterSize * scale, 3);
                
                ctx.beginPath();
                ctx.arc(cx, cy, r, 0, Math.PI * 2);
                ctx.fill();
            }
        }
        
        // Center cluster
        const centerSize = canopyRadius * 0.5;
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, Math.max(centerSize * scale, 4), 0, Math.PI * 2);
        ctx.fill();
        
    } else if (category === 'deciduous') {
        // Deciduous - rounder, fuller canopy with overlapping clusters
        const branchCount = 5 + Math.floor(seededRandom(seed + 20) * 4);
        
        for (let i = 0; i < branchCount; i++) {
            const angle = seededRandom(seed + 40 + i) * Math.PI * 2 + rotationAngle;
            const branchLength = canopyRadius * (0.3 + seededRandom(seed + 50 + i) * 0.6);
            
            const clusterCount = 2 + Math.floor(seededRandom(seed + 70 + i) * 3);
            for (let j = 0; j < clusterCount; j++) {
                const clusterSize = canopyRadius * (0.35 + seededRandom(seed + 80 + i * 10 + j) * 0.4);
                const dist = branchLength * (0.4 + seededRandom(seed + 90 + i * 10 + j) * 0.6);
                
                const cx = pos.x + Math.cos(angle) * dist * scale;
                const cy = pos.y + Math.sin(angle) * dist * scale;
                const r = Math.max(clusterSize * scale, 4);
                
                ctx.beginPath();
                ctx.arc(cx, cy, r, 0, Math.PI * 2);
                ctx.fill();
            }
        }
        
        // Large center cluster for deciduous
        const centerSize = canopyRadius * 0.6;
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, Math.max(centerSize * scale, 5), 0, Math.PI * 2);
        ctx.fill();
        
    } else {
        // Fallback - simple circle
        const r = Math.max(canopyRadius * scale, 4);
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, r, 0, Math.PI * 2);
        ctx.fill();
    }
}

// Draw terrain features on canvas
function drawTerrainFeatures(ctx, features, worldToCanvas) {
    if (!features) return;
    
    features.forEach(feature => {
        if (feature.shape === 'polygon' && feature.points) {
            ctx.beginPath();
            feature.points.forEach((pt, i) => {
                const pos = worldToCanvas(pt[0], pt[1]);
                if (i === 0) ctx.moveTo(pos.x, pos.y);
                else ctx.lineTo(pos.x, pos.y);
            });
            ctx.closePath();
            ctx.fill();
        } else if (feature.shape === 'rect') {
            const tl = worldToCanvas(feature.x, feature.y);
            const tr = worldToCanvas(feature.x + feature.width, feature.y);
            const br = worldToCanvas(feature.x + feature.width, feature.y + feature.height);
            const bl = worldToCanvas(feature.x, feature.y + feature.height);
            
            ctx.beginPath();
            ctx.moveTo(tl.x, tl.y);
            ctx.lineTo(tr.x, tr.y);
            ctx.lineTo(br.x, br.y);
            ctx.lineTo(bl.x, bl.y);
            ctx.closePath();
            ctx.fill();
        } else if (feature.shape === 'ellipse') {
            const center = worldToCanvas(feature.cx, feature.cy);
            // Approximate ellipse radius in pixels (simplified)
            const rx = feature.rx;
            const ry = feature.ry;
            
            ctx.beginPath();
            // Draw ellipse by sampling points
            for (let a = 0; a <= Math.PI * 2; a += 0.1) {
                const wx = feature.cx + rx * Math.cos(a);
                const wy = feature.cy + ry * Math.sin(a);
                const pos = worldToCanvas(wx, wy);
                if (a === 0) ctx.moveTo(pos.x, pos.y);
                else ctx.lineTo(pos.x, pos.y);
            }
            ctx.closePath();
            ctx.fill();
        }
    });
}

// Draw path features on canvas
function drawPathFeatures(ctx, paths, worldToCanvas, viewWidth, canvasWidth) {
    if (!paths) return;
    
    paths.forEach(path => {
        if (path.shape === 'line' && path.points && path.points.length > 1) {
            const lineWidth = (path.width / viewWidth) * canvasWidth;
            ctx.lineWidth = Math.max(lineWidth, 2);
            
            ctx.beginPath();
            path.points.forEach((pt, i) => {
                const pos = worldToCanvas(pt[0], pt[1]);
                if (i === 0) ctx.moveTo(pos.x, pos.y);
                else ctx.lineTo(pos.x, pos.y);
            });
            ctx.stroke();
        }
    });
}

function renderYardageOverlays(container, hole, captureData) {
    // Create SVG overlay for circles and labels
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'yardage-overlay-svg');
    svg.style.cssText = 'position: absolute; left: 0; top: 0; width: 100%; height: 100%; pointer-events: none; z-index: 10;';
    svg.setAttribute('viewBox', `0 0 ${captureData.width} ${captureData.height}`);
    
    const refs = calculateReferencePoints(hole);
    const greenFront = refs.greenFront;
    const teeFront = refs.teeFront;
    
    // === LAYER 1: Terrain outlines (bottom) ===
    addTerrainOutlines(svg, hole, captureData);
    
    // === LAYER 2: Slope arrows ===
    addSlopeArrows(svg, hole, captureData);
    
    // === LAYER 3: Distance circles and markers ===
    // Collect all occupied positions (yardage markers) to avoid label overlap
    const occupiedPositions = [];
    
    // Add fairway yardage markers (100, 150, 200 from front of green)
    if (hole.centreline && greenFront) {
        const markerYardages = [100, 150, 200];
        const markerColors = ['#ff4444', '#ffffff', '#4488ff']; // Red, White, Blue
        
        // Get elevation at front of green for elevation difference calc
        const greenFrontElevation = getElevationAt(hole, greenFront.x, greenFront.y);
        
        markerYardages.forEach((yards, idx) => {
            const radiusWorld = yardsToWorld(yards);
            const markerWorldPos = findCircleCentrelineIntersection(hole.centreline, greenFront, radiusWorld);
            if (markerWorldPos) {
                const pos = worldToCapture(markerWorldPos.x, markerWorldPos.y, captureData);
                
                // Calculate distance from tee
                let yardsFromTee = null;
                if (teeFront) {
                    const dx = markerWorldPos.x - teeFront.x;
                    const dy = markerWorldPos.y - teeFront.y;
                    const distWorld = Math.sqrt(dx * dx + dy * dy);
                    yardsFromTee = Math.round(worldToYards(distWorld));
                }
                
                // Calculate elevation difference to front of green
                const markerElevation = getElevationAt(hole, markerWorldPos.x, markerWorldPos.y);
                const elevDiff = Math.round(greenFrontElevation - markerElevation);
                
                addYardageMarker(svg, pos, markerColors[idx], yards, yardsFromTee, elevDiff);
                occupiedPositions.push({ x: pos.x, y: pos.y, radius: 30 }); // larger radius for labels
            }
        });
    }
    
    // COMMENTED OUT: Concentric distance circles - keeping for future reference
    /*
    // Collect all circle labels first, then filter overlaps
    const circleLabels = [];
    
    // Add distance circles from front of tee (orange)
    if (hole.centreline && teeFront) {
        const teeDistances = [100, 200, 300];
        teeDistances.forEach(yards => {
            const radiusWorld = yardsToWorld(yards);
            const labelWorldPos = findCircleCentrelineIntersection(hole.centreline, teeFront, radiusWorld);
            if (labelWorldPos) {
                const labelPos = worldToCapture(labelWorldPos.x, labelWorldPos.y, captureData);
                circleLabels.push({
                    refPoint: teeFront,
                    yards,
                    radiusWorld,
                    labelPos,
                    circleColor: 'rgba(255,180,80,0.6)',
                    textColor: 'rgba(255,200,100,1)'
                });
            }
        });
    }
    
    // Add distance circles from front of green (green color)
    if (hole.centreline && greenFront) {
        const greenDistances = [50, 100, 150, 200];
        greenDistances.forEach(yards => {
            const radiusWorld = yardsToWorld(yards);
            const labelWorldPos = findCircleCentrelineIntersection([...hole.centreline].reverse(), greenFront, radiusWorld);
            if (labelWorldPos) {
                const labelPos = worldToCapture(labelWorldPos.x, labelWorldPos.y, captureData);
                circleLabels.push({
                    refPoint: greenFront,
                    yards,
                    radiusWorld,
                    labelPos,
                    circleColor: 'rgba(100,200,100,0.6)',
                    textColor: 'rgba(100,220,100,1)'
                });
            }
        });
    }
    
    // Draw circles and labels, skipping labels that overlap
    const labelMinDist = 18; // Minimum distance between label centers
    
    circleLabels.forEach(label => {
        // Draw the circle
        const refPos = worldToCapture(label.refPoint.x, label.refPoint.y, captureData);
        const radiusPx = (label.radiusWorld * WORLD_SCALE / captureData.viewWidth) * captureData.width;
        
        const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        circle.setAttribute('cx', refPos.x);
        circle.setAttribute('cy', refPos.y);
        circle.setAttribute('r', radiusPx);
        circle.setAttribute('fill', 'none');
        circle.setAttribute('stroke', label.circleColor);
        circle.setAttribute('stroke-width', '1.5');
        circle.setAttribute('stroke-dasharray', '6,4');
        svg.appendChild(circle);
        
        // Check if label overlaps with any occupied position
        const overlaps = occupiedPositions.some(pos => {
            const dx = label.labelPos.x - pos.x;
            const dy = label.labelPos.y - pos.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            return dist < (pos.radius + labelMinDist / 2);
        });
        
        if (!overlaps) {
            // Add text label
            const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            text.setAttribute('x', label.labelPos.x);
            text.setAttribute('y', label.labelPos.y);
            text.setAttribute('fill', label.textColor);
            text.setAttribute('font-size', '11');
            text.setAttribute('font-weight', 'bold');
            text.setAttribute('text-anchor', 'middle');
            text.setAttribute('dominant-baseline', 'middle');
            text.setAttribute('stroke', 'rgba(0,0,0,0.5)');
            text.setAttribute('stroke-width', '2');
            text.setAttribute('paint-order', 'stroke');
            text.textContent = label.yards;
            svg.appendChild(text);
            
            // Mark this position as occupied
            occupiedPositions.push({ x: label.labelPos.x, y: label.labelPos.y, radius: labelMinDist / 2 });
        }
    });
    */
    
    // === LAYER 4: Hazard cover yardages (top) ===
    if (hole.centreline && teeFront) {
        addHazardCoverYardages(svg, hole, teeFront, captureData, occupiedPositions);
    }
    
    container.appendChild(svg);
    
    // Add reference markers (quartered circles at front of tee and front of green)
    if (teeFront) {
        addReferenceMarker(container, teeFront, captureData, 'tee');
    }
    if (greenFront) {
        addReferenceMarker(container, greenFront, captureData, 'green');
    }
}

// Kept for reference but no longer used directly
function addDistanceCircle(svg, refPoint, yards, centreline, captureData, circleColor, textColor) {
    const radiusWorld = yardsToWorld(yards);
    const refPos = worldToCapture(refPoint.x, refPoint.y, captureData);
    
    // Calculate radius in pixels
    const WORLD_SCALE = 4;
    const radiusPx = (radiusWorld * WORLD_SCALE / captureData.viewWidth) * captureData.width;
    
    // Create circle
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('cx', refPos.x);
    circle.setAttribute('cy', refPos.y);
    circle.setAttribute('r', radiusPx);
    circle.setAttribute('fill', 'none');
    circle.setAttribute('stroke', circleColor);
    circle.setAttribute('stroke-width', '1.5');
    circle.setAttribute('stroke-dasharray', '6,4');
    svg.appendChild(circle);
    
    // Find label position on centreline
    const labelWorldPos = findCircleCentrelineIntersection(centreline, refPoint, radiusWorld);
    if (labelWorldPos) {
        const labelPos = worldToCapture(labelWorldPos.x, labelWorldPos.y, captureData);
        
        // Add text label
        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('x', labelPos.x);
        text.setAttribute('y', labelPos.y);
        text.setAttribute('fill', textColor);
        text.setAttribute('font-size', '11');
        text.setAttribute('font-weight', 'bold');
        text.setAttribute('text-anchor', 'middle');
        text.setAttribute('dominant-baseline', 'middle');
        text.setAttribute('stroke', 'rgba(0,0,0,0.5)');
        text.setAttribute('stroke-width', '2');
        text.setAttribute('paint-order', 'stroke');
        text.textContent = yards;
        svg.appendChild(text);
    }
}

function addYardageMarker(svg, pos, color, yardsToGreen, yardsFromTee, elevDiff) {
    // Marker circle - smaller with black outline
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('cx', pos.x);
    circle.setAttribute('cy', pos.y);
    circle.setAttribute('r', '3.5');
    circle.setAttribute('fill', color);
    circle.setAttribute('stroke', 'black');
    circle.setAttribute('stroke-width', '1');
    svg.appendChild(circle);
    
    // Text positioning - to the right of the marker
    const textX = pos.x + 8;
    const textY = pos.y;
    
    // 1. Black number - yards to front of green (matches hazard cover size)
    const greenText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    greenText.setAttribute('x', textX);
    greenText.setAttribute('y', textY);
    greenText.setAttribute('fill', 'black');
    greenText.setAttribute('font-size', '10');
    greenText.setAttribute('font-weight', 'bold');
    greenText.setAttribute('dominant-baseline', 'middle');
    greenText.setAttribute('stroke', 'white');
    greenText.setAttribute('stroke-width', '2');
    greenText.setAttribute('paint-order', 'stroke');
    greenText.textContent = yardsToGreen;
    svg.appendChild(greenText);
    
    // 2. Red number - yards from front of tee (smaller, below)
    if (yardsFromTee !== null) {
        const teeText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        teeText.setAttribute('x', textX);
        teeText.setAttribute('y', textY + 9);
        teeText.setAttribute('fill', '#cc0000');
        teeText.setAttribute('font-size', '8');
        teeText.setAttribute('font-weight', 'bold');
        teeText.setAttribute('dominant-baseline', 'middle');
        teeText.setAttribute('stroke', 'white');
        teeText.setAttribute('stroke-width', '1.5');
        teeText.setAttribute('paint-order', 'stroke');
        teeText.textContent = yardsFromTee;
        svg.appendChild(teeText);
    }
    
    // 3. Black elevation difference (smaller, above)
    if (elevDiff !== null && elevDiff !== 0) {
        const elevText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        elevText.setAttribute('x', textX);
        elevText.setAttribute('y', textY - 8);
        elevText.setAttribute('fill', 'black');
        elevText.setAttribute('font-size', '7');
        elevText.setAttribute('font-weight', 'bold');
        elevText.setAttribute('dominant-baseline', 'middle');
        elevText.setAttribute('stroke', 'white');
        elevText.setAttribute('stroke-width', '1.5');
        elevText.setAttribute('paint-order', 'stroke');
        elevText.textContent = (elevDiff > 0 ? '+' : '') + elevDiff;
        svg.appendChild(elevText);
    }
}

function addReferenceMarker(container, worldPos, captureData, type) {
    const pos = worldToCapture(worldPos.x, worldPos.y, captureData);
    
    const marker = document.createElement('div');
    marker.className = `yardage-ref-marker ${type}-ref`;
    marker.style.cssText = `position: absolute; left: ${pos.x}px; top: ${pos.y}px; transform: translate(-50%, -50%); z-index: 15;`;
    marker.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 16 16">
            <circle cx="8" cy="8" r="7" fill="none" stroke="#333" stroke-width="1"/>
            <path d="M8,1 A7,7 0 0,1 15,8 L8,8 Z" fill="#fff"/>
            <path d="M8,8 A7,7 0 0,1 1,8 L8,8 Z" fill="#fff"/>
            <path d="M15,8 A7,7 0 0,1 8,15 L8,8 Z" fill="#333"/>
            <path d="M1,8 A7,7 0 0,1 8,1 L8,8 Z" fill="#333"/>
        </svg>
    `;
    container.appendChild(marker);
}

// Add black outlines around terrain features (bunkers, water, green)
function addTerrainOutlines(svg, hole, captureData) {
    // Get terrain from world instance
    let terrain = null;
    if (worldInstance && worldInstance.course && worldInstance.course.terrain) {
        terrain = worldInstance.course.terrain;
    }
    
    if (!terrain) return;
    
    const outlineGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    outlineGroup.setAttribute('class', 'terrain-outlines');
    
    // Draw fairway outlines
    if (terrain.fairway) {
        terrain.fairway.forEach(fairway => {
            drawTerrainOutline(outlineGroup, fairway, captureData);
        });
    }
    
    // Draw tee box outlines
    if (terrain.teeBox) {
        terrain.teeBox.forEach(tee => {
            drawTerrainOutline(outlineGroup, tee, captureData);
        });
    }
    
    // Note: path outlines skipped - path is a line, already drawn on canvas
    
    // Draw out of bounds outlines
    if (terrain.outOfBounds) {
        terrain.outOfBounds.forEach(oob => {
            drawTerrainOutline(outlineGroup, oob, captureData);
        });
    }
    
    // Draw bunker outlines
    if (terrain.bunker) {
        terrain.bunker.forEach(bunker => {
            drawTerrainOutline(outlineGroup, bunker, captureData);
        });
    }
    
    // Draw water outlines
    if (terrain.water) {
        terrain.water.forEach(water => {
            drawTerrainOutline(outlineGroup, water, captureData);
        });
    }
    
    // Draw green outlines
    if (terrain.green) {
        terrain.green.forEach(green => {
            drawTerrainOutline(outlineGroup, green, captureData);
        });
    }
    
    svg.appendChild(outlineGroup);
}

// Draw outline for a path (line with width)
function drawPathOutline(group, feature, captureData) {
    if (feature.shape === 'line' && feature.points && feature.points.length > 1) {
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        let d = '';
        feature.points.forEach((pt, i) => {
            const pos = worldToCapture(pt[0], pt[1], captureData);
            d += (i === 0 ? 'M' : 'L') + `${pos.x},${pos.y}`;
        });
        path.setAttribute('d', d);
        path.setAttribute('fill', 'none');
        path.setAttribute('stroke', 'black');
        // Convert path width from world units to pixels
        const widthPx = (feature.width * WORLD_SCALE / captureData.viewWidth) * captureData.width;
        path.setAttribute('stroke-width', Math.max(widthPx, 1));
        path.setAttribute('opacity', '0.5');
        path.setAttribute('stroke-linecap', 'round');
        path.setAttribute('stroke-linejoin', 'round');
        group.appendChild(path);
    }
}

// Add tree markers - green circles (bigger than real) with black dot for trunk
function addTreeMarkers(svg, hole, captureData) {
    // Get trees from course
    let trees = null;
    if (worldInstance && worldInstance.course && worldInstance.course.trees) {
        trees = worldInstance.course.trees;
    }
    
    if (!trees || trees.length === 0) return;
    
    const treeGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    treeGroup.setAttribute('class', 'tree-markers');
    
    trees.forEach(tree => {
        const pos = worldToCapture(tree.x, tree.y, captureData);
        
        // Get tree properties for canopy size
        const props = treeProperties[tree.type];
        if (!props) return;
        
        // Use average canopy radius at actual size
        const canopyRadius = (props.canopyRadius.min + props.canopyRadius.max) / 2;
        const radiusPx = (canopyRadius * WORLD_SCALE / captureData.viewWidth) * captureData.width;
        
        // Green circle for canopy (semi-transparent)
        const canopy = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        canopy.setAttribute('cx', pos.x);
        canopy.setAttribute('cy', pos.y);
        canopy.setAttribute('r', Math.max(radiusPx, 6)); // minimum 6px
        canopy.setAttribute('fill', 'rgba(34, 85, 34, 0.5)');
        canopy.setAttribute('stroke', 'rgba(20, 60, 20, 0.7)');
        canopy.setAttribute('stroke-width', '1');
        treeGroup.appendChild(canopy);
        
        // Black dot for trunk
        const trunk = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        trunk.setAttribute('cx', pos.x);
        trunk.setAttribute('cy', pos.y);
        trunk.setAttribute('r', '2');
        trunk.setAttribute('fill', 'black');
        treeGroup.appendChild(trunk);
    });
    
    svg.appendChild(treeGroup);
}

// Draw outline for a single terrain feature
function drawTerrainOutline(group, feature, captureData) {
    if (feature.shape === 'polygon' && feature.points) {
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        let d = '';
        feature.points.forEach((pt, i) => {
            const pos = worldToCapture(pt[0], pt[1], captureData);
            d += (i === 0 ? 'M' : 'L') + `${pos.x},${pos.y}`;
        });
        d += 'Z';
        path.setAttribute('d', d);
        path.setAttribute('fill', 'none');
        path.setAttribute('stroke', 'black');
        path.setAttribute('stroke-width', '1');
        path.setAttribute('opacity', '0.5');
        group.appendChild(path);
    } else if (feature.shape === 'ellipse') {
        // Draw ellipse as a path (to handle rotation properly)
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        let d = '';
        for (let a = 0; a <= Math.PI * 2; a += 0.1) {
            const wx = feature.cx + feature.rx * Math.cos(a);
            const wy = feature.cy + feature.ry * Math.sin(a);
            const pos = worldToCapture(wx, wy, captureData);
            d += (a === 0 ? 'M' : 'L') + `${pos.x},${pos.y}`;
        }
        d += 'Z';
        path.setAttribute('d', d);
        path.setAttribute('fill', 'none');
        path.setAttribute('stroke', 'black');
        path.setAttribute('stroke-width', '1');
        path.setAttribute('opacity', '0.5');
        group.appendChild(path);
    } else if (feature.shape === 'rect') {
        // Draw rect as a path with 4 corners (to handle rotation properly)
        const tl = worldToCapture(feature.x, feature.y, captureData);
        const tr = worldToCapture(feature.x + feature.width, feature.y, captureData);
        const br = worldToCapture(feature.x + feature.width, feature.y + feature.height, captureData);
        const bl = worldToCapture(feature.x, feature.y + feature.height, captureData);
        
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        const d = `M${tl.x},${tl.y} L${tr.x},${tr.y} L${br.x},${br.y} L${bl.x},${bl.y} Z`;
        path.setAttribute('d', d);
        path.setAttribute('fill', 'none');
        path.setAttribute('stroke', 'black');
        path.setAttribute('stroke-width', '1');
        path.setAttribute('opacity', '0.5');
        group.appendChild(path);
    }
}

// Add slope arrows showing terrain gradient
// Arrows point downhill, fixed length, opacity indicates steepness
function addSlopeArrows(svg, hole, captureData) {
    const { centerWorld, viewWidth, viewHeight, width, height } = captureData;
    
    // Grid spacing in world units
    // 5 world units = 20 yards
    const gridSpacing = 5;
    
    // Minimum gradient to show arrow (feet per yard)
    // 0.35 = ~4 inches per yard = ~1.2% grade
    const minGradient = 0.35;
    
    // Gradient for full opacity (feet per yard)
    // 4.0 = 4 feet per yard = ~12% grade (very steep)
    const maxGradient = 4.0;
    
    // Fixed arrow length in pixels
    const arrowLength = 10;
    
    // Calculate world bounds visible in capture (2D - no WORLD_SCALE)
    const halfViewW = viewWidth / 2;
    const halfViewH = viewHeight / 2;
    
    const minX = centerWorld.x - halfViewW;
    const maxX = centerWorld.x + halfViewW;
    const minY = centerWorld.y - halfViewH;
    const maxY = centerWorld.y + halfViewH;
    
    // Create a group for all arrows
    const arrowGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    arrowGroup.setAttribute('class', 'slope-arrows');
    
    // Sample grid points
    for (let worldX = minX; worldX <= maxX; worldX += gridSpacing) {
        for (let worldY = minY; worldY <= maxY; worldY += gridSpacing) {
            // Skip greens, bunkers, and water
            const terrain = getTerrainAt(hole, worldX, worldY);
            if (terrain === TerrainType.GREEN || 
                terrain === TerrainType.BUNKER || 
                terrain === TerrainType.WATER) continue;
            
            const slope = getSlopeAt(hole, worldX, worldY);
            
            // Skip if gradient too small (flat areas)
            if (slope.magnitude < minGradient) continue;
            
            // Calculate opacity based on gradient (0.4 to 1.0)
            const gradientNormalized = Math.min((slope.magnitude - minGradient) / (maxGradient - minGradient), 1.0);
            const opacity = 0.4 + gradientNormalized * 0.6;
            
            // Get screen position
            const pos = worldToCapture(worldX, worldY, captureData);
            
            // Skip if outside visible area
            if (pos.x < 0 || pos.x > width || pos.y < 0 || pos.y > height) continue;
            
            // Downhill direction (negative of gradient)
            const downhillX = -slope.x;
            const downhillY = -slope.y;
            const mag = Math.sqrt(downhillX * downhillX + downhillY * downhillY);
            
            if (mag === 0) continue;
            
            // Normalize direction
            const dirX = downhillX / mag;
            const dirY = downhillY / mag;
            
            // Apply rotation to match camera view
            const cos = Math.cos(captureData.rotationAngle);
            const sin = Math.sin(captureData.rotationAngle);
            const rotDirX = dirX * cos + dirY * sin;
            const rotDirY = -dirX * sin + dirY * cos;
            
            // Calculate arrow endpoints - centered on grid point
            const halfLen = arrowLength / 2;
            const startX = pos.x - rotDirX * halfLen;
            const startY = pos.y - rotDirY * halfLen;
            const endX = pos.x + rotDirX * halfLen;
            const endY = pos.y + rotDirY * halfLen;
            
            // Create arrow line - black with opacity
            const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            line.setAttribute('x1', startX);
            line.setAttribute('y1', startY);
            line.setAttribute('x2', endX);
            line.setAttribute('y2', endY);
            line.setAttribute('stroke', 'black');
            line.setAttribute('stroke-width', '1.5');
            line.setAttribute('opacity', opacity);
            arrowGroup.appendChild(line);
            
            // Create arrowhead at downhill end (end point)
            const headSize = 3;
            const headAngle = Math.PI / 6; // 30 degrees
            
            // Arrowhead wings
            const angle = Math.atan2(rotDirY, rotDirX);
            const wing1X = endX - headSize * Math.cos(angle - headAngle);
            const wing1Y = endY - headSize * Math.sin(angle - headAngle);
            const wing2X = endX - headSize * Math.cos(angle + headAngle);
            const wing2Y = endY - headSize * Math.sin(angle + headAngle);
            
            const arrowhead = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            arrowhead.setAttribute('d', `M${endX},${endY} L${wing1X},${wing1Y} M${endX},${endY} L${wing2X},${wing2Y}`);
            arrowhead.setAttribute('stroke', 'black');
            arrowhead.setAttribute('stroke-width', '1.5');
            arrowhead.setAttribute('fill', 'none');
            arrowhead.setAttribute('opacity', opacity);
            arrowGroup.appendChild(arrowhead);
        }
    }
    
    svg.appendChild(arrowGroup);
}

// ============================================
// Hazard Cover Yardages (Bunkers and Water)
// ============================================

// Find the closest point on a hazard to the tee
function findClosestPointOnHazard(teeFront, hazard) {
    let closestPoint = null;
    let closestDist = Infinity;
    
    if (hazard.shape === 'polygon' && hazard.points) {
        // Check each edge of the polygon
        for (let i = 0; i < hazard.points.length; i++) {
            const p1 = hazard.points[i];
            const p2 = hazard.points[(i + 1) % hazard.points.length];
            
            // Find closest point on this edge to tee
            const closest = closestPointOnSegment(teeFront.x, teeFront.y, p1[0], p1[1], p2[0], p2[1]);
            const dist = Math.sqrt((closest.x - teeFront.x) ** 2 + (closest.y - teeFront.y) ** 2);
            
            if (dist < closestDist) {
                closestDist = dist;
                closestPoint = closest;
            }
        }
    } else if (hazard.shape === 'ellipse') {
        // For ellipse, find closest point on perimeter
        // Direction from ellipse center to tee
        const dx = teeFront.x - hazard.cx;
        const dy = teeFront.y - hazard.cy;
        const angle = Math.atan2(dy, dx);
        
        // Point on ellipse in that direction
        closestPoint = {
            x: hazard.cx + hazard.rx * Math.cos(angle),
            y: hazard.cy + hazard.ry * Math.sin(angle)
        };
        closestDist = Math.sqrt((closestPoint.x - teeFront.x) ** 2 + (closestPoint.y - teeFront.y) ** 2);
    } else if (hazard.shape === 'rect') {
        // Convert rect to edges and find closest
        const edges = [
            [[hazard.x, hazard.y], [hazard.x + hazard.width, hazard.y]],
            [[hazard.x + hazard.width, hazard.y], [hazard.x + hazard.width, hazard.y + hazard.height]],
            [[hazard.x + hazard.width, hazard.y + hazard.height], [hazard.x, hazard.y + hazard.height]],
            [[hazard.x, hazard.y + hazard.height], [hazard.x, hazard.y]]
        ];
        
        for (const edge of edges) {
            const closest = closestPointOnSegment(teeFront.x, teeFront.y, edge[0][0], edge[0][1], edge[1][0], edge[1][1]);
            const dist = Math.sqrt((closest.x - teeFront.x) ** 2 + (closest.y - teeFront.y) ** 2);
            
            if (dist < closestDist) {
                closestDist = dist;
                closestPoint = closest;
            }
        }
    }
    
    return { point: closestPoint, distance: closestDist };
}

// Find closest point on a line segment to a point
function closestPointOnSegment(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len2 = dx * dx + dy * dy;
    
    if (len2 === 0) return { x: x1, y: y1 };
    
    let t = ((px - x1) * dx + (py - y1) * dy) / len2;
    t = Math.max(0, Math.min(1, t));
    
    return {
        x: x1 + t * dx,
        y: y1 + t * dy
    };
}

// Find where a ray from tee through a point intersects a hazard
function findRayHazardIntersections(teeFront, direction, hazard) {
    const intersections = [];
    
    // Extend ray far enough to pass through any hazard
    const rayEnd = {
        x: teeFront.x + direction.x * 1000,
        y: teeFront.y + direction.y * 1000
    };
    
    if (hazard.shape === 'polygon' && hazard.points) {
        for (let i = 0; i < hazard.points.length; i++) {
            const p1 = hazard.points[i];
            const p2 = hazard.points[(i + 1) % hazard.points.length];
            
            const intersection = lineSegmentIntersect(
                [teeFront.x, teeFront.y], 
                [rayEnd.x, rayEnd.y], 
                p1, 
                p2
            );
            
            if (intersection) {
                const dist = Math.sqrt((intersection.x - teeFront.x) ** 2 + (intersection.y - teeFront.y) ** 2);
                intersections.push({ x: intersection.x, y: intersection.y, dist });
            }
        }
    } else if (hazard.shape === 'ellipse') {
        const cx = hazard.cx, cy = hazard.cy, rx = hazard.rx, ry = hazard.ry;
        const dx = rayEnd.x - teeFront.x;
        const dy = rayEnd.y - teeFront.y;
        
        const a = (dx * dx) / (rx * rx) + (dy * dy) / (ry * ry);
        const b = 2 * ((teeFront.x - cx) * dx / (rx * rx) + (teeFront.y - cy) * dy / (ry * ry));
        const c = ((teeFront.x - cx) ** 2) / (rx * rx) + ((teeFront.y - cy) ** 2) / (ry * ry) - 1;
        
        const discriminant = b * b - 4 * a * c;
        if (discriminant >= 0) {
            const sqrtD = Math.sqrt(discriminant);
            [(-b - sqrtD) / (2 * a), (-b + sqrtD) / (2 * a)].forEach(t => {
                if (t >= 0 && t <= 1) {
                    const ix = teeFront.x + t * dx;
                    const iy = teeFront.y + t * dy;
                    const dist = Math.sqrt((ix - teeFront.x) ** 2 + (iy - teeFront.y) ** 2);
                    intersections.push({ x: ix, y: iy, dist });
                }
            });
        }
    } else if (hazard.shape === 'rect') {
        const edges = [
            [[hazard.x, hazard.y], [hazard.x + hazard.width, hazard.y]],
            [[hazard.x + hazard.width, hazard.y], [hazard.x + hazard.width, hazard.y + hazard.height]],
            [[hazard.x + hazard.width, hazard.y + hazard.height], [hazard.x, hazard.y + hazard.height]],
            [[hazard.x, hazard.y + hazard.height], [hazard.x, hazard.y]]
        ];
        
        for (const edge of edges) {
            const intersection = lineSegmentIntersect(
                [teeFront.x, teeFront.y], 
                [rayEnd.x, rayEnd.y], 
                edge[0], 
                edge[1]
            );
            
            if (intersection) {
                const dist = Math.sqrt((intersection.x - teeFront.x) ** 2 + (intersection.y - teeFront.y) ** 2);
                intersections.push({ x: intersection.x, y: intersection.y, dist });
            }
        }
    }
    
    // Sort by distance from tee
    intersections.sort((a, b) => a.dist - b.dist);
    
    return intersections;
}

// Check if hazard is within range of centreline
function isHazardNearCentreline(hazard, centreline, maxDistWorld) {
    // Get hazard center
    let center;
    if (hazard.shape === 'polygon' && hazard.points) {
        let sumX = 0, sumY = 0;
        hazard.points.forEach(p => { sumX += p[0]; sumY += p[1]; });
        center = { x: sumX / hazard.points.length, y: sumY / hazard.points.length };
    } else if (hazard.shape === 'ellipse') {
        center = { x: hazard.cx, y: hazard.cy };
    } else if (hazard.shape === 'rect') {
        center = { x: hazard.x + hazard.width / 2, y: hazard.y + hazard.height / 2 };
    } else {
        return false;
    }
    
    // Check distance to any centreline segment
    for (let i = 0; i < centreline.length - 1; i++) {
        const p1 = centreline[i];
        const p2 = centreline[i + 1];
        const dist = distanceToSegment(center.x, center.y, p1[0], p1[1], p2[0], p2[1]);
        if (dist < maxDistWorld) return true;
    }
    
    return false;
}

// Add hazard cover yardages to the SVG overlay
function addHazardCoverYardages(svg, hole, teeFront, captureData, occupiedPositions) {
    // Get terrain hazards from the world instance
    let terrain = null;
    if (worldInstance && worldInstance.course && worldInstance.course.terrain) {
        terrain = worldInstance.course.terrain;
    }
    
    if (!terrain) return;
    
    const centreline = hole.centreline;
    if (!centreline || centreline.length < 2) return;
    
    // Max distance from centreline to consider hazard (200 yards in world units)
    const maxDistWorld = yardsToWorld(200);
    
    // Process bunkers
    if (terrain.bunker) {
        terrain.bunker.forEach(bunker => {
            if (isHazardNearCentreline(bunker, centreline, maxDistWorld)) {
                addHazardYardageLabels(svg, teeFront, bunker, 'bunker', captureData, occupiedPositions);
            }
        });
    }
    
    // Process water hazards
    if (terrain.water) {
        terrain.water.forEach(water => {
            if (isHazardNearCentreline(water, centreline, maxDistWorld)) {
                addHazardYardageLabels(svg, teeFront, water, 'water', captureData, occupiedPositions);
            }
        });
    }
}

// Add yardage labels for a single hazard (entry and exit points)
function addHazardYardageLabels(svg, teeFront, hazard, hazardType, captureData, occupiedPositions) {
    // Find closest point on hazard to tee
    const closest = findClosestPointOnHazard(teeFront, hazard);
    if (!closest.point) return;
    
    // Direction from tee to closest point
    const dx = closest.point.x - teeFront.x;
    const dy = closest.point.y - teeFront.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len === 0) return;
    
    const direction = { x: dx / len, y: dy / len };
    
    // Find where ray from tee through closest point intersects hazard
    const intersections = findRayHazardIntersections(teeFront, direction, hazard);
    
    if (intersections.length < 2) return; // Need entry and exit
    
    // First intersection is entry, last is exit (cover)
    const entry = intersections[0];
    const exit = intersections[intersections.length - 1];
    
    // Calculate yardages from tee front
    const entryYards = Math.round(worldToYards(entry.dist));
    const exitYards = Math.round(worldToYards(exit.dist));
    
    // Colors based on hazard type
    const colors = hazardType === 'bunker' 
        ? { bg: 'rgba(232, 212, 168, 0.9)', text: '#8B7355', border: '#A08060' }  // Sand/tan colors
        : { bg: 'rgba(52, 152, 219, 0.9)', text: '#fff', border: '#2980b9' };      // Blue for water
    
    const labelMinDist = 20;
    
    // Add entry yardage label
    const entryPos = worldToCapture(entry.x, entry.y, captureData);
    const entryOverlaps = occupiedPositions.some(pos => {
        const dx = entryPos.x - pos.x;
        const dy = entryPos.y - pos.y;
        return Math.sqrt(dx * dx + dy * dy) < (pos.radius + labelMinDist / 2);
    });
    
    if (!entryOverlaps) {
        addHazardYardageLabel(svg, entryPos, entryYards, colors, false);
        occupiedPositions.push({ x: entryPos.x, y: entryPos.y, radius: labelMinDist / 2 });
    }
    
    // Add exit (cover) yardage label
    const exitPos = worldToCapture(exit.x, exit.y, captureData);
    const exitOverlaps = occupiedPositions.some(pos => {
        const dx = exitPos.x - pos.x;
        const dy = exitPos.y - pos.y;
        return Math.sqrt(dx * dx + dy * dy) < (pos.radius + labelMinDist / 2);
    });
    
    if (!exitOverlaps) {
        addHazardYardageLabel(svg, exitPos, exitYards, colors, true);
        occupiedPositions.push({ x: exitPos.x, y: exitPos.y, radius: labelMinDist / 2 });
    }
}

// Add a single hazard yardage label with dot marker
function addHazardYardageLabel(svg, pos, yards, colors, isCover) {
    // Create a group for the label
    const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    
    // Black dot at intersection point
    const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    dot.setAttribute('cx', pos.x);
    dot.setAttribute('cy', pos.y);
    dot.setAttribute('r', '4');
    dot.setAttribute('fill', 'black');
    group.appendChild(dot);
    
    // Text label offset to the side
    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.setAttribute('x', pos.x + 8);
    text.setAttribute('y', pos.y);
    text.setAttribute('fill', 'black');
    text.setAttribute('font-size', '8');
    text.setAttribute('font-weight', 'bold');
    text.setAttribute('text-anchor', 'start');
    text.setAttribute('dominant-baseline', 'middle');
    text.setAttribute('stroke', 'white');
    text.setAttribute('stroke-width', '1.5');
    text.setAttribute('paint-order', 'stroke');
    text.textContent = `${yards}`;
    group.appendChild(text);
    
    svg.appendChild(group);
}


// ============================================
// Compass Rose
// ============================================

function addCompassRose(container, rotationAngle) {
    const rose = document.createElement('div');
    rose.className = 'compass-rose';
    rose.style.cssText = `
        position: absolute;
        top: 10px;
        right: 10px;
        width: 50px;
        height: 50px;
        z-index: 20;
    `;
    
    // The map is rotated by rotationAngle, so north arrow needs to point opposite
    const northAngle = -rotationAngle * (180 / Math.PI);
    
    rose.innerHTML = `
        <svg width="50" height="50" viewBox="0 0 50 50">
            <g transform="rotate(${northAngle}, 25, 25)">
                <!-- Outer circle -->
                <circle cx="25" cy="25" r="22" fill="rgba(255,255,255,0.8)" stroke="#333" stroke-width="1"/>
                
                <!-- North arrow (red) -->
                <polygon points="25,5 21,20 25,17 29,20" fill="#cc0000" stroke="#990000" stroke-width="0.5"/>
                
                <!-- South arrow (white) -->
                <polygon points="25,45 21,30 25,33 29,30" fill="#ffffff" stroke="#333" stroke-width="0.5"/>
                
                <!-- East-West line -->
                <line x1="8" y1="25" x2="17" y2="25" stroke="#333" stroke-width="1.5"/>
                <line x1="33" y1="25" x2="42" y2="25" stroke="#333" stroke-width="1.5"/>
                
                <!-- N label -->
                <text x="25" y="14" text-anchor="middle" font-size="8" font-weight="bold" fill="#cc0000">N</text>
                
                <!-- Center dot -->
                <circle cx="25" cy="25" r="2" fill="#333"/>
            </g>
        </svg>
    `;
    
    container.appendChild(rose);
}

// ============================================
// Course Stats Page
// ============================================

function renderCoursePage(modal, hole) {
    const wind = getWind();
    const compassDir = degreesToCompass(wind.direction);
    
    // Get course data
    let courseName = 'Unknown Course';
    let holes = [];
    let totalPar = 0;
    let totalYards = 0;
    
    if (worldInstance && worldInstance.course) {
        courseName = worldInstance.course.name || 'Unknown Course';
        holes = worldInstance.course.holes || [];
        holes.forEach(h => {
            totalPar += h.par || 0;
            totalYards += h.yards || 0;
        });
    }
    
    modal.innerHTML = `
        <div class="yardage-header">
            <div class="modal-title">${courseName}</div>
            <div class="yardage-tabs">
                <button class="yardage-tab-btn" id="hole-tab">Hole</button>
                <button class="yardage-tab-btn" id="green-tab">Green</button>
                <button class="yardage-tab-btn" id="clubs-tab">Clubs</button>
                <button class="yardage-close-btn" id="close-btn">✕</button>
            </div>
        </div>
        <div class="yardage-content course-stats">
            <div class="course-section">
                <h3>Wind Conditions</h3>
                <div class="wind-display">
                    <div class="wind-arrow" style="transform: rotate(${wind.direction}deg)">
                        <svg width="60" height="60" viewBox="0 0 60 60">
                            <circle cx="30" cy="30" r="28" fill="rgba(135,206,235,0.3)" stroke="#4a90d9" stroke-width="2"/>
                            <polygon points="30,8 24,28 30,24 36,28" fill="#4a90d9"/>
                            <circle cx="30" cy="30" r="4" fill="#4a90d9"/>
                        </svg>
                    </div>
                    <div class="wind-info">
                        <div class="wind-speed">${wind.speed} mph</div>
                        <div class="wind-direction">${wind.direction}° ${compassDir}</div>
                    </div>
                </div>
            </div>
            
            <div class="course-section">
                <h3>Course Details</h3>
                <div class="course-details">
                    <div class="detail-row">
                        <span class="detail-label">Holes:</span>
                        <span class="detail-value">${holes.length}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Total Par:</span>
                        <span class="detail-value">${totalPar}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Total Yards:</span>
                        <span class="detail-value">${totalYards.toLocaleString()}</span>
                    </div>
                </div>
                
                <div class="hole-list">
                    <table class="hole-table">
                        <thead>
                            <tr>
                                <th>Hole</th>
                                <th>Par</th>
                                <th>Yards</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${holes.map(h => `
                                <tr>
                                    <td>${h.number || h.name}</td>
                                    <td>${h.par}</td>
                                    <td>${h.yards}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
            
            <div class="course-section">
                <h3>Leaderboard</h3>
                <div class="leaderboard" id="leaderboard">
                    <div class="leaderboard-empty">No scores recorded yet</div>
                </div>
            </div>
        </div>
    `;
    
    modal.querySelector('#close-btn').addEventListener('click', () => {
        modal.closest('.modal-overlay').remove();
    });
    modal.querySelector('#hole-tab').addEventListener('click', () => {
        currentPage = 'hole';
        renderPage(modal, hole);
    });
    modal.querySelector('#green-tab').addEventListener('click', () => {
        currentPage = 'green';
        renderPage(modal, hole);
    });
    modal.querySelector('#clubs-tab').addEventListener('click', () => {
        currentPage = 'clubs';
        renderPage(modal, hole);
    });
}

// ============================================
// Green Page - Detailed green view
// ============================================

function renderGreenPage(modal, hole) {
    modal.innerHTML = `
        <div class="yardage-header">
            <div class="modal-title">${hole.name} - Green</div>
            <div class="yardage-tabs">
                <button class="yardage-tab-btn" id="hole-tab">Hole</button>
                <button class="yardage-tab-btn" id="clubs-tab">Clubs</button>
                <button class="yardage-tab-btn" id="golfer-tab">Golfer</button>
                <button class="yardage-tab-btn" id="course-tab">Course</button>
                <button class="yardage-close-btn" id="close-btn">✕</button>
            </div>
        </div>
        <div class="yardage-map-container">
            <div class="yardage-map-hole" id="yardage-map-green">
                <div class="yardage-loading">Rendering green...</div>
            </div>
        </div>
    `;
    
    modal.querySelector('#close-btn').addEventListener('click', () => {
        modal.closest('.modal-overlay').remove();
    });
    modal.querySelector('#hole-tab').addEventListener('click', () => {
        currentPage = 'hole';
        renderPage(modal, hole);
    });
    modal.querySelector('#golfer-tab').addEventListener('click', () => {
        currentPage = 'golfer';
        renderPage(modal, hole);
    });
    modal.querySelector('#clubs-tab').addEventListener('click', () => {
        currentPage = 'clubs';
        renderPage(modal, hole);
    });
    modal.querySelector('#course-tab').addEventListener('click', () => {
        currentPage = 'course';
        renderPage(modal, hole);
    });
    
    // Render green view after modal renders
    requestAnimationFrame(() => {
        renderGreenMap(modal, hole);
    });
}

function renderGreenMap(modal, hole) {
    const mapContainer = modal.querySelector('#yardage-map-green');
    if (!mapContainer) return;
    
    // Get container dimensions
    const containerRect = mapContainer.getBoundingClientRect();
    const width = Math.floor(containerRect.width) || 400;
    const height = Math.floor(containerRect.height) || 500;
    
    // Find the green zone
    const greenZone = hole.zones?.find(z => z.terrain === TerrainType.GREEN);
    if (!greenZone) {
        mapContainer.innerHTML = '<div class="yardage-fallback">No green data available</div>';
        return;
    }
    
    // Calculate green bounds with padding for surrounding terrain
    const greenBounds = calculateGreenBounds(greenZone, 8);
    
    // Clear loading message
    mapContainer.innerHTML = '';
    
    // Get terrain and trees data
    let terrain = null;
    let trees = null;
    if (worldInstance && worldInstance.course) {
        terrain = worldInstance.course.terrain;
        trees = worldInstance.course.trees;
    }
    
    // Calculate rotation angle to orient tee at bottom, hole at top
    const teePos = hole.tee;
    const holePos = hole.hole;
    const dx = holePos.x - teePos.x;
    const dy = holePos.y - teePos.y;
    const rotationAngle = Math.atan2(dx, -dy);
    
    // Calculate view dimensions
    const boundsWidth = greenBounds.maxX - greenBounds.minX;
    const boundsHeight = greenBounds.maxY - greenBounds.minY;
    const aspect = width / height;
    
    let viewWidth, viewHeight;
    if (boundsWidth / boundsHeight > aspect) {
        viewWidth = boundsWidth * 1.15;
        viewHeight = viewWidth / aspect;
    } else {
        viewHeight = boundsHeight * 1.15;
        viewWidth = viewHeight * aspect;
    }
    
    const centerX = (greenBounds.minX + greenBounds.maxX) / 2;
    const centerY = (greenBounds.minY + greenBounds.maxY) / 2;
    
    // Create canvas for 2D rendering
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    canvas.style.cssText = 'position: absolute; left: 0; top: 0; width: 100%; height: 100%;';
    
    const ctx = canvas.getContext('2d');
    
    // Fill with light green (rough/grass base)
    ctx.fillStyle = '#90c090';
    ctx.fillRect(0, 0, width, height);
    
    // Helper to convert world coords to canvas coords (with rotation)
    function worldToCanvas(worldX, worldY) {
        const ox = worldX - centerX;
        const oy = worldY - centerY;
        const cos = Math.cos(rotationAngle);
        const sin = Math.sin(rotationAngle);
        const rx = ox * cos + oy * sin;
        const ry = -ox * sin + oy * cos;
        const px = (rx / viewWidth + 0.5) * width;
        const py = (ry / viewHeight + 0.5) * height;
        return { x: px, y: py };
    }
    
    // Draw terrain features (same as hole page)
    if (terrain) {
        // Draw fairway
        ctx.fillStyle = '#b8e8b8';
        drawTerrainFeatures(ctx, terrain.fairway, worldToCanvas);
        
        // Draw tee box
        ctx.fillStyle = '#b8e8b8';
        drawTerrainFeatures(ctx, terrain.teeBox, worldToCanvas);
        
        // Draw path
        ctx.strokeStyle = '#c8c0b0';
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        drawPathFeatures(ctx, terrain.path, worldToCanvas, viewWidth, width);
        
        // Draw water
        ctx.fillStyle = '#a0c8e8';
        drawTerrainFeatures(ctx, terrain.water, worldToCanvas);
        
        // Draw bunkers
        ctx.fillStyle = '#e8dca0';
        drawTerrainFeatures(ctx, terrain.bunker, worldToCanvas);
        
        // Don't draw green here - we'll draw it with elevation gradient
    }
    
    // Draw trees
    if (trees) {
        trees.forEach(tree => {
            const props = treeProperties[tree.type];
            if (!props) return;
            
            const pos = worldToCanvas(tree.x, tree.y);
            const canopyRadius = (props.canopyRadius.min + props.canopyRadius.max) / 2;
            const category = props.category;
            const seed = Math.abs(tree.x * 1000 + tree.y * 7);
            
            ctx.fillStyle = 'rgba(34, 85, 34, 0.5)';
            drawTree2DCanopy(ctx, pos, canopyRadius, category, seed, viewWidth, width, rotationAngle);
            
            ctx.fillStyle = 'black';
            ctx.beginPath();
            ctx.arc(pos.x, pos.y, 2, 0, Math.PI * 2);
            ctx.fill();
        });
    }
    
    mapContainer.appendChild(canvas);
    
    // Store capture data for overlay positioning
    const captureData = {
        centerWorld: { x: centerX, y: centerY },
        rotationAngle: rotationAngle,
        viewWidth: viewWidth,
        viewHeight: viewHeight,
        width: width,
        height: height,
        greenBounds: greenBounds
    };
    
    // Add elevation grid overlay on the green
    const greenGridCanvas = document.createElement('canvas');
    greenGridCanvas.width = width;
    greenGridCanvas.height = height;
    greenGridCanvas.style.cssText = 'position: absolute; left: 0; top: 0; width: 100%; height: 100%; pointer-events: none;';
    const gridCtx = greenGridCanvas.getContext('2d');
    drawGreenElevationGrid(gridCtx, hole, greenZone, captureData);
    mapContainer.appendChild(greenGridCanvas);
    
    // Create SVG overlay for markers and arrows
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'yardage-overlay-svg');
    svg.style.cssText = 'position: absolute; left: 0; top: 0; width: 100%; height: 100%; pointer-events: none; z-index: 10;';
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    
    // Add terrain outlines
    addTerrainOutlines(svg, hole, captureData);
    
    // Add slope arrows on surrounding terrain (NOT on the green)
    addGreenSlopeArrows(svg, hole, greenZone, captureData);
    
    // Add front of green marker and depth line
    const greenFront = findGreenFront(hole);
    if (greenFront) {
        addGreenFrontMarker(svg, greenFront, hole, greenZone, captureData);
    }
    
    // Add hole marker
    if (hole.hole) {
        addHoleMarker(svg, hole.hole, captureData);
    }
    
    // Add ball marker if ball is within or near the green view
    if (ballInstance) {
        addBallMarker(svg, captureData);
    }
    
    mapContainer.appendChild(svg);
    
    // Add elevation legend
    addElevationLegend(mapContainer, captureData);
    
    // Add compass rose
    addCompassRose(mapContainer, rotationAngle);
}

// Fallback rendering when world capture is not available
function renderGreenMapFallback(mapContainer, hole, greenZone, greenBounds, width, height) {
    // Calculate rotation angle (same as hole view - tee at bottom, hole at top)
    const teePos = hole.tee;
    const holePos = hole.hole;
    const dx = holePos.x - teePos.x;
    const dy = holePos.y - teePos.y;
    const rotationAngle = Math.atan2(dx, -dy);
    
    // Calculate view dimensions to fill the container
    const aspect = width / height;
    const boundsWidth = greenBounds.maxX - greenBounds.minX;
    const boundsHeight = greenBounds.maxY - greenBounds.minY;
    
    let viewWidth, viewHeight;
    if (boundsWidth / boundsHeight > aspect) {
        viewWidth = boundsWidth * WORLD_SCALE * 1.15;
        viewHeight = viewWidth / aspect;
    } else {
        viewHeight = boundsHeight * WORLD_SCALE * 1.15;
        viewWidth = viewHeight * aspect;
    }
    
    // Center of green
    const centerX = (greenBounds.minX + greenBounds.maxX) / 2;
    const centerY = (greenBounds.minY + greenBounds.maxY) / 2;
    
    const captureData = {
        centerWorld: { x: centerX, y: centerY },
        rotationAngle: rotationAngle,
        viewWidth: viewWidth,
        viewHeight: viewHeight,
        width: width,
        height: height,
        greenBounds: greenBounds
    };
    
    // Create canvas for the green elevation grid
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    canvas.style.cssText = 'position: absolute; left: 0; top: 0; width: 100%; height: 100%;';
    
    const ctx = canvas.getContext('2d');
    
    // Draw elevation-colored grid for the green
    drawGreenElevationGrid(ctx, hole, greenZone, captureData);
    
    mapContainer.appendChild(canvas);
    
    // Create SVG overlay for markers and arrows
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'yardage-overlay-svg');
    svg.style.cssText = 'position: absolute; left: 0; top: 0; width: 100%; height: 100%; pointer-events: none; z-index: 10;';
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    
    // Add slope arrows on surrounding terrain
    addGreenSlopeArrows(svg, hole, greenZone, captureData);
    
    // Add front of green marker and depth line
    const greenFront = findGreenFront(hole);
    if (greenFront) {
        addGreenFrontMarker(svg, greenFront, hole, greenZone, captureData);
    }
    
    // Add hole marker
    if (hole.hole) {
        addHoleMarker(svg, hole.hole, captureData);
    }
    
    // Add ball marker if ball is within or near the green view
    if (ballInstance) {
        addBallMarker(svg, captureData);
    }
    
    mapContainer.appendChild(svg);
    
    // Add elevation legend
    addElevationLegend(mapContainer, captureData);
}

function calculateGreenBounds(greenZone, padding = 3) {
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    
    if (greenZone.shape === 'ellipse') {
        minX = greenZone.cx - greenZone.rx;
        maxX = greenZone.cx + greenZone.rx;
        minY = greenZone.cy - greenZone.ry;
        maxY = greenZone.cy + greenZone.ry;
    } else if (greenZone.shape === 'rect') {
        minX = greenZone.x;
        maxX = greenZone.x + greenZone.width;
        minY = greenZone.y;
        maxY = greenZone.y + greenZone.height;
    } else if (greenZone.shape === 'polygon' && greenZone.points) {
        greenZone.points.forEach(p => {
            minX = Math.min(minX, p[0]);
            maxX = Math.max(maxX, p[0]);
            minY = Math.min(minY, p[1]);
            maxY = Math.max(maxY, p[1]);
        });
    }
    
    return {
        minX: minX - padding,
        maxX: maxX + padding,
        minY: minY - padding,
        maxY: maxY + padding
    };
}

function drawGreenElevationGrid(ctx, hole, greenZone, captureData) {
    const { centerWorld, rotationAngle, viewWidth, viewHeight, width, height, greenBounds } = captureData;
    
    // Sample elevation at high resolution
    const gridResolution = 2; // pixels per sample
    
    // Find elevation range on the green for color mapping
    let minElev = Infinity, maxElev = -Infinity;
    const elevationSamples = [];
    
    for (let py = 0; py < height; py += gridResolution) {
        for (let px = 0; px < width; px += gridResolution) {
            const worldPos = captureToWorld(px, py, captureData);
            if (isPointInGreen(worldPos.x, worldPos.y, greenZone)) {
                const elev = getElevationAt(hole, worldPos.x, worldPos.y);
                minElev = Math.min(minElev, elev);
                maxElev = Math.max(maxElev, elev);
                elevationSamples.push({ px, py, elev, inGreen: true });
            }
        }
    }
    
    // If no elevation variation, use a small range
    const elevRange = maxElev - minElev;
    if (elevRange < 0.5) {
        minElev -= 0.25;
        maxElev += 0.25;
    }
    
    // Only draw on the green - no background fill (3D capture handles surrounding terrain)
    // Draw elevation-colored grid on the green only
    elevationSamples.forEach(sample => {
        // Map elevation to color: blue (low) -> green (mid) -> yellow/red (high)
        const t = (sample.elev - minElev) / (maxElev - minElev || 1);
        const color = getElevationColor(t);
        
        ctx.fillStyle = color;
        ctx.fillRect(sample.px, sample.py, gridResolution, gridResolution);
    });
    
    // Draw green outline
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.lineWidth = 2;
    drawGreenOutline(ctx, greenZone, captureData);
}

function getElevationColor(t) {
    // Color gradient: dark blue (low) -> light green (mid) -> yellow -> orange (high)
    // t is 0-1 where 0 is lowest, 1 is highest
    
    let r, g, b;
    
    if (t < 0.25) {
        // Dark blue to light blue
        const s = t / 0.25;
        r = Math.round(40 + s * 40);
        g = Math.round(80 + s * 60);
        b = Math.round(140 + s * 40);
    } else if (t < 0.5) {
        // Light blue to green
        const s = (t - 0.25) / 0.25;
        r = Math.round(80 - s * 20);
        g = Math.round(140 + s * 60);
        b = Math.round(180 - s * 80);
    } else if (t < 0.75) {
        // Green to yellow
        const s = (t - 0.5) / 0.25;
        r = Math.round(60 + s * 180);
        g = Math.round(200 - s * 20);
        b = Math.round(100 - s * 80);
    } else {
        // Yellow to orange/red
        const s = (t - 0.75) / 0.25;
        r = Math.round(240 + s * 15);
        g = Math.round(180 - s * 80);
        b = Math.round(20);
    }
    
    return `rgb(${r}, ${g}, ${b})`;
}

function drawGreenOutline(ctx, greenZone, captureData) {
    ctx.beginPath();
    
    if (greenZone.shape === 'ellipse') {
        // Sample ellipse points
        const steps = 64;
        for (let i = 0; i <= steps; i++) {
            const angle = (i / steps) * Math.PI * 2;
            const worldX = greenZone.cx + Math.cos(angle) * greenZone.rx;
            const worldY = greenZone.cy + Math.sin(angle) * greenZone.ry;
            const pos = worldToCapture(worldX, worldY, captureData);
            if (i === 0) ctx.moveTo(pos.x, pos.y);
            else ctx.lineTo(pos.x, pos.y);
        }
    } else if (greenZone.shape === 'polygon' && greenZone.points) {
        greenZone.points.forEach((p, i) => {
            const pos = worldToCapture(p[0], p[1], captureData);
            if (i === 0) ctx.moveTo(pos.x, pos.y);
            else ctx.lineTo(pos.x, pos.y);
        });
        ctx.closePath();
    } else if (greenZone.shape === 'rect') {
        const corners = [
            [greenZone.x, greenZone.y],
            [greenZone.x + greenZone.width, greenZone.y],
            [greenZone.x + greenZone.width, greenZone.y + greenZone.height],
            [greenZone.x, greenZone.y + greenZone.height]
        ];
        corners.forEach((c, i) => {
            const pos = worldToCapture(c[0], c[1], captureData);
            if (i === 0) ctx.moveTo(pos.x, pos.y);
            else ctx.lineTo(pos.x, pos.y);
        });
        ctx.closePath();
    }
    
    ctx.stroke();
}

function isPointInGreen(x, y, greenZone) {
    if (greenZone.shape === 'ellipse') {
        const dx = (x - greenZone.cx) / greenZone.rx;
        const dy = (y - greenZone.cy) / greenZone.ry;
        return (dx * dx + dy * dy) <= 1;
    } else if (greenZone.shape === 'polygon') {
        return isPointInPolygon(x, y, greenZone.points);
    } else if (greenZone.shape === 'rect') {
        return x >= greenZone.x && x <= greenZone.x + greenZone.width &&
               y >= greenZone.y && y <= greenZone.y + greenZone.height;
    }
    return false;
}

function captureToWorld(px, py, captureData) {
    const { centerWorld, rotationAngle, viewWidth, viewHeight, width, height } = captureData;
    
    // Convert pixel to normalized coords (-0.5 to 0.5)
    const nx = (px / width) - 0.5;
    const ny = (py / height) - 0.5;
    
    // Scale to view size
    const rx = nx * viewWidth;
    const rz = ny * viewHeight;
    
    // Reverse rotation
    const cos = Math.cos(-rotationAngle);
    const sin = Math.sin(-rotationAngle);
    const dx = (rx * cos + rz * sin) / WORLD_SCALE;
    const dz = (-rx * sin + rz * cos) / WORLD_SCALE;
    
    return {
        x: centerWorld.x + dx,
        y: centerWorld.y + dz
    };
}

function addGreenSlopeArrows(svg, hole, greenZone, captureData) {
    const { width, height } = captureData;
    
    // Grid spacing in pixels
    const gridSpacing = 25;
    
    // Minimum gradient to show arrow (feet per yard) - skip flat-ish areas
    // Same settings as main hole view
    const minGradient = 0.1;
    
    // Arrow length scaling (pixels per unit gradient)
    const arrowScale = 250;
    const maxArrowLength = 18;
    
    const arrowGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    arrowGroup.setAttribute('class', 'green-slope-arrows');
    
    for (let py = gridSpacing / 2; py < height; py += gridSpacing) {
        for (let px = gridSpacing / 2; px < width; px += gridSpacing) {
            const worldPos = captureToWorld(px, py, captureData);
            
            // Only draw arrows on surrounding terrain, NOT on the green
            if (isPointInGreen(worldPos.x, worldPos.y, greenZone)) continue;
            
            // Also skip bunkers and water
            const terrain = getTerrainAt(hole, worldPos.x, worldPos.y);
            if (terrain === TerrainType.BUNKER || terrain === TerrainType.WATER) continue;
            
            const slope = getSlopeAt(hole, worldPos.x, worldPos.y);
            
            if (slope.magnitude < minGradient) continue;
            
            const effectiveGradient = slope.magnitude - minGradient;
            const arrowLength = Math.min(effectiveGradient * arrowScale, maxArrowLength);
            
            // Downhill direction
            const downhillX = -slope.x;
            const downhillY = -slope.y;
            const mag = Math.sqrt(downhillX * downhillX + downhillY * downhillY);
            
            if (mag === 0) continue;
            
            const dirX = downhillX / mag;
            const dirY = downhillY / mag;
            
            // Apply rotation
            const cos = Math.cos(captureData.rotationAngle);
            const sin = Math.sin(captureData.rotationAngle);
            const rotDirX = dirX * cos + dirY * sin;
            const rotDirY = -dirX * sin + dirY * cos;
            
            const halfLen = arrowLength / 2;
            const startX = px - rotDirX * halfLen;
            const startY = py - rotDirY * halfLen;
            const endX = px + rotDirX * halfLen;
            const endY = py + rotDirY * halfLen;
            
            // Arrow line - black for visibility on terrain
            const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            line.setAttribute('x1', startX);
            line.setAttribute('y1', startY);
            line.setAttribute('x2', endX);
            line.setAttribute('y2', endY);
            line.setAttribute('stroke', 'black');
            line.setAttribute('stroke-width', '1.5');
            arrowGroup.appendChild(line);
            
            // Arrowhead
            const headSize = 4;
            const headAngle = Math.PI / 6;
            const angle = Math.atan2(rotDirY, rotDirX);
            const wing1X = endX - headSize * Math.cos(angle - headAngle);
            const wing1Y = endY - headSize * Math.sin(angle - headAngle);
            const wing2X = endX - headSize * Math.cos(angle + headAngle);
            const wing2Y = endY - headSize * Math.sin(angle + headAngle);
            
            const arrowhead = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            arrowhead.setAttribute('d', `M${endX},${endY} L${wing1X},${wing1Y} M${endX},${endY} L${wing2X},${wing2Y}`);
            arrowhead.setAttribute('stroke', 'black');
            arrowhead.setAttribute('stroke-width', '1.5');
            arrowhead.setAttribute('fill', 'none');
            arrowGroup.appendChild(arrowhead);
        }
    }
    
    svg.appendChild(arrowGroup);
}

function addGreenFrontMarker(svg, greenFront, hole, greenZone, captureData) {
    const frontPos = worldToCapture(greenFront.x, greenFront.y, captureData);
    
    // Add front of green marker (quartered circle)
    const markerSize = 12;
    const marker = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    marker.setAttribute('transform', `translate(${frontPos.x}, ${frontPos.y})`);
    
    // Quartered circle
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('r', markerSize / 2);
    circle.setAttribute('fill', 'none');
    circle.setAttribute('stroke', '#333');
    circle.setAttribute('stroke-width', '1');
    marker.appendChild(circle);
    
    // Quarters
    const quarters = [
        { d: `M0,-${markerSize/2} A${markerSize/2},${markerSize/2} 0 0,1 ${markerSize/2},0 L0,0 Z`, fill: '#fff' },
        { d: `M0,0 L${markerSize/2},0 A${markerSize/2},${markerSize/2} 0 0,1 0,${markerSize/2} Z`, fill: '#333' },
        { d: `M0,0 L0,${markerSize/2} A${markerSize/2},${markerSize/2} 0 0,1 -${markerSize/2},0 Z`, fill: '#fff' },
        { d: `M-${markerSize/2},0 A${markerSize/2},${markerSize/2} 0 0,1 0,-${markerSize/2} L0,0 Z`, fill: '#333' }
    ];
    quarters.forEach(q => {
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', q.d);
        path.setAttribute('fill', q.fill);
        marker.appendChild(path);
    });
    
    svg.appendChild(marker);
    
    // Calculate and draw depth line (vertical - along centreline)
    const depthInfo = calculateGreenDepth(hole, greenFront, greenZone, captureData);
    if (depthInfo) {
        drawGreenDepthLine(svg, depthInfo, captureData);
        
        // Calculate and draw width line (horizontal - perpendicular at midpoint of depth)
        const widthInfo = calculateGreenWidth(greenFront, greenZone, depthInfo);
        if (widthInfo) {
            drawGreenWidthLine(svg, widthInfo, captureData);
        }
    }
}

function calculateGreenDepth(hole, greenFront, greenZone, captureData) {
    // Get centreline direction at green front
    const centreline = hole.centreline;
    if (!centreline || centreline.length < 2) return null;
    
    // Find direction along centreline at green front
    let dirX = 0, dirY = 0;
    for (let i = 0; i < centreline.length - 1; i++) {
        const p1 = centreline[i];
        const p2 = centreline[i + 1];
        const dx = p2[0] - p1[0];
        const dy = p2[1] - p1[1];
        
        // Check if green front is near this segment
        const dist = distanceToSegment(greenFront.x, greenFront.y, p1[0], p1[1], p2[0], p2[1]);
        if (dist < 2) {
            const len = Math.sqrt(dx * dx + dy * dy);
            dirX = dx / len;
            dirY = dy / len;
            break;
        }
    }
    
    if (dirX === 0 && dirY === 0) {
        // Fallback: use tee to hole direction
        const dx = hole.hole.x - hole.tee.x;
        const dy = hole.hole.y - hole.tee.y;
        const len = Math.sqrt(dx * dx + dy * dy);
        dirX = dx / len;
        dirY = dy / len;
    }
    
    // Extend line from green front along centreline direction until it exits green
    let backX = greenFront.x;
    let backY = greenFront.y;
    const step = 0.5;
    let maxSteps = 200;
    
    while (maxSteps-- > 0) {
        const nextX = backX + dirX * step;
        const nextY = backY + dirY * step;
        
        if (!isPointInGreen(nextX, nextY, greenZone)) {
            break;
        }
        backX = nextX;
        backY = nextY;
    }
    
    // Calculate depth in feet (world units * 4 yards * 3 feet)
    const depthWorld = Math.sqrt((backX - greenFront.x) ** 2 + (backY - greenFront.y) ** 2);
    const depthYards = depthWorld * 4;
    const depthFeet = Math.round(depthYards * 3);
    
    return {
        frontX: greenFront.x,
        frontY: greenFront.y,
        backX: backX,
        backY: backY,
        depthFeet: depthFeet,
        dirX: dirX,
        dirY: dirY
    };
}

// Calculate green width (perpendicular to centreline at midpoint of depth)
function calculateGreenWidth(greenFront, greenZone, depthInfo) {
    // Perpendicular direction (rotate 90 degrees)
    const perpX = -depthInfo.dirY;
    const perpY = depthInfo.dirX;
    
    // Start from midpoint of depth line
    const midX = (depthInfo.frontX + depthInfo.backX) / 2;
    const midY = (depthInfo.frontY + depthInfo.backY) / 2;
    
    // Find left edge
    let leftX = midX;
    let leftY = midY;
    const step = 0.5;
    let maxSteps = 200;
    
    while (maxSteps-- > 0) {
        const nextX = leftX - perpX * step;
        const nextY = leftY - perpY * step;
        
        if (!isPointInGreen(nextX, nextY, greenZone)) {
            break;
        }
        leftX = nextX;
        leftY = nextY;
    }
    
    // Find right edge
    let rightX = midX;
    let rightY = midY;
    maxSteps = 200;
    
    while (maxSteps-- > 0) {
        const nextX = rightX + perpX * step;
        const nextY = rightY + perpY * step;
        
        if (!isPointInGreen(nextX, nextY, greenZone)) {
            break;
        }
        rightX = nextX;
        rightY = nextY;
    }
    
    // Calculate width in feet
    const widthWorld = Math.sqrt((rightX - leftX) ** 2 + (rightY - leftY) ** 2);
    const widthYards = widthWorld * 4;
    const widthFeet = Math.round(widthYards * 3);
    
    return {
        leftX: leftX,
        leftY: leftY,
        rightX: rightX,
        rightY: rightY,
        widthFeet: widthFeet
    };
}

function drawGreenDepthLine(svg, depthInfo, captureData) {
    const frontPos = worldToCapture(depthInfo.frontX, depthInfo.frontY, captureData);
    const backPos = worldToCapture(depthInfo.backX, depthInfo.backY, captureData);
    
    // Draw depth line
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', frontPos.x);
    line.setAttribute('y1', frontPos.y);
    line.setAttribute('x2', backPos.x);
    line.setAttribute('y2', backPos.y);
    line.setAttribute('stroke', 'rgba(255, 255, 255, 0.8)');
    line.setAttribute('stroke-width', '2');
    line.setAttribute('stroke-dasharray', '6,4');
    svg.appendChild(line);
    
    // Draw end markers
    const markerSize = 6;
    [frontPos, backPos].forEach(pos => {
        const marker = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        const angle = Math.atan2(backPos.y - frontPos.y, backPos.x - frontPos.x) + Math.PI / 2;
        const dx = Math.cos(angle) * markerSize;
        const dy = Math.sin(angle) * markerSize;
        marker.setAttribute('x1', pos.x - dx);
        marker.setAttribute('y1', pos.y - dy);
        marker.setAttribute('x2', pos.x + dx);
        marker.setAttribute('y2', pos.y + dy);
        marker.setAttribute('stroke', 'rgba(255, 255, 255, 0.8)');
        marker.setAttribute('stroke-width', '2');
        svg.appendChild(marker);
    });
    
    // Draw depth label - black text, centered on line, rotated parallel
    // Position at 25% along the line (closer to front) to avoid overlap with width label
    const labelX = frontPos.x + (backPos.x - frontPos.x) * 0.25;
    const labelY = frontPos.y + (backPos.y - frontPos.y) * 0.25;
    
    const lineAngle = Math.atan2(backPos.y - frontPos.y, backPos.x - frontPos.x);
    const rotationDeg = (lineAngle * 180 / Math.PI);
    
    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.setAttribute('x', labelX);
    text.setAttribute('y', labelY);
    text.setAttribute('fill', 'black');
    text.setAttribute('font-size', '12');
    text.setAttribute('font-weight', 'bold');
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('dominant-baseline', 'middle');
    text.setAttribute('stroke', 'white');
    text.setAttribute('stroke-width', '2');
    text.setAttribute('paint-order', 'stroke');
    text.setAttribute('transform', `rotate(${rotationDeg}, ${labelX}, ${labelY})`);
    text.textContent = `${depthInfo.depthFeet} ft`;
    svg.appendChild(text);
}

// Draw the width line (horizontal across green at midpoint of depth)
function drawGreenWidthLine(svg, widthInfo, captureData) {
    const leftPos = worldToCapture(widthInfo.leftX, widthInfo.leftY, captureData);
    const rightPos = worldToCapture(widthInfo.rightX, widthInfo.rightY, captureData);
    
    // Draw width line
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', leftPos.x);
    line.setAttribute('y1', leftPos.y);
    line.setAttribute('x2', rightPos.x);
    line.setAttribute('y2', rightPos.y);
    line.setAttribute('stroke', 'rgba(255, 255, 255, 0.8)');
    line.setAttribute('stroke-width', '2');
    line.setAttribute('stroke-dasharray', '6,4');
    svg.appendChild(line);
    
    // Draw end markers
    const markerSize = 6;
    [leftPos, rightPos].forEach(pos => {
        const marker = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        const angle = Math.atan2(rightPos.y - leftPos.y, rightPos.x - leftPos.x) + Math.PI / 2;
        const dx = Math.cos(angle) * markerSize;
        const dy = Math.sin(angle) * markerSize;
        marker.setAttribute('x1', pos.x - dx);
        marker.setAttribute('y1', pos.y - dy);
        marker.setAttribute('x2', pos.x + dx);
        marker.setAttribute('y2', pos.y + dy);
        marker.setAttribute('stroke', 'rgba(255, 255, 255, 0.8)');
        marker.setAttribute('stroke-width', '2');
        svg.appendChild(marker);
    });
    
    // Draw width label - black text, centered on line, rotated parallel
    // Position at 75% along the line (closer to right) to avoid overlap with depth label
    const labelX = leftPos.x + (rightPos.x - leftPos.x) * 0.75;
    const labelY = leftPos.y + (rightPos.y - leftPos.y) * 0.75;
    
    const lineAngle = Math.atan2(rightPos.y - leftPos.y, rightPos.x - leftPos.x);
    const rotationDeg = (lineAngle * 180 / Math.PI);
    
    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.setAttribute('x', labelX);
    text.setAttribute('y', labelY);
    text.setAttribute('fill', 'black');
    text.setAttribute('font-size', '12');
    text.setAttribute('font-weight', 'bold');
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('dominant-baseline', 'middle');
    text.setAttribute('stroke', 'white');
    text.setAttribute('stroke-width', '2');
    text.setAttribute('paint-order', 'stroke');
    text.setAttribute('transform', `rotate(${rotationDeg}, ${labelX}, ${labelY})`);
    text.textContent = `${widthInfo.widthFeet} ft`;
    svg.appendChild(text);
}

function addHoleMarker(svg, holePos, captureData) {
    const pos = worldToCapture(holePos.x, holePos.y, captureData);
    
    // Hole cup (dark circle) - no flag
    const cup = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    cup.setAttribute('cx', pos.x);
    cup.setAttribute('cy', pos.y);
    cup.setAttribute('r', '6');
    cup.setAttribute('fill', '#222');
    cup.setAttribute('stroke', '#fff');
    cup.setAttribute('stroke-width', '1.5');
    svg.appendChild(cup);
}

function addBallMarker(svg, captureData) {
    if (!ballInstance) return;
    
    const ballPos = ballInstance.getPosition();
    const pos = worldToCapture(ballPos.x, ballPos.y, captureData);
    
    // Only show if ball is within the visible area
    if (pos.x < 0 || pos.x > captureData.width || pos.y < 0 || pos.y > captureData.height) {
        return;
    }
    
    // Ball marker - white circle with black outline
    const ball = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    ball.setAttribute('cx', pos.x);
    ball.setAttribute('cy', pos.y);
    ball.setAttribute('r', '5');
    ball.setAttribute('fill', '#fff');
    ball.setAttribute('stroke', '#333');
    ball.setAttribute('stroke-width', '1.5');
    svg.appendChild(ball);
}

function addElevationLegend(container, captureData) {
    const legend = document.createElement('div');
    legend.className = 'green-elevation-legend';
    legend.innerHTML = `
        <div class="legend-gradient">
            <div class="legend-bar"></div>
            <div class="legend-labels">
                <span>Low</span>
                <span>High</span>
            </div>
        </div>
    `;
    container.appendChild(legend);
}

function renderClubsPage(modal, hole) {
    modal.innerHTML = `
        <div class="yardage-header">
            <div class="modal-title">Club Yardages</div>
            <div class="yardage-tabs">
                <button class="yardage-tab-btn" id="hole-tab">Hole</button>
                <button class="yardage-tab-btn" id="green-tab">Green</button>
                <button class="yardage-tab-btn" id="golfer-tab">Golfer</button>
                <button class="yardage-tab-btn" id="course-tab">Course</button>
                <button class="yardage-close-btn" id="close-btn">✕</button>
            </div>
        </div>
        <div class="clubs-page">
            ${renderClubsListExpandable()}
        </div>
    `;
    
    modal.querySelectorAll('.club-header').forEach(header => {
        header.addEventListener('click', () => {
            const item = header.parentElement;
            const wasExpanded = item.classList.contains('expanded');
            modal.querySelectorAll('.club-expandable').forEach(el => el.classList.remove('expanded'));
            if (!wasExpanded) {
                item.classList.add('expanded');
            }
        });
    });
    
    modal.querySelector('#close-btn').addEventListener('click', () => {
        modal.closest('.modal-overlay').remove();
    });
    modal.querySelector('#hole-tab').addEventListener('click', () => {
        currentPage = 'hole';
        renderPage(modal, hole);
    });
    modal.querySelector('#green-tab').addEventListener('click', () => {
        currentPage = 'green';
        renderPage(modal, hole);
    });
    modal.querySelector('#golfer-tab').addEventListener('click', () => {
        currentPage = 'golfer';
        renderPage(modal, hole);
    });
    modal.querySelector('#course-tab').addEventListener('click', () => {
        currentPage = 'course';
        renderPage(modal, hole);
    });
}

function renderClubsListExpandable() {
    return `<div class="clubs-list-expandable">
        ${shotClubs.map(club => renderClubExpandable(club)).join('')}
    </div>`;
}

function renderClubExpandable(club) {
    const shots = golfer.shotHistory[club.name] || [];
    const stats = calculateStatsFromShots(shots);
    
    let distArrow = '•', distVal = 0;
    if (stats.distAvg > 0) { distArrow = '↑'; distVal = stats.distAvg; }
    else if (stats.distAvg < 0) { distArrow = '↓'; distVal = Math.abs(stats.distAvg); }
    
    let dirArrow = '•', dirVal = 0;
    if (stats.dirAvg > 0) { dirArrow = '→'; dirVal = stats.dirAvg; }
    else if (stats.dirAvg < 0) { dirArrow = '←'; dirVal = Math.abs(stats.dirAvg); }
    
    const missDisplay = stats.dominantMiss || 'None';
    const missRatePct = Math.round(stats.missRate * 100);
    
    return `
        <div class="club-expandable">
            <div class="club-header">
                <span class="club-header-name">${club.name}</span>
                <span class="club-header-yards">${club.yards}</span>
                <span class="club-header-stat">${distArrow}${distVal}</span>
                <span class="club-header-stat">${dirArrow}${dirVal}</span>
            </div>
            <div class="club-details">
                <div class="club-dispersion-mini">
                    ${renderMiniDispersionFromShots(shots, stats)}
                </div>
                <div class="club-stats-row">
                    <div class="club-stat">
                        <span class="club-stat-label">Distance</span>
                        <span class="club-stat-value">${distArrow}${distVal}y</span>
                    </div>
                    <div class="club-stat">
                        <span class="club-stat-label">Direction</span>
                        <span class="club-stat-value">${dirArrow}${dirVal}y</span>
                    </div>
                    <div class="club-stat">
                        <span class="club-stat-label">Bias</span>
                        <span class="club-stat-value">${stats.bias}</span>
                    </div>
                    <div class="club-stat">
                        <span class="club-stat-label">Miss ${missRatePct}%</span>
                        <span class="club-stat-value">${missDisplay}</span>
                    </div>
                </div>
            </div>
        </div>
    `;
}

function calculateStatsFromShots(shots) {
    if (shots.length === 0) {
        return { distAvg: 0, dirAvg: 0, bias: 'Center', maxExtent: 10, missRate: 0, dominantMiss: null };
    }
    
    const normalShots = shots.filter(s => !s.miss);
    const missShots = shots.filter(s => s.miss);
    const missRate = shots.length > 0 ? missShots.length / shots.length : 0;
    
    let dominantMiss = null;
    if (missShots.length > 0) {
        const avgMissX = missShots.reduce((sum, s) => sum + s.x, 0) / missShots.length;
        const avgMissY = missShots.reduce((sum, s) => sum + s.y, 0) / missShots.length;
        
        const isRight = avgMissX > 3, isLeft = avgMissX < -3;
        const isShort = avgMissY < -3, isLong = avgMissY > 3;
        
        if (isRight && isShort) dominantMiss = 'Push-Fade';
        else if (isLeft && isLong) dominantMiss = 'Pull-Draw';
        else if (isRight) dominantMiss = 'Push';
        else if (isLeft) dominantMiss = 'Pull';
        else if (isShort) dominantMiss = 'Short';
        else if (isLong) dominantMiss = 'Long';
        else dominantMiss = 'Mixed';
    }
    
    const allX = shots.map(s => Math.abs(s.x));
    const allY = shots.map(s => Math.abs(s.y));
    const maxExtent = Math.max(...allX, ...allY, 10);
    
    if (normalShots.length === 0) {
        return { distAvg: 0, dirAvg: 0, bias: 'Center', maxExtent, missRate, dominantMiss };
    }
    
    const distAvg = Math.round(normalShots.reduce((sum, s) => sum + s.y, 0) / normalShots.length);
    const dirAvg = Math.round(normalShots.reduce((sum, s) => sum + s.x, 0) / normalShots.length);
    
    let bias = 'Center';
    if (dirAvg > 2) bias = 'Right';
    else if (dirAvg < -2) bias = 'Left';
    
    return { distAvg, dirAvg, bias, maxExtent, missRate, dominantMiss };
}

function renderMiniDispersionFromShots(shots, stats) {
    if (shots.length === 0) {
        return `
            <div class="mini-dispersion-crosshair-v"></div>
            <div class="mini-dispersion-crosshair-h"></div>
            <div class="mini-dispersion-target"></div>
            <div class="no-shots-mini">No shots</div>
        `;
    }
    
    const mapRange = stats.maxExtent * 1.2;
    const yardsToPercent = (yards) => 50 + (yards / mapRange) * 45;
    
    const points = shots.map(s => ({
        x: clamp(yardsToPercent(s.x), 2, 98),
        y: clamp(yardsToPercent(-s.y), 2, 98),
        miss: s.miss,
        thisRound: s.thisRound
    }));
    
    let ringYards;
    if (mapRange < 12) ringYards = [2, 4, 6];
    else if (mapRange < 20) ringYards = [5, 10, 15];
    else if (mapRange < 35) ringYards = [5, 10, 20];
    else ringYards = [10, 20, 30];
    
    const ringPercent = (yards) => (yards / mapRange) * 90;
    
    return `
        <div class="mini-dispersion-crosshair-v"></div>
        <div class="mini-dispersion-crosshair-h"></div>
        <div class="mini-ring" style="width: ${ringPercent(ringYards[0])}%; height: ${ringPercent(ringYards[0])}%;" data-yards="${ringYards[0]}y"></div>
        <div class="mini-ring" style="width: ${ringPercent(ringYards[1])}%; height: ${ringPercent(ringYards[1])}%;" data-yards="${ringYards[1]}y"></div>
        <div class="mini-ring" style="width: ${ringPercent(ringYards[2])}%; height: ${ringPercent(ringYards[2])}%;" data-yards="${ringYards[2]}y"></div>
        <div class="mini-dispersion-target"></div>
        ${points.map(p => {
            let className = 'mini-dispersion-point';
            if (p.miss) className += ' miss';
            if (p.thisRound) className += ' this-round';
            return `<div class="${className}" style="left: ${p.x}%; top: ${p.y}%"></div>`;
        }).join('')}
        <span class="mini-label-short">Short</span>
        <span class="mini-label-long">Long</span>
    `;
}

function renderGolferPage(modal, hole) {
    const g = golfer;
    
    modal.innerHTML = `
        <div class="yardage-header">
            <div class="modal-title">${g.name} - Mental State</div>
            <div class="yardage-tabs">
                <button class="yardage-tab-btn" id="hole-tab">Hole</button>
                <button class="yardage-tab-btn" id="green-tab">Green</button>
                <button class="yardage-tab-btn" id="clubs-tab">Clubs</button>
                <button class="yardage-tab-btn" id="course-tab">Course</button>
                <button class="yardage-close-btn" id="close-btn">✕</button>
            </div>
        </div>
        <div class="golfer-stats">
            <div class="stat-section">
                <div class="stat-title">Current State</div>
                <div class="mental-state-display">
                    <div class="mental-meter">
                        <div class="mental-meter-fill" style="width: ${g.mental.confidence}%"></div>
                    </div>
                    <div class="mental-label">Confidence</div>
                </div>
                <div class="mental-state-display">
                    <div class="mental-meter pressure">
                        <div class="mental-meter-fill" style="width: ${g.mental.pressure}%"></div>
                    </div>
                    <div class="mental-label">Pressure</div>
                </div>
                <div class="mental-state-display">
                    <div class="mental-meter focus">
                        <div class="mental-meter-fill" style="width: ${g.mental.focus}%"></div>
                    </div>
                    <div class="mental-label">Focus</div>
                </div>
            </div>
            
            <div class="stat-section">
                <div class="stat-title">Effects</div>
                <div class="mental-effects">
                    ${renderMentalEffects(g.mental)}
                </div>
            </div>
            
            <div class="stat-section">
                <div class="stat-title">Recent Form</div>
                <div class="recent-shots">
                    ${renderRecentShots(g.recentShots || [])}
                </div>
            </div>
        </div>
    `;
    
    modal.querySelector('#close-btn').addEventListener('click', () => {
        modal.closest('.modal-overlay').remove();
    });
    modal.querySelector('#hole-tab').addEventListener('click', () => {
        currentPage = 'hole';
        renderPage(modal, hole);
    });
    modal.querySelector('#green-tab').addEventListener('click', () => {
        currentPage = 'green';
        renderPage(modal, hole);
    });
    modal.querySelector('#clubs-tab').addEventListener('click', () => {
        currentPage = 'clubs';
        renderPage(modal, hole);
    });
    modal.querySelector('#course-tab').addEventListener('click', () => {
        currentPage = 'course';
        renderPage(modal, hole);
    });
}

function renderMentalEffects(mental) {
    const effects = [];
    
    if (mental.confidence < 40) effects.push({ text: 'Low confidence: +15% miss rate', type: 'negative' });
    else if (mental.confidence > 80) effects.push({ text: 'High confidence: -10% miss rate', type: 'positive' });
    
    if (mental.pressure > 70) effects.push({ text: 'Under pressure: +20% direction spread', type: 'negative' });
    
    if (mental.focus < 50) effects.push({ text: 'Losing focus: +10% distance spread', type: 'negative' });
    else if (mental.focus > 80) effects.push({ text: 'Locked in: -5% all spreads', type: 'positive' });
    
    if (effects.length === 0) effects.push({ text: 'Steady state - no modifiers', type: 'neutral' });
    
    return effects.map(e => `<div class="mental-effect ${e.type}">${e.text}</div>`).join('');
}

function renderRecentShots(shots) {
    if (shots.length === 0) return '<div class="no-shots">No shots yet</div>';
    
    return shots.slice(-5).map(shot => `
        <div class="recent-shot ${shot.quality}">
            <span class="shot-club">${shot.club}</span>
            <span class="shot-result">${shot.result}</span>
        </div>
    `).join('');
}
