# Requirements Document

## Introduction

This document defines the requirements for implementing a consistent pixel-style UI theme across the golf game application. The goal is to create a unified pixel-art aesthetic with centralized styling, pixel fonts, square corners, and consistent button/card/module styling throughout the main game, yardage book, and editor interfaces.

## Glossary

- **Theme_System**: The centralized CSS variables and styling system that controls the visual appearance of all UI elements
- **Pixel_Font**: A bitmap-style font that maintains the pixel-art aesthetic (e.g., "Press Start 2P", "VT323", or similar)
- **Control_Button**: Interactive buttons in the game UI (Club, Power, Shape, Aim buttons)
- **Modal**: Popup overlay dialogs for club selection, power adjustment, etc.
- **Card**: Container elements displaying grouped information (stat sections, club items, course sections)
- **Yardage_Book**: The full-screen overlay showing hole, green, golfer, clubs, and course information
- **Editor**: The course editor interface for creating and modifying golf holes

## Requirements

### Requirement 1: Centralized Theme System

**User Story:** As a developer, I want a centralized CSS theme system, so that editing one style variable updates the entire game consistently.

#### Acceptance Criteria

1. THE Theme_System SHALL define all pixel-style CSS variables in a single `:root` block in styles.css
2. THE Theme_System SHALL include a `--pixel-font` variable for the pixel-style font family
3. THE Theme_System SHALL set `--radius-sm`, `--radius-md`, `--radius-lg`, `--radius-xl`, and `--radius-round` to 0 for square corners
4. THE Theme_System SHALL define pixel-appropriate spacing variables that align with the pixel aesthetic
5. WHEN a theme variable is modified, THE Theme_System SHALL propagate the change to all UI elements using that variable

### Requirement 2: Pixel Font Implementation

**User Story:** As a player, I want to see pixel-style fonts throughout the game, so that the visual experience feels cohesive with the pixel-art aesthetic.

#### Acceptance Criteria

1. THE Theme_System SHALL import a pixel-style web font (such as "Press Start 2P" or "VT323")
2. THE Theme_System SHALL apply the pixel font to all text elements via the `--font-family` variable
3. WHEN text is displayed in Control_Buttons, THE Theme_System SHALL use the pixel font
4. WHEN text is displayed in Modals, THE Theme_System SHALL use the pixel font
5. WHEN text is displayed in the Yardage_Book, THE Theme_System SHALL use the pixel font
6. WHEN text is displayed in the Editor, THE Theme_System SHALL use the pixel font

### Requirement 3: Square Corners Throughout

**User Story:** As a player, I want all UI elements to have square corners, so that the interface maintains a consistent pixel-art style.

#### Acceptance Criteria

1. THE Theme_System SHALL set all border-radius values to 0
2. WHEN rendering Control_Buttons, THE Theme_System SHALL display them with square corners
3. WHEN rendering Modals, THE Theme_System SHALL display them with square corners
4. WHEN rendering Cards, THE Theme_System SHALL display them with square corners
5. WHEN rendering the Aim button, THE Theme_System SHALL display it as a square shape (not circular)
6. WHEN rendering slider thumbs and tracks, THE Theme_System SHALL display them with square corners
7. WHEN rendering tab buttons, THE Theme_System SHALL display them with square corners

### Requirement 4: Simple Rectangular Buttons

**User Story:** As a player, I want buttons to have simple rectangular shapes, so that interactions feel consistent with the pixel-art theme.

#### Acceptance Criteria

1. THE Theme_System SHALL style Control_Buttons with square corners and simple flat backgrounds (no gradients or shadows)
2. THE Theme_System SHALL apply simple color-change hover and active states to buttons (no complex effects)
3. WHEN the Aim button is rendered, THE Theme_System SHALL display it as a square button (not circular)
4. WHEN buttons are pressed, THE Theme_System SHALL provide simple color-based visual feedback
5. THE Theme_System SHALL style tab buttons in the Yardage_Book with simple rectangular shapes
6. THE Theme_System SHALL remove all box-shadow, gradient, and backdrop-filter effects from buttons

### Requirement 5: Simple Rectangular Cards and Modules

**User Story:** As a player, I want information cards and modules to have simple rectangular shapes, so that the entire interface feels unified with the pixel theme.

#### Acceptance Criteria

1. THE Theme_System SHALL style stat sections with square corners and flat backgrounds (no shadows or gradients)
2. THE Theme_System SHALL style club items in lists with simple rectangular shapes
3. THE Theme_System SHALL style course sections with square corners and flat styling
4. THE Theme_System SHALL style the lie window with simple rectangular shapes
5. THE Theme_System SHALL style modal overlays with square corners and flat backgrounds
6. THE Theme_System SHALL remove all box-shadow, gradient, and backdrop-filter effects from cards and modules

### Requirement 6: Main Game Styles Update (styles.css)

**User Story:** As a developer, I want the main styles.css file updated with pixel theme variables, so that the game interface uses the new theme.

#### Acceptance Criteria

1. WHEN styles.css is loaded, THE Theme_System SHALL define pixel font imports at the top of the file
2. WHEN styles.css is loaded, THE Theme_System SHALL set all radius variables to 0
3. THE Theme_System SHALL update button styles to use square corners
4. THE Theme_System SHALL update modal styles to use square corners
5. THE Theme_System SHALL update card and section styles to use square corners
6. THE Theme_System SHALL update the aim button to be square instead of circular

### Requirement 7: Yardage Book Styles Update

**User Story:** As a player, I want the yardage book to use the pixel theme, so that it matches the rest of the game.

#### Acceptance Criteria

1. THE Yardage_Book SHALL display tab buttons with square corners
2. THE Yardage_Book SHALL display content cards with square corners
3. THE Yardage_Book SHALL use the pixel font for all text
4. THE Yardage_Book SHALL style the close button with the pixel theme
5. THE Yardage_Book SHALL style stat sections and data displays with square corners

### Requirement 8: Slider and Input Styles

**User Story:** As a player, I want sliders and inputs to match the pixel aesthetic, so that all interactive elements feel consistent.

#### Acceptance Criteria

1. THE Theme_System SHALL style slider tracks with square corners
2. THE Theme_System SHALL style slider thumbs with square corners (not circular)
3. THE Theme_System SHALL style the power slider with pixel aesthetics
4. THE Theme_System SHALL style the shape slider with pixel aesthetics
5. THE Theme_System SHALL style input fields in modals with square corners

### Requirement 9: Consistent Control Button Layout

**User Story:** As a player, I want the control buttons (Club, Power, Shape) to have consistent sizing and compact labels, so that the UI looks clean and unified.

#### Acceptance Criteria

1. THE Control_Buttons (Club, Power, Shape) SHALL all have the same fixed width
2. THE Control_Button width SHALL match the width needed for "100%" display (the Power button reference width)
3. THE Club button SHALL display abbreviated club names (e.g., "Dr" for Driver, "3W" for 3-Wood, "7i" for 7-Iron, "PW" for Pitching Wedge, "Pt" for Putter)
4. THE Shape button SHALL display arrow symbols to indicate shot shape (e.g., "←" for draw/hook, "↑" or "—" for straight, "→" for fade/slice)
5. THE Control_Buttons SHALL NOT use bold font weight
6. THE Control_Buttons SHALL use the pixel font family

### Requirement 10: Simplified Lie Window Display

**User Story:** As a player, I want the lie window to show compact text without emojis, so that it matches the pixel aesthetic and saves screen space.

#### Acceptance Criteria

1. THE Lie_Window SHALL NOT display emoji icons
2. THE Lie_Window SHALL display abbreviated lie names (e.g., "PL" for Perfect Lie, "FL" for Fairway Lie, "RL" for Rough Lie, "BL" for Bunker Lie)
3. THE Lie_Window SHALL use the pixel font family
4. THE Lie_Window SHALL NOT use bold font weight
5. THE Lie_Window text SHALL be compact and minimal

### Requirement 11: File-by-File Implementation Tasks

**User Story:** As a developer, I want specific tasks for each file, so that I can systematically update the entire codebase to use the centralized theme.

#### Acceptance Criteria

1. THE implementation plan SHALL include a task for updating styles.css with centralized pixel theme variables
2. THE implementation plan SHALL include a task for updating index.html with pixel font imports
3. THE implementation plan SHALL include a task for reviewing and updating js/ui.js to use theme colors, abbreviated club names, and arrow symbols for shape
4. THE implementation plan SHALL include a task for reviewing and updating js/aim.js to use theme colors
5. THE implementation plan SHALL include a task for reviewing and updating js/lieWindow.js to remove emojis and use abbreviated lie names
6. THE implementation plan SHALL include a task for reviewing and updating js/trees.js to use theme colors (contains inline styles for tree rendering)
7. THE implementation plan SHALL include a task for reviewing and updating js/yardagebook/index.js to use theme colors
8. THE implementation plan SHALL include a task for reviewing and updating js/yardagebook/hole-tab.js to use theme colors (contains many hardcoded colors for terrain, markers, compass)
9. THE implementation plan SHALL include a task for reviewing and updating js/yardagebook/green-tab.js to use theme colors
10. THE implementation plan SHALL include a task for reviewing and updating js/yardagebook/golfer-tab.js to use theme colors
11. THE implementation plan SHALL include a task for reviewing and updating js/yardagebook/clubs-tab.js to use theme colors
12. THE implementation plan SHALL include a task for reviewing and updating js/yardagebook/course-tab.js to use theme colors
13. THE implementation plan SHALL include a task for reviewing and updating js/yardagebook/utils.js to use theme colors (contains compass rose SVG colors)
14. WHEN reviewing each file, THE developer SHALL ensure all hardcoded colors are replaced with CSS variable references or centralized constants
15. WHEN reviewing each file, THE developer SHALL ensure all inline styles use the centralized theme palette
16. WHEN reviewing each file, THE developer SHALL ensure no bold font weights are used (font-weight: normal only)
