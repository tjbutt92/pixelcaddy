// UI module - modals and button handlers
import { clubs } from './clubs.js';
import { showYardageBook, setYardageBookWorld, setObjectsToHide, setYardageBookBall } from './yardageBook.js';

const shapes = ['Draw', 'Straight', 'Fade'];

// Check if current club is putter
function isPutter(club) {
    return club && club.name === 'Putter';
}

export function setupUI(gameState, aimLine, ball, onHitShot, world = null, objectsToHide = []) {
    // Pass world reference to yardage book for capturing
    if (world) {
        setYardageBookWorld(world);
    }
    // Pass objects to hide during capture (like aim line)
    setObjectsToHide(objectsToHide);
    // Pass ball reference for position display on green map
    if (ball) {
        setYardageBookBall(ball);
    }
    const btnClub = document.getElementById('btn-club');
    const btnPower = document.getElementById('btn-power');
    const btnShape = document.getElementById('btn-shape');
    const btnAim = document.getElementById('btn-aim');
    const btnYardage = document.getElementById('btn-yardage');

    // Create wind indicator
    createWindIndicator(gameState.wind);
    
    // Store reference for updating
    gameState.updateWindDisplay = (aimAngle) => updateWindIndicator(gameState.wind, aimAngle);
    
    // Initialize putter distance if not set
    if (!gameState.putterDistance) {
        gameState.putterDistance = 30; // Default 30 ft putt
    }
    
    updateButtons();

    btnClub.addEventListener('click', () => showClubModal());
    btnPower.addEventListener('click', () => {
        if (isPutter(gameState.club)) {
            showPutterDistanceModal();
        } else {
            showPowerModal();
        }
    });
    btnShape.addEventListener('click', () => {
        // No shot shape for putter
        if (!isPutter(gameState.club)) {
            showShapeModal();
        }
    });
    btnAim.addEventListener('click', () => {
        const isActive = aimLine.toggleAimMode();
        btnAim.textContent = isActive ? 'Set Aim' : 'Aim';
    });

    btnYardage.addEventListener('click', () => {
        showYardageBook(gameState.currentHole);
    });
    
    // Double-tap/click on the golf hole to hit shot (when not in aim mode)
    const golfHole = document.querySelector('.golf-hole');
    golfHole.addEventListener('dblclick', (e) => {
        if (!aimLine.isAimMode) {
            onHitShot();
        }
    });

    function createWindIndicator(wind) {
        const indicator = document.createElement('div');
        indicator.className = 'wind-indicator';
        indicator.id = 'wind-indicator';
        
        // Add strength class for color coding
        if (wind.speed < 5) {
            indicator.classList.add('calm');
        } else if (wind.speed < 10) {
            indicator.classList.add('moderate');
        } else if (wind.speed < 15) {
            indicator.classList.add('strong');
        } else {
            indicator.classList.add('extreme');
        }
        
        indicator.innerHTML = `
            <div class="wind-arrow">➤</div>
            <div class="wind-speed">${wind.speed} mph</div>
        `;
        
        document.body.appendChild(indicator);
    }
    
    function updateWindIndicator(wind, aimAngle) {
        const indicator = document.getElementById('wind-indicator');
        if (!indicator) return;
        
        // Arrow shows where wind is blowing TO
        // wind.direction is where wind comes FROM (0° = from north)
        // CSS rotation: 0° = right (east), 90° = down (south), etc.
        // So wind from north (0°) blows south → arrow points down (90°)
        const arrowRotation = wind.direction + 90;
        
        const arrow = indicator.querySelector('.wind-arrow');
        if (arrow) arrow.style.transform = `rotate(${arrowRotation}deg)`;
    }

    function updateButtons() {
        btnClub.textContent = gameState.club.name;
        
        // Show ft for putter, % for other clubs
        if (isPutter(gameState.club)) {
            btnPower.textContent = gameState.putterDistance + ' ft';
            btnShape.textContent = '-';
            btnShape.style.opacity = '0.5';
        } else {
            btnPower.textContent = gameState.power + '%';
            btnShape.textContent = gameState.shape;
            btnShape.style.opacity = '1';
        }
    }

    function showModal(content) {
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.innerHTML = content;
        
        overlay.appendChild(modal);
        document.body.appendChild(overlay);
        
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) overlay.remove();
        });
        
        return { overlay, modal };
    }

    function showClubModal() {
        let html = '<div class="modal-title">Select Club</div><div class="club-list">';
        clubs.forEach((club, i) => {
            const selected = club.name === gameState.club.name ? ' selected' : '';
            html += `<div class="club-item${selected}" data-index="${i}">
                <span class="club-name">${club.name}</span>
            </div>`;
        });
        html += '</div>';
        
        const { overlay, modal } = showModal(html);
        modal.querySelectorAll('.club-item').forEach(item => {
            item.addEventListener('click', () => {
                gameState.club = clubs[item.dataset.index];
                updateButtons();
                overlay.remove();
            });
        });
    }

    function showPowerModal() {
        const html = `
            <div class="modal-title">Power</div>
            <div class="power-display">${gameState.power}%</div>
            <input type="range" class="power-slider" min="0" max="100" value="${gameState.power}">
            <div class="power-labels"><span>0%</span><span>50%</span><span>100%</span></div>
        `;
        
        const { overlay, modal } = showModal(html);
        const slider = modal.querySelector('.power-slider');
        const display = modal.querySelector('.power-display');
        
        slider.addEventListener('input', () => {
            gameState.power = parseInt(slider.value);
            display.textContent = gameState.power + '%';
            updateButtons();
        });
    }

    function showPutterDistanceModal() {
        const html = `
            <div class="modal-title">Putt Distance</div>
            <div class="power-display">${gameState.putterDistance} ft</div>
            <input type="range" class="power-slider" min="1" max="100" value="${gameState.putterDistance}">
            <div class="power-labels"><span>1 ft</span><span>50 ft</span><span>100 ft</span></div>
        `;
        
        const { overlay, modal } = showModal(html);
        const slider = modal.querySelector('.power-slider');
        const display = modal.querySelector('.power-display');
        
        slider.addEventListener('input', () => {
            gameState.putterDistance = parseInt(slider.value);
            display.textContent = gameState.putterDistance + ' ft';
            updateButtons();
        });
    }

    function showShapeModal() {
        let html = '<div class="modal-title">Shot Shape</div><div class="shape-list">';
        shapes.forEach(shape => {
            const selected = shape === gameState.shape ? ' selected' : '';
            html += `<div class="shape-item${selected}" data-shape="${shape}">${shape}</div>`;
        });
        html += '</div>';
        
        const { overlay, modal } = showModal(html);
        modal.querySelectorAll('.shape-item').forEach(item => {
            item.addEventListener('click', () => {
                gameState.shape = item.dataset.shape;
                updateButtons();
                overlay.remove();
            });
        });
    }
}
