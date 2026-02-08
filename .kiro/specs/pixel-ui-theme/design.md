# Design Document: Pixel UI Theme

## Overview

This design document outlines the technical approach for implementing a consistent pixel-style UI theme across the golf game application. The implementation focuses on creating a centralized CSS variable system, applying a pixel font throughout, removing all rounded corners, and ensuring consistent styling across all UI components.

The design prioritizes simplicity - flat backgrounds, simple rectangular shapes, and straightforward color-change interactions without gradients, shadows, or complex effects.

## Architecture

The pixel theme implementation follows a centralized architecture:

```
┌─────────────────────────────────────────────────────────────┐
│                    styles.css (:root)                        │
│  ┌─────────────────────────────────────────────────────────┐│
│  │  CSS Variables (Single Source of Truth)                 ││
│  │  - --pixel-font: "Press Start 2P", monospace            ││
│  │  - --radius-*: 0 (all square corners)                   ││
│  │  - --color-*: theme color palette                       ││
│  └─────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        ▼                     ▼                     ▼
┌───────────────┐    ┌───────────────┐    ┌───────────────┐
│  index.html   │    │   JS Files    │    │  Components   │
│  (font import)│    │ (use CSS vars)│    │ (inherit vars)│
└───────────────┘    └───────────────┘    └───────────────┘
```

## Components and Interfaces

### 1. Theme System (styles.css :root)

The centralized theme system defines all visual properties:

```css
:root {
    /* Pixel Font */
    --pixel-font: "Press Start 2P", "VT323", monospace;
    --font-family: var(--pixel-font);
    
    /* Square Corners - All set to 0 */
    --radius-sm: 0;
    --radius-md: 0;
    --radius-lg: 0;
    --radius-xl: 0;
    --radius-round: 0;
    
    /* Simplified spacing for pixel grid alignment */
    --space-xs: 4px;
    --space-sm: 8px;
    --space-md: 12px;
    --space-lg: 16px;
    --space-xl: 20px;
}
```

### 2. Font Import (index.html)

Google Fonts import for pixel-style font:

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap" rel="stylesheet">
```

### 3. Button Components

All buttons use simple rectangular styling:

```css
.control-btn {
    border-radius: 0;
    background: var(--color-bg-secondary);
    border: 2px solid var(--color-text-muted);
    /* No shadows, gradients, or backdrop-filter */
}

.control-btn:hover {
    background: var(--color-bg-tertiary);
}

.control-btn:active {
    background: var(--color-bg-hover);
}
```

### 4. Aim Button (Square)

The aim button changes from circular to square:

```css
.aim-btn {
    min-width: 60px;
    min-height: 60px;
    border-radius: 0;  /* Was --radius-round (50%) */
    /* Simple square shape */
}
```

### 5. Modal Components

Modals use square corners and flat styling:

```css
.modal {
    border-radius: 0;  /* Was --radius-xl */
    background-color: var(--color-bg-primary);
    /* No shadows */
}
```

### 6. Card/Section Components

All cards and sections use flat rectangular styling:

```css
.stat-section,
.course-section,
.club-expandable {
    border-radius: 0;
    background-color: var(--color-bg-secondary);
    /* No shadows or gradients */
}
```

### 7. Slider Components

Sliders use square thumbs and tracks:

```css
.power-range-expandable::-webkit-slider-thumb {
    border-radius: 0;  /* Was --radius-round */
}

.power-range-expandable::-webkit-slider-runnable-track {
    border-radius: 0;  /* Was --radius-sm */
}
```

## Data Models

### Theme Color Constants (for JavaScript files)

For JavaScript files that generate dynamic content (like SVG elements), a centralized color constants object:

```javascript
// js/theme-colors.js (new file)
export const THEME_COLORS = {
    // Terrain colors (for canvas/SVG rendering)
    rough: '#90c090',
    fairway: '#b8e8b8',
    water: '#a0c8e8',
    bunker: '#e8dca0',
    green: '#98e898',
    path: '#c8c0b0',
    
    // Marker colors
    markerRed: '#ff4444',
    markerWhite: '#ffffff',
    markerBlue: '#4488ff',
    
    // UI colors
    textDark: '#333333',
    compassRed: '#cc0000',
    compassDarkRed: '#990000',
    
    // Accent colors (matching CSS variables)
    accentGreen: '#5cb85c',
    accentRed: '#e74c3c',
    accentBlue: '#3498db',
    accentOrange: '#f39c12'
};
```



## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

Based on the prework analysis, this feature is primarily a styling/configuration change rather than a behavioral feature. The acceptance criteria are mostly configuration checks (verifying CSS values are set correctly) rather than universal properties that apply across many inputs.

### Property 1: All Border Radius Variables Are Zero

*For any* CSS radius variable (--radius-sm, --radius-md, --radius-lg, --radius-xl, --radius-round) defined in the theme system, the computed value SHALL be 0.

**Validates: Requirements 1.3, 3.1**

### Property 2: No Shadow or Gradient Effects on Interactive Elements

*For any* button, card, or modal component in the stylesheet, the CSS rules SHALL NOT contain box-shadow, background-image (gradient), or backdrop-filter properties.

**Validates: Requirements 4.6, 5.6**

### Property 3: Theme Color Consistency in JavaScript

*For any* hardcoded color value in JavaScript files that renders UI elements, the color SHALL be defined in the centralized THEME_COLORS constant or reference a CSS variable.

**Validates: Requirements 9.14, 9.15**

## Error Handling

This feature is primarily CSS/styling changes with minimal error scenarios:

1. **Font Loading Failure**: If the pixel font fails to load from Google Fonts, the system falls back to the monospace font family specified in the font stack.

2. **CSS Variable Undefined**: If a CSS variable is referenced but not defined, the browser uses the fallback value or inherits from parent elements.

3. **JavaScript Color Constants**: If THEME_COLORS is not imported in a JavaScript file, the file should fail at import time with a clear error message.

## Testing Strategy

### Unit Tests (Examples)

Since this feature is primarily configuration/styling, testing focuses on verifying correct values:

1. **CSS Variable Tests**: Verify that all radius variables are set to 0
2. **Font Import Test**: Verify the pixel font is imported in index.html
3. **Button Style Tests**: Verify buttons have no shadows/gradients
4. **Aim Button Test**: Verify aim button has border-radius: 0 (not 50%)

### Visual Regression Testing

For comprehensive validation, visual regression testing is recommended:

1. Capture screenshots of key UI components before and after changes
2. Verify all corners are square
3. Verify pixel font is applied throughout
4. Verify no rounded elements remain

### Manual Verification Checklist

- [ ] All buttons have square corners
- [ ] Aim button is square (not circular)
- [ ] All modals have square corners
- [ ] All cards/sections have square corners
- [ ] Pixel font is visible throughout
- [ ] No shadows or gradients on interactive elements
- [ ] Sliders have square thumbs and tracks
- [ ] Tab buttons have square corners

## File Change Summary

### Files to Modify

| File | Changes |
|------|---------|
| styles.css | Update :root variables, remove shadows/gradients, set all radius to 0 |
| index.html | Add Google Fonts import for pixel font |
| js/ui.js | Review inline styles, ensure CSS variable usage |
| js/aim.js | Review for any inline styles |
| js/lieWindow.js | Review for any inline styles |
| js/trees.js | Review inline styles for tree rendering |
| js/yardagebook/index.js | Review for any inline styles |
| js/yardagebook/hole-tab.js | Replace hardcoded colors with THEME_COLORS |
| js/yardagebook/green-tab.js | Review for any inline styles |
| js/yardagebook/golfer-tab.js | Review for any inline styles |
| js/yardagebook/clubs-tab.js | Review for any inline styles |
| js/yardagebook/course-tab.js | Review for any inline styles |
| js/yardagebook/utils.js | Replace compass rose SVG colors with THEME_COLORS |

### New Files

| File | Purpose |
|------|---------|
| js/theme-colors.js | Centralized color constants for JavaScript files |
