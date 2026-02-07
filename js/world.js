// World Creation System
// Builds 3D world from course data: elevation grid, terrain features, trees, and hole setup

import * as THREE from 'three';
import { TerrainType, terrainProperties, setCourse, getElevationAt, findGreenFront } from './terrain.js';
import { TreeType, treeProperties, createTree3D } from './trees.js';
import { 
    WORLD_SCALE, 
    isPointInPolygon, 
    distanceToSegment, 
    distanceToPolygon, 
    smoothstep,
    yardsToWorld,
    findCircleCentrelineIntersection
} from './utils.js';

// Sky configuration
const SKY_CONFIG = {
    sunColor: 0xfffacd,        // Warm sun color
    sunSize: 80,               // Sun disc size
    sunDistance: 3000,         // Distance from origin
    sunElevation: 80,          // Sun elevation angle in degrees (0=horizon, 90=overhead)
    sunAzimuth: 30,            // Sun azimuth angle in degrees (direction around horizon)
    cloudCount: 15,            // Number of cloud groups
    cloudMinHeight: 400,       // Minimum cloud height
    cloudMaxHeight: 600,       // Maximum cloud height
    cloudSpread: 2000,         // How far clouds spread from center
    cloudSpeed: 0.5            // Cloud movement speed
};

// Terrain colors for 3D rendering
const TERRAIN_COLORS = {
    [TerrainType.FAIRWAY]: 0x3d6b35,
    [TerrainType.ROUGH]: 0x2d5a27,
    [TerrainType.GREEN]: 0x5cb85c,
    [TerrainType.BUNKER]: 0xe8d4a8,
    [TerrainType.WATER]: 0x3498db,
    [TerrainType.TEE]: 0x4a7c43,
    [TerrainType.OUT_OF_BOUNDS]: 0x1a1a1a
};

export class World {
    constructor(scene) {
        this.scene = scene;
        this.course = null;
        this.currentHole = null;
        this.terrainMesh = null;
        this.terrainOverlays = [];
        this.trees = [];
        this.holeMarker = null;
        this.teeMarker = null;
        
        // Sky elements
        this.sunMesh = null;
        this.sunGlow = null;
        this.clouds = [];
        this.sunPosition = new THREE.Vector3();
    }

    // Load a course and build the world
    loadCourse(course) {
        this.course = course;
        setCourse(course);
        this.clear();
        this.waterBodies = []; // Reset water bodies
        this.calculateSunPosition(); // Calculate sun position first for shadows
        this.buildSky();       // Add sun and clouds
        this.buildTerrain();   // Terrain texture includes tree shadows
        this.buildWaterPlanes(); // Add flat water surfaces
        this.buildTrees();
        this.buildSprinklerHeads(); // Add sprinkler head markers
    }

    // Set the active hole (tee and hole positions)
    setHole(holeNumber) {
        const hole = this.course.holes.find(h => h.number === holeNumber);
        if (!hole) {
            console.warn(`Hole ${holeNumber} not found`);
            return null;
        }
        this.currentHole = hole;
        this.updateHoleMarkers();
        return hole;
    }

    // Clear all world objects
    clear() {
        if (this.terrainMesh) {
            this.scene.remove(this.terrainMesh);
            this.terrainMesh.geometry.dispose();
            this.terrainMesh.material.dispose();
            this.terrainMesh = null;
        }

        this.terrainOverlays.forEach(overlay => {
            this.scene.remove(overlay);
            overlay.geometry.dispose();
            overlay.material.dispose();
        });
        this.terrainOverlays = [];

        this.trees.forEach(tree => {
            this.scene.remove(tree.group);
        });
        this.trees = [];
        
        // Clear sprinkler heads
        if (this.sprinklerHeadMarkers) {
            this.sprinklerHeadMarkers.forEach(marker => {
                this.scene.remove(marker);
                marker.traverse(child => {
                    if (child.geometry) child.geometry.dispose();
                    if (child.material) child.material.dispose();
                });
            });
        }
        this.sprinklerHeadMarkers = [];
        
        // Clear sky elements
        if (this.sunMesh) {
            this.scene.remove(this.sunMesh);
            this.sunMesh.geometry.dispose();
            this.sunMesh.material.dispose();
            this.sunMesh = null;
        }
        if (this.sunGlow) {
            this.scene.remove(this.sunGlow);
            this.sunGlow.geometry.dispose();
            this.sunGlow.material.dispose();
            this.sunGlow = null;
        }
        this.clouds.forEach(cloud => {
            this.scene.remove(cloud.group);
            cloud.group.traverse(child => {
                if (child.geometry) child.geometry.dispose();
                if (child.material) child.material.dispose();
            });
        });
        this.clouds = [];

        if (this.holeMarker) {
            this.scene.remove(this.holeMarker);
            this.holeMarker = null;
        }
        if (this.teeMarker) {
            this.scene.remove(this.teeMarker);
            this.teeMarker = null;
        }
    }


    // Build the base terrain mesh with a generated texture for terrain colors
    buildTerrain() {
        if (!this.course || !this.course.elevationGrid) return;

        const grid = this.course.elevationGrid;
        const bounds = this.course.bounds;
        
        // Modify elevation for bunkers and water
        this.modifyTerrainForFeatures(grid, bounds);
        
        // Create terrain color texture with slope shading
        const textureSize = 4096; // High res texture for sharp edges
        const texture = this.createTerrainTexture(textureSize, bounds);
        
        // Create geometry from elevation grid
        const geometry = new THREE.PlaneGeometry(
            (bounds.maxX - bounds.minX) * WORLD_SCALE,
            (bounds.maxY - bounds.minY) * WORLD_SCALE,
            grid.cols - 1,
            grid.rows - 1
        );

        // Apply elevation to vertices
        const positions = geometry.attributes.position.array;
        for (let row = 0; row < grid.rows; row++) {
            for (let col = 0; col < grid.cols; col++) {
                const idx = (row * grid.cols + col) * 3;
                const elevation = grid.data[row][col];
                positions[idx + 2] = elevation * 0.33;
            }
        }
        geometry.computeVertexNormals();

        // Use MeshStandardMaterial for better lighting response
        const material = new THREE.MeshStandardMaterial({
            map: texture,
            side: THREE.DoubleSide,
            roughness: 0.9,
            metalness: 0.0
        });

        this.terrainMesh = new THREE.Mesh(geometry, material);
        this.terrainMesh.rotation.x = -Math.PI / 2;
        this.terrainMesh.receiveShadow = true;

        // Center the terrain
        const centerX = (bounds.minX + bounds.maxX) / 2;
        const centerY = (bounds.minY + bounds.maxY) / 2;
        this.terrainMesh.position.set(
            (centerX - 50) * WORLD_SCALE,
            0,
            (centerY - 50) * WORLD_SCALE
        );

        this.scene.add(this.terrainMesh);
    }

    // Build sky with sun and clouds
    buildSky() {
        // Sun position already calculated in calculateSunPosition()
        
        // Create sun disc
        const sunGeometry = new THREE.CircleGeometry(SKY_CONFIG.sunSize, 32);
        const sunMaterial = new THREE.MeshBasicMaterial({
            color: SKY_CONFIG.sunColor,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 1.0
        });
        this.sunMesh = new THREE.Mesh(sunGeometry, sunMaterial);
        this.sunMesh.position.copy(this.sunPosition);
        this.sunMesh.lookAt(0, 0, 0);
        this.scene.add(this.sunMesh);
        
        // Create sun glow
        const glowGeometry = new THREE.CircleGeometry(SKY_CONFIG.sunSize * 2.5, 32);
        const glowMaterial = new THREE.MeshBasicMaterial({
            color: 0xfffacd,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.3
        });
        this.sunGlow = new THREE.Mesh(glowGeometry, glowMaterial);
        this.sunGlow.position.copy(this.sunPosition);
        this.sunGlow.lookAt(0, 0, 0);
        this.scene.add(this.sunGlow);
        
        // Create clouds
        this.createClouds();
    }
    
    // Calculate sun position (called before terrain for shadow baking)
    calculateSunPosition() {
        // Convert degrees to radians
        const elevationRad = (SKY_CONFIG.sunElevation * Math.PI) / 180;
        const azimuthRad = (SKY_CONFIG.sunAzimuth * Math.PI) / 180;
        
        // Calculate sun position
        // At 90° elevation, sun is directly overhead (Y = distance, X = Z = 0)
        // At 0° elevation, sun is on horizon
        this.sunPosition.set(
            Math.cos(azimuthRad) * Math.cos(elevationRad) * SKY_CONFIG.sunDistance,
            Math.sin(elevationRad) * SKY_CONFIG.sunDistance,
            Math.sin(azimuthRad) * Math.cos(elevationRad) * SKY_CONFIG.sunDistance
        );
        
        // Store shadow length multiplier based on sun elevation
        // tan(elevation) gives the ratio: higher sun = shorter shadows
        // At 60°, shadows are ~0.58x tree height
        // At 30°, shadows are ~1.73x tree height
        // At 45°, shadows are 1x tree height
        this.shadowLengthMultiplier = 1 / Math.tan(elevationRad);
    }
    
    // Create fluffy cloud groups
    createClouds() {
        for (let i = 0; i < SKY_CONFIG.cloudCount; i++) {
            const cloud = this.createCloudGroup();
            
            // Random position in sky
            const angle = Math.random() * Math.PI * 2;
            const distance = Math.random() * SKY_CONFIG.cloudSpread;
            const height = SKY_CONFIG.cloudMinHeight + Math.random() * (SKY_CONFIG.cloudMaxHeight - SKY_CONFIG.cloudMinHeight);
            
            cloud.group.position.set(
                Math.cos(angle) * distance,
                height,
                Math.sin(angle) * distance
            );
            
            // Random rotation
            cloud.group.rotation.y = Math.random() * Math.PI * 2;
            
            // Random scale
            const scale = 0.5 + Math.random() * 1.0;
            cloud.group.scale.set(scale, scale * 0.6, scale);
            
            this.clouds.push(cloud);
            this.scene.add(cloud.group);
        }
    }
    
    // Create a single cloud group made of multiple spheres
    createCloudGroup() {
        const group = new THREE.Group();
        
        const cloudMaterial = new THREE.MeshLambertMaterial({
            color: 0xffffff,
            transparent: true,
            opacity: 0.9
        });
        
        // Create cloud puffs
        const puffCount = 5 + Math.floor(Math.random() * 5);
        for (let i = 0; i < puffCount; i++) {
            const size = 20 + Math.random() * 40;
            const puffGeometry = new THREE.SphereGeometry(size, 8, 6);
            const puff = new THREE.Mesh(puffGeometry, cloudMaterial);
            
            // Position puffs to form cloud shape
            puff.position.set(
                (Math.random() - 0.5) * 80,
                (Math.random() - 0.5) * 20,
                (Math.random() - 0.5) * 40
            );
            
            // Flatten slightly
            puff.scale.y = 0.6 + Math.random() * 0.3;
            
            group.add(puff);
        }
        
        return {
            group,
            speed: 0.3 + Math.random() * 0.4,
            drift: (Math.random() - 0.5) * 0.1
        };
    }

    // Create a texture with terrain colors and slope shading
    createTerrainTexture(size, bounds) {
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        
        // Fill with rough color as base
        ctx.fillStyle = '#2d5a27';
        ctx.fillRect(0, 0, size, size);
        
        // Draw terrain features in order (back to front)
        const terrain = this.course.terrain;
        
        // Helper to convert world coords to canvas coords
        const toCanvas = (worldX, worldY) => {
            const x = ((worldX - bounds.minX) / (bounds.maxX - bounds.minX)) * size;
            const y = ((worldY - bounds.minY) / (bounds.maxY - bounds.minY)) * size;
            return { x, y };
        };
        
        // Draw polygon on canvas
        const drawPolygon = (points, color) => {
            if (!points || points.length < 3) return;
            ctx.fillStyle = color;
            ctx.beginPath();
            const start = toCanvas(points[0][0], points[0][1]);
            ctx.moveTo(start.x, start.y);
            for (let i = 1; i < points.length; i++) {
                const p = toCanvas(points[i][0], points[i][1]);
                ctx.lineTo(p.x, p.y);
            }
            ctx.closePath();
            ctx.fill();
        };
        
        // Draw rectangle on canvas
        const drawRect = (zone, color) => {
            ctx.fillStyle = color;
            const tl = toCanvas(zone.x, zone.y);
            const br = toCanvas(zone.x + zone.width, zone.y + zone.height);
            ctx.fillRect(tl.x, tl.y, br.x - tl.x, br.y - tl.y);
        };
        
        // Draw line/path on canvas
        const drawLine = (points, color, width) => {
            if (!points || points.length < 2) return;
            ctx.strokeStyle = color;
            ctx.lineWidth = (width || 3) * size / (bounds.maxX - bounds.minX);
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.beginPath();
            const start = toCanvas(points[0][0], points[0][1]);
            ctx.moveTo(start.x, start.y);
            for (let i = 1; i < points.length; i++) {
                const p = toCanvas(points[i][0], points[i][1]);
                ctx.lineTo(p.x, p.y);
            }
            ctx.stroke();
        };
        
        // Draw any shape
        const drawShape = (zone, color) => {
            if (zone.shape === 'polygon') {
                drawPolygon(zone.points, color);
            } else if (zone.shape === 'rect') {
                drawRect(zone, color);
            } else if (zone.shape === 'line') {
                drawLine(zone.points, color, zone.width);
            }
        };
        
        // Draw in render order - skip water since it's a separate flat plane
        if (terrain.outOfBounds) {
            terrain.outOfBounds.forEach(f => drawShape(f, '#1a1a1a'));
        }
        if (terrain.fairway) {
            terrain.fairway.forEach(f => drawShape(f, '#3d6b35'));
        }
        if (terrain.bunker) {
            terrain.bunker.forEach(f => drawShape(f, '#e8d4a8'));
        }
        // Water is rendered as separate flat plane, but draw dark color for underwater terrain
        if (terrain.water) {
            terrain.water.forEach(f => drawShape(f, '#1a3d4d'));
        }
        if (terrain.green) {
            terrain.green.forEach(f => drawShape(f, '#5cb85c'));
        }
        if (terrain.teeBox) {
            terrain.teeBox.forEach(f => drawShape(f, '#4a7c43'));
        }
        if (terrain.path) {
            terrain.path.forEach(f => drawShape(f, '#8b7355'));
        }
        
        // Apply slope shading overlay
        this.applySlopeShading(ctx, size, bounds);
        
        // Bake tree shadows into texture
        this.bakeTreeShadows(ctx, size, bounds);
        
        const texture = new THREE.CanvasTexture(canvas);
        texture.wrapS = THREE.ClampToEdgeWrapping;
        texture.wrapT = THREE.ClampToEdgeWrapping;
        texture.minFilter = THREE.LinearMipmapLinearFilter;
        texture.magFilter = THREE.LinearFilter;
        texture.anisotropy = 16; // Sharper at angles
        
        return texture;
    }
    
    // Bake tree shadows onto the terrain texture
    bakeTreeShadows(ctx, size, bounds) {
        if (!this.course.trees || this.course.trees.length === 0) return;
        
        // Get sun direction for shadow projection (horizontal direction only)
        const azimuthRad = (SKY_CONFIG.sunAzimuth * Math.PI) / 180;
        
        // Shadow direction is opposite to sun's horizontal direction
        // shadowLengthMultiplier already accounts for sun elevation
        const shadowDirX = -Math.cos(azimuthRad) * this.shadowLengthMultiplier;
        const shadowDirZ = -Math.sin(azimuthRad) * this.shadowLengthMultiplier;
        
        // Helper to convert world coords to canvas coords
        const toCanvas = (worldX, worldY) => {
            const x = ((worldX - bounds.minX) / (bounds.maxX - bounds.minX)) * size;
            const y = ((worldY - bounds.minY) / (bounds.maxY - bounds.minY)) * size;
            return { x, y };
        };
        
        // Scale factor for world to canvas
        const worldWidth = bounds.maxX - bounds.minX;
        const scale = size / worldWidth;
        
        ctx.save();
        ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
        
        this.course.trees.forEach(tree => {
            const props = treeProperties[tree.type];
            if (!props) return;
            
            const treeX = tree.x;
            const treeY = tree.y;
            const height = tree.height || (props.height.min + props.height.max) / 2;
            const canopyRadius = tree.canopyRadius || (props.canopyRadius.min + props.canopyRadius.max) / 2;
            const trunkRatio = props.trunkRatio;
            const category = props.category;
            
            // Draw shadow shape based on tree type
            ctx.beginPath();
            
            if (category === 'tall_pine' || category === 'short_pine') {
                // Pine shadow: trunk line + foliage clusters at top
                this.drawPineShadow(ctx, toCanvas, treeX, treeY, height, canopyRadius, trunkRatio, shadowDirX, shadowDirZ, scale);
            } else {
                // Deciduous shadow: broad canopy shape
                this.drawDeciduousShadow(ctx, toCanvas, treeX, treeY, height, canopyRadius, trunkRatio, shadowDirX, shadowDirZ, scale);
            }
        });
        
        ctx.restore();
    }
    
    // Draw pine tree shadow (trunk + sparse foliage clusters)
    drawPineShadow(ctx, toCanvas, treeX, treeY, height, canopyRadius, trunkRatio, shadowDirX, shadowDirZ, scale) {
        const trunkHeight = height * trunkRatio;
        const crownHeight = height - trunkHeight;
        
        // Trunk shadow (thin rectangle)
        const trunkWidth = 0.4;
        const trunkBasePos = toCanvas(treeX, treeY);
        const trunkTopShadowX = treeX + trunkHeight * shadowDirX;
        const trunkTopShadowY = treeY + trunkHeight * shadowDirZ;
        const trunkTopPos = toCanvas(trunkTopShadowX, trunkTopShadowY);
        
        // Draw trunk as thin quad
        const perpX = -shadowDirZ;
        const perpY = shadowDirX;
        const perpLen = Math.sqrt(perpX * perpX + perpY * perpY);
        const normPerpX = (perpX / perpLen) * trunkWidth * 0.5;
        const normPerpY = (perpY / perpLen) * trunkWidth * 0.5;
        
        ctx.beginPath();
        const tb1 = toCanvas(treeX - normPerpX, treeY - normPerpY);
        const tb2 = toCanvas(treeX + normPerpX, treeY + normPerpY);
        const tt1 = toCanvas(trunkTopShadowX - normPerpX * 0.5, trunkTopShadowY - normPerpY * 0.5);
        const tt2 = toCanvas(trunkTopShadowX + normPerpX * 0.5, trunkTopShadowY + normPerpY * 0.5);
        ctx.moveTo(tb1.x, tb1.y);
        ctx.lineTo(tb2.x, tb2.y);
        ctx.lineTo(tt2.x, tt2.y);
        ctx.lineTo(tt1.x, tt1.y);
        ctx.closePath();
        ctx.fill();
        
        // Foliage cluster shadows at various heights
        const clusterCount = 5;
        for (let i = 0; i < clusterCount; i++) {
            const t = 0.2 + (i / clusterCount) * 0.8; // 20% to 100% up the crown
            const clusterHeight = trunkHeight + t * crownHeight;
            const clusterRadius = canopyRadius * (0.4 + Math.random() * 0.4);
            
            // Random offset from trunk
            const angle = (i / clusterCount) * Math.PI * 2 + i * 1.3;
            const offsetDist = canopyRadius * 0.6;
            const clusterWorldX = treeX + Math.cos(angle) * offsetDist;
            const clusterWorldY = treeY + Math.sin(angle) * offsetDist;
            
            // Project to shadow position
            const shadowX = clusterWorldX + clusterHeight * shadowDirX;
            const shadowY = clusterWorldY + clusterHeight * shadowDirZ;
            const shadowPos = toCanvas(shadowX, shadowY);
            
            // Draw elliptical shadow for cluster
            ctx.beginPath();
            ctx.ellipse(
                shadowPos.x, 
                shadowPos.y, 
                clusterRadius * scale * 1.2, 
                clusterRadius * scale * 0.8, 
                Math.atan2(shadowDirZ, shadowDirX), 
                0, 
                Math.PI * 2
            );
            ctx.fill();
        }
        
        // Top tuft shadow
        const topShadowX = treeX + height * shadowDirX;
        const topShadowY = treeY + height * shadowDirZ;
        const topPos = toCanvas(topShadowX, topShadowY);
        ctx.beginPath();
        ctx.ellipse(
            topPos.x, 
            topPos.y, 
            canopyRadius * scale * 0.8, 
            canopyRadius * scale * 0.5, 
            Math.atan2(shadowDirZ, shadowDirX), 
            0, 
            Math.PI * 2
        );
        ctx.fill();
    }
    
    // Draw deciduous tree shadow (broad canopy)
    drawDeciduousShadow(ctx, toCanvas, treeX, treeY, height, canopyRadius, trunkRatio, shadowDirX, shadowDirZ, scale) {
        const trunkHeight = height * trunkRatio;
        
        // Trunk shadow
        const trunkWidth = 0.5;
        const trunkTopShadowX = treeX + trunkHeight * shadowDirX;
        const trunkTopShadowY = treeY + trunkHeight * shadowDirZ;
        
        const perpX = -shadowDirZ;
        const perpY = shadowDirX;
        const perpLen = Math.sqrt(perpX * perpX + perpY * perpY);
        const normPerpX = (perpX / perpLen) * trunkWidth * 0.5;
        const normPerpY = (perpY / perpLen) * trunkWidth * 0.5;
        
        ctx.beginPath();
        const tb1 = toCanvas(treeX - normPerpX, treeY - normPerpY);
        const tb2 = toCanvas(treeX + normPerpX, treeY + normPerpY);
        const tt1 = toCanvas(trunkTopShadowX - normPerpX * 0.6, trunkTopShadowY - normPerpY * 0.6);
        const tt2 = toCanvas(trunkTopShadowX + normPerpX * 0.6, trunkTopShadowY + normPerpY * 0.6);
        ctx.moveTo(tb1.x, tb1.y);
        ctx.lineTo(tb2.x, tb2.y);
        ctx.lineTo(tt2.x, tt2.y);
        ctx.lineTo(tt1.x, tt1.y);
        ctx.closePath();
        ctx.fill();
        
        // Main canopy shadow - large irregular shape
        const canopyHeight = trunkHeight + (height - trunkHeight) * 0.5; // Center of canopy
        const canopyShadowX = treeX + canopyHeight * shadowDirX;
        const canopyShadowY = treeY + canopyHeight * shadowDirZ;
        
        // Draw main canopy as overlapping ellipses for organic shape
        const lobeCount = 4;
        for (let i = 0; i < lobeCount; i++) {
            const angle = (i / lobeCount) * Math.PI * 2;
            const lobeOffsetX = Math.cos(angle) * canopyRadius * 0.5;
            const lobeOffsetY = Math.sin(angle) * canopyRadius * 0.5;
            const lobeHeight = canopyHeight + (Math.random() - 0.5) * canopyRadius;
            
            const lobeShadowX = treeX + lobeOffsetX + lobeHeight * shadowDirX;
            const lobeShadowY = treeY + lobeOffsetY + lobeHeight * shadowDirZ;
            const lobePos = toCanvas(lobeShadowX, lobeShadowY);
            
            ctx.beginPath();
            ctx.ellipse(
                lobePos.x, 
                lobePos.y, 
                canopyRadius * scale * (0.6 + Math.random() * 0.3), 
                canopyRadius * scale * (0.4 + Math.random() * 0.2), 
                Math.atan2(shadowDirZ, shadowDirX) + (Math.random() - 0.5) * 0.3, 
                0, 
                Math.PI * 2
            );
            ctx.fill();
        }
        
        // Central shadow blob
        const centerPos = toCanvas(canopyShadowX, canopyShadowY);
        ctx.beginPath();
        ctx.ellipse(
            centerPos.x, 
            centerPos.y, 
            canopyRadius * scale * 1.0, 
            canopyRadius * scale * 0.7, 
            Math.atan2(shadowDirZ, shadowDirX), 
            0, 
            Math.PI * 2
        );
        ctx.fill();
    }
    
    // Apply slope-based shading to the terrain texture
    applySlopeShading(ctx, size, bounds) {
        const grid = this.course.elevationGrid;
        if (!grid) return;
        
        // Create an overlay for slope shading
        const imageData = ctx.getImageData(0, 0, size, size);
        const data = imageData.data;
        
        // Sun direction for lighting (normalized, pointing toward sun)
        const sunDir = { x: 0.5, y: 0.7, z: 0.5 };
        const sunLen = Math.sqrt(sunDir.x * sunDir.x + sunDir.y * sunDir.y + sunDir.z * sunDir.z);
        sunDir.x /= sunLen;
        sunDir.y /= sunLen;
        sunDir.z /= sunLen;
        
        const worldWidth = bounds.maxX - bounds.minX;
        const worldHeight = bounds.maxY - bounds.minY;
        
        // Apply shading to every pixel
        for (let py = 0; py < size; py++) {
            for (let px = 0; px < size; px++) {
                // Convert pixel to world coordinates
                const worldX = bounds.minX + (px / size) * worldWidth;
                const worldY = bounds.minY + (py / size) * worldHeight;
                
                // Calculate normal using smooth elevation sampling
                const normal = this.calculateTerrainNormalSmooth(grid, bounds, worldX, worldY);
                
                // Calculate lighting (dot product with sun direction)
                const dot = normal.x * sunDir.x + normal.y * sunDir.y + normal.z * sunDir.z;
                
                // Map dot product to brightness adjustment (darker overall)
                const brightness = 0.5 + dot * 0.3;
                
                // Add subtle random texture noise
                const noise = 0.9 + Math.random() * 0.2; // 0.9 to 1.1 (±10% = 20% range)
                const finalBrightness = brightness * noise;
                
                const idx = (py * size + px) * 4;
                data[idx] = Math.min(255, Math.max(0, data[idx] * finalBrightness));
                data[idx + 1] = Math.min(255, Math.max(0, data[idx + 1] * finalBrightness));
                data[idx + 2] = Math.min(255, Math.max(0, data[idx + 2] * finalBrightness));
            }
        }
        
        ctx.putImageData(imageData, 0, 0);
    }
    
    // Calculate terrain normal using bicubic interpolated elevations
    calculateTerrainNormalSmooth(grid, bounds, worldX, worldY) {
        const delta = 0.5; // Sample distance in world units
        
        // Get elevations using bicubic interpolation
        const elevRight = this.getElevationBicubic(grid, bounds, worldX + delta, worldY);
        const elevLeft = this.getElevationBicubic(grid, bounds, worldX - delta, worldY);
        const elevUp = this.getElevationBicubic(grid, bounds, worldX, worldY + delta);
        const elevDown = this.getElevationBicubic(grid, bounds, worldX, worldY - delta);
        
        // Calculate gradient
        const dzdx = (elevRight - elevLeft) / (2 * delta);
        const dzdy = (elevUp - elevDown) / (2 * delta);
        
        // Normal from gradient: (-dz/dx, 1, -dz/dy) normalized
        const nx = -dzdx;
        const ny = 1;
        const nz = -dzdy;
        
        const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
        
        return {
            x: nx / len,
            y: ny / len,
            z: nz / len
        };
    }
    
    // Bicubic interpolation for smooth elevation sampling
    getElevationBicubic(grid, bounds, worldX, worldY) {
        // Convert world to grid coordinates
        const gx = ((worldX - bounds.minX) / (bounds.maxX - bounds.minX)) * (grid.cols - 1);
        const gy = ((worldY - bounds.minY) / (bounds.maxY - bounds.minY)) * (grid.rows - 1);
        
        const xi = Math.floor(gx);
        const yi = Math.floor(gy);
        const xf = gx - xi;
        const yf = gy - yi;
        
        // Get value with bounds clamping
        const getValue = (c, r) => {
            const cc = Math.max(0, Math.min(grid.cols - 1, c));
            const rr = Math.max(0, Math.min(grid.rows - 1, r));
            return grid.data[rr][cc];
        };
        
        // Catmull-Rom cubic interpolation
        const cubic = (p0, p1, p2, p3, t) => {
            const t2 = t * t;
            const t3 = t2 * t;
            return 0.5 * (
                (2 * p1) +
                (-p0 + p2) * t +
                (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
                (-p0 + 3 * p1 - 3 * p2 + p3) * t3
            );
        };
        
        // Interpolate 4 rows
        const row0 = cubic(getValue(xi-1, yi-1), getValue(xi, yi-1), getValue(xi+1, yi-1), getValue(xi+2, yi-1), xf);
        const row1 = cubic(getValue(xi-1, yi), getValue(xi, yi), getValue(xi+1, yi), getValue(xi+2, yi), xf);
        const row2 = cubic(getValue(xi-1, yi+1), getValue(xi, yi+1), getValue(xi+1, yi+1), getValue(xi+2, yi+1), xf);
        const row3 = cubic(getValue(xi-1, yi+2), getValue(xi, yi+2), getValue(xi+1, yi+2), getValue(xi+2, yi+2), xf);
        
        // Interpolate column
        return cubic(row0, row1, row2, row3, yf);
    }
    
    // Calculate terrain normal at a world position (used by other code)
    calculateTerrainNormal(worldX, worldY, bounds) {
        const grid = this.course.elevationGrid;
        return this.calculateTerrainNormalSmooth(grid, bounds, worldX, worldY);
    }

    // No longer needed - terrain colors are in texture now
    drapeTerrainFeatures() {
    }

    // Modify elevation grid for bunkers (depress) and water (carve out basin)
    modifyTerrainForFeatures(grid, bounds) {
        const terrain = this.course.terrain;
        if (!terrain) return;

        // Process water - carve terrain below water level, we'll add flat water plane separately
        if (terrain.water) {
            terrain.water.forEach(feature => {
                if (feature.shape === 'polygon' && feature.points) {
                    this.carveWaterBasin(grid, bounds, feature.points);
                }
            });
        }

        // Process bunkers - create bowl-shaped depressions
        if (terrain.bunker) {
            terrain.bunker.forEach(feature => {
                if (feature.shape === 'polygon' && feature.points) {
                    this.depressBunker(grid, bounds, feature.points, feature.depth || 12);
                }
            });
        }
    }

    // Carve terrain below water level - water plane added separately
    carveWaterBasin(grid, bounds, points) {
        // Find lowest elevation along the polygon edge - this is water level
        let waterLevel = Infinity;
        for (const p of points) {
            const elev = this.getGridElevation(grid, bounds, p[0], p[1]);
            if (elev < waterLevel) waterLevel = elev;
        }

        // Store water level for creating flat plane later
        if (!this.waterBodies) this.waterBodies = [];
        this.waterBodies.push({ points, waterLevel });

        // Carve terrain inside water to be below water surface
        const waterDepth = 2; // How deep below surface
        
        for (let row = 0; row < grid.rows; row++) {
            for (let col = 0; col < grid.cols; col++) {
                const worldX = bounds.minX + (col / (grid.cols - 1)) * (bounds.maxX - bounds.minX);
                const worldY = bounds.minY + (row / (grid.rows - 1)) * (bounds.maxY - bounds.minY);
                
                if (isPointInPolygon(worldX, worldY, points)) {
                    // Set terrain below water level
                    grid.data[row][col] = waterLevel - waterDepth;
                }
            }
        }

        // Pull down surrounding terrain to meet water edge
        const transitionDist = 5;
        
        for (let row = 0; row < grid.rows; row++) {
            for (let col = 0; col < grid.cols; col++) {
                const worldX = bounds.minX + (col / (grid.cols - 1)) * (bounds.maxX - bounds.minX);
                const worldY = bounds.minY + (row / (grid.rows - 1)) * (bounds.maxY - bounds.minY);
                
                if (isPointInPolygon(worldX, worldY, points)) continue;
                
                const dist = distanceToPolygon(worldX, worldY, points);
                if (dist < transitionDist) {
                    const currentElev = grid.data[row][col];
                    if (currentElev > waterLevel) {
                        const t = dist / transitionDist;
                        grid.data[row][col] = waterLevel + (currentElev - waterLevel) * smoothstep(t);
                    }
                }
            }
        }
    }

    // Create flat water planes after terrain is built
    buildWaterPlanes() {
        if (!this.waterBodies) return;

        for (const water of this.waterBodies) {
            this.createWaterPlane(water.points, water.waterLevel);
        }
    }

    // Create a flat water plane for a water body
    createWaterPlane(points, waterLevel) {
        // Create shape from points
        const shape = new THREE.Shape();
        const firstPt = points[0];
        shape.moveTo((firstPt[0] - 50) * WORLD_SCALE, (firstPt[1] - 50) * WORLD_SCALE);
        
        for (let i = 1; i < points.length; i++) {
            const p = points[i];
            shape.lineTo((p[0] - 50) * WORLD_SCALE, (p[1] - 50) * WORLD_SCALE);
        }
        shape.closePath();

        const geometry = new THREE.ShapeGeometry(shape);
        
        const material = new THREE.MeshLambertMaterial({
            color: 0x3498db,
            transparent: true,
            opacity: 0.85,
            side: THREE.DoubleSide
        });

        const mesh = new THREE.Mesh(geometry, material);
        mesh.rotation.x = -Math.PI / 2;
        mesh.position.y = waterLevel * 0.33; // Same scale as terrain elevation
        
        this.scene.add(mesh);
        this.terrainOverlays.push(mesh);
    }

    // Create bowl-shaped depression for bunker
    // Asymmetric: steeper face toward green if closer to green, away from tee if closer to tee
    depressBunker(grid, bounds, points, depth) {
        // Find centroid and bounding box of bunker
        let cx = 0, cy = 0;
        let minX = Infinity, maxX = -Infinity;
        let minY = Infinity, maxY = -Infinity;
        
        for (const p of points) {
            cx += p[0];
            cy += p[1];
            minX = Math.min(minX, p[0]);
            maxX = Math.max(maxX, p[0]);
            minY = Math.min(minY, p[1]);
            maxY = Math.max(maxY, p[1]);
        }
        cx /= points.length;
        cy /= points.length;
        
        const radiusX = (maxX - minX) / 2;
        const radiusY = (maxY - minY) / 2;
        
        // Get tee and green positions for asymmetry
        let teePos = { x: 0, y: 0 };
        let greenPos = { x: 0, y: 0 };
        
        if (this.course && this.course.holes && this.course.holes.length > 0) {
            const hole = this.course.holes[0]; // Use first hole for now
            if (hole.tee) teePos = hole.tee;
            if (hole.hole) greenPos = hole.hole;
        }
        
        // Determine if bunker is closer to tee or green
        const distToTee = Math.sqrt((cx - teePos.x) ** 2 + (cy - teePos.y) ** 2);
        const distToGreen = Math.sqrt((cx - greenPos.x) ** 2 + (cy - greenPos.y) ** 2);
        const closerToGreen = distToGreen < distToTee;
        
        // Calculate direction for steep face
        // If closer to tee: steep face is AWAY from tee (toward green direction)
        // If closer to green: steep face is TOWARD green
        const targetPos = closerToGreen ? greenPos : teePos;
        let dirX = targetPos.x - cx;
        let dirY = targetPos.y - cy;
        const dirMag = Math.sqrt(dirX ** 2 + dirY ** 2) || 1;
        dirX /= dirMag;
        dirY /= dirMag;
        
        // Flip direction if closer to tee (steep face away from tee)
        if (!closerToGreen) {
            dirX = -dirX;
            dirY = -dirY;
        }

        for (let row = 0; row < grid.rows; row++) {
            for (let col = 0; col < grid.cols; col++) {
                const worldX = bounds.minX + (col / (grid.cols - 1)) * (bounds.maxX - bounds.minX);
                const worldY = bounds.minY + (row / (grid.rows - 1)) * (bounds.maxY - bounds.minY);
                
                if (isPointInPolygon(worldX, worldY, points)) {
                    // Calculate distance from center (normalized)
                    const dx = (worldX - cx) / radiusX;
                    const dy = (worldY - cy) / radiusY;
                    const distFromCenter = Math.sqrt(dx * dx + dy * dy);
                    
                    // Calculate asymmetry factor based on position relative to steep face direction
                    const offsetX = worldX - cx;
                    const offsetY = worldY - cy;
                    const offsetMag = Math.sqrt(offsetX ** 2 + offsetY ** 2) || 1;
                    // Dot product gives -1 to 1: positive = toward steep face
                    const asymmetryFactor = (offsetX * dirX + offsetY * dirY) / offsetMag;
                    
                    // Asymmetric depth multiplier (0.65 to 1.35 range)
                    const asymmetryStrength = 0.35;
                    const depthMultiplier = 1 + (asymmetryFactor * asymmetryStrength);
                    
                    // Steeper bowl shape using power curve
                    // cos^0.7 creates steeper walls near edges
                    const baseCurve = Math.cos(Math.min(distFromCenter, 1) * Math.PI / 2);
                    const steepCurve = Math.pow(baseCurve, 0.7);
                    
                    grid.data[row][col] -= depth * steepCurve * depthMultiplier;
                }
            }
        }
    }

    // Get elevation from grid at world position
    getGridElevation(grid, bounds, worldX, worldY) {
        const col = ((worldX - bounds.minX) / (bounds.maxX - bounds.minX)) * (grid.cols - 1);
        const row = ((worldY - bounds.minY) / (bounds.maxY - bounds.minY)) * (grid.rows - 1);
        
        const c = Math.floor(Math.max(0, Math.min(grid.cols - 1, col)));
        const r = Math.floor(Math.max(0, Math.min(grid.rows - 1, row)));
        
        return grid.data[r][c];
    }

    // Build trees from course data
    buildTrees() {
        if (!this.course || !this.course.trees) return;

        this.course.trees.forEach(treeData => {
            const tree = createTree3D(treeData, this.course, this.scene);
            if (tree) {
                this.trees.push(tree);
            }
        });
    }
    
    // Build sprinkler head markers from course data
    // These are black circles on the ground that caddies use for yardage reference
    buildSprinklerHeads() {
        if (!this.course || !this.course.sprinklerHeads) return;
        
        this.sprinklerHeadMarkers = [];
        
        this.course.sprinklerHeads.forEach(sprinklerData => {
            const marker = this.createSprinklerHeadMarker(sprinklerData.x, sprinklerData.y);
            if (marker) {
                this.sprinklerHeadMarkers.push(marker);
            }
        });
    }
    
    // Create a sprinkler head marker at position
    // Rendered as a black circle on the ground, visible above terrain
    createSprinklerHeadMarker(worldX, worldY) {
        const group = new THREE.Group();
        
        const elevation = getElevationAt(this.course, worldX, worldY);
        const x = (worldX - 50) * WORLD_SCALE;
        const z = (worldY - 50) * WORLD_SCALE;
        const y = elevation * 0.33 + 0.05; // Slightly above terrain to be visible
        
        // Create a flat black disc for the sprinkler head
        // Make it fairly large (about 1 yard diameter) so caddies can see it
        const radius = 0.5; // 0.5 yards radius = 1 yard diameter
        
        // Main disc - black with slight gray center
        const discGeom = new THREE.CircleGeometry(radius, 24);
        const discMat = new THREE.MeshBasicMaterial({ 
            color: 0x111111,
            side: THREE.DoubleSide,
            depthWrite: true
        });
        const disc = new THREE.Mesh(discGeom, discMat);
        disc.rotation.x = -Math.PI / 2; // Lay flat on ground
        group.add(disc);
        
        // Inner ring for visibility
        const innerRingGeom = new THREE.RingGeometry(radius * 0.3, radius * 0.5, 24);
        const innerRingMat = new THREE.MeshBasicMaterial({ 
            color: 0x333333,
            side: THREE.DoubleSide
        });
        const innerRing = new THREE.Mesh(innerRingGeom, innerRingMat);
        innerRing.rotation.x = -Math.PI / 2;
        innerRing.position.y = 0.01; // Slightly above main disc
        group.add(innerRing);
        
        // Center dot
        const centerGeom = new THREE.CircleGeometry(radius * 0.15, 16);
        const centerMat = new THREE.MeshBasicMaterial({ 
            color: 0x444444,
            side: THREE.DoubleSide
        });
        const center = new THREE.Mesh(centerGeom, centerMat);
        center.rotation.x = -Math.PI / 2;
        center.position.y = 0.02; // Above inner ring
        group.add(center);
        
        group.position.set(x, y, z);
        group.renderOrder = 1; // Render above terrain
        this.scene.add(group);
        
        return group;
    }

    // Update hole and tee markers for current hole
    updateHoleMarkers() {
        // Remove existing markers
        if (this.holeMarker) {
            this.scene.remove(this.holeMarker);
        }
        if (this.teeMarker) {
            this.scene.remove(this.teeMarker);
        }
        // Remove existing yardage markers
        if (this.yardageMarkers) {
            this.yardageMarkers.forEach(marker => {
                this.scene.remove(marker);
            });
        }
        this.yardageMarkers = [];

        if (!this.currentHole) return;

        // Create hole marker (flag)
        this.holeMarker = this.createFlagMarker(
            this.currentHole.hole.x,
            this.currentHole.hole.y,
            0xff0000
        );

        // Create tee marker
        this.teeMarker = this.createTeeMarker(
            this.currentHole.tee.x,
            this.currentHole.tee.y
        );
        
        // Create yardage markers (100, 150, 200 yards from green)
        this.createYardageMarkers();
    }
    
    // Create yardage markers at 100, 150, 200 yards from the green along centreline
    createYardageMarkers() {
        if (!this.currentHole || !this.currentHole.centreline) return;
        
        const centreline = this.currentHole.centreline;
        const greenFront = this.findGreenFrontPosition();
        if (!greenFront) return;
        
        const yardages = [100, 150, 200];
        const colors = [0xff0000, 0xffffff, 0x0066ff]; // Red, White, Blue
        
        yardages.forEach((yards, index) => {
            // Find where the circle at this yardage intersects the centreline
            const radiusWorld = yardsToWorld(yards);
            const markerPos = findCircleCentrelineIntersection(centreline, greenFront, radiusWorld);
            if (markerPos) {
                const marker = this.createYardageMarker(markerPos.x, markerPos.y, yards, colors[index]);
                if (marker) {
                    this.yardageMarkers.push(marker);
                }
            }
        });
    }
    
    // Find the front of green position (uses shared utility from terrain.js)
    findGreenFrontPosition() {
        if (!this.currentHole) return null;
        return findGreenFront(this.currentHole);
    }
    
    // Find a point along the centreline at a specific yardage from the green
    // Uses shared utility from utils.js
    findPointAtYardageFromGreen(centreline, greenFront, yards) {
        return findPointAtYardageFromRef(centreline, greenFront, yards);
    }
    
    // Create a yardage marker post at position
    createYardageMarker(worldX, worldY, yards, color) {
        const group = new THREE.Group();
        
        const elevation = getElevationAt(this.course, worldX, worldY);
        const x = (worldX - 50) * WORLD_SCALE;
        const z = (worldY - 50) * WORLD_SCALE;
        const y = elevation * 0.33;
        
        // Create a stake/post marker
        const postHeight = 1.2;
        const postRadius = 0.15;
        
        // Main post
        const postGeom = new THREE.CylinderGeometry(postRadius, postRadius, postHeight, 8);
        const postMat = new THREE.MeshLambertMaterial({ color: color });
        const post = new THREE.Mesh(postGeom, postMat);
        post.position.y = postHeight / 2;
        post.castShadow = true;
        group.add(post);
        
        // Top cap (slightly larger, colored disc)
        const capGeom = new THREE.CylinderGeometry(postRadius * 1.5, postRadius * 1.5, 0.1, 16);
        const capMat = new THREE.MeshLambertMaterial({ color: color });
        const cap = new THREE.Mesh(capGeom, capMat);
        cap.position.y = postHeight + 0.05;
        group.add(cap);
        
        group.position.set(x, y, z);
        this.scene.add(group);
        return group;
    }


    // Create a flag marker at position
    createFlagMarker(worldX, worldY, color) {
        const group = new THREE.Group();
        
        const elevation = getElevationAt(this.course, worldX, worldY);
        const x = (worldX - 50) * WORLD_SCALE;
        const z = (worldY - 50) * WORLD_SCALE;
        const y = elevation * 0.33;

        // Real sizes: pole ~7ft tall (2.3 yards), 0.5" diameter (0.014 yards)
        // Flag ~14"x20" (0.4 x 0.55 yards)
        const poleHeight = 2.3;
        const poleRadius = 0.02;
        
        // Pole
        const poleGeom = new THREE.CylinderGeometry(poleRadius, poleRadius, poleHeight, 8);
        const poleMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
        const pole = new THREE.Mesh(poleGeom, poleMat);
        pole.position.y = poleHeight / 2;
        group.add(pole);

        // Flag cloth with segments for animation
        const flagWidth = 0.55;
        const flagHeight = 0.4;
        const flagGeom = new THREE.PlaneGeometry(flagWidth, flagHeight, 8, 4);
        
        // Shift geometry so left edge is at origin (pivot at pole)
        const posAttr = flagGeom.attributes.position;
        for (let i = 0; i < posAttr.count; i++) {
            posAttr.setX(i, posAttr.getX(i) + flagWidth / 2);
        }
        posAttr.needsUpdate = true;
        
        const flagMat = new THREE.MeshLambertMaterial({ 
            color: color, 
            side: THREE.DoubleSide 
        });
        const flag = new THREE.Mesh(flagGeom, flagMat);
        flag.position.set(poleRadius, poleHeight - flagHeight / 2 - 0.05, 0);
        group.add(flag);
        
        // Store flag mesh and original positions for animation
        this.flagMesh = flag;
        this.flagGeometry = flagGeom;
        this.flagOriginalPositions = flagGeom.attributes.position.array.slice();

        // Hole cup - 4.25" diameter (0.12 yards), as a dark ring on surface
        const cupRadius = 0.06;
        const cupGeom = new THREE.RingGeometry(cupRadius * 0.7, cupRadius, 16);
        const cupMat = new THREE.MeshBasicMaterial({ color: 0x111111, side: THREE.DoubleSide });
        const cup = new THREE.Mesh(cupGeom, cupMat);
        cup.rotation.x = -Math.PI / 2; // Lay flat on ground
        cup.position.y = 0.01; // Just above terrain
        group.add(cup);

        group.position.set(x, y, z);
        this.scene.add(group);
        return group;
    }
    
    // Set wind for animations
    setWind(wind) {
        this.wind = wind;
    }
    
    // Update flag animation based on wind
    updateFlagAnimation(time) {
        if (!this.flagMesh || !this.flagGeometry || !this.flagOriginalPositions) return;
        
        const positions = this.flagGeometry.attributes.position.array;
        const original = this.flagOriginalPositions;
        
        const windSpeed = this.wind?.speed || 0;
        const windDirDeg = this.wind?.direction || 0;
        
        // Flag angle based on wind speed (max 90 degrees)
        const flagAngleDeg = Math.min(windSpeed * 4, 90);
        const flagAngleRad = (flagAngleDeg * Math.PI) / 180;
        const windIntensity = Math.min(windSpeed / 20, 1);
        
        // Wave parameters (scaled for smaller flag)
        const waveAmplitude = 0.005 + windIntensity * 0.02;
        const waveFrequency = 6 + windIntensity * 4;
        const waveSpeed = 4 + windIntensity * 3;
        const flagWidth = 0.55;
        
        const horizontalFactor = Math.sin(flagAngleRad);
        const verticalFactor = Math.cos(flagAngleRad);
        
        for (let i = 0; i < positions.length; i += 3) {
            const origX = original[i];
            const origY = original[i + 1];
            const origZ = original[i + 2];
            
            const distFromPole = origX / flagWidth;
            const newX = origX * horizontalFactor;
            const dropY = -origX * verticalFactor;
            
            const waveStrength = distFromPole * distFromPole;
            const wave1 = Math.sin(time * waveSpeed + distFromPole * waveFrequency) * waveAmplitude * waveStrength;
            const wave2 = Math.sin(time * waveSpeed * 1.3 + distFromPole * waveFrequency * 0.7 + origY * 2) * waveAmplitude * 0.5 * waveStrength;
            const flutter = wave1 + wave2;
            
            positions[i] = newX;
            positions[i + 1] = origY + dropY;
            positions[i + 2] = origZ + flutter;
        }
        
        this.flagGeometry.attributes.position.needsUpdate = true;
        this.flagGeometry.computeVertexNormals();
        
        // Rotate flag to point in wind direction (where wind blows TO)
        // wind.direction is where wind comes FROM, so flag points opposite
        // Three.js rotation.y: 0 = +Z (south), π/2 = +X (east), π = -Z (north)
        // Game angles: 0° = north, 90° = east, 180° = south
        // Wind from north (0°) blows south → flag points +Z → rotation.y = 0
        const windDirRad = -windDirDeg * Math.PI / 180;
        this.flagMesh.rotation.y = windDirRad;
    }

    // Create tee marker
    createTeeMarker(worldX, worldY) {
        const group = new THREE.Group();
        
        const elevation = getElevationAt(this.course, worldX, worldY);
        const x = (worldX - 50) * WORLD_SCALE;
        const z = (worldY - 50) * WORLD_SCALE;
        const y = elevation * 0.33;

        // Tee markers (two small posts) - 5x wider spacing
        const markerGeom = new THREE.BoxGeometry(0.3, 0.8, 0.3);
        const markerMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
        
        const marker1 = new THREE.Mesh(markerGeom, markerMat);
        marker1.position.set(-7.5, 0.4, 0);
        group.add(marker1);

        const marker2 = new THREE.Mesh(markerGeom, markerMat);
        marker2.position.set(7.5, 0.4, 0);
        group.add(marker2);

        group.position.set(x, y, z);
        this.scene.add(group);
        return group;
    }

    // Get ball start position for current hole
    getBallStartPosition() {
        if (!this.currentHole) return { x: 0, y: 0, z: 0 };
        
        const tee = this.currentHole.tee;
        const elevation = getElevationAt(this.course, tee.x, tee.y);
        
        return {
            x: (tee.x - 50) * WORLD_SCALE,
            y: elevation * 0.33 + 0.2, // Slightly above ground
            z: (tee.y - 50) * WORLD_SCALE
        };
    }

    // Get hole position for current hole
    getHolePosition() {
        if (!this.currentHole) return { x: 0, y: 0, z: 0 };
        
        const hole = this.currentHole.hole;
        const elevation = getElevationAt(this.course, hole.x, hole.y);
        
        return {
            x: (hole.x - 50) * WORLD_SCALE,
            y: elevation * 0.33,
            z: (hole.y - 50) * WORLD_SCALE
        };
    }

    // Convert world coordinates to 3D position
    worldTo3D(worldX, worldY) {
        const elevation = getElevationAt(this.course, worldX, worldY);
        return {
            x: (worldX - 50) * WORLD_SCALE,
            y: elevation * 0.33,
            z: (worldY - 50) * WORLD_SCALE
        };
    }

    // Convert 3D position to world coordinates
    threeDToWorld(x, z) {
        return {
            x: x / WORLD_SCALE + 50,
            y: z / WORLD_SCALE + 50
        };
    }

    // Animate trees, flag, and clouds (sway in wind)
    update(time) {
        const windSpeed = this.wind?.speed || 0;
        // Wind direction where wind blows TO (opposite of where it comes FROM)
        // wind.direction is where wind comes FROM, so negate to get blow direction
        // Three.js: 0 rad = +Z (south), π/2 = +X (east)
        const windDirRad = -((this.wind?.direction || 0) * Math.PI / 180);
        
        // Tree sway based on wind
        this.trees.forEach(tree => {
            const phase = tree.seed * 0.1;
            
            // Base sway amount (gentle movement even in calm conditions)
            const baseSway = tree.swayAmount * 0.15;
            
            // Wind-induced lean: starts at 8mph, maxes out around 15mph
            // Below 8mph: no wind lean, just gentle sway
            // 8-15mph: increasing lean
            // Above 15mph: trees are well bent over
            let windLean = 0;
            if (windSpeed >= 8) {
                // Ramp from 0 at 8mph to moderate lean at 15mph+
                const leanFactor = Math.min((windSpeed - 8) / 7, 1); // 0 to 1 over 8-15mph range
                // Gentler lean - about 5 degrees at 15mph
                const maxLeanAngle = 0.04 + leanFactor * 0.04;
                windLean = maxLeanAngle * leanFactor;
                // Above 15mph, gradually increase bend
                if (windSpeed > 15) {
                    windLean += (windSpeed - 15) / 30 * 0.08;
                }
            }
            
            // Sway oscillates from vertical (0) toward wind direction (positive values only)
            // Use (1 + sin) / 2 to get 0-1 range instead of -1 to 1
            const swayOscillation = (1 + Math.sin(time * tree.swaySpeed + phase)) / 2;
            const swayOscillationZ = (1 + Math.sin(time * tree.swaySpeed * 0.7 + phase + 1)) / 2;
            
            // Sway amount increases with wind speed
            // Calm: gentle sway, Strong wind: bigger sway motion
            const windSwayMultiplier = 1 + Math.min(windSpeed / 10, 2); // 1x at 0mph, up to 3x at 20mph+
            const swayAmount = tree.swayAmount * 0.25 * windSwayMultiplier;
            
            // Total lean = constant wind lean + oscillating sway (both in wind direction)
            const totalLeanX = windLean + swayOscillation * swayAmount;
            const totalLeanZ = windLean + swayOscillationZ * swayAmount * 0.6;
            
            // Apply lean in wind direction
            // cos(windDirRad) gives Z component, sin(windDirRad) gives X component
            const leanX = Math.sin(windDirRad) * totalLeanX;
            const leanZ = Math.cos(windDirRad) * totalLeanZ;
            
            tree.group.rotation.x = leanZ;   // Z-axis lean from rotation around X
            tree.group.rotation.z = -leanX;  // X-axis lean from rotation around Z (negated)
        });
        
        // Flag animation
        this.updateFlagAnimation(time);
        
        // Cloud animation - drift in wind direction at wind-relative speed
        this.clouds.forEach((cloud, i) => {
            // Base cloud speed scaled by wind speed
            // At 0 wind: very slow drift (0.1), at 15mph: moderate drift, at 25mph: fast drift
            const baseCloudSpeed = 0.1 + (windSpeed / 25) * 0.4; // 0.1 to 0.5 based on wind
            const cloudMoveSpeed = baseCloudSpeed * cloud.speed;
            
            // Move clouds in wind direction (wind blows FROM direction, so clouds move opposite)
            // windDirRad already accounts for this (negated in the calculation above)
            cloud.group.position.x += Math.sin(windDirRad) * cloudMoveSpeed;
            cloud.group.position.z += Math.cos(windDirRad) * cloudMoveSpeed;
            
            // Add subtle perpendicular wobble for natural movement
            const wobbleAmount = 0.02 * cloud.speed;
            cloud.group.position.x += Math.cos(time * 0.1 + i) * wobbleAmount;
            cloud.group.position.z += Math.sin(time * 0.15 + i * 0.7) * wobbleAmount;
            
            // Wrap clouds around when they drift too far
            const maxDist = SKY_CONFIG.cloudSpread * 1.5;
            const dist = Math.sqrt(cloud.group.position.x ** 2 + cloud.group.position.z ** 2);
            if (dist > maxDist) {
                // Reset to opposite side (upwind)
                cloud.group.position.x = -Math.sin(windDirRad) * SKY_CONFIG.cloudSpread * 0.8;
                cloud.group.position.z = -Math.cos(windDirRad) * SKY_CONFIG.cloudSpread * 0.8;
                // Add some randomness to the reset position
                const perpAngle = windDirRad + Math.PI / 2;
                const perpOffset = (Math.random() - 0.5) * SKY_CONFIG.cloudSpread;
                cloud.group.position.x += Math.sin(perpAngle) * perpOffset;
                cloud.group.position.z += Math.cos(perpAngle) * perpOffset;
            }
            
            // Subtle vertical bob
            cloud.group.position.y = SKY_CONFIG.cloudMinHeight + 
                (SKY_CONFIG.cloudMaxHeight - SKY_CONFIG.cloudMinHeight) * 0.5 +
                Math.sin(time * 0.2 + i * 0.5) * 10;
        });
    }

    // Capture a top-down view of the hole for yardage book
    // Returns a canvas with the hole rotated so tee is at bottom, hole at top
    captureYardageBookView(hole, width = 600, height = 800, objectsToHide = []) {
        if (!this.course || !hole) return null;
        
        // Hide objects that shouldn't appear in yardage book (like aim line)
        const hiddenObjects = [];
        objectsToHide.forEach(obj => {
            if (obj && obj.visible) {
                obj.visible = false;
                hiddenObjects.push(obj);
            }
        });
        
        // Hide clouds
        this.clouds.forEach(cloud => {
            if (cloud.group && cloud.group.visible) {
                cloud.group.visible = false;
                hiddenObjects.push(cloud.group);
            }
        });
        
        // Hide sun and glow
        if (this.sunMesh && this.sunMesh.visible) {
            this.sunMesh.visible = false;
            hiddenObjects.push(this.sunMesh);
        }
        if (this.sunGlow && this.sunGlow.visible) {
            this.sunGlow.visible = false;
            hiddenObjects.push(this.sunGlow);
        }
        
        // Hide trees (we'll draw SVG markers instead)
        this.trees.forEach(tree => {
            if (tree.group && tree.group.visible) {
                tree.group.visible = false;
                hiddenObjects.push(tree.group);
            }
        });
        
        // Calculate bounds for the hole
        const bounds = this.calculateHoleBounds(hole);
        
        // Calculate rotation angle to orient tee at bottom, hole at top
        const teePos = hole.tee;
        const holePos = hole.hole;
        const dx = holePos.x - teePos.x;
        const dy = holePos.y - teePos.y;
        const rotationAngle = Math.atan2(dx, -dy); // Angle to rotate so tee->hole points up
        
        // Create an offscreen renderer with shadows disabled
        const offscreenRenderer = new THREE.WebGLRenderer({ 
            antialias: true, 
            preserveDrawingBuffer: true,
            alpha: true
        });
        offscreenRenderer.setSize(width, height);
        offscreenRenderer.shadowMap.enabled = false; // Disable shadows for yardage book
        
        // Create orthographic camera for top-down view
        const aspect = width / height;
        const boundsWidth = bounds.maxX - bounds.minX;
        const boundsHeight = bounds.maxY - bounds.minY;
        
        // Determine view size based on bounds, maintaining aspect ratio
        let viewWidth, viewHeight;
        if (boundsWidth / boundsHeight > aspect) {
            viewWidth = boundsWidth * WORLD_SCALE * 1.1;
            viewHeight = viewWidth / aspect;
        } else {
            viewHeight = boundsHeight * WORLD_SCALE * 1.1;
            viewWidth = viewHeight * aspect;
        }
        
        const orthoCamera = new THREE.OrthographicCamera(
            -viewWidth / 2, viewWidth / 2,
            viewHeight / 2, -viewHeight / 2,
            0.1, 5000
        );
        
        // Position camera above the center of the hole, looking down
        const centerX = (bounds.minX + bounds.maxX) / 2;
        const centerY = (bounds.minY + bounds.maxY) / 2;
        const center3D = this.worldTo3D(centerX, centerY);
        
        orthoCamera.position.set(center3D.x, 500, center3D.z);
        orthoCamera.lookAt(center3D.x, 0, center3D.z);
        
        // Rotate camera around Z axis to orient tee at bottom
        orthoCamera.rotation.z = -rotationAngle;
        
        // Render the scene
        offscreenRenderer.render(this.scene, orthoCamera);
        
        // Restore hidden objects
        hiddenObjects.forEach(obj => {
            obj.visible = true;
        });
        
        // Get the canvas
        const canvas = offscreenRenderer.domElement;
        
        // Create a new canvas to return (copy the data)
        const resultCanvas = document.createElement('canvas');
        resultCanvas.width = width;
        resultCanvas.height = height;
        const ctx = resultCanvas.getContext('2d');
        ctx.drawImage(canvas, 0, 0);
        
        // Store metadata for overlays - use 3D center position
        resultCanvas.holeBounds = bounds;
        resultCanvas.rotationAngle = rotationAngle;
        resultCanvas.center3D = center3D;
        resultCanvas.centerWorld = { x: centerX, y: centerY };
        resultCanvas.viewWidth = viewWidth;
        resultCanvas.viewHeight = viewHeight;
        
        // Clean up
        offscreenRenderer.dispose();
        
        return resultCanvas;
    }
    
    // Capture a top-down view focused on the green area
    // Returns a canvas with the green rotated so tee is at bottom, hole at top
    captureGreenView(hole, greenBounds, width = 400, height = 500, objectsToHide = []) {
        if (!this.course || !hole) return null;
        
        // Hide objects that shouldn't appear in yardage book (like aim line)
        const hiddenObjects = [];
        objectsToHide.forEach(obj => {
            if (obj && obj.visible) {
                obj.visible = false;
                hiddenObjects.push(obj);
            }
        });
        
        // Hide clouds
        this.clouds.forEach(cloud => {
            if (cloud.group && cloud.group.visible) {
                cloud.group.visible = false;
                hiddenObjects.push(cloud.group);
            }
        });
        
        // Hide sun and glow
        if (this.sunMesh && this.sunMesh.visible) {
            this.sunMesh.visible = false;
            hiddenObjects.push(this.sunMesh);
        }
        if (this.sunGlow && this.sunGlow.visible) {
            this.sunGlow.visible = false;
            hiddenObjects.push(this.sunGlow);
        }
        
        // Hide trees (we'll draw SVG markers instead)
        this.trees.forEach(tree => {
            if (tree.group && tree.group.visible) {
                tree.group.visible = false;
                hiddenObjects.push(tree.group);
            }
        });
        
        // Calculate rotation angle to orient tee at bottom, hole at top
        const teePos = hole.tee;
        const holePos = hole.hole;
        const dx = holePos.x - teePos.x;
        const dy = holePos.y - teePos.y;
        const rotationAngle = Math.atan2(dx, -dy);
        
        // Create an offscreen renderer with shadows disabled
        const offscreenRenderer = new THREE.WebGLRenderer({ 
            antialias: true, 
            preserveDrawingBuffer: true,
            alpha: true
        });
        offscreenRenderer.setSize(width, height);
        offscreenRenderer.shadowMap.enabled = false; // Disable shadows for yardage book
        
        // Create orthographic camera for top-down view
        const aspect = width / height;
        const boundsWidth = greenBounds.maxX - greenBounds.minX;
        const boundsHeight = greenBounds.maxY - greenBounds.minY;
        
        // Determine view size based on bounds, maintaining aspect ratio
        let viewWidth, viewHeight;
        if (boundsWidth / boundsHeight > aspect) {
            viewWidth = boundsWidth * WORLD_SCALE * 1.1;
            viewHeight = viewWidth / aspect;
        } else {
            viewHeight = boundsHeight * WORLD_SCALE * 1.1;
            viewWidth = viewHeight * aspect;
        }
        
        const orthoCamera = new THREE.OrthographicCamera(
            -viewWidth / 2, viewWidth / 2,
            viewHeight / 2, -viewHeight / 2,
            0.1, 5000
        );
        
        // Position camera above the center of the green, looking down
        const centerX = (greenBounds.minX + greenBounds.maxX) / 2;
        const centerY = (greenBounds.minY + greenBounds.maxY) / 2;
        const center3D = this.worldTo3D(centerX, centerY);
        
        orthoCamera.position.set(center3D.x, 500, center3D.z);
        orthoCamera.lookAt(center3D.x, 0, center3D.z);
        
        // Rotate camera around Z axis to orient tee at bottom
        orthoCamera.rotation.z = -rotationAngle;
        
        // Render the scene
        offscreenRenderer.render(this.scene, orthoCamera);
        
        // Restore hidden objects
        hiddenObjects.forEach(obj => {
            obj.visible = true;
        });
        
        // Get the canvas
        const canvas = offscreenRenderer.domElement;
        
        // Create a new canvas to return (copy the data)
        const resultCanvas = document.createElement('canvas');
        resultCanvas.width = width;
        resultCanvas.height = height;
        const ctx = resultCanvas.getContext('2d');
        ctx.drawImage(canvas, 0, 0);
        
        // Store metadata for overlays
        resultCanvas.greenBounds = greenBounds;
        resultCanvas.rotationAngle = rotationAngle;
        resultCanvas.center3D = center3D;
        resultCanvas.centerWorld = { x: centerX, y: centerY };
        resultCanvas.viewWidth = viewWidth;
        resultCanvas.viewHeight = viewHeight;
        
        // Clean up
        offscreenRenderer.dispose();
        
        return resultCanvas;
    }
    
    // Calculate bounding box for a hole
    calculateHoleBounds(hole, padding = 15) {
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
        
        // Include all zones
        if (hole.zones) {
            hole.zones.forEach(zone => {
                if (zone.shape === 'rect') {
                    minX = Math.min(minX, zone.x);
                    maxX = Math.max(maxX, zone.x + zone.width);
                    minY = Math.min(minY, zone.y);
                    maxY = Math.max(maxY, zone.y + zone.height);
                } else if (zone.shape === 'ellipse') {
                    minX = Math.min(minX, zone.cx - zone.rx);
                    maxX = Math.max(maxX, zone.cx + zone.rx);
                    minY = Math.min(minY, zone.cy - zone.ry);
                    maxY = Math.max(maxY, zone.cy + zone.ry);
                } else if (zone.shape === 'polygon' && zone.points) {
                    zone.points.forEach(p => {
                        minX = Math.min(minX, p[0]);
                        maxX = Math.max(maxX, p[0]);
                        minY = Math.min(minY, p[1]);
                        maxY = Math.max(maxY, p[1]);
                    });
                }
            });
        }
        
        // Include trees
        if (hole.trees) {
            hole.trees.forEach(tree => {
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
}

// Create and export world instance factory
export function createWorld(scene) {
    return new World(scene);
}
