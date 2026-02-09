// Main game module
import * as THREE from 'three';
import { clubs } from './clubs.js';
import { Ball } from './ball.js';
import { AimLine } from './aim.js';
import { setupUI, updateYardageIndicator, createSimulatePuttButton, updateSimulatePuttButtonVisibility, disableSimulatePuttButton, setSimulatePuttButtonSimulating, resetSimulatePuttButton } from './ui.js';
import { ShotSimulator } from './shot.js';
import { golfer, initializeGolferHistory, recordShot } from './golfer.js';
import { course as defaultCourse } from '../courses/test_course.js';
import { TerrainType, setCourse, getTerrainAt, getSlopeAt, getElevationAt } from './terrain.js';
import { createWorld } from './world.js';
import { createLieWindow, updateLieWindow } from './lieWindow.js';
import { determineLie } from './lie.js';
import { validateTrees } from './trees.js';
import { WORLD_SCALE } from './utils.js';
import { CAMERA, TIMING } from './constants.js';
import { initializeWind, getWindForShot } from './wind.js';
import { setLastShotData } from './yardagebook/golfer-tab.js';
import { runPuttSimulations } from './puttSimulation.js';

// Current course (default course loaded directly)
let course = defaultCourse;

// Convert course terrain structure to zones array
function buildZonesFromTerrain(terrain) {
    const zones = [];
    const terrainMapping = {
        teeBox: TerrainType.TEE,
        fairway: TerrainType.FAIRWAY,
        rough: TerrainType.ROUGH,
        green: TerrainType.GREEN,
        bunker: TerrainType.BUNKER,
        water: TerrainType.WATER,
        outOfBounds: TerrainType.OUT_OF_BOUNDS
    };
    for (const [key, terrainType] of Object.entries(terrainMapping)) {
        const shapes = terrain[key] || [];
        for (const shape of shapes) {
            zones.push({ ...shape, terrain: terrainType });
        }
    }
    return zones;
}

// Game state - initialized after course selection
let hole1 = null;
const gameState = {
    club: clubs[0],
    power: 100,
    shape: 'Straight',
    strokes: 0,
    currentHole: null,
    currentLie: null,
    courseBounds: null,
    wind: { speed: 0, direction: 0 },
    putterDistance: 30  // Default putt distance in feet
};

// Game entities
const ball = new Ball(0, 0);
const aimLine = new AimLine();
let shotSimulator = null;
let world = null;
let scene, camera, renderer;
let ballMesh = null;
let aimLineMesh = null;

// Shot tracer
let shotTracerLine = null;
let shotTracerPoints = [];
let isTracingShot = false;

// Putt simulation paths
let puttSimulationLines = [];
let puttSimulationAnimations = [];
let isPuttSimulationActive = false;
let puttSimulationFadeStart = null;

// Camera fly-along state
let isCameraFlying = false;
let cameraFlyStartTime = null;
let cameraFlyDuration = TIMING.CAMERA_FLY_MIN; // Initial value, adjusted based on path length
let cameraFlyPath = [];
let cameraFlyCallback = null;

function init() {
    // Load game directly without landing page
    initGame();
}

function initGame() {
    const container = document.querySelector('.golf-hole');
    
    // Build hole data
    const holeData = course.holes[0];
    const zones = buildZonesFromTerrain(course.terrain || {});
    hole1 = { ...holeData, zones, trees: course.trees || [] };
    
    gameState.currentHole = hole1;
    gameState.courseBounds = course.bounds;
    
    initializeGolferHistory(golfer);
    gameState.wind = initializeWind();
    setCourse(course);
    
    // Setup Three.js scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87ceeb);
    
    // Add atmospheric fog for depth perception
    // Fog color slightly blue-grey, starts at 250 yards, fully opaque at 600 yards
    scene.fog = new THREE.Fog(0xa8c8d8, 250, 600);
    
    camera = new THREE.PerspectiveCamera(CAMERA.FOV, container.clientWidth / container.clientHeight, CAMERA.NEAR, CAMERA.FAR);
    
    renderer = new THREE.WebGLRenderer({ antialias: true, logarithmicDepthBuffer: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);
    
    // Lighting
    const ambient = new THREE.AmbientLight(0xffffff, 0.4);
    scene.add(ambient);
    
    const sun = new THREE.DirectionalLight(0xffffff, 1.0);
    sun.position.set(100, 200, 50);
    sun.castShadow = true;
    sun.shadow.mapSize.width = 2048;
    sun.shadow.mapSize.height = 2048;
    sun.shadow.camera.near = 10;
    sun.shadow.camera.far = 500;
    sun.shadow.camera.left = -200;
    sun.shadow.camera.right = 200;
    sun.shadow.camera.top = 200;
    sun.shadow.camera.bottom = -200;
    scene.add(sun);
    
    // Create world using the simple world.js renderer
    world = createWorld(scene);
    world.loadCourse(course);
    world.setHole(1);
    
    // Create ball mesh
    createBallMesh();
    
    // Create aim line
    createAimLineMesh();
    
    // Initialize ball (2D logic)
    ball.init(container);
    ball.setPosition(hole1.tee.x, hole1.tee.y);
    updateBallMeshPosition();
    
    // Initialize lie window
    createLieWindow();
    updateBallLie(hole1.tee.x, hole1.tee.y);
    
    // Initialize aim line
    aimLine.init(container, ball);
    aimLine.setOnAngleChange((ballX, ballY, angle) => {
        updateAimLineMesh(ballX, ballY, angle);
        if (gameState.updateWindDisplay) gameState.updateWindDisplay(angle);
    });
    aimLine.setOnAimModeChange((isAimMode) => { 
        aimModeActive = isAimMode;
        // Change aim line color: red when aim mode active, white when inactive
        if (aimLineMesh && aimLineMesh.material) {
            aimLineMesh.material.color.setHex(isAimMode ? 0xff0000 : 0xffffff);
        }
    });
    aimLine.setProjectBallToScreen(() => getBallScreenPosition());
    aimLine.setScreenToGroundPoint(screenToGroundPoint);
    aimLine.setAimAtPoint(aimAtPoint);
    
    // Point aim along hole centreline (first segment of centreline)
    const centreline = gameState.currentHole.centreline;
    const p1 = centreline[0];
    const p2 = centreline[1];
    const centrelineAngle = Math.atan2(p2[0] - p1[0], p1[1] - p2[1]) * (180 / Math.PI);
    aimLine.setAngle(centrelineAngle);
    const ballPos = ball.getPosition();
    updateAimLineMesh(ballPos.x, ballPos.y, centrelineAngle);
    
    // Position camera behind ball, looking along hole centreline
    updateCameraForBallAlongCentreline(hole1.tee.x, hole1.tee.y, centrelineAngle);
    
    // Setup shot simulator
    shotSimulator = new ShotSimulator(ball, onShotComplete);
    
    // Setup UI
    setupUI(gameState, aimLine, ball, hitShot, world, [aimLineMesh, ballMesh, shotTracerLine]);
    if (gameState.updateWindDisplay) gameState.updateWindDisplay(centrelineAngle);
    
    // Setup putt simulation button
    createSimulatePuttButton(container, gameState, runPuttSimulation);
    
    // Setup camera controls
    setupCameraControls();
    
    // Handle resize
    window.addEventListener('resize', onResize);
    
    // Start render loop
    animate(0);
    
    console.log(`Golf game initialized! Wind: ${gameState.wind.speed} mph from ${gameState.wind.direction}°`);
}

function createBallMesh() {
    // Golf ball is 1.68 inches diameter = 0.047 yards (low-poly for pixelated look)
    const geom = new THREE.IcosahedronGeometry(0.047, 1);
    const mat = new THREE.MeshLambertMaterial({ 
        color: 0xffffff, 
        flatShading: true,
        emissive: 0x666666 // Add self-illumination so ball stands out
    });
    ballMesh = new THREE.Mesh(geom, mat);
    ballMesh.castShadow = true;
    scene.add(ballMesh);
}


function updateBallMeshPosition() {
    if (!ballMesh || !ball || !world) return;
    const pos = ball.getPosition();
    const rawHeight = ball.getHeight();
    const pos3D = world.worldTo3D(pos.x, pos.y);
    // Ball radius is 0.047 yards, add small offset (0.02) to ensure ball sits visibly on terrain
    const ballRadius = 0.047;
    const terrainOffset = 0.02; // Small offset to prevent z-fighting with terrain
    
    // If height is negative, ball is dropping into hole - use directly as yards
    // If positive, it's from flight animation (pixels) - convert to yards
    const height = rawHeight < 0 ? rawHeight : rawHeight / 2.5;
    
    ballMesh.position.set(pos3D.x, pos3D.y + ballRadius + terrainOffset + height, pos3D.z);
    
    // Add point to shot tracer if tracing
    if (isTracingShot) {
        addTracerPoint(pos3D.x, pos3D.y + ballRadius + terrainOffset + height, pos3D.z);
    }
}

// Shot tracer functions
function startShotTracer() {
    isTracingShot = true;
    shotTracerPoints = [];
    if (shotTracerLine) {
        scene.remove(shotTracerLine);
        shotTracerLine.geometry.dispose();
        shotTracerLine.material.dispose();
        shotTracerLine = null;
    }
}

function addTracerPoint(x, y, z) {
    const lastPoint = shotTracerPoints[shotTracerPoints.length - 1];
    if (lastPoint) {
        const dist = Math.sqrt((x - lastPoint.x) ** 2 + (y - lastPoint.y) ** 2 + (z - lastPoint.z) ** 2);
        if (dist < 0.3) return;
    }
    shotTracerPoints.push(new THREE.Vector3(x, y, z));
    updateTracerLine();
}

function updateTracerLine() {
    if (shotTracerPoints.length < 2) return;
    if (shotTracerLine) {
        scene.remove(shotTracerLine);
        shotTracerLine.geometry.dispose();
    }
    
    const colors = [];
    for (let i = 0; i < shotTracerPoints.length; i++) {
        const t = i / (shotTracerPoints.length - 1);
        colors.push(1, 1, 0.3 + t * 0.7);
    }
    
    const geometry = new THREE.BufferGeometry().setFromPoints(shotTracerPoints);
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    
    const material = new THREE.LineBasicMaterial({
        vertexColors: true,
        linewidth: 2,
        transparent: true,
        opacity: 0.9
    });
    
    shotTracerLine = new THREE.Line(geometry, material);
    scene.add(shotTracerLine);
}

function stopShotTracer() {
    isTracingShot = false;
}

function clearShotTracer() {
    isTracingShot = false;
    shotTracerPoints = [];
    if (shotTracerLine) {
        scene.remove(shotTracerLine);
        shotTracerLine.geometry.dispose();
        shotTracerLine.material.dispose();
        shotTracerLine = null;
    }
}

// Putt simulation functions
function runPuttSimulation() {
    if (isPuttSimulationActive || shotSimulator.isAnimating) return;
    
    const ballPos = ball.getPosition();
    const aimAngle = aimLine.getAngle();
    const distanceFeet = gameState.putterDistance;
    
    // Set button to simulating state
    setSimulatePuttButtonSimulating(true);
    
    // Run simulations
    const simulations = runPuttSimulations(ballPos, aimAngle, distanceFeet, gameState.currentHole);
    
    // Clear any existing simulation paths
    clearPuttSimulationPaths();
    
    // Create 3D paths for each simulation
    isPuttSimulationActive = true;
    puttSimulationAnimations = [];
    
    // Color scheme: all paths same color
    const pathColor = 0x3498db;  // Blue
    const pathOpacity = 0.8;
    
    simulations.forEach((sim, index) => {
        // Convert path to 3D points
        const points3D = sim.path.map(p => {
            const pos3D = world.worldTo3D(p.x, p.y);
            return new THREE.Vector3(pos3D.x, pos3D.y + 0.05, pos3D.z); // Slight offset above terrain
        });
        
        // Create line geometry (initially empty, will be animated)
        const geometry = new THREE.BufferGeometry();
        const material = new THREE.LineBasicMaterial({
            color: pathColor,
            transparent: true,
            opacity: pathOpacity,
            linewidth: 2
        });
        
        const line = new THREE.Line(geometry, material);
        scene.add(line);
        puttSimulationLines.push(line);
        
        // Store animation data
        puttSimulationAnimations.push({
            points3D,
            duration: sim.duration,
            startTime: null,
            currentIndex: 0,
            complete: false,
            line,
            material,
            baseOpacity: pathOpacity
        });
    });
    
    // Disable button after use
    disableSimulatePuttButton();
    setSimulatePuttButtonSimulating(false);
}

function updatePuttSimulationAnimation(currentTime) {
    if (!isPuttSimulationActive || puttSimulationAnimations.length === 0) return;
    
    let allComplete = true;
    
    puttSimulationAnimations.forEach(anim => {
        if (anim.complete) return;
        
        // Initialize start time on first frame
        if (anim.startTime === null) {
            anim.startTime = currentTime;
        }
        
        const elapsed = currentTime - anim.startTime;
        const t = Math.min(elapsed / anim.duration, 1);
        
        // Calculate how many points to show based on time
        const targetIndex = Math.floor(t * (anim.points3D.length - 1)) + 1;
        
        if (targetIndex > anim.currentIndex) {
            anim.currentIndex = targetIndex;
            
            // Update line geometry with points up to current index
            const visiblePoints = anim.points3D.slice(0, anim.currentIndex + 1);
            anim.line.geometry.dispose();
            anim.line.geometry = new THREE.BufferGeometry().setFromPoints(visiblePoints);
        }
        
        if (t >= 1) {
            anim.complete = true;
        } else {
            allComplete = false;
        }
    });
    
    // If all animations complete, start fade timer
    if (allComplete && puttSimulationFadeStart === null) {
        puttSimulationFadeStart = currentTime;
    }
    
    // Handle fade out (1 second hold, then 5 second fade)
    if (puttSimulationFadeStart !== null) {
        const fadeElapsed = currentTime - puttSimulationFadeStart;
        const holdTime = 1000; // 1 second hold
        const fadeTime = 5000; // 5 second fade
        
        if (fadeElapsed > holdTime) {
            const fadeT = Math.min((fadeElapsed - holdTime) / fadeTime, 1);
            
            // Fade out all lines
            puttSimulationAnimations.forEach(anim => {
                anim.material.opacity = anim.baseOpacity * (1 - fadeT);
            });
            
            // Clean up when fade complete
            if (fadeT >= 1) {
                clearPuttSimulationPaths();
            }
        }
    }
}

function clearPuttSimulationPaths() {
    puttSimulationLines.forEach(line => {
        scene.remove(line);
        line.geometry.dispose();
        line.material.dispose();
    });
    puttSimulationLines = [];
    puttSimulationAnimations = [];
    isPuttSimulationActive = false;
    puttSimulationFadeStart = null;
}

// Camera fly-along functions
function startCameraFlyAlong(onComplete) {
    if (shotTracerPoints.length < 2) {
        if (onComplete) onComplete();
        return;
    }
    
    // Copy all tracer points for smooth interpolation
    cameraFlyPath = shotTracerPoints.map(p => p.clone());
    
    // Calculate cumulative distances for smooth parametric interpolation
    cameraFlyPath.distances = [0];
    for (let i = 1; i < cameraFlyPath.length; i++) {
        const dist = cameraFlyPath[i].distanceTo(cameraFlyPath[i - 1]);
        cameraFlyPath.distances.push(cameraFlyPath.distances[i - 1] + dist);
    }
    cameraFlyPath.totalLength = cameraFlyPath.distances[cameraFlyPath.distances.length - 1];
    
    // Duration based on path length
    cameraFlyDuration = Math.max(TIMING.CAMERA_FLY_MIN, Math.min(TIMING.CAMERA_FLY_MAX, cameraFlyPath.totalLength * 12));
    
    isCameraFlying = true;
    cameraFlyStartTime = null;
    cameraFlyCallback = onComplete;
    
    // Store initial camera state for smooth start
    cameraFlyPath.startPos = camera.position.clone();
    cameraFlyPath.startLookAt = new THREE.Vector3();
    camera.getWorldDirection(cameraFlyPath.startLookAt);
    cameraFlyPath.startLookAt.multiplyScalar(50).add(camera.position);
}

function getPointOnPath(path, t) {
    // Clamp t
    t = Math.max(0, Math.min(1, t));
    
    const targetDist = t * path.totalLength;
    
    // Binary search for segment
    let low = 0, high = path.distances.length - 1;
    while (low < high - 1) {
        const mid = Math.floor((low + high) / 2);
        if (path.distances[mid] <= targetDist) low = mid;
        else high = mid;
    }
    
    const segmentStart = path.distances[low];
    const segmentEnd = path.distances[high];
    const segmentLength = segmentEnd - segmentStart;
    
    if (segmentLength < 0.001) return path[low].clone();
    
    const segmentT = (targetDist - segmentStart) / segmentLength;
    return path[low].clone().lerp(path[high], segmentT);
}

function updateCameraFlyAlong(time) {
    if (!isCameraFlying || cameraFlyPath.length < 2) return false;
    
    if (cameraFlyStartTime === null) {
        cameraFlyStartTime = time;
    }
    
    const elapsed = time - cameraFlyStartTime;
    const rawT = Math.min(elapsed / cameraFlyDuration, 1);
    
    // Smooth ease-in-out (cubic)
    const t = rawT < 0.5 
        ? 4 * rawT * rawT * rawT 
        : 1 - Math.pow(-2 * rawT + 2, 3) / 2;
    
    // Get current position on path
    const pathPos = getPointOnPath(cameraFlyPath, t);
    
    // Get look-ahead position (10% ahead on path)
    const lookAheadT = Math.min(t + 0.1, 1);
    const lookAheadPos = getPointOnPath(cameraFlyPath, lookAheadT);
    
    // Calculate smooth direction
    const direction = new THREE.Vector3().subVectors(lookAheadPos, pathPos);
    if (direction.length() < 0.01) {
        direction.set(0, 0, -1); // Default forward
    }
    direction.normalize();
    
    // Camera height: higher when ball is high, lower near ground
    const baseHeight = 2.5;
    const heightBoost = Math.max(0, pathPos.y) * 0.3;
    const camHeight = baseHeight + heightBoost;
    
    // Camera behind offset
    const behindOffset = 5;
    
    // Target camera position
    const targetCamPos = new THREE.Vector3(
        pathPos.x - direction.x * behindOffset,
        pathPos.y + camHeight,
        pathPos.z - direction.z * behindOffset
    );
    
    // Target look position
    const targetLookAt = new THREE.Vector3(
        lookAheadPos.x,
        lookAheadPos.y + 0.5,
        lookAheadPos.z
    );
    
    // Blend from starting position for first 15% of animation
    if (rawT < 0.15) {
        const blendT = rawT / 0.15;
        const smoothBlend = blendT * blendT * (3 - 2 * blendT); // smoothstep
        camera.position.lerpVectors(cameraFlyPath.startPos, targetCamPos, smoothBlend);
        const blendedLookAt = new THREE.Vector3().lerpVectors(cameraFlyPath.startLookAt, targetLookAt, smoothBlend);
        camera.lookAt(blendedLookAt);
    } else {
        camera.position.copy(targetCamPos);
        camera.lookAt(targetLookAt);
    }
    
    // Complete
    if (rawT >= 1) {
        isCameraFlying = false;
        cameraFlyPath = [];
        if (cameraFlyCallback) {
            cameraFlyCallback();
            cameraFlyCallback = null;
        }
        return false;
    }
    
    return true;
}

function createAimLineMesh() {
    const mat = new THREE.LineDashedMaterial({
        color: 0xffffff,
        dashSize: 1,
        gapSize: 0.5,
        transparent: true,
        opacity: 0.8
    });
    const geom = new THREE.BufferGeometry();
    aimLineMesh = new THREE.Line(geom, mat);
    scene.add(aimLineMesh);
}

function updateAimLineMesh(ballX, ballY, aimAngle) {
    if (!aimLineMesh || !world) return;
    
    const aimRad = (aimAngle * Math.PI) / 180;
    const points = [];
    const bounds = course.bounds;
    
    // Line parameters - shorter on green for putting
    const onGreen = gameState.currentLie?.name === 'Green';
    const lineLength = onGreen ? 50 : 500;
    const numPoints = onGreen ? 100 : 250;
    
    // The aim line should sit at the same height as the ball
    // Ball sits at: terrain elevation + ballRadius + small offset
    const ballRadius = 0.047;
    const ballTerrainOffset = 0.02;
    const lineHeight = ballRadius + ballTerrainOffset; // Match ball height above terrain
    
    // Start exactly at the ball position
    const ballPos3D = world.worldTo3D(ballX, ballY);
    points.push(new THREE.Vector3(ballPos3D.x, ballPos3D.y + lineHeight, ballPos3D.z));
    
    // Generate points along the aim direction, following terrain
    for (let i = 1; i < numPoints; i++) {
        const t = i / (numPoints - 1);
        const dist = t * lineLength;
        const worldX = ballX + Math.sin(aimRad) * dist;
        const worldY = ballY - Math.cos(aimRad) * dist;
        
        if (worldX >= bounds.minX && worldX <= bounds.maxX && worldY >= bounds.minY && worldY <= bounds.maxY) {
            const pos3D = world.worldTo3D(worldX, worldY);
            points.push(new THREE.Vector3(pos3D.x, pos3D.y + lineHeight, pos3D.z));
        }
    }
    
    if (points.length >= 2) {
        aimLineMesh.geometry.dispose();
        aimLineMesh.geometry = new THREE.BufferGeometry().setFromPoints(points);
        aimLineMesh.computeLineDistances();
    }
}

function getBallScreenPosition() {
    if (!ballMesh || !camera || !renderer) return null;
    const vector = ballMesh.position.clone();
    vector.project(camera);
    const canvas = renderer.domElement;
    const rect = canvas.getBoundingClientRect();
    return {
        x: rect.left + (vector.x + 1) / 2 * rect.width,
        y: rect.top + (-vector.y + 1) / 2 * rect.height
    };
}

// Camera controls
let isDragging = false;
let lastMouseX = 0, lastMouseY = 0;
let cameraYaw = 0, cameraPitch = 0;
let baseLookDir = new THREE.Vector3();
let aimModeActive = false;

function setupCameraControls() {
    const canvas = renderer.domElement;
    
    canvas.addEventListener('mousedown', (e) => {
        if (aimModeActive) return;
        isDragging = true;
        lastMouseX = e.clientX;
        lastMouseY = e.clientY;
    });
    
    canvas.addEventListener('mousemove', (e) => {
        if (!isDragging || aimModeActive) return;
        const deltaX = e.clientX - lastMouseX;
        const deltaY = e.clientY - lastMouseY;
        cameraYaw += deltaX * 0.005;
        cameraPitch -= deltaY * 0.005;
        cameraPitch = Math.max(-Math.PI / 3, Math.min(Math.PI / 36, cameraPitch));
        updateCameraLook();
        lastMouseX = e.clientX;
        lastMouseY = e.clientY;
    });
    
    canvas.addEventListener('mouseup', () => { isDragging = false; });
    canvas.addEventListener('mouseleave', () => { isDragging = false; });
    
    // Touch controls
    canvas.addEventListener('touchstart', (e) => {
        if (aimModeActive || e.touches.length !== 1) return;
        isDragging = true;
        lastMouseX = e.touches[0].clientX;
        lastMouseY = e.touches[0].clientY;
    });
    
    canvas.addEventListener('touchmove', (e) => {
        if (!isDragging || aimModeActive || e.touches.length !== 1) return;
        e.preventDefault();
        const deltaX = e.touches[0].clientX - lastMouseX;
        const deltaY = e.touches[0].clientY - lastMouseY;
        cameraYaw += deltaX * 0.005;
        cameraPitch -= deltaY * 0.005;
        cameraPitch = Math.max(-Math.PI / 3, Math.min(Math.PI / 36, cameraPitch));
        updateCameraLook();
        lastMouseX = e.touches[0].clientX;
        lastMouseY = e.touches[0].clientY;
    });
    
    canvas.addEventListener('touchend', () => { isDragging = false; });
}

// Raycast to find ground point from screen coordinates
function screenToGroundPoint(clientX, clientY) {
    const canvas = renderer.domElement;
    const rect = canvas.getBoundingClientRect();
    
    // Normalize to -1 to 1
    const mouse = new THREE.Vector2(
        ((clientX - rect.left) / rect.width) * 2 - 1,
        -((clientY - rect.top) / rect.height) * 2 + 1
    );
    
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, camera);
    
    // Use a ground plane at ball's elevation
    const ballPos = ball.getPosition();
    const ballPos3D = world.worldTo3D(ballPos.x, ballPos.y);
    const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -ballPos3D.y);
    const intersectPoint = new THREE.Vector3();
    
    if (raycaster.ray.intersectPlane(groundPlane, intersectPoint)) {
        return intersectPoint;
    }
    
    // If ray doesn't hit plane (pointing above horizon), project ray direction onto ground
    // Use just the horizontal direction of the ray
    const dir = raycaster.ray.direction.clone();
    if (Math.abs(dir.x) > 0.001 || Math.abs(dir.z) > 0.001) {
        // Normalize horizontal direction and extend far
        const horizDir = new THREE.Vector3(dir.x, 0, dir.z).normalize();
        const farPoint = ballPos3D.clone().add(horizDir.multiplyScalar(1000));
        farPoint.y = ballPos3D.y;
        return farPoint;
    }
    
    return null;
}

// Calculate aim angle from ball to a 3D point
function aimAtPoint(point3D) {
    if (!point3D) return;
    
    const ballPos = ball.getPosition();
    const ballPos3D = world.worldTo3D(ballPos.x, ballPos.y);
    
    // Direction from ball to clicked point
    const dx = point3D.x - ballPos3D.x;
    const dz = point3D.z - ballPos3D.z;
    
    // Convert to aim angle (0 = north, clockwise)
    const angle = Math.atan2(dx, -dz) * (180 / Math.PI);
    
    aimLine.setAngle(angle);
    updateAimLineMesh(ballPos.x, ballPos.y, angle);
}

function updateCameraLook() {
    const lookDir = baseLookDir.clone();
    const yawQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), cameraYaw);
    lookDir.applyQuaternion(yawQuat);
    const right = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), lookDir).normalize();
    const pitchQuat = new THREE.Quaternion().setFromAxisAngle(right, cameraPitch);
    lookDir.applyQuaternion(pitchQuat);
    const target = camera.position.clone().add(lookDir.multiplyScalar(50));
    camera.lookAt(target);
}

function updateCameraForBall(ballX, ballY, isPutting = false) {
    const ballPos3D = world.worldTo3D(ballX, ballY);
    const holePos3D = world.getHolePosition();
    
    const dirX = holePos3D.x - ballPos3D.x;
    const dirZ = holePos3D.z - ballPos3D.z;
    const dist = Math.sqrt(dirX * dirX + dirZ * dirZ);
    const normX = dist > 0 ? dirX / dist : 0;
    const normZ = dist > 0 ? dirZ / dist : 1;
    
    // Perpendicular direction (to the right of aim line)
    const perpX = normZ;
    const perpZ = -normX;
    
    // Use putting camera when on green or putting
    const onGreen = gameState.currentLie?.name === 'Green' || isPutting;
    
    const camHeight = onGreen ? CAMERA.PUTT_HEIGHT : CAMERA.HEIGHT;
    const camBehind = onGreen ? CAMERA.PUTT_BEHIND_DISTANCE : CAMERA.BEHIND_DISTANCE;
    const camSide = onGreen ? CAMERA.PUTT_SIDE_OFFSET : CAMERA.SIDE_OFFSET;
    
    camera.position.set(
        ballPos3D.x - normX * camBehind + perpX * camSide,
        ballPos3D.y + camHeight,
        ballPos3D.z - normZ * camBehind + perpZ * camSide
    );
    
    // Look toward the target, level gaze (no downward tilt)
    baseLookDir.set(normX, 0, normZ).normalize();
    cameraYaw = 0;
    cameraPitch = 0;
    updateCameraLook();
}

// Camera aligned to hole centreline (using centreline angle)
function updateCameraForBallAlongCentreline(ballX, ballY, angleInDegrees, isPutting = false) {
    const ballPos3D = world.worldTo3D(ballX, ballY);
    
    // Convert angle to 3D direction
    const angleRad = (angleInDegrees * Math.PI) / 180;
    const norm3DX = Math.sin(angleRad);
    const norm3DZ = -Math.cos(angleRad);
    
    // Perpendicular direction (to the right of aim line)
    const perpX = norm3DZ;
    const perpZ = -norm3DX;
    
    // Use putting camera when on green or putting
    const onGreen = gameState.currentLie?.name === 'Green' || isPutting;
    
    const camHeight = onGreen ? CAMERA.PUTT_HEIGHT : CAMERA.HEIGHT;
    const camBehind = onGreen ? CAMERA.PUTT_BEHIND_DISTANCE : CAMERA.BEHIND_DISTANCE;
    const camSide = onGreen ? CAMERA.PUTT_SIDE_OFFSET : CAMERA.SIDE_OFFSET;
    
    camera.position.set(
        ballPos3D.x - norm3DX * camBehind + perpX * camSide,
        ballPos3D.y + camHeight,
        ballPos3D.z - norm3DZ * camBehind + perpZ * camSide
    );
    
    // Look toward the target, level gaze
    baseLookDir.set(norm3DX, 0, norm3DZ).normalize();
    cameraYaw = 0;
    cameraPitch = 0;
    updateCameraLook();
}

function onResize() {
    const container = document.querySelector('.golf-hole');
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
}

function updateBallLie(x, y) {
    const terrain = getTerrainAt(gameState.currentHole, x, y);
    const slope = getSlopeAt(gameState.currentHole, x, y);
    const lie = determineLie(terrain, slope);
    gameState.currentLie = lie;
    if (shotSimulator) shotSimulator.currentLie = lie;
    updateLieWindow(lie, terrain);
    return lie;
}

function hitShot() {
    if (shotSimulator.isAnimating) return;
    gameState.strokes++;
    
    const isPutting = gameState.club.name === 'Putter';
    const intendedYards = isPutting ? (gameState.putterDistance / 3) : gameState.club.yards * (gameState.power / 100);
    
    gameState.lastShotIntent = {
        club: gameState.club.name,
        intendedYards,
        power: gameState.power,
        shape: gameState.shape,
        putterDistance: gameState.putterDistance
    };
    
    // Start shot tracer (not for putts - they stay on ground)
    if (!isPutting) {
        startShotTracer();
    }
    
    shotSimulator.hit({
        club: gameState.club,
        power: gameState.power,
        shape: gameState.shape,
        putterDistance: gameState.putterDistance,
        aimAngle: aimLine.getAngle(),
        holeData: gameState.currentHole,
        wind: getWindForShot(aimLine.getAngle())
    });
}

function onShotComplete(finalPosition, shotData) {
    // Stop shot tracer
    stopShotTracer();
    
    // Clear any putt simulation paths and reset button for next shot
    clearPuttSimulationPaths();
    resetSimulatePuttButton();
    
    // Check if ball went in the hole!
    if (shotData && shotData.holed) {
        console.log('🎉 HOLED! Ball is in the cup!');
        showHoledMessage(() => {
            // After celebration, could advance to next hole or show score
            console.log(`Hole completed in ${gameState.strokes} strokes`);
        });
        return;
    }
    
    const newLie = updateBallLie(finalPosition.x, finalPosition.y);
    const hole = gameState.currentHole.hole;
    const newAngle = Math.atan2(hole.x - finalPosition.x, finalPosition.y - hole.y) * (180 / Math.PI);
    
    if (gameState.updateWindDisplay) gameState.updateWindDisplay(newAngle);
    
    if (gameState.lastShotIntent && shotData && !shotData.isPutt) {
        recordShot(golfer, gameState.lastShotIntent.club, shotData);
    }
    
    // Store shot data for display in golfer tab of yardage book
    if (shotData) {
        const clubName = gameState.lastShotIntent?.club || null;
        setLastShotData(shotData, clubName);
    }
    
    // Update yardage indicator with new distance to hole
    // Requirements: 11.3 - Show current yardage to the hole
    updateYardageIndicator(gameState, ball);
    
    console.log(`Shot ${gameState.strokes} complete. Ball at (${finalPosition.x.toFixed(1)}, ${finalPosition.y.toFixed(1)})`);
    
    // For putts, skip the camera fly-along since there's no tracer
    const isPutt = shotData && shotData.isPutt;
    
    showContinueButton(() => {
        if (isPutt) {
            // Just update camera and aim for next shot
            clearShotTracer();
            aimLine.setAngle(newAngle);
            aimLine.render();
            updateCameraForBall(finalPosition.x, finalPosition.y, true);
            updateAimLineMesh(finalPosition.x, finalPosition.y, newAngle);
        } else {
            // Start camera fly-along, then set up for next shot
            startCameraFlyAlong(() => {
                // Clear shot tracer after fly-along completes
                clearShotTracer();
                
                aimLine.setAngle(newAngle);
                aimLine.render();
                // Check if we landed on the green
                const landedOnGreen = newLie?.name === 'Green';
                updateCameraForBall(finalPosition.x, finalPosition.y, landedOnGreen);
                updateAimLineMesh(finalPosition.x, finalPosition.y, newAngle);
            });
        }
    });
}

/**
 * Show celebration message when ball is holed
 */
function showHoledMessage(onComplete) {
    const existing = document.querySelector('.holed-overlay');
    if (existing) existing.remove();
    
    const overlay = document.createElement('div');
    overlay.className = 'holed-overlay';
    overlay.innerHTML = `
        <div class="holed-message">
            <div class="holed-text">HOLED!</div>
            <div class="holed-strokes">${gameState.strokes} ${gameState.strokes === 1 ? 'stroke' : 'strokes'}</div>
        </div>
    `;
    
    document.body.appendChild(overlay);
    
    // Auto-dismiss after 2 seconds
    setTimeout(() => {
        overlay.classList.add('fade-out');
        setTimeout(() => {
            overlay.remove();
            if (onComplete) onComplete();
        }, 500);
    }, 2000);
}

function showContinueButton(onContinue) {
    const existing = document.querySelector('.continue-overlay');
    if (existing) existing.remove();
    
    const overlay = document.createElement('div');
    overlay.className = 'continue-overlay';
    const button = document.createElement('button');
    button.className = 'continue-button';
    button.textContent = 'Continue';
    button.addEventListener('click', () => {
        overlay.remove();
        onContinue();
    });
    overlay.appendChild(button);
    document.body.appendChild(overlay);
}

// Game loop state for pause support
const loopState = {
    isPaused: false,
    lastTime: 0,
    updateCallbacks: [],
    renderCallbacks: []
};

// Main game loop with pause support
function gameLoop(currentTime) {
    requestAnimationFrame(gameLoop);
    
    if (loopState.isPaused) {
        return;
    }
    
    const deltaTime = currentTime - loopState.lastTime;
    loopState.lastTime = currentTime;
    
    // Update phase - run all update callbacks
    loopState.updateCallbacks.forEach(cb => cb(deltaTime, currentTime));
    
    // Render phase - run all render callbacks
    loopState.renderCallbacks.forEach(cb => cb());
}

// Core update function (registered as update callback)
function coreUpdate(deltaTime, currentTime) {
    if (world) world.update(currentTime * 0.001);
    
    // Update camera fly-along if active
    if (isCameraFlying) {
        updateCameraFlyAlong(currentTime);
    }
    
    // Update putt simulation animation if active
    if (isPuttSimulationActive) {
        updatePuttSimulationAnimation(currentTime);
    }
    
    updateBallMeshPosition();
}

// Core render function (registered as render callback)
function coreRender() {
    renderer.render(scene, camera);
}

// Public API for pause support
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

// Legacy animate function - now starts the game loop
function animate(time) {
    // Register core callbacks
    loopState.updateCallbacks.push(coreUpdate);
    loopState.renderCallbacks.push(coreRender);
    
    // Initialize lastTime
    loopState.lastTime = time;
    
    // Start the game loop
    gameLoop(time);
}

document.addEventListener('DOMContentLoaded', init);
