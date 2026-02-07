// Lie Window UI - displays current ball lie in bottom left corner

let lieWindowElement = null;
let currentLie = null;

/**
 * Create the lie window element
 */
export function createLieWindow() {
    if (lieWindowElement) return lieWindowElement;
    
    lieWindowElement = document.createElement('div');
    lieWindowElement.className = 'lie-window';
    lieWindowElement.id = 'lie-window';
    
    lieWindowElement.innerHTML = `
        <div class="lie-window-content">
            <div class="lie-image">⛳</div>
            <div class="lie-name">Perfect Lie</div>
        </div>
    `;
    
    document.body.appendChild(lieWindowElement);
    
    return lieWindowElement;
}

/**
 * Update the lie window with new lie data
 * @param {object} lie - The lie object { type, data }
 */
export function updateLieWindow(lie) {
    if (!lieWindowElement) {
        createLieWindow();
    }
    
    currentLie = lie;
    const data = lie.data;
    
    // Update image and name
    lieWindowElement.querySelector('.lie-image').textContent = data.image;
    lieWindowElement.querySelector('.lie-name').textContent = data.name;
}

/**
 * Get the current lie
 */
export function getCurrentLie() {
    return currentLie;
}

/**
 * Hide the lie window
 */
export function hideLieWindow() {
    if (lieWindowElement) {
        lieWindowElement.style.display = 'none';
    }
}

/**
 * Show the lie window
 */
export function showLieWindow() {
    if (lieWindowElement) {
        lieWindowElement.style.display = 'flex';
    }
}
