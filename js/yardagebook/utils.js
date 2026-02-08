// Shared utilities for yardage book rendering
// Extracted from yardageBook.js for modular organization

import { THEME_COLORS } from '../theme-colors.js';


/**
 * Transform world coordinates to capture/canvas coordinates
 * Handles rotation for the map view orientation
 * 
 * @param {number} worldX - X coordinate in world space
 * @param {number} worldY - Y coordinate in world space
 * @param {Object} captureData - Capture configuration object
 * @param {Object} captureData.centerWorld - Center point in world coordinates {x, y}
 * @param {number} captureData.rotationAngle - Rotation angle in radians
 * @param {number} captureData.viewWidth - View width in world units
 * @param {number} captureData.viewHeight - View height in world units
 * @param {number} captureData.width - Canvas width in pixels
 * @param {number} captureData.height - Canvas height in pixels
 * @returns {Object} Canvas coordinates {x, y}
 */
export function worldToCapture(worldX, worldY, captureData) {
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

/**
 * Draw a terrain polygon on canvas
 * 
 * @param {CanvasRenderingContext2D} ctx - Canvas 2D context
 * @param {Array<Array<number>>} points - Array of [x, y] coordinate pairs
 * @param {Function} worldToCanvas - Coordinate transform function
 */
function drawTerrainPolygon(ctx, points, worldToCanvas) {
    if (!points || points.length < 3) return;
    
    ctx.beginPath();
    points.forEach((pt, i) => {
        const pos = worldToCanvas(pt[0], pt[1]);
        if (i === 0) ctx.moveTo(pos.x, pos.y);
        else ctx.lineTo(pos.x, pos.y);
    });
    ctx.closePath();
    ctx.fill();
}

/**
 * Draw a terrain ellipse on canvas
 * 
 * @param {CanvasRenderingContext2D} ctx - Canvas 2D context
 * @param {Object} feature - Ellipse feature with cx, cy, rx, ry properties
 * @param {Function} worldToCanvas - Coordinate transform function
 */
function drawTerrainEllipse(ctx, feature, worldToCanvas) {
    ctx.beginPath();
    // Draw ellipse by sampling points around the perimeter
    for (let a = 0; a <= Math.PI * 2; a += 0.1) {
        const wx = feature.cx + feature.rx * Math.cos(a);
        const wy = feature.cy + feature.ry * Math.sin(a);
        const pos = worldToCanvas(wx, wy);
        if (a === 0) ctx.moveTo(pos.x, pos.y);
        else ctx.lineTo(pos.x, pos.y);
    }
    ctx.closePath();
    ctx.fill();
}

/**
 * Draw a terrain rectangle on canvas
 * Handles rotation by transforming all four corners
 * 
 * @param {CanvasRenderingContext2D} ctx - Canvas 2D context
 * @param {Object} feature - Rectangle feature with x, y, width, height properties
 * @param {Function} worldToCanvas - Coordinate transform function
 */
function drawTerrainRect(ctx, feature, worldToCanvas) {
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
}

/**
 * Draw all terrain features of a given type on canvas
 * Handles polygon, rect, and ellipse shapes
 * 
 * @param {CanvasRenderingContext2D} ctx - Canvas 2D context
 * @param {Array<Object>} features - Array of terrain features
 * @param {Function} worldToCanvas - Coordinate transform function
 */
export function drawTerrainFeatures(ctx, features, worldToCanvas) {
    if (!features) return;
    
    features.forEach(feature => {
        if (feature.shape === 'polygon' && feature.points) {
            drawTerrainPolygon(ctx, feature.points, worldToCanvas);
        } else if (feature.shape === 'rect') {
            drawTerrainRect(ctx, feature, worldToCanvas);
        } else if (feature.shape === 'ellipse') {
            drawTerrainEllipse(ctx, feature, worldToCanvas);
        }
    });
}

/**
 * Calculate the bounding box for a hole including all terrain and trees
 * Used for determining map view extents
 * 
 * @param {Object} hole - Hole data with tee and hole positions
 * @param {Object} terrain - Terrain data with feature arrays
 * @param {Array<Object>} trees - Array of tree objects with x, y positions
 * @param {number} padding - Padding to add around bounds (default: 15 world units)
 * @returns {Object} Bounds object {minX, maxX, minY, maxY}
 */
export function calculateHoleBounds(hole, terrain, trees, padding = 15) {
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
    
    // Include trees (with small buffer for canopy)
    if (trees) {
        trees.forEach(tree => {
            minX = Math.min(minX, tree.x - 5);
            maxX = Math.max(maxX, tree.x + 5);
            minY = Math.min(minY, tree.y - 5);
            maxY = Math.max(maxY, tree.y + 5);
        });
    }
    
    // Fallback for empty bounds
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

/**
 * Draw path features (cart paths, etc.) on canvas
 * 
 * @param {CanvasRenderingContext2D} ctx - Canvas 2D context
 * @param {Array<Object>} paths - Array of path features
 * @param {Function} worldToCanvas - Coordinate transform function
 * @param {number} viewWidth - View width in world units
 * @param {number} canvasWidth - Canvas width in pixels
 */
export function drawPathFeatures(ctx, paths, worldToCanvas, viewWidth, canvasWidth) {
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


/**
 * Convert capture/canvas coordinates back to world coordinates.
 * Inverse of worldToCapture.
 * 
 * @param {number} px - Pixel X coordinate
 * @param {number} py - Pixel Y coordinate
 * @param {Object} captureData - Capture configuration
 * @returns {Object} World coordinates {x, y}
 */
export function captureToWorld(px, py, captureData) {
    const { centerWorld, rotationAngle, viewWidth, viewHeight, width, height } = captureData;
    
    // Convert pixel to normalized coords (-0.5 to 0.5)
    const nx = (px / width) - 0.5;
    const ny = (py / height) - 0.5;
    
    // Scale to view size (viewWidth/viewHeight are already in world units)
    const rx = nx * viewWidth;
    const rz = ny * viewHeight;
    
    // Reverse rotation
    const cos = Math.cos(-rotationAngle);
    const sin = Math.sin(-rotationAngle);
    const dx = rx * cos + rz * sin;
    const dz = -rx * sin + rz * cos;
    
    return {
        x: centerWorld.x + dx,
        y: centerWorld.y + dz
    };
}

/**
 * Add slope arrows showing terrain gradient to an SVG element.
 * Arrows point downhill, fixed length, opacity indicates steepness.
 * 
 * @param {SVGElement} svg - The SVG element to add arrows to
 * @param {Object} hole - The hole data object
 * @param {Object} captureData - Capture configuration
 * @param {Object} options - Arrow configuration options
 * @param {number} options.gridSpacing - Grid spacing in world units (default: 5)
 * @param {number} options.minGradient - Minimum gradient to show arrow (default: 0.35)
 * @param {number} options.maxGradient - Gradient for full opacity (default: 4.0)
 * @param {number} options.arrowLength - Fixed arrow length in pixels (default: 10)
 * @param {Function} options.skipCondition - Optional function(terrain, worldX, worldY) returning true to skip
 * @param {Function} getSlopeAt - Function to get slope at world position
 * @param {Function} getTerrainAt - Function to get terrain type at world position
 * @param {Object} TerrainType - Terrain type enum
 */
export function addSlopeArrows(svg, hole, captureData, options, getSlopeAt, getTerrainAt, TerrainType) {
    const { centerWorld, viewWidth, viewHeight, width, height } = captureData;
    
    // Default options
    const gridSpacing = options.gridSpacing ?? 5;
    const minGradient = options.minGradient ?? 0.35;
    const maxGradient = options.maxGradient ?? 4.0;
    const arrowLength = options.arrowLength ?? 10;
    const skipCondition = options.skipCondition;
    
    // Calculate world bounds visible in capture
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
            // Skip greens, bunkers, and water by default
            const terrain = getTerrainAt(hole, worldX, worldY);
            if (terrain === TerrainType.GREEN || 
                terrain === TerrainType.BUNKER || 
                terrain === TerrainType.WATER) continue;
            
            // Custom skip condition
            if (skipCondition && skipCondition(terrain, worldX, worldY)) continue;
            
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

/**
 * Draw outline for a single terrain feature on SVG.
 * 
 * @param {SVGGElement} group - The SVG group element
 * @param {Object} feature - The terrain feature
 * @param {Object} captureData - Capture configuration
 */
export function drawTerrainOutline(group, feature, captureData) {
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

/**
 * Add a compass rose to a container element.
 * Shows north direction relative to the rotated map view.
 * 
 * @param {HTMLElement} container - The container element
 * @param {number} rotationAngle - Map rotation angle in radians
 */
export function addCompassRose(container, rotationAngle) {
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
                <circle cx="25" cy="25" r="22" fill="rgba(255,255,255,0.8)" stroke="${THEME_COLORS.textDark}" stroke-width="1"/>
                
                <!-- North arrow (red) -->
                <polygon points="25,5 21,20 25,17 29,20" fill="${THEME_COLORS.compassRed}" stroke="${THEME_COLORS.compassDarkRed}" stroke-width="0.5"/>
                
                <!-- South arrow (white) -->
                <polygon points="25,45 21,30 25,33 29,30" fill="${THEME_COLORS.markerWhite}" stroke="${THEME_COLORS.textDark}" stroke-width="0.5"/>
                
                <!-- East-West line -->
                <line x1="8" y1="25" x2="17" y2="25" stroke="${THEME_COLORS.textDark}" stroke-width="1.5"/>
                <line x1="33" y1="25" x2="42" y2="25" stroke="${THEME_COLORS.textDark}" stroke-width="1.5"/>
                
                <!-- N label -->
                <text x="25" y="14" text-anchor="middle" font-size="8" font-weight="bold" fill="${THEME_COLORS.compassRed}">N</text>
                
                <!-- Center dot -->
                <circle cx="25" cy="25" r="2" fill="${THEME_COLORS.textDark}"/>
            </g>
        </svg>
    `;
    
    container.appendChild(rose);
}

/**
 * Draw flattened 2D tree canopy based on tree type.
 * Creates clusters of circles to represent the canopy from above.
 * 
 * @param {CanvasRenderingContext2D} ctx - Canvas 2D context
 * @param {Object} pos - Screen position {x, y}
 * @param {number} canopyRadius - Canopy radius in world units
 * @param {string} category - Tree category (tall_pine, short_pine, deciduous)
 * @param {number} seed - Random seed for consistent appearance
 * @param {number} viewWidth - View width in world units
 * @param {number} canvasWidth - Canvas width in pixels
 * @param {number} rotationAngle - Map rotation angle in radians
 * @param {Function} seededRandom - Seeded random function
 */
export function drawTree2DCanopy(ctx, pos, canopyRadius, category, seed, viewWidth, canvasWidth, rotationAngle, seededRandom) {
    const scale = canvasWidth / viewWidth;
    
    if (category === 'tall_pine') {
        // Tall pines - sparse clusters at branch ends
        const branchCount = 4 + Math.floor(seededRandom(seed + 20) * 3);
        
        for (let i = 0; i < branchCount; i++) {
            const angle = seededRandom(seed + 40 + i) * Math.PI * 2 + rotationAngle;
            const branchLength = canopyRadius * (0.4 + seededRandom(seed + 50 + i) * 0.5);
            
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


/**
 * Calculate hole yardage from centreline or tee-to-hole distance.
 * Uses front of tee to front of green along centreline.
 * 
 * @param {Object} hole - Hole data with centreline, tee, and hole positions
 * @returns {number} Hole yardage
 */
export function calculateHoleYardage(hole) {
    const WORLD_TO_YARDS = 4;
    
    // If centreline exists, use it
    if (hole.centreline && hole.centreline.length >= 2) {
        let totalDist = 0;
        for (let i = 1; i < hole.centreline.length; i++) {
            const p1 = hole.centreline[i - 1];
            const p2 = hole.centreline[i];
            const dx = p2[0] - p1[0];
            const dy = p2[1] - p1[1];
            totalDist += Math.sqrt(dx * dx + dy * dy);
        }
        return Math.round(totalDist * WORLD_TO_YARDS);
    }
    
    // Fallback: straight line from tee to hole
    if (hole.tee && hole.hole) {
        const dx = hole.hole.x - hole.tee.x;
        const dy = hole.hole.y - hole.tee.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        return Math.round(dist * WORLD_TO_YARDS);
    }
    
    return 0;
}
