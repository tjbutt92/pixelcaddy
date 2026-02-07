// Ball entity - stores ball position state (3D rendering handled by game.js)

export class Ball {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.height = 0; // Height above ground in pixels
        this.element = null;
        this.shadowElement = null;
    }

    init(container) {
        // Create shadow element (rendered first, below ball)
        this.shadowElement = document.createElement('div');
        this.shadowElement.className = 'ball-shadow';
        container.appendChild(this.shadowElement);
        
        // Create ball element
        this.element = document.createElement('div');
        this.element.className = 'ball';
        this.element.id = 'ball';
        container.appendChild(this.element);
        
        this.render();
    }

    setPosition(x, y, height = 0) {
        this.x = x;
        this.y = y;
        this.height = height;
        this.render();
    }

    render() {
        // 2D rendering disabled - 3D renderer handles ball display
    }

    // Get position in world coordinates
    getPosition() {
        return { x: this.x, y: this.y };
    }
    
    getHeight() {
        return this.height;
    }
}
