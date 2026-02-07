// Golf ball physics engine - TrackMan/Toptracer style simulation
// Implements realistic aerodynamics with Magnus effect, drag, and spin decay

// Physical constants
const GRAVITY = 9.81;           // m/s²
const AIR_DENSITY = 1.225;      // kg/m³ at sea level
const BALL_MASS = 0.0459;       // kg (45.9g)
const BALL_RADIUS = 0.02135;    // m (42.7mm diameter)
const BALL_AREA = Math.PI * BALL_RADIUS * BALL_RADIUS;
const KINEMATIC_VISCOSITY = 1.48e-5; // m²/s for air at ~15°C

// Conversion factors
const MPH_TO_MS = 0.44704;
const MS_TO_MPH = 2.23694;
const YARDS_TO_METERS = 0.9144;
const METERS_TO_YARDS = 1.09361;
const RPM_TO_RADS = Math.PI / 30;

// Club data with realistic launch parameters for a scratch golfer
// Ball speeds calibrated to produce yardage book distances (carry)
// Target carries: Driver 280, 3W 250, 5W 230, 4i 210, 5i 195, 6i 180, 7i 165, 8i 150, 9i 135, PW 120, GW 105, SW 90, LW 70
// Launch angles tuned for ~28-32 yard apex (PGA Tour average)
export const clubPhysics = {
    'Driver':   { loft: 10.5, launchAngle: 10.9, spinRate: 2686, ballSpeed: 139, smashFactor: 1.48, spinLoftFactor: 0.85 },
    '3 Wood':   { loft: 15,   launchAngle: 11.5, spinRate: 3655, ballSpeed: 119, smashFactor: 1.46, spinLoftFactor: 0.88 },
    '5 Wood':   { loft: 18,   launchAngle: 13.0, spinRate: 4350, ballSpeed: 110, smashFactor: 1.44, spinLoftFactor: 0.90 },
    '4 Iron':   { loft: 21,   launchAngle: 14.5, spinRate: 4836, ballSpeed: 104, smashFactor: 1.42, spinLoftFactor: 0.92 },
    '5 Iron':   { loft: 24,   launchAngle: 15.5, spinRate: 5361, ballSpeed: 100, smashFactor: 1.40, spinLoftFactor: 0.93 },
    '6 Iron':   { loft: 27,   launchAngle: 17.0, spinRate: 6231, ballSpeed: 96,  smashFactor: 1.38, spinLoftFactor: 0.94 },
    '7 Iron':   { loft: 31,   launchAngle: 18.5, spinRate: 7097, ballSpeed: 92,  smashFactor: 1.36, spinLoftFactor: 0.95 },
    '8 Iron':   { loft: 35,   launchAngle: 20.0, spinRate: 7998, ballSpeed: 88,  smashFactor: 1.34, spinLoftFactor: 0.96 },
    '9 Iron':   { loft: 39,   launchAngle: 22.0, spinRate: 8647, ballSpeed: 84,  smashFactor: 1.32, spinLoftFactor: 0.97 },
    'PW':       { loft: 44,   launchAngle: 25.0, spinRate: 9304, ballSpeed: 79,  smashFactor: 1.30, spinLoftFactor: 0.98 },
    'GW':       { loft: 50,   launchAngle: 28.0, spinRate: 9800, ballSpeed: 74,  smashFactor: 1.27, spinLoftFactor: 0.99 },
    'SW':       { loft: 54,   launchAngle: 31.0, spinRate: 10200, ballSpeed: 70, smashFactor: 1.24, spinLoftFactor: 1.00 },
    'LW':       { loft: 58,   launchAngle: 34.0, spinRate: 10500, ballSpeed: 64, smashFactor: 1.20, spinLoftFactor: 1.00 }
};

/**
 * Calculate Reynolds number for the golf ball
 * Re = V * D / ν
 */
function calcReynolds(velocity) {
    return (velocity * BALL_RADIUS * 2) / KINEMATIC_VISCOSITY;
}

/**
 * Calculate non-dimensional spin factor
 * S = ω * r / V
 */
function calcSpinFactor(spinRateRPM, velocity) {
    const omega = spinRateRPM * RPM_TO_RADS;
    return (omega * BALL_RADIUS) / Math.max(velocity, 1);
}

/**
 * Calculate drag coefficient based on Reynolds number
 * From aerodynamics research on dimpled golf balls
 */
function calcDragCoefficient(Re) {
    if (Re < 1e5) {
        return 1.29e-10 * Re * Re - 2.59e-5 * Re + 1.50;
    } else {
        return 1.91e-11 * Re * Re - 5.40e-6 * Re + 0.56;
    }
}

/**
 * Calculate lift coefficient based on spin factor
 * CL = -3.25 * S² + 1.99 * S (from research)
 */
function calcLiftCoefficient(spinFactor) {
    const S = Math.min(spinFactor, 0.3); // Cap to prevent unrealistic values
    return -3.25 * S * S + 1.99 * S;
}


/**
 * Calculate spin decay over time
 * Spin decreases due to air resistance - roughly 1-2% per second
 */
function decaySpin(spinRPM, dt) {
    const decayRate = 0.015; // 1.5% per second
    return spinRPM * Math.pow(1 - decayRate, dt);
}

/**
 * Generate launch conditions from club and swing parameters
 * This is the "impact" data like TrackMan captures
 */
export function generateLaunchConditions(clubName, power, shape, variability = {}) {
    const club = clubPhysics[clubName];
    if (!club) return null;
    
    // Power scaling: designed to produce linear distance scaling
    // The aerodynamic simulation naturally loses more distance at lower speeds
    // So we need to give MORE ball speed at lower powers to compensate
    let powerFactor;
    if (power >= 80) {
        // High power: nearly linear (small adjustment)
        // 80% power → 0.88 ball speed, 100% power → 1.0 ball speed
        powerFactor = 0.88 + (power - 80) * 0.006;
    } else if (power >= 50) {
        // Mid power: steeper compensation
        // 50% power → 0.70 ball speed, 80% power → 0.88 ball speed
        powerFactor = 0.70 + (power - 50) * 0.006;
    } else {
        // Low power: even steeper
        powerFactor = 0.50 + (power) * 0.004;
    }
    const baseBallSpeed = club.ballSpeed * powerFactor; // mph
    
    // Apply variability to ball speed (strike quality)
    const speedVariance = variability.speedVariance || 0;
    const ballSpeedMPH = baseBallSpeed * (1 + speedVariance);
    const ballSpeed = ballSpeedMPH * MPH_TO_MS;
    
    // Launch angle with variability
    const launchAngleVariance = variability.launchAngleVariance || 0;
    const launchAngle = club.launchAngle + launchAngleVariance;
    
    // Spin rate scales with power and has variability
    const spinVariance = variability.spinVariance || 0;
    const baseSpinRate = club.spinRate * Math.pow(powerFactor, 0.7); // Spin doesn't scale linearly
    const spinRate = baseSpinRate * (1 + spinVariance);
    
    // Spin axis determines draw/fade curve
    // 0° = pure backspin, positive = fade/slice, negative = draw/hook
    let spinAxis = variability.spinAxisOffset || 0;
    
    // Shape affects spin axis
    switch (shape) {
        case 'Draw':
            spinAxis -= 8 + Math.random() * 4; // -8 to -12 degrees
            break;
        case 'Fade':
            spinAxis += 8 + Math.random() * 4; // +8 to +12 degrees
            break;
        case 'Straight':
            spinAxis += (Math.random() - 0.5) * 4; // Small random variance
            break;
    }
    
    // Launch direction (horizontal) - affected by face angle and path
    const launchDirection = variability.launchDirection || 0;
    
    return {
        ballSpeed,           // m/s
        ballSpeedMPH,        // mph (for display)
        launchAngle,         // degrees
        launchDirection,     // degrees (+ = right)
        spinRate,            // RPM
        spinAxis,            // degrees (+ = fade axis)
        clubName,
        power
    };
}

/**
 * Decompose total spin into backspin and sidespin components
 */
function decomposeSpinComponents(totalSpinRPM, spinAxisDegrees) {
    const axisRad = spinAxisDegrees * Math.PI / 180;
    return {
        backspin: totalSpinRPM * Math.cos(axisRad),
        sidespin: totalSpinRPM * Math.sin(axisRad)
    };
}

/**
 * Main trajectory simulation using numerical integration (Euler method)
 * Returns array of positions for the entire flight
 */
export function simulateTrajectory(launchConditions, windSpeed = 0, windDirection = 0) {
    const { ballSpeed, launchAngle, launchDirection, spinRate, spinAxis } = launchConditions;
    
    // Convert angles to radians
    const launchAngleRad = launchAngle * Math.PI / 180;
    const launchDirRad = launchDirection * Math.PI / 180;
    
    // Initial velocity components (3D: x = lateral, y = vertical, z = forward)
    let vx = ballSpeed * Math.sin(launchDirRad) * Math.cos(launchAngleRad);
    let vy = ballSpeed * Math.sin(launchAngleRad);
    let vz = ballSpeed * Math.cos(launchDirRad) * Math.cos(launchAngleRad);
    
    // Position (meters)
    let x = 0;  // lateral (+ = right)
    let y = 0.01;  // height - start slightly above ground
    let z = 0;  // forward distance
    
    // Current spin
    let currentSpinRPM = spinRate;
    const { backspin: initialBackspin, sidespin: initialSidespin } = decomposeSpinComponents(spinRate, spinAxis);
    let backspin = initialBackspin;
    let sidespin = initialSidespin;
    
    // Wind components - windDirection is where wind is coming FROM
    // 0° = headwind (from front), 90° = from right, 180° = tailwind (from behind), 270° = from left
    // We need to reverse the direction since wind FROM a direction pushes the ball the opposite way
    const windRad = (windDirection + 180) * Math.PI / 180;
    const windX = windSpeed * MPH_TO_MS * Math.sin(windRad);
    const windZ = windSpeed * MPH_TO_MS * Math.cos(windRad);
    
    // Simulation parameters
    const dt = 0.001; // 1ms time step for accuracy
    const maxTime = 15; // Max 15 seconds of flight
    
    // Store trajectory points (sample every 10ms for smooth animation)
    const trajectory = [];
    let sampleCounter = 0;
    const sampleInterval = 10; // Store every 10th point
    
    let t = 0;
    let maxHeight = 0;
    let apexTime = 0;
    
    // Always add starting point
    trajectory.push({
        x: 0,
        y: 0,
        z: 0,
        t: 0,
        spinRPM: currentSpinRPM,
        speed: ballSpeed * MS_TO_MPH
    });
    
    while (y > 0 && t < maxTime) {
        // Store sampled points
        sampleCounter++;
        if (sampleCounter % sampleInterval === 0) {
            trajectory.push({
                x: x * METERS_TO_YARDS,
                y: y * METERS_TO_YARDS,
                z: z * METERS_TO_YARDS,
                t: t,
                spinRPM: currentSpinRPM,
                speed: Math.sqrt(vx*vx + vy*vy + vz*vz) * MS_TO_MPH
            });
        }
        
        // Track apex
        if (y > maxHeight) {
            maxHeight = y;
            apexTime = t;
        }
        
        // Relative velocity (accounting for wind)
        const vrx = vx - windX;
        const vry = vy;
        const vrz = vz - windZ;
        const vrel = Math.sqrt(vrx*vrx + vry*vry + vrz*vrz);
        
        if (vrel < 0.1) break; // Ball essentially stopped
        
        // Calculate aerodynamic coefficients
        const Re = calcReynolds(vrel);
        const spinFactor = calcSpinFactor(currentSpinRPM, vrel);
        const Cd = calcDragCoefficient(Re);
        const Cl = calcLiftCoefficient(spinFactor);
        
        // Drag force (opposes velocity)
        const dragMag = 0.5 * AIR_DENSITY * vrel * vrel * BALL_AREA * Cd;
        const dragX = -dragMag * (vrx / vrel) / BALL_MASS;
        const dragY = -dragMag * (vry / vrel) / BALL_MASS;
        const dragZ = -dragMag * (vrz / vrel) / BALL_MASS;
        
        // Lift force from backspin (Magnus effect - perpendicular to velocity in vertical plane)
        const liftMag = 0.5 * AIR_DENSITY * vrel * vrel * BALL_AREA * Cl;
        const horizontalSpeed = Math.sqrt(vrx*vrx + vrz*vrz);
        
        let liftY = 0;
        let liftX = 0;
        let liftZ = 0;
        
        if (horizontalSpeed > 0.1) {
            const backspinLift = liftMag * (backspin / Math.max(currentSpinRPM, 1));
            liftY = backspinLift / BALL_MASS;
            
            const sidespinForce = liftMag * (sidespin / Math.max(currentSpinRPM, 1)) * 0.7;
            liftX = sidespinForce * (vrz / horizontalSpeed) / BALL_MASS;
            liftZ = -sidespinForce * (vrx / horizontalSpeed) / BALL_MASS;
        }
        
        // Total acceleration
        const ax = dragX + liftX;
        const ay = dragY + liftY - GRAVITY;
        const az = dragZ + liftZ;
        
        // Update velocity (Euler integration)
        vx += ax * dt;
        vy += ay * dt;
        vz += az * dt;
        
        // Update position
        x += vx * dt;
        y += vy * dt;
        z += vz * dt;
        
        // Decay spin
        currentSpinRPM = decaySpin(currentSpinRPM, dt);
        backspin = decaySpin(backspin, dt);
        sidespin = decaySpin(sidespin, dt);
        
        t += dt;
    }
    
    // Add final landing point
    trajectory.push({
        x: x * METERS_TO_YARDS,
        y: 0,
        z: z * METERS_TO_YARDS,
        t: t,
        spinRPM: currentSpinRPM,
        speed: Math.sqrt(vx*vx + vy*vy + vz*vz) * MS_TO_MPH
    });
    
    return {
        trajectory,
        carry: z * METERS_TO_YARDS,
        lateral: x * METERS_TO_YARDS,
        maxHeight: maxHeight * METERS_TO_YARDS,
        apexTime,
        flightTime: t,
        landingAngle: Math.atan2(-vy, Math.sqrt(vx*vx + vz*vz)) * 180 / Math.PI,
        landingSpinRPM: currentSpinRPM,
        landingSpeed: Math.sqrt(vx*vx + vy*vy + vz*vz) * MS_TO_MPH
    };
}


/**
 * Calculate ball behavior on landing based on spin and landing conditions
 * This determines bounce, check, and roll
 * @param {object} trajectoryResult - Flight trajectory data
 * @param {string} terrain - Landing terrain type
 * @param {object} lie - Optional lie data that affected the shot
 */
export function calculateLandingBehavior(trajectoryResult, terrain = 'fairway', lie = null) {
    const { landingAngle, landingSpinRPM, landingSpeed, carry } = trajectoryResult;
    
    // Terrain friction coefficients (higher = more friction/stopping power)
    const terrainFriction = {
        'green': 0.95,
        'fairway': 0.7,
        'rough': 0.85,
        'bunker': 0.98,
        'tee': 0.7
    };
    
    // Terrain softness (affects how much spin "grabs")
    const terrainSoftness = {
        'green': 0.9,
        'fairway': 0.6,
        'rough': 0.4,
        'bunker': 0.95,
        'tee': 0.6
    };
    
    const friction = terrainFriction[terrain] || 0.7;
    const softness = terrainSoftness[terrain] || 0.6;
    
    // Landing angle affects bounce height
    // Steeper = less forward bounce, more vertical
    const bounceAngleFactor = Math.sin(landingAngle * Math.PI / 180);
    
    // Energy factor based on landing speed - scales bounce and roll with power
    // Full power driver lands ~50-60 mph, half power ~30-35 mph
    // Normalize to 55 mph as "full power" reference
    const energyFactor = Math.pow(landingSpeed / 55, 2); // Kinetic energy scales with v²
    const speedFactor = landingSpeed / 55; // Linear speed factor for some calculations
    
    // First bounce height scales with energy
    const bounceHeight = landingSpeed * 0.3 * bounceAngleFactor * (1 - friction * 0.5);
    
    // Spin effect on landing
    // High backspin + soft terrain = ball checks or spins back
    // Low backspin = ball releases forward
    const spinEffect = (landingSpinRPM / 10000) * softness;
    
    // Calculate roll distance - now scales with energy/speed
    let rollYards;
    let rollDirection = 0; // 0 = forward, negative = backward (spin back)
    
    if (spinEffect > 0.6 && landingAngle > 40) {
        // High spin, steep landing = ball checks hard or spins back
        // Spin back distance scales with speed (more speed = more spin back potential)
        rollYards = (-2 - Math.random() * 4) * speedFactor;
        rollDirection = -1;
    } else if (spinEffect > 0.4 && landingAngle > 30) {
        // Medium-high spin = ball checks, minimal roll
        rollYards = (1 + Math.random() * 3) * speedFactor;
    } else if (spinEffect > 0.2) {
        // Medium spin = some roll, scales with energy
        rollYards = (3 + Math.random() * 5) * energyFactor;
    } else {
        // Low spin = ball releases, scales with energy
        // Driver typically rolls 20-30 yards on fairway at full power
        const baseRoll = 15 + Math.random() * 15;
        const spinReduction = spinEffect * 0.5;
        rollYards = baseRoll * (1 - spinReduction) * energyFactor;
    }
    
    // Adjust for terrain
    if (terrain === 'rough') {
        rollYards *= 0.3; // Rough kills roll
    } else if (terrain === 'bunker') {
        rollYards = 0; // Ball plugs or stops
    } else if (terrain === 'green') {
        // Greens are fast but spin grabs
        if (rollDirection < 0) {
            rollYards *= 1.2; // Spin back more on greens
        } else {
            rollYards *= 0.7; // But forward roll is reduced
        }
    }
    
    return {
        bounceHeight,
        rollYards,
        rollDirection,
        spinEffect,
        checksUp: spinEffect > 0.4 && landingAngle > 30,
        spinsBack: rollDirection < 0
    };
}

/**
 * Generate variability based on golfer skill and conditions
 * This creates the "human element" in the simulation
 * @param {object} golferStats - Golfer statistics
 * @param {string} clubName - Club being used
 * @param {object} conditions - Additional conditions including lie
 */
export function generateShotVariability(golferStats, clubName, conditions = {}) {
    const { missRate = 0.12, distStd = 3, dirStd = 3 } = golferStats;
    const { lie = null } = conditions;
    
    // Get additional miss chance from lie
    let lieMissIncrease = 0;
    if (lie && lie.data && lie.data.effects) {
        lieMissIncrease = lie.data.effects.missChanceIncrease || 0;
        
        // Club difficulty affects lie penalty
        const clubDifficulty = getClubLieDifficulty(clubName);
        lieMissIncrease *= (1 + clubDifficulty * 0.5);
    }
    
    // Roll for shot quality (lie affects miss chance)
    const adjustedMissRate = Math.min(0.5, missRate + lieMissIncrease);
    const qualityRoll = Math.random();
    const isDisaster = qualityRoll < 0.01 + (lieMissIncrease * 0.5);
    const isMiss = qualityRoll < adjustedMissRate;
    
    let variability = {
        speedVariance: 0,
        launchAngleVariance: 0,
        spinVariance: 0,
        spinAxisOffset: 0,
        launchDirection: 0,
        isMiss: false,
        isDisaster: false
    };
    
    if (isDisaster) {
        // Disaster shot - big miss
        variability.isDisaster = true;
        variability.isMiss = true;
        const disasterType = Math.random();
        
        if (disasterType < 0.3) {
            // Topped - low launch, low spin, short
            variability.speedVariance = -0.3 - Math.random() * 0.2;
            variability.launchAngleVariance = -8 - Math.random() * 5;
            variability.spinVariance = -0.5;
        } else if (disasterType < 0.5) {
            // Fat/chunk - very short
            variability.speedVariance = -0.4 - Math.random() * 0.3;
            variability.launchAngleVariance = 5 + Math.random() * 5;
            variability.spinVariance = 0.3;
        } else if (disasterType < 0.75) {
            // Big slice
            variability.spinAxisOffset = 25 + Math.random() * 15;
            variability.launchDirection = 5 + Math.random() * 5;
            variability.speedVariance = -0.1;
        } else {
            // Big hook
            variability.spinAxisOffset = -25 - Math.random() * 15;
            variability.launchDirection = -5 - Math.random() * 5;
            variability.speedVariance = -0.05;
        }
    } else if (isMiss) {
        // Regular miss - moderate deviation, mostly short
        variability.isMiss = true;
        // Speed variance skewed negative (mishits lose distance)
        variability.speedVariance = -Math.abs(gaussianRandom() * 0.04) - 0.02;
        variability.launchAngleVariance = gaussianRandom() * 2;
        variability.spinVariance = gaussianRandom() * 0.10;
        variability.spinAxisOffset = gaussianRandom() * 6;
        variability.launchDirection = gaussianRandom() * 3;
    } else {
        // Good shot - tight variance, slightly skewed short
        // Max ~2% gain, typical 0-3% loss
        const speedRoll = gaussianRandom() * 0.015;
        variability.speedVariance = Math.min(speedRoll, 0.02) - 0.005;
        variability.launchAngleVariance = gaussianRandom() * 0.8;
        variability.spinVariance = gaussianRandom() * 0.05;
        variability.spinAxisOffset = gaussianRandom() * 2;
        variability.launchDirection = gaussianRandom() * 1;
    }
    
    return variability;
}

/**
 * Gaussian random number generator (Box-Muller transform)
 */
function gaussianRandom() {
    let u = 0, v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

/**
 * Full shot simulation combining all physics
 * Returns complete shot data including trajectory and landing
 */
export function simulateFullShot(clubName, power, shape, golferStats, terrain = 'fairway', wind = { speed: 0, direction: 0 }) {
    // Generate variability based on golfer
    const variability = generateShotVariability(golferStats, clubName);
    
    // Generate launch conditions
    const launchConditions = generateLaunchConditions(clubName, power, shape, variability);
    if (!launchConditions) return null;
    
    // Simulate trajectory
    const trajectoryResult = simulateTrajectory(launchConditions, wind.speed, wind.direction);
    
    // Calculate landing behavior
    const landingBehavior = calculateLandingBehavior(trajectoryResult, terrain);
    
    // Calculate final position
    const totalDistance = trajectoryResult.carry + landingBehavior.rollYards;
    const lateralDeviation = trajectoryResult.lateral;
    
    return {
        launch: launchConditions,
        flight: trajectoryResult,
        landing: landingBehavior,
        result: {
            carryYards: trajectoryResult.carry,
            totalYards: totalDistance,
            lateralYards: lateralDeviation,
            maxHeightYards: trajectoryResult.maxHeight,
            flightTime: trajectoryResult.flightTime,
            landingAngle: trajectoryResult.landingAngle
        },
        variability
    };
}

// Export for use in other modules
export { gaussianRandom, YARDS_TO_METERS, METERS_TO_YARDS };


/**
 * Get club difficulty multiplier for lie effects
 * Long clubs are harder to hit from bad lies
 */
function getClubLieDifficulty(clubName) {
    const clubDifficulty = {
        'Driver': 1.0,
        '3 Wood': 0.9,
        '5 Wood': 0.8,
        '4 Iron': 0.7,
        '5 Iron': 0.6,
        '6 Iron': 0.5,
        '7 Iron': 0.4,
        '8 Iron': 0.3,
        '9 Iron': 0.2,
        'PW': 0.15,
        'GW': 0.1,
        'SW': 0.05,
        'LW': 0.1,
        'Putter': 0
    };
    return clubDifficulty[clubName] || 0.5;
}

/**
 * Apply lie effects to launch conditions
 * @param {object} launchConditions - Original launch conditions
 * @param {object} lie - The lie object { type, data }
 * @param {string} clubName - Club being used
 * @returns {object} - Modified launch conditions
 */
export function applyLieToLaunch(launchConditions, lie, clubName) {
    if (!lie || !lie.data || !lie.data.effects) {
        return launchConditions;
    }
    
    const effects = lie.data.effects;
    const modified = { ...launchConditions };
    
    // Club difficulty affects how much the lie hurts
    const clubDiff = getClubLieDifficulty(clubName);
    
    // Distance: lie multiplier, worse with longer clubs
    const distEffect = effects.distanceMultiplier;
    const distPenalty = (1 - distEffect) * (1 + clubDiff * 0.3);
    modified.ballSpeed *= (1 - distPenalty);
    modified.ballSpeedMPH *= (1 - distPenalty);
    
    // Spin: lie multiplier
    modified.spinRate *= effects.spinMultiplier;
    
    // Launch angle adjustment
    modified.launchAngle += effects.launchAngleAdjust || 0;
    
    // Curve adjustment (spin axis)
    if (effects.curveAdjust) {
        modified.spinAxis += effects.curveAdjust;
    }
    
    // Random curve for mud ball
    if (effects.randomCurve) {
        modified.spinAxis += (Math.random() - 0.5) * 20;
        modified.launchDirection += (Math.random() - 0.5) * 8;
    }
    
    // Accuracy penalty affects launch direction
    if (effects.accuracyPenalty > 0) {
        const accuracyNoise = gaussianRandom() * (effects.accuracyPenalty * 0.3);
        modified.launchDirection += accuracyNoise;
    }
    
    return modified;
}
