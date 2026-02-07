// Yardage Book modal - captures the actual game world rendering
// No separate re-rendering - just a screenshot of the 3D world from top-down view
import { getSlopeAt, findGreenFront, getTerrainAt, TerrainType, getElevationAt } from './terrain.js';
import { golfer } from './golfer.js';
import { shotClubs } from './clubs.js';
import { 
    WORLD_SCALE, 
    clamp, 
    yardsToWorld, 
    findCircleCentrelineIntersection,
    isPointInPolygon,
    distanceToSegment
} from './utils.js';

let currentPage = 'hole'; // 'hole', 'golfer', 'green', or 'clubs'
let worldInstance = null; // Reference to the game world for capturing
let objectsToHideList = []; // Objects to hide during capture (aim line, ball, etc.)

// Set the world instance (called from ui.js)
export function setYardageBookWorld(world) {
    worldInstance = world;
}

// Set objects to hide during capture
export function setObjectsToHide(objects) {
    objectsToHideList = objects || [];
}

// Convert world coordinates to screen position on the captured image
// The camera is positioned above center3D, looking down, rotated by rotationAngle
function worldToCapture(worldX, worldY, captureData) {
    const { centerWorld, rotationAngle, viewWidth, viewHeight, width, height } = captureData;
    
    // Convert world coords to 3D coords (same as world.worldTo3D)
    const x3D = (worldX - 50) * WORLD_SCALE;
    const z3D = (worldY - 50) * WORLD_SCALE;
    
    // Center in 3D
    const cx3D = (centerWorld.x - 50) * WORLD_SCALE;
    const cz3D = (centerWorld.y - 50) * WORLD_SCALE;
    
    // Offset from center
    const dx = x3D - cx3D;
    const dz = z3D - cz3D;
    
    // Apply rotation (camera rotates around Z axis when looking down)
    const cos = Math.cos(rotationAngle);
    const sin = Math.sin(rotationAngle);
    const rx = dx * cos + dz * sin;
    const rz = -dx * sin + dz * cos;
    
    // Convert to pixel coordinates
    const pxX = (rx / viewWidth + 0.5) * width;
    const pxY = (rz / viewHeight + 0.5) * height;
    
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
    
    // Capture the world view (hide aim line, ball, tracer)
    let capturedCanvas = null;
    if (worldInstance) {
        capturedCanvas = worldInstance.captureYardageBookView(hole, width, height, objectsToHideList);
    }
    
    // Clear loading message
    mapContainer.innerHTML = '';
    
    if (capturedCanvas) {
        // Add the captured image as background
        capturedCanvas.style.cssText = 'position: absolute; left: 0; top: 0; width: 100%; height: 100%;';
        mapContainer.appendChild(capturedCanvas);
        
        // Store capture data for overlay positioning
        const captureData = {
            centerWorld: capturedCanvas.centerWorld,
            rotationAngle: capturedCanvas.rotationAngle,
            viewWidth: capturedCanvas.viewWidth,
            viewHeight: capturedCanvas.viewHeight,
            width: width,
            height: height
        };
        
        // Add overlays (yardage circles, markers, flag)
        renderYardageOverlays(mapContainer, hole, captureData);
    } else {
        mapContainer.innerHTML = '<div class="yardage-fallback">Unable to capture hole view</div>';
    }
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
    
    // Collect all occupied positions (yardage markers) to avoid label overlap
    const occupiedPositions = [];
    
    // Add fairway yardage markers FIRST (100, 150, 200 from front of green) - below everything else
    if (hole.centreline && greenFront) {
        const markerYardages = [100, 150, 200];
        const markerColors = ['#ff4444', '#ffffff', '#4488ff']; // Red, White, Blue
        markerYardages.forEach((yards, idx) => {
            const radiusWorld = yardsToWorld(yards);
            const markerWorldPos = findCircleCentrelineIntersection(hole.centreline, greenFront, radiusWorld);
            if (markerWorldPos) {
                const pos = worldToCapture(markerWorldPos.x, markerWorldPos.y, captureData);
                addYardageMarker(svg, pos, markerColors[idx]);
                occupiedPositions.push({ x: pos.x, y: pos.y, radius: 12 }); // marker radius + padding
            }
        });
    }
    
    // Add slope arrows
    addSlopeArrows(svg, hole, captureData);
    
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

function addYardageMarker(svg, pos, color) {
    // Simple circle, no outline, no label, half size
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('cx', pos.x);
    circle.setAttribute('cy', pos.y);
    circle.setAttribute('r', '5');
    circle.setAttribute('fill', color);
    svg.appendChild(circle);
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

// Add slope arrows showing terrain gradient
// Arrows point downhill, length proportional to gradient
function addSlopeArrows(svg, hole, captureData) {
    const { centerWorld, viewWidth, viewHeight, width, height } = captureData;
    
    // Grid spacing in world units (yards) - dense coverage
    const gridSpacing = 8;
    
    // Minimum gradient to show arrow (feet per yard) - skip flat-ish areas
    const minGradient = 0.1;
    
    // Arrow length scaling (pixels per unit gradient)
    const arrowScale = 250;
    const maxArrowLength = 18;
    
    // Calculate world bounds visible in capture
    const halfViewW = viewWidth / (2 * WORLD_SCALE);
    const halfViewH = viewHeight / (2 * WORLD_SCALE);
    
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
            
            // Skip if gradient too small (flat-ish areas)
            if (slope.magnitude < minGradient) continue;
            
            // Arrow length based on gradient - longer = steeper
            // Subtract minGradient so arrows at threshold are shortest
            const effectiveGradient = slope.magnitude - minGradient;
            const arrowLength = Math.min(effectiveGradient * arrowScale, maxArrowLength);
            
            // Get screen position
            const pos = worldToCapture(worldX, worldY, captureData);
            
            // Skip if outside visible area
            if (pos.x < 0 || pos.x > width || pos.y < 0 || pos.y > height) continue;
            
            // Downhill direction (negative of gradient)
            // slope.x and slope.y are uphill gradients, so negate for downhill
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
            
            // Calculate arrow endpoints
            // Arrow starts at grid point, ends at downhill direction
            const halfLen = arrowLength / 2;
            const startX = pos.x - rotDirX * halfLen;
            const startY = pos.y - rotDirY * halfLen;
            const endX = pos.x + rotDirX * halfLen;
            const endY = pos.y + rotDirY * halfLen;
            
            // Create arrow line - black
            const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            line.setAttribute('x1', startX);
            line.setAttribute('y1', startY);
            line.setAttribute('x2', endX);
            line.setAttribute('y2', endY);
            line.setAttribute('stroke', 'black');
            line.setAttribute('stroke-width', '1.5');
            arrowGroup.appendChild(line);
            
            // Create arrowhead at downhill end (end point)
            const headSize = 4;
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
            arrowGroup.appendChild(arrowhead);
        }
    }
    
    svg.appendChild(arrowGroup);
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
    
    // Capture the world view focused on the green
    let capturedCanvas = null;
    if (worldInstance) {
        capturedCanvas = worldInstance.captureGreenView(hole, greenBounds, width, height, objectsToHideList);
    }
    
    // Clear loading message
    mapContainer.innerHTML = '';
    
    if (capturedCanvas) {
        // Add the captured image as background
        capturedCanvas.style.cssText = 'position: absolute; left: 0; top: 0; width: 100%; height: 100%;';
        mapContainer.appendChild(capturedCanvas);
        
        // Store capture data for overlay positioning
        const captureData = {
            centerWorld: capturedCanvas.centerWorld,
            rotationAngle: capturedCanvas.rotationAngle,
            viewWidth: capturedCanvas.viewWidth,
            viewHeight: capturedCanvas.viewHeight,
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
        
        mapContainer.appendChild(svg);
        
        // Add elevation legend
        addElevationLegend(mapContainer, captureData);
    } else {
        // Fallback to canvas rendering if world capture fails
        renderGreenMapFallback(mapContainer, hole, greenZone, greenBounds, width, height);
    }
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
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
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
    text.setAttribute('font-size', '11');
    text.setAttribute('font-weight', 'bold');
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('dominant-baseline', 'middle');
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
    text.setAttribute('font-size', '11');
    text.setAttribute('font-weight', 'bold');
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('dominant-baseline', 'middle');
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
