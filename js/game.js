// Main game module
import * as THREE from 'three';
import { clubs } from './clubs.js';
import { Ball } from './ball.js';
import { AimLine } from './aim.js';
import { setupUI } from './ui.js';
import { ShotSimulator } from './shot.js';
import { golfer, initializeGolferHistory, recordShot } from './golfer.js';
import { course as defaultCourse } from '../courses/test_course.js';
import { TerrainType, setCourse, getTerrainAt, getSlopeAt, getElevationAt } from './terrain.js';
import { createWorld } from './world.js';
import { createLieWindow, updateLieWindow } from './lieWindow.js';
import { determineLie } from './lie.js';
import { validateTrees } from './trees.js';
import { WORLD_SCALE } from './utils.js';

// Available courses
const availableCourses = [
    { id: 'test_course', name: 'New Course', holes: 1, course: defaultCourse }
];

// Current course (set after selection)
let course = null;

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

// Generate random wind for a hole
function generateWind() {
    const speedRoll = Math.random();
    let speed;
    if (speedRoll < 0.3) speed = Math.random() * 5;
    else if (speedRoll < 0.7) speed = 5 + Math.random() * 5;
    else speed = 10 + Math.random() * 10;
    return { speed: Math.round(speed), direction: Math.round(Math.random() * 360) };
}

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

// Camera fly-along state
let isCameraFlying = false;
let cameraFlyStartTime = null;
let cameraFlyDuration = 2000; // 2 seconds to fly along tracer
let cameraFlyPath = [];
let cameraFlyCallback = null;

function init() {
    // Show home screen and populate course list
    const overlay = document.getElementById('home-overlay');
    const courseList = document.getElementById('course-list');
    
    availableCourses.forEach(c => {
        const card = document.createElement('div');
        card.className = 'course-card';
        card.innerHTML = `
            <div class="course-name">${c.name}</div>
            <div class="course-info">${c.holes} hole${c.holes > 1 ? 's' : ''}</div>
        `;
        card.addEventListener('click', () => startGame(c));
        courseList.appendChild(card);
    });
}

function startGame(selectedCourse) {
    const overlay = document.getElementById('home-overlay');
    const loadingBar = document.getElementById('loading-bar');
    const loadingText = document.getElementById('loading-text');
    const loadingCourseName = document.getElementById('loading-course-name');
    const loadingHoleInfo = document.getElementById('loading-hole-info');
    
    // Switch to loading state
    overlay.classList.add('loading');
    course = selectedCourse.course;
    loadingCourseName.textContent = course.name;
    loadingHoleInfo.textContent = `Hole 1 • Par ${course.holes[0].par} • ${course.holes[0].yards} yards`;
    loadingBar.style.width = '10%';
    loadingText.textContent = 'Loading course...';
    
    // Use requestAnimationFrame to let the UI update, then init game
    requestAnimationFrame(() => {
        initGame(() => {
            // Game ready - fade out overlay
            loadingBar.style.width = '100%';
            loadingText.textContent = 'Ready!';
            setTimeout(() => {
                overlay.classList.add('hidden');
                setTimeout(() => overlay.classList.add('gone'), 500);
            }, 300);
        });
    });
}

function initGame(onReady) {
    const loadingBar = document.getElementById('loading-bar');
    const loadingText = document.getElementById('loading-text');
    
    const container = document.querySelector('.golf-hole');
    
    // Build hole data
    const holeData = course.holes[0];
    const zones = buildZonesFromTerrain(course.terrain || {});
    hole1 = { ...holeData, zones, trees: course.trees || [] };
    
    gameState.currentHole = hole1;
    gameState.courseBounds = course.bounds;
    
    loadingBar.style.width = '30%';
    loadingText.textContent = 'Initializing...';
    
    initializeGolferHistory(golfer);
    gameState.wind = generateWind();
    setCourse(course);
    
    // Setup Three.js scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87ceeb);
    
    camera = new THREE.PerspectiveCamera(60, container.clientWidth / container.clientHeight, 0.1, 12000);
    
    renderer = new THREE.WebGLRenderer({ antialias: true, logarithmicDepthBuffer: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);
    
    loadingBar.style.width = '50%';
    loadingText.textContent = 'Building world...';
    
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
    world.setWind(gameState.wind);
    
    loadingBar.style.width = '70%';
    loadingText.textContent = 'Setting up game...';
    
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
    });
    aimLine.setProjectBallToScreen(() => getBallScreenPosition());
    aimLine.setScreenToGroundPoint(screenToGroundPoint);
    aimLine.setAimAtPoint(aimAtPoint);
    
    loadingBar.style.width = '85%';
    loadingText.textContent = 'Final touches...';
    
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
    
    // Setup camera controls
    setupCameraControls();
    
    // Handle resize
    window.addEventListener('resize', onResize);
    
    // Start render loop
    animate(0);
    
    console.log(`Golf game initialized! Wind: ${gameState.wind.speed} mph from ${gameState.wind.direction}°`);
    
    if (onReady) onReady();
}

function createBallMesh() {
    // Golf ball is 1.68 inches diameter = 0.047 yards
    const geom = new THREE.SphereGeometry(0.047, 16, 16);
    const mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    ballMesh = new THREE.Mesh(geom, mat);
    ballMesh.castShadow = true;
    scene.add(ballMesh);
}

function updateBallMeshPosition() {
    if (!ballMesh || !ball) return;
    const pos = ball.getPosition();
    const height = ball.getHeight() / 2.5; // Convert from pixels to yards
    const pos3D = world.worldTo3D(pos.x, pos.y);
    ballMesh.position.set(pos3D.x, pos3D.y + 0.047 + height, pos3D.z);
    
    // Add point to shot tracer if tracing
    if (isTracingShot) {
        addTracerPoint(pos3D.x, pos3D.y + 0.047 + height, pos3D.z);
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
    cameraFlyDuration = Math.max(1800, Math.min(3500, cameraFlyPath.totalLength * 12));
    
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
    
    const numPoints = 100;
    const lineLength = 500; // Much longer aim line
    const aimRad = (aimAngle * Math.PI) / 180;
    const points = [];
    const bounds = course.bounds;
    
    for (let i = 0; i < numPoints; i++) {
        const t = i / (numPoints - 1);
        const dist = t * lineLength;
        const worldX = ballX + Math.sin(aimRad) * dist;
        const worldY = ballY - Math.cos(aimRad) * dist;
        
        if (worldX >= bounds.minX && worldX <= bounds.maxX && worldY >= bounds.minY && worldY <= bounds.maxY) {
            const pos3D = world.worldTo3D(worldX, worldY);
            points.push(new THREE.Vector3(pos3D.x, pos3D.y + 0.1, pos3D.z));
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

function updateCameraForBall(ballX, ballY) {
    const ballPos3D = world.worldTo3D(ballX, ballY);
    const holePos3D = world.getHolePosition();
    
    const dirX = holePos3D.x - ballPos3D.x;
    const dirZ = holePos3D.z - ballPos3D.z;
    const dist = Math.sqrt(dirX * dirX + dirZ * dirZ);
    const normX = dist > 0 ? dirX / dist : 0;
    const normZ = dist > 0 ? dirZ / dist : 1;
    
    // Camera height ~12ft (4 yards), distance behind ~30ft (10 yards)
    const camHeight = 4;
    const camBehind = 10;
    
    camera.position.set(
        ballPos3D.x - normX * camBehind,
        ballPos3D.y + camHeight,
        ballPos3D.z - normZ * camBehind
    );
    
    baseLookDir.set(normX, -0.05, normZ).normalize();
    cameraYaw = 0;
    cameraPitch = 0;
    updateCameraLook();
}

// Camera aligned to hole centreline (using centreline angle)
function updateCameraForBallAlongCentreline(ballX, ballY, angleInDegrees) {
    const ballPos3D = world.worldTo3D(ballX, ballY);
    
    // Convert angle to 3D direction
    const angleRad = (angleInDegrees * Math.PI) / 180;
    const norm3DX = Math.sin(angleRad);
    const norm3DZ = -Math.cos(angleRad);
    
    // Camera height ~12ft (4 yards), distance behind ~30ft (10 yards)
    const camHeight = 4;
    const camBehind = 10;
    
    camera.position.set(
        ballPos3D.x - norm3DX * camBehind,
        ballPos3D.y + camHeight,
        ballPos3D.z - norm3DZ * camBehind
    );
    
    baseLookDir.set(norm3DX, -0.05, norm3DZ).normalize();
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
    updateLieWindow(lie);
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
        wind: gameState.wind
    });
}

function onShotComplete(finalPosition, shotData) {
    // Stop shot tracer
    stopShotTracer();
    
    const newLie = updateBallLie(finalPosition.x, finalPosition.y);
    const hole = gameState.currentHole.hole;
    const newAngle = Math.atan2(hole.x - finalPosition.x, finalPosition.y - hole.y) * (180 / Math.PI);
    
    if (gameState.updateWindDisplay) gameState.updateWindDisplay(newAngle);
    
    if (gameState.lastShotIntent && shotData && !shotData.isPutt) {
        recordShot(golfer, gameState.lastShotIntent.club, shotData);
    }
    
    if (shotData) displayShotData(shotData);
    
    console.log(`Shot ${gameState.strokes} complete. Ball at (${finalPosition.x.toFixed(1)}, ${finalPosition.y.toFixed(1)})`);
    
    // For putts, skip the camera fly-along since there's no tracer
    const isPutt = shotData && shotData.isPutt;
    
    showContinueButton(() => {
        if (isPutt) {
            // Just update camera and aim for next shot
            clearShotTracer();
            aimLine.setAngle(newAngle);
            aimLine.render();
            updateCameraForBall(finalPosition.x, finalPosition.y);
            updateAimLineMesh(finalPosition.x, finalPosition.y, newAngle);
        } else {
            // Start camera fly-along, then set up for next shot
            startCameraFlyAlong(() => {
                // Clear shot tracer after fly-along completes
                clearShotTracer();
                
                aimLine.setAngle(newAngle);
                aimLine.render();
                updateCameraForBall(finalPosition.x, finalPosition.y);
                updateAimLineMesh(finalPosition.x, finalPosition.y, newAngle);
            });
        }
    });
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

function displayShotData(shotData) {
    const existing = document.querySelector('.shot-data-display');
    if (existing) existing.remove();
    
    const display = document.createElement('div');
    display.className = 'shot-data-display';
    
    // Handle putt data differently
    if (shotData.isPutt) {
        display.innerHTML = `
            <div class="shot-data-header">Putt Data</div>
            <div class="shot-data-grid">
                <div class="data-item"><span class="data-label">Distance</span><span class="data-value">${shotData.intendedFeet.toFixed(0)} ft</span></div>
                <div class="data-item"><span class="data-label">Rolled</span><span class="data-value">${shotData.actualFeet.toFixed(1)} ft</span></div>
            </div>
        `;
    } else {
        const { launch, flight, landing } = shotData;
        
        let landingNote = '';
        if (landing.spinsBack) landingNote = '<span class="spin-back">⬅ SPIN BACK</span>';
        else if (landing.checksUp) landingNote = '<span class="check-up">✓ CHECK</span>';
        
        display.innerHTML = `
            <div class="shot-data-header">Shot Data</div>
            <div class="shot-data-grid">
                <div class="data-item"><span class="data-label">Ball Speed</span><span class="data-value">${launch.ballSpeed.toFixed(1)} mph</span></div>
                <div class="data-item"><span class="data-label">Launch Angle</span><span class="data-value">${launch.launchAngle.toFixed(1)}°</span></div>
                <div class="data-item"><span class="data-label">Spin Rate</span><span class="data-value">${Math.round(launch.spinRate)} rpm</span></div>
                <div class="data-item"><span class="data-label">Spin Axis</span><span class="data-value">${launch.spinAxis > 0 ? '+' : ''}${launch.spinAxis.toFixed(1)}°</span></div>
                <div class="data-item"><span class="data-label">Carry</span><span class="data-value">${flight.carry.toFixed(1)} yds</span></div>
                <div class="data-item"><span class="data-label">Total</span><span class="data-value">${shotData.actualYards.toFixed(1)} yds</span></div>
                <div class="data-item"><span class="data-label">Max Height</span><span class="data-value">${flight.maxHeight.toFixed(1)} yds</span></div>
                <div class="data-item"><span class="data-label">Land Angle</span><span class="data-value">${flight.landingAngle.toFixed(1)}°</span></div>
            </div>
            ${landingNote ? `<div class="landing-note">${landingNote}</div>` : ''}
        `;
    }
    
    document.body.appendChild(display);
    setTimeout(() => {
        display.classList.add('fade-out');
        setTimeout(() => display.remove(), 500);
    }, 4000);
}

function animate(time) {
    requestAnimationFrame(animate);
    if (world) world.update(time * 0.001);
    
    // Update camera fly-along if active
    if (isCameraFlying) {
        updateCameraFlyAlong(time);
    }
    
    updateBallMeshPosition();
    renderer.render(scene, camera);
}

document.addEventListener('DOMContentLoaded', init);
