// Lie system - simplified ball lie mechanics
// 3 levels of grass coverage + perfect + 2 bunker lies

import { TerrainType } from './terrain.js';

// Simplified lie types
export const LieType = {
    // Grass lies (3 levels of nestled + 1 perfect)
    PERFECT: 'perfect',       // Tee or ball sitting up perfectly
    GOOD: 'good',             // Clean lie, ball visible
    SITTING_DOWN: 'sitting',  // Ball nestled in grass
    BURIED: 'buried',         // Ball deep in grass, hard to advance
    
    // Bunker lies (2 types)
    BUNKER_CLEAN: 'bunker_clean',   // Ball on top of sand
    BUNKER_PLUGGED: 'bunker_plugged', // Fried egg / plugged
    
    // Green
    GREEN: 'green'
};

// Lie data with effects on shot physics
export const lieData = {
    [LieType.PERFECT]: {
        name: 'Perfect Lie',
        description: 'Ball sitting up perfectly - full contact',
        image: '⛳',
        terrain: [TerrainType.TEE, TerrainType.FAIRWAY],
        effects: {
            distanceMultiplier: 1.0,
            spinMultiplier: 1.0,
            accuracyPenalty: 0,
            launchAngleAdjust: 0,
            missChanceIncrease: 0
        }
    },
    [LieType.GOOD]: {
        name: 'Good Lie',
        description: 'Ball visible, clean contact expected',
        image: '🟢',
        terrain: [TerrainType.FAIRWAY, TerrainType.ROUGH],
        effects: {
            distanceMultiplier: 0.95,
            spinMultiplier: 0.9,
            accuracyPenalty: 2,
            launchAngleAdjust: 0,
            missChanceIncrease: 0.03
        }
    },
    [LieType.SITTING_DOWN]: {
        name: 'Sitting Down',
        description: 'Ball nestled in grass - some interference',
        image: '🌿',
        terrain: [TerrainType.ROUGH],
        effects: {
            distanceMultiplier: 0.85,
            spinMultiplier: 0.7,
            accuracyPenalty: 5,
            launchAngleAdjust: 2,
            missChanceIncrease: 0.08
        }
    },
    [LieType.BURIED]: {
        name: 'Buried Lie',
        description: 'Ball deep in grass - wedge recommended',
        image: '⬇️',
        terrain: [TerrainType.ROUGH],
        effects: {
            distanceMultiplier: 0.6,
            spinMultiplier: 0.5,
            accuracyPenalty: 10,
            launchAngleAdjust: 4,
            missChanceIncrease: 0.18
        }
    },
    [LieType.BUNKER_CLEAN]: {
        name: 'Clean Bunker Lie',
        description: 'Ball sitting on top of sand',
        image: '🏖️',
        terrain: [TerrainType.BUNKER],
        effects: {
            distanceMultiplier: 0.85,
            spinMultiplier: 1.1,
            accuracyPenalty: 5,
            launchAngleAdjust: 2,
            missChanceIncrease: 0.1
        }
    },
    [LieType.BUNKER_PLUGGED]: {
        name: 'Plugged',
        description: 'Ball buried in sand - dig it out',
        image: '🍳',
        terrain: [TerrainType.BUNKER],
        effects: {
            distanceMultiplier: 0.55,
            spinMultiplier: 0.3,
            accuracyPenalty: 12,
            launchAngleAdjust: 5,
            missChanceIncrease: 0.22
        }
    },
    [LieType.GREEN]: {
        name: 'On Green',
        description: 'Ball on the putting surface',
        image: '⛳',
        terrain: [TerrainType.GREEN],
        effects: {
            distanceMultiplier: 1.0,
            spinMultiplier: 1.0,
            accuracyPenalty: 0,
            launchAngleAdjust: 0,
            missChanceIncrease: 0
        }
    }
};

/**
 * Determine the lie based on terrain
 * @param {string} terrain - The terrain type at ball position
 * @param {object} slope - Slope data (unused in simplified system)
 * @returns {object} - Lie type and data
 */
export function determineLie(terrain, slope = null) {
    const roll = Math.random();
    let lieType;
    
    switch (terrain) {
        case TerrainType.TEE:
            lieType = LieType.PERFECT;
            break;
            
        case TerrainType.FAIRWAY:
            // 70% perfect, 30% good
            lieType = roll < 0.7 ? LieType.PERFECT : LieType.GOOD;
            break;
            
        case TerrainType.ROUGH:
            // 25% good, 45% sitting down, 30% buried
            if (roll < 0.25) {
                lieType = LieType.GOOD;
            } else if (roll < 0.70) {
                lieType = LieType.SITTING_DOWN;
            } else {
                lieType = LieType.BURIED;
            }
            break;
            
        case TerrainType.BUNKER:
            // 60% clean, 40% plugged
            lieType = roll < 0.6 ? LieType.BUNKER_CLEAN : LieType.BUNKER_PLUGGED;
            break;
            
        case TerrainType.GREEN:
            lieType = LieType.GREEN;
            break;
            
        default:
            lieType = LieType.SITTING_DOWN;
    }
    
    return { type: lieType, data: lieData[lieType] };
}

/**
 * Apply lie effects to shot parameters
 * @param {object} lie - The lie object { type, data }
 * @param {object} launchConditions - Original launch conditions
 * @param {string} clubName - The club being used
 * @returns {object} - Modified launch conditions
 */
export function applyLieEffects(lie, launchConditions, clubName) {
    const effects = lie.data.effects;
    const modified = { ...launchConditions };
    
    // Club difficulty - long clubs harder from bad lies
    const clubDifficulty = getClubLieDifficulty(clubName, lie.type);
    
    // Apply distance multiplier (worse with long clubs in bad lies)
    const distanceEffect = effects.distanceMultiplier * (1 - (1 - effects.distanceMultiplier) * clubDifficulty * 0.5);
    modified.ballSpeed *= distanceEffect;
    modified.ballSpeedMPH *= distanceEffect;
    
    // Apply spin multiplier
    modified.spinRate *= effects.spinMultiplier;
    
    // Apply launch angle adjustment
    modified.launchAngle += effects.launchAngleAdjust;
    
    return modified;
}

/**
 * Get additional miss chance from lie
 */
export function getLieMissChance(lie, clubName) {
    const baseMissIncrease = lie.data.effects.missChanceIncrease;
    const clubDifficulty = getClubLieDifficulty(clubName, lie.type);
    
    return baseMissIncrease * (1 + clubDifficulty * 0.5);
}

/**
 * Get club difficulty multiplier for a given lie
 */
function getClubLieDifficulty(clubName, lieType) {
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
    
    // Sand wedge is designed for bunkers
    if (lieType.includes('bunker') && clubName === 'SW') {
        return 0;
    }
    
    return clubDifficulty[clubName] || 0.5;
}

/**
 * Get recommended clubs for a given lie
 */
export function getRecommendedClubs(lie) {
    const recommendations = {
        [LieType.PERFECT]: ['Any club'],
        [LieType.GOOD]: ['Any club'],
        [LieType.SITTING_DOWN]: ['7 Iron or less recommended'],
        [LieType.BURIED]: ['Wedge recommended'],
        [LieType.BUNKER_CLEAN]: ['SW recommended'],
        [LieType.BUNKER_PLUGGED]: ['SW with square face'],
        [LieType.GREEN]: ['Putter']
    };
    
    return recommendations[lie.type] || ['Play conservatively'];
}
