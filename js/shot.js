// Shot simulation module - now using realistic physics engine
import { golfer, applyVariability, recordShot } from './golfer.js';
import { getElevationAt, getElevationChange, getSlopeAt, getTerrainAt } from './terrain.js';
import { 
    simulateFullShot, 
    generateLaunchConditions, 
    simulateTrajectory, 
    calculateLandingBehavior,
    generateShotVariability,
    applyLieToLaunch,
    clubPhysics 
} from './physics.js';
import { determineLie } from './lie.js';
import { checkTreeCollision } from './trees.js';

// Simple ground physics - keep it predictable
const TREE_ENERGY_ABSORPTION = 0.75;  // Trees absorb 75% of energy

export class ShotSimulator {
    constructor(ball, onComplete) {
        this.ball = ball;
        this.onComplete = onComplete;
        this.isAnimating = false;
        this.trajectoryPoints = [];
        this.currentLie = null;
    }

    getCurrentLie() {
        return this.currentLie;
    }

    updateLie(holeData) {
        const pos = this.ball.getPosition();
        const terrain = getTerrainAt(holeData, pos.x, pos.y) || 'fairway';
        const slope = getSlopeAt(holeData, pos.x, pos.y);
        this.currentLie = determineLie(terrain, slope);
        return this.currentLie;
    }

    hit(params) {
        const { club, power, shape, aimAngle, holeData, wind = { speed: 0, direction: 0 } } = params;
        const start = this.ball.getPosition();
        const terrain = getTerrainAt(holeData, start.x, start.y) || 'fairway';
        
        // Handle putting separately
        if (club.name === 'Putter') {
            this.putt(params);
            return;
        }
        
        if (!this.currentLie) {
            this.updateLie(holeData);
        }
        const lie = this.currentLie;
        const clubStats = this.getClubStats(golfer, club.name);
        const variability = generateShotVariability(clubStats, club.name, { lie });
        const adjustedParams = applyVariability(params, golfer);
        
        if (adjustedParams.isMiss) {
            variability.isMiss = true;
            variability.launchDirection += adjustedParams.directionErrorYards * 0.3;
            variability.spinAxisOffset += adjustedParams.directionErrorYards * 0.5;
        }
        
        let launchConditions = generateLaunchConditions(club.name, power, shape, variability);
        if (!launchConditions) {
            console.error('Failed to generate launch conditions for', club.name);
            return;
        }
        
        launchConditions = applyLieToLaunch(launchConditions, lie, club.name);
        console.log(`Lie: ${lie.data.name} - Distance: ${Math.round(lie.data.effects.distanceMultiplier * 100)}%, Spin: ${Math.round(lie.data.effects.spinMultiplier * 100)}%`);
        
        const windRelativeToTarget = (wind.direction - aimAngle + 360) % 360;
        const windRelativeToFlight = (windRelativeToTarget - launchConditions.launchDirection + 360) % 360;
        const trajectoryResult = simulateTrajectory(launchConditions, wind.speed, windRelativeToFlight);
        
        console.log(`Shot: ${club.name}, Carry: ${trajectoryResult.carry.toFixed(0)}y`);
        
        const landingBehavior = calculateLandingBehavior(trajectoryResult, terrain, lie);
        const screenCoords = this.convertToScreenCoords(start, aimAngle, trajectoryResult, landingBehavior, holeData);
        
        const elevChange = getElevationChange(holeData, start.x, start.y, screenCoords.land.x, screenCoords.land.y);
        const elevAdjustment = elevChange * 0.9;
        const aimRad = (aimAngle * Math.PI) / 180;
        screenCoords.land.x -= Math.sin(aimRad) * elevAdjustment * screenCoords.yardToUnit;
        screenCoords.land.y += Math.cos(aimRad) * elevAdjustment * screenCoords.yardToUnit;
        
        // Simple roll calculation - mostly forward with slight slope influence
        const { finalX, finalY } = this.calculateSimpleRoll(
            screenCoords.land.x, screenCoords.land.y, start,
            landingBehavior.rollYards * screenCoords.yardToUnit,
            landingBehavior.rollDirection, holeData
        );
        
        const intendedYards = club.yards * (power / 100);
        const actualCarry = trajectoryResult.carry - elevAdjustment;
        const actualTotal = actualCarry + landingBehavior.rollYards;
        
        const shotData = {
            intendedYards, actualYards: actualTotal,
            distanceError: actualTotal - intendedYards,
            directionError: trajectoryResult.lateral,
            isMiss: variability.isMiss || variability.isDisaster,
            lie: { type: lie.type, name: lie.data.name, effects: lie.data.effects },
            launch: {
                ballSpeed: launchConditions.ballSpeedMPH,
                launchAngle: launchConditions.launchAngle,
                spinRate: launchConditions.spinRate,
                spinAxis: launchConditions.spinAxis
            },
            flight: {
                carry: actualCarry, maxHeight: trajectoryResult.maxHeight,
                flightTime: trajectoryResult.flightTime, landingAngle: trajectoryResult.landingAngle
            },
            landing: {
                rollYards: landingBehavior.rollYards,
                checksUp: landingBehavior.checksUp,
                spinsBack: landingBehavior.spinsBack
            }
        };
        
        this.trajectoryPoints = trajectoryResult.trajectory;
        this.animatePhysicsShot(start, screenCoords.land, { x: finalX, y: finalY },
            trajectoryResult, landingBehavior, aimAngle, shotData, holeData);
    }

    /**
     * Putting simulation - ball rolls on ground with slope influence
     * Distance is specified in feet (how far ball would roll on flat green)
     */
    putt(params) {
        const { putterDistance, aimAngle, holeData } = params;
        const start = this.ball.getPosition();
        
        // Convert feet to yards (3 feet = 1 yard)
        const distanceFeet = putterDistance || 30;
        const distanceYards = distanceFeet / 3;
        
        // World units: 1 unit = 4 yards
        const yardToUnit = 1 / 4;
        const totalUnits = distanceYards * yardToUnit;
        
        // Calculate putt path with slope influence
        const puttResult = this.simulatePutt(start, aimAngle, totalUnits, holeData);
        
        // Create shot data for putting
        const shotData = {
            isPutt: true,
            intendedFeet: distanceFeet,
            actualFeet: puttResult.actualDistanceFeet,
            distanceError: puttResult.actualDistanceFeet - distanceFeet,
            directionError: 0,
            isMiss: false
        };
        
        console.log(`Putt: ${distanceFeet} ft intended, rolling...`);
        
        // Animate the putt
        this.animatePutt(start, puttResult.path, puttResult.duration, shotData, holeData);
    }

    /**
     * Simulate putt path with slope breaking
     * Returns path points and final position
     */
    simulatePutt(start, aimAngle, totalUnits, holeData) {
        const path = [{ x: start.x, y: start.y }];
        const aimRad = (aimAngle * Math.PI) / 180;
        
        // Initial velocity direction
        let velX = Math.sin(aimRad);
        let velY = -Math.cos(aimRad);
        
        // Simulate in small steps
        const numSteps = 100;
        const stepSize = totalUnits / numSteps;
        
        let x = start.x;
        let y = start.y;
        let remainingEnergy = 1.0; // Energy decreases as ball rolls
        
        // Green speed factor (stimp meter simulation)
        // Higher = faster greens, more break
        const greenSpeed = 11; // Typical tournament green stimp
        const breakFactor = 0.15 * (greenSpeed / 10); // How much slope affects direction
        
        for (let i = 0; i < numSteps && remainingEnergy > 0.01; i++) {
            // Get slope at current position
            const slope = getSlopeAt(holeData, x, y);
            
            // Ball curves toward downhill (slope points uphill, so negate)
            // Effect increases as ball slows down
            const speedFactor = Math.sqrt(remainingEnergy);
            const slopeInfluence = breakFactor * (1 - speedFactor * 0.5);
            
            // Adjust velocity direction based on slope
            velX -= slope.x * slopeInfluence;
            velY -= slope.y * slopeInfluence;
            
            // Normalize velocity
            const velMag = Math.sqrt(velX * velX + velY * velY);
            if (velMag > 0) {
                velX /= velMag;
                velY /= velMag;
            }
            
            // Move ball
            const actualStep = stepSize * speedFactor;
            x += velX * actualStep;
            y += velY * actualStep;
            
            // Decrease energy (friction)
            // Uphill putts lose energy faster, downhill gain slightly
            const slopeAlongPath = slope.x * velX + slope.y * velY;
            const frictionFactor = 0.015 + slopeAlongPath * 0.01;
            remainingEnergy -= frictionFactor;
            
            // Store path point
            path.push({ x, y, energy: remainingEnergy });
        }
        
        // Calculate actual distance rolled
        let totalDistance = 0;
        for (let i = 1; i < path.length; i++) {
            const dx = path[i].x - path[i-1].x;
            const dy = path[i].y - path[i-1].y;
            totalDistance += Math.sqrt(dx * dx + dy * dy);
        }
        
        // Duration based on distance (longer putts take more time)
        const duration = Math.max(1000, Math.min(3000, totalDistance * 200));
        
        return {
            path,
            finalPosition: path[path.length - 1],
            actualDistanceFeet: (totalDistance * 4) * 3, // units to yards to feet
            duration
        };
    }

    /**
     * Animate the putt rolling along the calculated path
     */
    animatePutt(start, path, duration, shotData, holeData) {
        this.isAnimating = true;
        const startTime = performance.now();
        
        const animate = (currentTime) => {
            const elapsed = currentTime - startTime;
            const t = Math.min(elapsed / duration, 1);
            
            // Ease out - ball decelerates
            const easeT = 1 - Math.pow(1 - t, 2);
            
            // Find position along path
            const pathIndex = Math.floor(easeT * (path.length - 1));
            const nextIndex = Math.min(pathIndex + 1, path.length - 1);
            const localT = (easeT * (path.length - 1)) - pathIndex;
            
            const point = path[pathIndex];
            const nextPoint = path[nextIndex];
            
            const x = point.x + (nextPoint.x - point.x) * localT;
            const y = point.y + (nextPoint.y - point.y) * localT;
            
            this.ball.setPosition(x, y, 0);
            
            if (t < 1) {
                requestAnimationFrame(animate);
            } else {
                const finalPos = path[path.length - 1];
                this.ball.setPosition(finalPos.x, finalPos.y, 0);
                this.isAnimating = false;
                if (this.onComplete) this.onComplete(finalPos, shotData);
            }
        };
        
        requestAnimationFrame(animate);
    }

    convertToScreenCoords(start, aimAngle, trajectoryResult, landingBehavior, holeData) {
        // Fixed ratio: 1 world unit = 4 yards (WORLD_TO_YARDS = 4)
        const yardToUnit = 1 / 4; // 0.25 world units per yard
        const aimRad = (aimAngle * Math.PI) / 180;
        const carryUnits = trajectoryResult.carry * yardToUnit;
        const lateralUnits = trajectoryResult.lateral * yardToUnit;
        const landX = start.x + Math.sin(aimRad) * carryUnits + Math.cos(aimRad) * lateralUnits;
        const landY = start.y - Math.cos(aimRad) * carryUnits + Math.sin(aimRad) * lateralUnits;
        return { land: { x: landX, y: landY }, yardToUnit };
    }

    getClubStats(golferData, clubName) {
        const shots = golferData.shotHistory[clubName] || [];
        if (shots.length === 0) return { missRate: 0.12, distStd: 5, dirStd: 5 };
        
        const normalShots = shots.filter(s => !s.miss);
        const missShots = shots.filter(s => s.miss);
        const missRate = shots.length > 0 ? missShots.length / shots.length : 0.12;
        if (normalShots.length === 0) return { missRate, distStd: 5, dirStd: 5 };
        
        const distAvg = normalShots.reduce((sum, s) => sum + s.y, 0) / normalShots.length;
        const dirAvg = normalShots.reduce((sum, s) => sum + s.x, 0) / normalShots.length;
        const distVariance = normalShots.reduce((sum, s) => sum + Math.pow(s.y - distAvg, 2), 0) / normalShots.length;
        const dirVariance = normalShots.reduce((sum, s) => sum + Math.pow(s.x - dirAvg, 2), 0) / normalShots.length;
        
        return { missRate, distStd: Math.sqrt(distVariance) || 3, dirStd: Math.sqrt(dirVariance) || 3, distAvg, dirAvg };
    }

    /**
     * Roll calculation with slope curve
     * Ball curves toward downhill as it slows - like a putt breaking
     */
    calculateSimpleRoll(landX, landY, start, rollUnits, rollDirection, holeData) {
        // Get shot direction
        const shotDirX = landX - start.x;
        const shotDirY = landY - start.y;
        const shotDist = Math.sqrt(shotDirX * shotDirX + shotDirY * shotDirY) || 1;
        
        // Normalize shot direction
        let rollDirX = shotDirX / shotDist;
        let rollDirY = shotDirY / shotDist;
        
        // Spin back reverses direction
        if (rollDirection < 0) {
            rollDirX = -rollDirX;
            rollDirY = -rollDirY;
        }
        
        // Get slope at landing spot (slope points UPHILL, so negate for downhill)
        const slope = getSlopeAt(holeData, landX, landY);
        const rollDist = Math.abs(rollUnits);
        
        // Ball curves toward downhill during roll (negate slope to get downhill direction)
        const slopeCurve = 0.3;
        
        // Calculate end position: start direction + curve toward downhill
        const finalX = landX + rollDirX * rollDist - slope.x * rollDist * slopeCurve;
        const finalY = landY + rollDirY * rollDist - slope.y * rollDist * slopeCurve;
        
        return { finalX, finalY };
    }

    animatePhysicsShot(start, land, final, trajectoryResult, landingBehavior, aimAngle, shotData, holeData) {
        this.isAnimating = true;
        
        const screenTrajectory = this.convertTrajectoryToScreen(start, aimAngle, trajectoryResult.trajectory, holeData);
        
        if (!screenTrajectory || screenTrajectory.length < 2) {
            this.ball.setPosition(final.x, final.y, 0);
            this.isAnimating = false;
            if (this.onComplete) this.onComplete(final, shotData);
            return;
        }
        
        const treeCollision = this.checkTrajectoryTreeCollision(screenTrajectory, holeData);
        const flightDuration = Math.max(1500, Math.min(trajectoryResult.flightTime * 800, 2500));
        const rollDuration = 500;
        
        const maxHeightYards = trajectoryResult.maxHeight;
        const carryYards = trajectoryResult.carry;
        const heightRatio = maxHeightYards / Math.max(carryYards, 1);
        const visualHeightMultiplier = Math.max(2, 1.5 + heightRatio * 3);
        
        const self = this;
        let animStartTime = null;
        
        function animateFlight(currentTime) {
            if (animStartTime === null) animStartTime = currentTime;
            
            const elapsed = currentTime - animStartTime;
            const t = Math.min(elapsed / flightDuration, 1);
            const maxIndex = screenTrajectory.length - 1;
            const trajIndex = Math.min(Math.floor(t * maxIndex), maxIndex);
            const nextIndex = Math.min(trajIndex + 1, maxIndex);
            const localT = maxIndex > 0 ? (t * maxIndex) - trajIndex : 0;
            
            const point = screenTrajectory[trajIndex];
            const nextPoint = screenTrajectory[nextIndex] || point;
            
            if (!point) {
                self.ball.setPosition(land.x, land.y, 0);
                self.isAnimating = false;
                if (self.onComplete) self.onComplete(final, shotData);
                return;
            }
            
            const x = point.x + (nextPoint.x - point.x) * localT;
            const y = point.y + (nextPoint.y - point.y) * localT;
            const heightYards = point.height + (nextPoint.height - point.height) * localT;
            const heightPixels = heightYards * visualHeightMultiplier;
            
            self.ball.setPosition(x, y, heightPixels);
            
            if (treeCollision && trajIndex >= treeCollision.index) {
                self.handleTreeCollision(treeCollision, shotData, holeData);
                return;
            }
            
            if (t < 1) {
                requestAnimationFrame(animateFlight);
            } else {
                self.ball.setPosition(land.x, land.y, 0);
                // Bounce then roll, or just roll - both with slope influence
                if (landingBehavior.bounceHeight > 0.5) {
                    self.animateSimpleBounce(land, final, landingBehavior, rollDuration, shotData, holeData);
                } else {
                    self.animateCurvingRoll(land, final, rollDuration, shotData, holeData);
                }
            }
        }
        
        requestAnimationFrame(animateFlight);
    }

    checkTrajectoryTreeCollision(screenTrajectory, holeData) {
        if (!holeData.trees || holeData.trees.length === 0) return null;
        
        for (let i = 0; i < screenTrajectory.length; i++) {
            const point = screenTrajectory[i];
            const collision = checkTreeCollision(holeData, point.x, point.y, point.height);
            if (collision) {
                return { index: i, point, tree: collision.tree, deflection: collision.deflection };
            }
        }
        return null;
    }

    handleTreeCollision(collision, shotData, holeData) {
        const hitType = collision.hitType || 'foliage';
        console.log(`Ball hit tree ${hitType}!`, collision.tree.type);
        
        shotData.hitTree = true;
        shotData.treeType = collision.tree.type;
        shotData.treeHitType = hitType;
        
        // Speed drops to 20% immediately on tree contact
        // Foliage: 10% speed (ball barely moves), Trunk: 20% speed (slight bounce)
        const speedRetained = hitType === 'trunk' ? 0.20 : 0.10;
        
        // Calculate simple drop from hit point with reduced momentum
        const hitX = collision.point.x;
        const hitY = collision.point.y;
        const hitHeight = collision.point.height;
        
        // Deflection direction (away from tree center for trunk, slight for foliage)
        const deflectX = collision.deflection.x * speedRetained;
        const deflectY = collision.deflection.y * speedRetained;
        
        // Final position: hit point + small deflection based on remaining speed
        // Ball drops mostly straight down with slight movement
        const finalX = Math.max(0, Math.min(100, hitX + deflectX));
        const finalY = Math.max(0, Math.min(100, hitY + deflectY));
        
        this.animateTreeDrop(collision.point, { x: finalX, y: finalY }, shotData, holeData);
    }

    animateTreeDrop(hitPoint, dropPoint, shotData, holeData) {
        const startTime = performance.now();
        const dropDuration = 700;
        const startHeight = hitPoint.height;
        
        const animate = (currentTime) => {
            const elapsed = currentTime - startTime;
            const t = Math.min(elapsed / dropDuration, 1);
            const easeT = t * t; // Simple gravity
            
            const x = hitPoint.x + (dropPoint.x - hitPoint.x) * easeT;
            const y = hitPoint.y + (dropPoint.y - hitPoint.y) * easeT;
            const height = startHeight * (1 - easeT);
            
            this.ball.setPosition(x, y, height);
            
            if (t < 1) {
                requestAnimationFrame(animate);
            } else {
                this.ball.setPosition(dropPoint.x, dropPoint.y, 0);
                this.isAnimating = false;
                if (this.onComplete) this.onComplete(dropPoint, shotData);
            }
        };
        
        requestAnimationFrame(animate);
    }

    convertTrajectoryToScreen(start, aimAngle, trajectory, holeData) {
        // Fixed ratio: 1 world unit = 4 yards (WORLD_TO_YARDS = 4)
        const yardToUnit = 1 / 4; // 0.25 world units per yard
        const aimRad = (aimAngle * Math.PI) / 180;
        
        return trajectory.map(point => ({
            x: start.x + Math.sin(aimRad) * point.z * yardToUnit + Math.cos(aimRad) * point.x * yardToUnit,
            y: start.y - Math.cos(aimRad) * point.z * yardToUnit + Math.sin(aimRad) * point.x * yardToUnit,
            height: point.y,
            t: point.t
        }));
    }

    /**
     * Bounce with slope reflection
     * Ball bounces in direction influenced by ground angle - like bouncing off a tilted surface
     */
    animateSimpleBounce(land, final, landingBehavior, totalDuration, shotData, holeData) {
        const bounceDuration = totalDuration * 0.3;
        const rollDuration = totalDuration * 0.7;
        const startTime = performance.now();
        
        // Get slope at landing point (slope points UPHILL, negate for downhill)
        const slope = getSlopeAt(holeData, land.x, land.y);
        
        // Calculate bounce direction - ball deflects based on slope
        const inDirX = final.x - land.x;
        const inDirY = final.y - land.y;
        const inDist = Math.sqrt(inDirX * inDirX + inDirY * inDirY) || 1;
        
        // Bounce deflects toward downhill - subtle effect (negate slope)
        const slopeStrength = Math.sqrt(slope.x * slope.x + slope.y * slope.y);
        const bounceDeflect = Math.min(slopeStrength * 0.15, 0.1);
        
        // Bounce end point: mostly forward, slight deflection toward downhill
        const bounceProgress = 0.25;
        const bounceEndX = land.x + (inDirX / inDist) * inDist * bounceProgress - slope.x * inDist * bounceDeflect;
        const bounceEndY = land.y + (inDirY / inDist) * inDist * bounceProgress - slope.y * inDist * bounceDeflect;
        
        const bounceHeight = Math.min(landingBehavior.bounceHeight * 0.3, 8);
        
        const animateBounce = (currentTime) => {
            const elapsed = currentTime - startTime;
            const t = Math.min(elapsed / bounceDuration, 1);
            
            const x = land.x + (bounceEndX - land.x) * t;
            const y = land.y + (bounceEndY - land.y) * t;
            const height = bounceHeight * 4 * t * (1 - t);
            
            this.ball.setPosition(x, y, height);
            
            if (t < 1) {
                requestAnimationFrame(animateBounce);
            } else {
                this.animateCurvingRoll({ x: bounceEndX, y: bounceEndY }, final, rollDuration, shotData, holeData);
            }
        };
        
        requestAnimationFrame(animateBounce);
    }

    /**
     * Roll with gradual curve toward downhill
     * Ball curves more as it slows down - like a breaking putt
     */
    animateCurvingRoll(start, end, duration, shotData, holeData) {
        const startTime = performance.now();
        
        // Get slope for curve calculation (slope points UPHILL, negate for downhill)
        const slope = getSlopeAt(holeData, start.x, start.y);
        
        const animateRoll = (currentTime) => {
            const elapsed = currentTime - startTime;
            const t = Math.min(elapsed / duration, 1);
            
            // Ease out - ball decelerates
            const easeT = 1 - Math.pow(1 - t, 3);
            
            // Linear interpolation toward end
            let x = start.x + (end.x - start.x) * easeT;
            let y = start.y + (end.y - start.y) * easeT;
            
            // Add curve toward downhill (negate slope) - increases as ball slows
            const curveAmount = easeT * easeT * 0.3;
            const totalDist = Math.sqrt((end.x - start.x) ** 2 + (end.y - start.y) ** 2);
            x -= slope.x * totalDist * curveAmount;
            y -= slope.y * totalDist * curveAmount;
            
            this.ball.setPosition(x, y, 0);
            
            if (t < 1) {
                requestAnimationFrame(animateRoll);
            } else {
                this.isAnimating = false;
                if (this.onComplete) this.onComplete({ x, y }, shotData);
            }
        };
        
        requestAnimationFrame(animateRoll);
    }

    getCurveOffset(shape, distance) {
        const curveFactor = distance * 0.08;
        switch (shape) {
            case 'Draw': return -curveFactor;
            case 'Fade': return curveFactor;
            default: return 0;
        }
    }
}
