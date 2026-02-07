// Club data - scratch golfer carry distances
export const clubs = [
    { name: 'Driver', yards: 280 },
    { name: '3 Wood', yards: 250 },
    { name: '5 Wood', yards: 230 },
    { name: '4 Iron', yards: 210 },
    { name: '5 Iron', yards: 195 },
    { name: '6 Iron', yards: 180 },
    { name: '7 Iron', yards: 165 },
    { name: '8 Iron', yards: 150 },
    { name: '9 Iron', yards: 135 },
    { name: 'PW', yards: 120 },
    { name: 'GW', yards: 105 },
    { name: 'SW', yards: 90 },
    { name: 'LW', yards: 70 },
    { name: 'Putter', yards: 0 }
];

// Clubs without putter (for shot history/yardage calculations)
export const shotClubs = clubs.filter(c => c.name !== 'Putter');

// Utility functions
export function gaussianRandom() {
    let u = 0, v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

export function rollMissType(missPattern) {
    const total = Object.values(missPattern).reduce((a, b) => a + b, 0);
    let roll = Math.random() * total;
    for (const [type, weight] of Object.entries(missPattern)) {
        roll -= weight;
        if (roll <= 0) return type;
    }
    return 'push';
}
