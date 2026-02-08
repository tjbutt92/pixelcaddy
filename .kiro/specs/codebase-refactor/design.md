# Design Document: Codebase Refactor

## Overview

This design document outlines the architecture and implementation approach for a comprehensive refactoring of the Golf Caddy game. The refactoring focuses on:

1. Removing the landing page for direct game loading
2. Eliminating duplicate code across modules
3. Extracting magic numbers to named constants
4. Reorganizing the yardage book into a modular structure with swipeable tabs
5. Implementing new UI controls (expandable sliders, swipe-up yardage book)
6. Unifying the wind system
7. Optimizing world generation performance
8. Adding pause support to the game loop

## Architecture

### Current Architecture Issues

```
┌─────────────────────────────────────────────────────────────────┐
│                     CURRENT STRUCTURE                            │
├─────────────────────────────────────────────────────────────────┤
│  index.html (landing page + game)                                │
│  ├── game.js (init, startGame, landing page logic)              │
│  ├── ui.js (wind indicator, modals, button bar)                 │
│  ├── yardageBook.js (2870 lines, all tabs in one file)          │
│  │                                                               │
│  DUPLICATED FUNCTIONS:                                           │
│  ├── gaussianRandom: clubs.js, golfer.js, physics.js            │
│  ├── getClubLieDifficulty: lie.js, physics.js                   │
│  ├── seededRandom: yardageBook.js, trees.js, world.js           │
│  ├── distanceToSegment: utils.js, terrain.js                    │
│                                                                  │
│  MAGIC NUMBERS scattered throughout all modules                  │
└─────────────────────────────────────────────────────────────────┘
```

### Target Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     TARGET STRUCTURE                             │
├─────────────────────────────────────────────────────────────────┤
│  index.html (game only, no landing page)                         │
│  ├── js/                                                         │
│  │   ├── constants.js (all magic numbers)                       │
│  │   ├── utils.js (consolidated utilities)                      │
│  │   ├── game.js (direct init, game loop with pause)            │
│  │   ├── ui.js (new layout, expandable controls)                │
│  │   ├── wind.js (unified wind state)                           │
│  │   │                                                           │
│  │   ├── yardagebook/                                           │
│  │   │   ├── index.js (main entry, swipe handling)              │
│  │   │   ├── utils.js (shared drawing, transforms)              │
│  │   │   ├── hole-tab.js                                        │
│  │   │   ├── green-tab.js                                       │
│  │   │   ├── golfer-tab.js                                      │
│  │   │   ├── clubs-tab.js                                       │
│  │   │   └── course-tab.js                                      │
│  │   │                                                           │
│  │   └── [other modules - cleaned up]                           │
└─────────────────────────────────────────────────────────────────┘
```

## Components and Interfaces

### 1. Constants Module (js/constants.js)

Centralizes all magic numbers into named constants.

```javascript
// Physics constants
export const PHYSICS = {
    GRAVITY: 9.81,              // m/s²
    AIR_DENSITY: 1.225,         // kg/m³
    BALL_MASS: 0.0459,          // kg
    BALL_RADIUS: 0.02135,       // m
    BALL_AREA: Math.PI * 0.02135 * 0.02135
};

// Conversion factors
export const CONVERSION = {
    MPH_TO_MS: 0.44704,
    MS_TO_MPH: 2.23694,
    YARDS_TO_METERS: 0.9144,
    METERS_TO_YARDS: 1.09361,
    RPM_TO_RADS: Math.PI / 30,
    WORLD_SCALE: 4,
    YARDS_TO_WORLD: 0.25
};

// Camera settings
export const CAMERA = {
    HEIGHT: 4,                  // yards above ball
    BEHIND_DISTANCE: 10,        // yards behind ball
    FOV: 60,
    NEAR: 0.1,
    FAR: 12000
};

// Animation timings (ms)
export const TIMING = {
    SHOT_TRACER_MIN: 1500,
    SHOT_TRACER_MAX: 2500,
    CAMERA_FLY_MIN: 1800,
    CAMERA_FLY_MAX: 3500,
    BOUNCE_DURATION: 300,
    ROLL_DURATION: 500,
    OVERLAY_FADE: 500
};

// Terrain colors
export const TERRAIN_COLORS = {
    FAIRWAY: 0x3d6b35,
    ROUGH: 0x2d5a27,
    GREEN: 0x5cb85c,
    BUNKER: 0xe8d4a8,
    WATER: 0x3498db,
    TEE: 0x4a7c43,
    OUT_OF_BOUNDS: 0x1a1a1a
};

// Sky configuration
export const SKY = {
    SUN_COLOR: 0xfffacd,
    SUN_SIZE: 80,
    SUN_DISTANCE: 3000,
    SUN_ELEVATION: 80,
    SUN_AZIMUTH: 30,
    CLOUD_COUNT: 15,
    CLOUD_MIN_HEIGHT: 400,
    CLOUD_MAX_HEIGHT: 600,
    CLOUD_SPREAD: 2000
};
```

### 2. Consolidated Utils Module (js/utils.js)

All shared utility functions in one place.

```javascript
// Random number generators
export function gaussianRandom() { /* single implementation */ }
export function seededRandom(seed) { /* single implementation */ }

// Geometry functions
export function isPointInPolygon(x, y, points) { /* ... */ }
export function distanceToSegment(px, py, x1, y1, x2, y2) { /* ... */ }
export function distanceToPolygon(x, y, points) { /* ... */ }
export function lineSegmentIntersect(p1, p2, p3, p4) { /* ... */ }

// Interpolation
export function smoothstep(t) { /* ... */ }
export function cubicInterpolate(p0, p1, p2, p3, t) { /* ... */ }
export function bicubicInterpolate(data, x, y, cols, rows) { /* ... */ }

// Coordinate conversion
export function yardsToWorld(yards) { /* ... */ }
export function worldToYards(worldUnits) { /* ... */ }

// Centreline utilities
export function findCircleCentrelineIntersection(centreline, refPoint, radiusWorld) { /* ... */ }
export function findPointAtYardageFromRef(centreline, refPoint, yards) { /* ... */ }

// Club utilities (moved from lie.js and physics.js)
export function getClubLieDifficulty(clubName, lieType) { /* single implementation */ }
```

### 3. Unified Wind System (js/wind.js)

Single source of truth for wind state.

```javascript
// Wind state - single instance
const windState = {
    speed: 0,           // mph
    direction: 0,       // degrees (0 = from north)
    lastChange: Date.now()
};

// Initialize wind for a hole
export function initializeWind() {
    const speedRoll = Math.random();
    if (speedRoll < 0.3) windState.speed = Math.random() * 5;
    else if (speedRoll < 0.7) windState.speed = 5 + Math.random() * 5;
    else windState.speed = 10 + Math.random() * 10;
    
    windState.direction = Math.round(Math.random() * 360);
    windState.lastChange = Date.now();
    return getWind();
}

// Get current wind (may randomly change)
export function getWind() {
    // Check for random wind change
    const now = Date.now();
    if (now - windState.lastChange > 60000 && Math.random() < 0.3) {
        // Small random adjustment
        windState.direction = (windState.direction + Math.floor(Math.random() * 60) - 30 + 360) % 360;
        windState.speed = Math.max(0, Math.min(25, windState.speed + Math.floor(Math.random() * 8) - 4));
        windState.lastChange = now;
    }
    return { speed: windState.speed, direction: windState.direction };
}

// Get wind for physics simulation
export function getWindForShot(aimAngle) {
    const wind = getWind();
    return {
        speed: wind.speed,
        relativeDirection: (wind.direction - aimAngle + 360) % 360
    };
}

// Get wind for visual effects (trees, clouds, flag)
export function getWindForVisuals() {
    return getWind();
}
```

### 4. Game Loop with Pause Support (js/game.js)

Refactored game loop supporting pause/resume.

```javascript
// Game loop state
const loopState = {
    isPaused: false,
    lastTime: 0,
    updateCallbacks: [],
    renderCallbacks: []
};

// Main animation loop
function gameLoop(currentTime) {
    if (loopState.isPaused) {
        requestAnimationFrame(gameLoop);
        return;
    }
    
    const deltaTime = currentTime - loopState.lastTime;
    loopState.lastTime = currentTime;
    
    // Update phase
    loopState.updateCallbacks.forEach(cb => cb(deltaTime));
    
    // Render phase
    loopState.renderCallbacks.forEach(cb => cb());
    
    requestAnimationFrame(gameLoop);
}

// Public API
export function pause() {
    loopState.isPaused = true;
}

export function resume() {
    loopState.isPaused = false;
    loopState.lastTime = performance.now();
}

export function isPaused() {
    return loopState.isPaused;
}

export function addUpdateCallback(callback) {
    loopState.updateCallbacks.push(callback);
}

export function addRenderCallback(callback) {
    loopState.renderCallbacks.push(callback);
}

// Direct initialization (no landing page)
export function init() {
    // Load default course directly
    const course = defaultCourse;
    initGame(course);
}
```

### 5. New UI Layout (js/ui.js)

Reorganized button layout with expandable controls.

```javascript
// UI Layout Structure
/*
┌─────────────────────────────────────────────────────────────────┐
│                         GAME VIEW                                │
│                                                                  │
│  ┌──────────┐                                      ┌──────────┐ │
│  │ Lie      │                                      │          │ │
│  │ Window   │                                      │   AIM    │ │
│  ├──────────┤                                      │  (right) │ │
│  │  CLUB    │ ← expands horizontal list            │          │ │
│  ├──────────┤                                      └──────────┘ │
│  │  POWER   │ ← expands color slider                            │
│  ├──────────┤                                                    │
│  │  SHAPE   │ ← expands curve slider                            │
│  └──────────┘                                                    │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────────┐│
│  │              YARDAGE INDICATOR (swipe up)                    ││
│  └──────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
*/

// Club selector - horizontal scrollable list
function createClubSelector() {
    const container = document.createElement('div');
    container.className = 'club-selector collapsed';
    
    const clubSymbols = {
        'Driver': '🏌️', '3 Wood': '3W', '5 Wood': '5W',
        '4 Iron': '4', '5 Iron': '5', '6 Iron': '6',
        '7 Iron': '7', '8 Iron': '8', '9 Iron': '9',
        'PW': 'P', 'GW': 'G', 'SW': 'S', 'LW': 'L', 'Putter': '🏒'
    };
    
    // Horizontal scroll container
    const scrollContainer = document.createElement('div');
    scrollContainer.className = 'club-scroll';
    
    clubs.forEach(club => {
        const item = document.createElement('div');
        item.className = 'club-item';
        item.textContent = clubSymbols[club.name];
        item.dataset.club = club.name;
        scrollContainer.appendChild(item);
    });
    
    container.appendChild(scrollContainer);
    return container;
}

// Power slider with color gradient
function createPowerSlider() {
    const container = document.createElement('div');
    container.className = 'power-slider collapsed';
    
    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = 0;
    slider.max = 100;
    slider.className = 'power-range';
    
    // Color gradient: blue (0%) → green (50%) → red (100%)
    slider.addEventListener('input', () => {
        const value = slider.value;
        const hue = 240 - (value * 2.4); // 240 (blue) to 0 (red)
        slider.style.setProperty('--power-color', `hsl(${hue}, 80%, 50%)`);
    });
    
    container.appendChild(slider);
    return container;
}

// Shape slider with curve indicators
function createShapeSlider() {
    const container = document.createElement('div');
    container.className = 'shape-slider collapsed';
    
    // Visual curve indicators
    const curveDisplay = document.createElement('div');
    curveDisplay.className = 'curve-display';
    curveDisplay.innerHTML = `
        <span class="curve-hook">↩</span>
        <span class="curve-draw">↰</span>
        <span class="curve-straight">↑</span>
        <span class="curve-fade">↱</span>
        <span class="curve-slice">↪</span>
    `;
    
    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = -2;  // Hard hook
    slider.max = 2;   // Hard slice
    slider.value = 0; // Straight
    slider.step = 1;
    slider.className = 'shape-range';
    
    container.appendChild(curveDisplay);
    container.appendChild(slider);
    return container;
}
```

### 6. Yardage Book Module Structure (js/yardagebook/)

Modular organization with swipeable tabs.

```
js/yardagebook/
├── index.js        # Main entry, tab management, swipe handling
├── utils.js        # Shared coordinate transforms, drawing utilities
├── hole-tab.js     # Hole overview map
├── green-tab.js    # Green detail view
├── golfer-tab.js   # Golfer statistics
├── clubs-tab.js    # Club distances
└── course-tab.js   # Course overview
```

#### index.js - Main Entry Point

```javascript
import { renderHoleTab } from './hole-tab.js';
import { renderGreenTab } from './green-tab.js';
import { renderGolferTab } from './golfer-tab.js';
import { renderClubsTab } from './clubs-tab.js';
import { renderCourseTab } from './course-tab.js';

const TABS = ['hole', 'green', 'golfer', 'clubs', 'course'];
let currentTabIndex = 0;
let touchStartX = 0;
let touchStartY = 0;

export function showYardageBook(hole) {
    const overlay = createOverlay();
    renderCurrentTab(overlay, hole);
    setupSwipeHandlers(overlay, hole);
    animateOpen(overlay);
}

function createOverlay() {
    const overlay = document.createElement('div');
    overlay.className = 'yardage-overlay';
    overlay.innerHTML = `
        <div class="yardage-tabs">
            ${TABS.map((tab, i) => `
                <button class="tab-btn ${i === currentTabIndex ? 'active' : ''}" 
                        data-tab="${tab}">${tab.charAt(0).toUpperCase() + tab.slice(1)}</button>
            `).join('')}
        </div>
        <div class="yardage-content"></div>
        <div class="swipe-indicator">↓ Swipe down to close</div>
    `;
    document.body.appendChild(overlay);
    return overlay;
}

function setupSwipeHandlers(overlay, hole) {
    const content = overlay.querySelector('.yardage-content');
    
    content.addEventListener('touchstart', (e) => {
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
    });
    
    content.addEventListener('touchend', (e) => {
        const deltaX = e.changedTouches[0].clientX - touchStartX;
        const deltaY = e.changedTouches[0].clientY - touchStartY;
        
        // Horizontal swipe for tab change
        if (Math.abs(deltaX) > 50 && Math.abs(deltaX) > Math.abs(deltaY)) {
            if (deltaX > 0 && currentTabIndex > 0) {
                currentTabIndex--;
                renderCurrentTab(overlay, hole);
            } else if (deltaX < 0 && currentTabIndex < TABS.length - 1) {
                currentTabIndex++;
                renderCurrentTab(overlay, hole);
            }
        }
        
        // Vertical swipe down to close
        if (deltaY > 100 && Math.abs(deltaY) > Math.abs(deltaX)) {
            closeYardageBook(overlay);
        }
    });
}

function renderCurrentTab(overlay, hole) {
    const content = overlay.querySelector('.yardage-content');
    const tabName = TABS[currentTabIndex];
    
    // Update tab buttons
    overlay.querySelectorAll('.tab-btn').forEach((btn, i) => {
        btn.classList.toggle('active', i === currentTabIndex);
    });
    
    // Render tab content
    switch (tabName) {
        case 'hole': renderHoleTab(content, hole); break;
        case 'green': renderGreenTab(content, hole); break;
        case 'golfer': renderGolferTab(content, hole); break;
        case 'clubs': renderClubsTab(content, hole); break;
        case 'course': renderCourseTab(content, hole); break;
    }
}
```

#### utils.js - Shared Utilities

```javascript
import { CONVERSION } from '../constants.js';

// Coordinate transformation for rotated map view
export function worldToCapture(worldX, worldY, captureData) {
    const { centerWorld, rotationAngle, viewWidth, viewHeight, width, height } = captureData;
    
    const ox = worldX - centerWorld.x;
    const oy = worldY - centerWorld.y;
    
    const cos = Math.cos(rotationAngle);
    const sin = Math.sin(rotationAngle);
    const rx = ox * cos + oy * sin;
    const ry = -ox * sin + oy * cos;
    
    return {
        x: (rx / viewWidth + 0.5) * width,
        y: (ry / viewHeight + 0.5) * height
    };
}

// Draw terrain polygon on canvas
export function drawTerrainPolygon(ctx, points, worldToCanvas) {
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

// Draw terrain ellipse on canvas
export function drawTerrainEllipse(ctx, feature, worldToCanvas) {
    ctx.beginPath();
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

// Calculate hole bounds for map rendering
export function calculateHoleBounds(hole, terrain, trees, padding = 15) {
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    
    // Include tee and hole
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
    // ... (bounds calculation logic)
    
    return { minX: minX - padding, maxX: maxX + padding, 
             minY: minY - padding, maxY: maxY + padding };
}
```

## Data Models

### Game State

```javascript
const gameState = {
    // Current selections
    club: clubs[0],
    power: 100,
    shape: 'Straight',      // 'Hook', 'Draw', 'Straight', 'Fade', 'Slice'
    
    // Game progress
    strokes: 0,
    currentHole: null,
    currentLie: null,
    
    // Course data
    courseBounds: null,
    
    // UI state
    isAimMode: false,
    isPaused: false,
    
    // Putter specific
    putterDistance: 30      // feet
};
```

### Wind State (unified)

```javascript
const windState = {
    speed: 0,               // mph (0-25)
    direction: 0,           // degrees (0 = from north, clockwise)
    lastChange: Date.now()  // timestamp for random changes
};
```


## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Pause/Resume Round Trip

*For any* game state, calling pause() followed by resume() SHALL return the game to an active state where updates continue, and isPaused() SHALL correctly reflect the current state at all times.

**Validates: Requirements 8.1, 8.2, 8.3, 8.4**

### Property 2: Swipe Navigation Consistency

*For any* yardage book tab state, swiping left SHALL navigate to the previous tab (if not first), swiping right SHALL navigate to the next tab (if not last), and swiping down SHALL close the yardage book.

**Validates: Requirements 5.5, 11.1, 11.2, 11.5**

### Property 3: Wind State Propagation

*For any* wind state change, the same wind speed and direction SHALL be used by tree sway animation, cloud movement, flag flutter, and shot physics simulation.

**Validates: Requirements 12.4, 12.5, 12.6, 12.7**

### Property 4: Club Selector Expand/Collapse

*For any* club selector state, tapping the Club button SHALL toggle between expanded and collapsed states, and selecting a club SHALL collapse the selector and update the game state.

**Validates: Requirements 13.1, 13.4**

### Property 5: Power Slider Color Gradient

*For any* power value from 0 to 100, the slider color SHALL transition from cool (blue) at low values through green at mid values to hot (red) at high values.

**Validates: Requirements 14.1, 14.2, 14.3, 14.4**

### Property 6: Shape Slider Expand/Collapse

*For any* shape slider state, tapping the Shape button SHALL toggle between expanded and collapsed states, and releasing the slider SHALL collapse it and update the game state.

**Validates: Requirements 15.1, 15.5**

### Property 7: Aim Mode Visual Feedback

*For any* aim mode state, when aim mode is active, the aim line SHALL be red and the aim button SHALL be highlighted; when inactive, both SHALL return to default appearance.

**Validates: Requirements 16.1, 16.2**

### Property 8: Aim Mode Shot Execution

*For any* aim mode state, double-tapping to hit a shot SHALL execute using the current aim angle regardless of whether aim mode is active or inactive.

**Validates: Requirements 16.3, 16.4, 16.5**

## Error Handling

### Module Loading Errors

- If a yardagebook tab module fails to load, display an error message in the tab content area
- If constants.js fails to load, fall back to inline default values with console warning
- If wind.js fails to load, use static wind values (0 mph, 0 degrees)

### UI Interaction Errors

- If touch events fail to register, provide fallback click handlers
- If slider drag fails, allow direct value input via tap
- If swipe detection fails, provide visible tab buttons as fallback

### Game State Errors

- If pause() is called when already paused, no-op (idempotent)
- If resume() is called when not paused, no-op (idempotent)
- If game state becomes corrupted, provide reset functionality

## Testing Strategy

### Unit Tests

Unit tests should focus on specific examples and edge cases:

1. **Constants Module**: Verify all expected constants are exported with correct values
2. **Utils Module**: Test each utility function with known inputs/outputs
3. **Wind Module**: Test wind initialization, getWind(), and state changes
4. **Game Loop**: Test pause/resume state transitions

### Property-Based Tests

Property-based tests should verify universal properties across many inputs:

1. **Pause/Resume**: Generate random sequences of pause/resume calls, verify state consistency
2. **Swipe Navigation**: Generate random swipe sequences, verify tab state is always valid
3. **Wind Propagation**: Generate random wind states, verify all consumers receive same values
4. **Slider Interactions**: Generate random slider values, verify color/state updates correctly

### Integration Tests

1. **Landing Page Removal**: Verify game loads directly without landing page
2. **Yardage Book Structure**: Verify all tab files exist and export correctly
3. **Code Deduplication**: Verify no duplicate function definitions across modules
4. **UI Layout**: Verify button positions match specification

### Testing Configuration

- Use Vitest for unit and property-based tests
- Minimum 100 iterations per property test
- Tag format: **Feature: codebase-refactor, Property {number}: {property_text}**
