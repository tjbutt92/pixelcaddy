# Implementation Plan: Codebase Refactor

## Overview

This implementation plan breaks down the codebase refactoring into discrete, incremental tasks. Each task builds on previous work and ends with integrated, working code. The focus is on removing unused code, eliminating duplication, extracting constants, reorganizing the yardage book, implementing new UI controls, and adding pause support.

## Tasks

- [x] 1. Create constants module and consolidate magic numbers
  - [x] 1.1 Create js/constants.js with PHYSICS, CONVERSION, CAMERA, TIMING, TERRAIN_COLORS, SKY objects
    - Extract constants from physics.js, world.js, game.js, shot.js
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_
  - [x] 1.2 Update physics.js to import from constants.js
    - Replace inline GRAVITY, AIR_DENSITY, BALL_MASS, etc.
    - _Requirements: 3.1_
  - [x] 1.3 Update world.js to import from constants.js
    - Replace SKY_CONFIG, TERRAIN_COLORS, WORLD_SCALE
    - _Requirements: 3.3, 3.4, 3.5_
  - [x] 1.4 Update game.js to import from constants.js
    - Replace camera parameters, timing values
    - _Requirements: 3.2, 3.5_

- [x] 2. Consolidate utility functions into utils.js
  - [x] 2.1 Add gaussianRandom and seededRandom to utils.js
    - Single implementation of each function
    - _Requirements: 2.1, 2.3, 7.1_
  - [x] 2.2 Add getClubLieDifficulty to utils.js
    - Consolidate from lie.js and physics.js
    - _Requirements: 2.2_
  - [x] 2.3 Consolidate distanceToSegment implementations
    - Remove duplicate from terrain.js, keep in utils.js
    - _Requirements: 2.4, 7.2_
  - [x] 2.4 Update all modules to import from utils.js
    - Update clubs.js, golfer.js, physics.js, lie.js, terrain.js, trees.js, yardageBook.js, world.js
    - Remove duplicate function definitions
    - _Requirements: 2.5_

- [x] 3. Create unified wind system
  - [x] 3.1 Create js/wind.js module
    - Implement windState object, initializeWind(), getWind(), getWindForShot(), getWindForVisuals()
    - _Requirements: 12.8_
  - [x] 3.2 Update game.js to use wind.js
    - Replace generateWind() with initializeWind()
    - Pass wind to shot simulator from getWindForShot()
    - _Requirements: 12.7_
  - [x] 3.3 Update world.js to use wind.js for visual effects
    - Use getWindForVisuals() for tree sway, cloud movement
    - _Requirements: 12.4, 12.5_

- [x] 4. Remove landing page and wind indicator
  - [x] 4.1 Remove landing page HTML from index.html
    - Delete home-overlay div and all child elements
    - Delete landing page inline styles
    - _Requirements: 1.2, 1.3_
  - [x] 4.2 Remove landing page JavaScript from game.js
    - Delete init() course selection logic
    - Delete startGame() function
    - Delete availableCourses array
    - Modify init() to call initGame() directly
    - _Requirements: 1.4, 1.5_
  - [x] 4.3 Remove wind indicator from ui.js
    - Delete createWindIndicator() function
    - Delete updateWindIndicator() function
    - Remove wind indicator creation from setupUI()
    - _Requirements: 12.1, 12.2_

- [x] 5. Implement game loop with pause support
  - [x] 5.1 Refactor game.js animate function to support pause
    - Add loopState object with isPaused, updateCallbacks, renderCallbacks
    - Implement pause(), resume(), isPaused() exports
    - Separate update and render phases in game loop
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_

- [x] 6. Reorganize UI button layout
  - [x] 6.1 Update index.html with new button structure
    - Create left-side control stack (lie-window, club, power, shape)
    - Create right-side aim button
    - Create bottom yardage indicator strip
    - Remove yardage button from button bar
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5_
  - [x] 6.2 Update styles.css with new layout styles
    - Position left controls vertically
    - Position aim button on right
    - Style yardage indicator strip at bottom
    - _Requirements: 10.1, 10.2, 10.3, 10.5_

- [x] 7. Implement expandable club selector
  - [x] 7.1 Create club selector component in ui.js
    - Horizontal scrollable list with club symbols
    - Expand/collapse animation on button tap
    - Highlight selected club
    - _Requirements: 13.1, 13.2, 13.3, 13.5_
  - [x] 7.2 Wire club selector to game state
    - Update gameState.club on selection
    - Collapse selector after selection
    - _Requirements: 13.4_

- [x] 8. Implement power slider control
  - [x] 8.1 Create power slider component in ui.js
    - Horizontal slider with color gradient
    - Display percentage value
    - Expand/collapse animation
    - _Requirements: 14.1, 14.2, 14.3_
  - [x] 8.2 Wire power slider to game state
    - Update gameState.power on change
    - Collapse slider on release
    - _Requirements: 14.4_

- [x] 9. Implement shape slider control
  - [x] 9.1 Create shape slider component in ui.js
    - Horizontal slider with curve symbols
    - Range from hook to slice with straight center
    - Expand/collapse animation
    - _Requirements: 15.1, 15.2, 15.3, 15.4_
  - [x] 9.2 Wire shape slider to game state
    - Update gameState.shape on change
    - Collapse slider on release
    - _Requirements: 15.5_

- [x] 10. Improve aim mode interaction
  - [x] 10.1 Update aim line color when aim mode active
    - Change aim line material color to red (0xff0000)
    - Restore to white when aim mode deactivated
    - _Requirements: 16.1_
  - [x] 10.2 Update aim button highlighting
    - Add 'active' class to aim button when aim mode on
    - Style active state with highlight color
    - _Requirements: 16.2_
  - [x] 10.3 Allow shot execution during aim mode
    - Modify double-tap handler to work regardless of aim mode
    - Use current aim angle for shot
    - _Requirements: 16.3, 16.4, 16.5_

- [x] 11. Create yardagebook module structure
  - [x] 11.1 Create js/yardagebook/ folder and index.js
    - Main entry point with showYardageBook export
    - Tab management and swipe handling
    - _Requirements: 5.1, 5.4_
  - [x] 11.2 Create js/yardagebook/utils.js
    - worldToCapture coordinate transform
    - drawTerrainPolygon, drawTerrainEllipse helpers
    - calculateHoleBounds function
    - _Requirements: 5.3_
  - [x] 11.3 Create js/yardagebook/hole-tab.js
    - Extract hole map rendering from yardageBook.js
    - Import shared utils
    - _Requirements: 5.2_
  - [x] 11.4 Create js/yardagebook/green-tab.js
    - Extract green detail rendering from yardageBook.js
    - Import shared utils
    - _Requirements: 5.2_
  - [x] 11.5 Create js/yardagebook/golfer-tab.js
    - Extract golfer stats rendering from yardageBook.js
    - _Requirements: 5.2_
  - [x] 11.6 Create js/yardagebook/clubs-tab.js
    - Extract clubs info rendering from yardageBook.js
    - _Requirements: 5.2_
  - [x] 11.7 Create js/yardagebook/course-tab.js
    - Extract course overview rendering from yardageBook.js
    - _Requirements: 5.2_

- [x] 12. Implement swipeable tabs in yardage book
  - [x] 12.1 Add tab bar with labels to yardage book
    - Create tab buttons for each tab
    - Style active tab indicator
    - _Requirements: 5.5_
  - [x] 12.2 Implement horizontal swipe for tab navigation
    - Detect swipe left/right gestures
    - Animate tab transitions
    - _Requirements: 5.5_

- [x] 13. Implement swipe-up yardage book opening
  - [x] 13.1 Create yardage indicator strip at bottom
    - Visual hint for swipe up
    - Tap to open functionality
    - _Requirements: 11.3, 11.5_
  - [x] 13.2 Implement swipe-up gesture detection
    - Detect swipe up from bottom area
    - Open yardage book as full-screen overlay
    - _Requirements: 11.1_
  - [x] 13.3 Implement swipe-down to close
    - Detect swipe down on yardage book
    - Animate close transition
    - _Requirements: 11.2_
  - [x] 13.4 Update ui.js to use new yardagebook module
    - Import from js/yardagebook/index.js
    - Remove old yardageBook.js import
    - _Requirements: 5.4_

- [x] 14. Delete old yardageBook.js file
  - Remove js/yardageBook.js after migration complete
  - _Requirements: 5.1_

- [x] 15. Optimize world generation
  - [x] 15.1 Reduce terrain texture size
    - Change textureSize from 4096 to 2048
    - _Requirements: 6.1_
  - [x] 15.2 Use typed arrays for slope shading
    - Use Uint8ClampedArray for pixel operations
    - _Requirements: 6.4_

- [x] 16. Clean up unused code
  - [x] 16.1 Remove unused exports and imports across all modules
    - Audit each module for unused exports
    - Remove unused imports
    - _Requirements: 9.1, 9.2, 9.3_
  - [x] 16.2 Ensure consistent named exports
    - Convert any default exports to named exports
    - _Requirements: 9.4_

## Notes

- Each task references specific requirements for traceability
