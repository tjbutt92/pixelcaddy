# Requirements Document

## Introduction

This document specifies requirements for an aggressive codebase cleanup and refactoring of the Golf Caddy game. The focus is on removing unused code, eliminating duplication across modules, extracting magic numbers into named constants, reducing unnecessary variables, and improving performance. No backward compatibility concerns - strict removal of anything not needed.

## Glossary

- **Landing_Page**: The initial course selection screen (to be removed entirely)
- **Yardage_Book**: The modal displaying hole maps, green details, golfer stats, and club info
- **World_Generator**: The 3D terrain, trees, and course visualization system
- **Game_Loop**: The main animation and update cycle
- **Core_Game_Modules**: aim.js, ball.js, clubs.js, golfer.js, lie.js, lieWindow.js, physics.js, shot.js
- **Utils**: Shared utility functions module
- **Magic_Number**: A hardcoded numeric literal that should be a named constant

## Requirements

### Requirement 1: Remove Landing Page Entirely

**User Story:** As a player, I want the game to load directly into gameplay without any landing screen.

#### Acceptance Criteria

1. WHEN the application starts, THE Game SHALL load directly into the first hole
2. THE System SHALL delete all landing page HTML elements from index.html
3. THE System SHALL delete all landing page CSS styles
4. THE System SHALL delete all landing page JavaScript code including course selection logic
5. THE System SHALL remove the availableCourses array and startGame function

### Requirement 2: Eliminate Duplicate Code Across Modules

**User Story:** As a developer, I want each function to exist in exactly one place.

#### Acceptance Criteria

1. THE System SHALL have exactly one gaussianRandom implementation (currently duplicated in clubs.js, golfer.js, physics.js)
2. THE System SHALL have exactly one getClubLieDifficulty implementation (currently duplicated in lie.js and physics.js)
3. THE System SHALL have exactly one seededRandom implementation (currently duplicated in yardageBook.js, trees.js, world.js)
4. THE System SHALL have exactly one distanceToSegment/pointToSegmentDistance implementation (currently duplicated in utils.js and terrain.js)
5. WHEN duplicate functions are found, THE System SHALL consolidate into utils.js and update all imports

### Requirement 3: Extract Magic Numbers to Named Constants

**User Story:** As a developer, I want all numeric literals to have meaningful names.

#### Acceptance Criteria

1. THE System SHALL extract physics constants (GRAVITY, AIR_DENSITY, BALL_MASS, etc.) into a constants section
2. THE System SHALL extract timing constants (animation durations, delays) into named constants
3. THE System SHALL extract scale factors (WORLD_SCALE, YARDS_TO_WORLD) into a single constants module
4. THE System SHALL extract terrain colors into a named color palette object
5. THE System SHALL extract camera parameters (height, distance, angles) into named constants

### Requirement 4: Reduce Unnecessary Variables and Code

**User Story:** As a developer, I want lean code without unused or redundant variables.

#### Acceptance Criteria

1. THE System SHALL remove all unused variables from each module
2. THE System SHALL remove all commented-out code blocks
3. THE System SHALL remove all unused function parameters
4. THE System SHALL inline single-use variables where clarity is not reduced
5. THE System SHALL remove dead code paths that can never execute

### Requirement 5: Refactor Yardage Book Structure

**User Story:** As a developer, I want the yardage book code organized into separate files with shared utilities.

#### Acceptance Criteria

1. THE Yardage_Book SHALL be split into a yardagebook/ subfolder
2. THE System SHALL create separate files: hole-tab.js, green-tab.js, golfer-tab.js, clubs-tab.js, course-tab.js
3. THE System SHALL create yardagebook/utils.js for shared coordinate transforms and drawing functions
4. THE System SHALL create yardagebook/index.js as the main entry point
5. THE Yardage_Book SHALL implement swipeable tabs with proper tab bar labels

### Requirement 6: Optimize World Generation

**User Story:** As a player, I want fast course loading without lag.

#### Acceptance Criteria

1. THE World_Generator SHALL reduce texture size from 4096 to 2048 where quality permits
2. THE World_Generator SHALL batch tree geometry creation instead of individual adds
3. THE World_Generator SHALL cache computed values instead of recalculating
4. THE World_Generator SHALL use typed arrays for pixel operations in slope shading
5. THE World_Generator SHALL defer shadow baking to after initial render

### Requirement 7: Consolidate Utils Module

**User Story:** As a developer, I want one authoritative utils module with all shared functions.

#### Acceptance Criteria

1. THE Utils module SHALL contain gaussianRandom, seededRandom functions
2. THE Utils module SHALL contain all geometry functions (isPointInPolygon, distanceToSegment, etc.)
3. THE Utils module SHALL contain all interpolation functions (cubicInterpolate, bicubicInterpolate)
4. THE Utils module SHALL contain all coordinate conversion functions
5. THE Utils module SHALL export a CONSTANTS object with all shared numeric constants

### Requirement 8: Improve Game Loop for Pause Support

**User Story:** As a developer, I want a game loop that can be paused and resumed.

#### Acceptance Criteria

1. THE Game_Loop SHALL expose a pause() function that stops all updates
2. THE Game_Loop SHALL expose a resume() function that continues from paused state
3. THE Game_Loop SHALL track isPaused state
4. WHEN paused, THE Game_Loop SHALL skip animation frame callbacks
5. THE Game_Loop SHALL separate update logic from render logic

### Requirement 9: Clean Up Unused Exports and Imports

**User Story:** As a developer, I want only necessary exports and imports in each module.

#### Acceptance Criteria

1. THE System SHALL remove all unused exports from each module
2. THE System SHALL remove all unused imports from each module
3. THE System SHALL ensure each module only exports what is used externally
4. THE System SHALL use named exports consistently (no default exports mixed with named)

### Requirement 10: Reorganize Game UI Button Layout

**User Story:** As a player, I want an intuitive button layout that keeps controls accessible without cluttering the view.

#### Acceptance Criteria

1. THE UI SHALL position Club, Power, and Shape buttons vertically stacked on the left side of the screen
2. THE UI SHALL position the Aim button on the right side of the screen
3. THE UI SHALL position the Lie Window directly above the Club button on the left side
4. THE UI SHALL remove the Yardage button from the button bar
5. THE UI SHALL display a yardage indicator strip across the bottom of the screen

### Requirement 13: Implement Expandable Club Selection

**User Story:** As a player, I want to quickly scroll through clubs with visual symbols.

#### Acceptance Criteria

1. WHEN the Club button is tapped, THE UI SHALL expand a horizontal scrollable list from the left
2. THE Club list SHALL display club symbols/icons instead of text names
3. THE Club list SHALL allow horizontal scrolling to browse all clubs
4. WHEN a club is selected, THE UI SHALL collapse the list and update the button
5. THE Club list SHALL highlight the currently selected club

### Requirement 14: Implement Power Slider Control

**User Story:** As a player, I want a visual power slider that shows intensity through color.

#### Acceptance Criteria

1. WHEN the Power button is tapped, THE UI SHALL expand a horizontal slider from the left
2. THE Power slider SHALL change color based on power level (low=cool, high=hot colors)
3. THE Power slider SHALL display the current power percentage
4. WHEN the slider is released, THE UI SHALL collapse and update the button
5. THE Power slider SHALL provide smooth drag interaction

### Requirement 15: Implement Shot Shape Slider Control

**User Story:** As a player, I want a visual slider showing shot curvature from hook to slice.

#### Acceptance Criteria

1. WHEN the Shape button is tapped, THE UI SHALL expand a horizontal slider from the left
2. THE Shape slider SHALL display curvature symbols showing expected ball flight path
3. THE Shape slider SHALL range from hard hook (left) to hard slice (right) with straight in center
4. THE Shape slider SHALL show visual curve indicators at different positions
5. WHEN the slider is released, THE UI SHALL collapse and update the button

### Requirement 16: Improve Aim Mode Interaction

**User Story:** As a player, I want clear visual feedback when aiming and ability to hit while aiming.

#### Acceptance Criteria

1. WHEN Aim mode is active, THE Aim line SHALL turn red
2. WHEN Aim mode is active, THE Aim button SHALL be visually highlighted
3. WHEN Aim mode is active, THE Player SHALL still be able to hit a shot (double-tap)
4. THE Aim mode SHALL not block shot execution
5. WHEN a shot is hit during aim mode, THE System SHALL use the current aim angle

### Requirement 11: Implement Swipe-Up Yardage Book

**User Story:** As a player, I want to swipe up from the bottom to open the yardage book, so that I can access it naturally.

#### Acceptance Criteria

1. WHEN a user swipes up from the bottom area, THE Yardage_Book SHALL open as a full-screen overlay
2. WHEN a user swipes down on the yardage book, THE Yardage_Book SHALL close
3. THE Yardage_Book bottom indicator SHALL show a visual hint that it can be swiped up
4. THE Yardage_Book SHALL animate smoothly when opening and closing
5. THE Yardage_Book SHALL support both swipe gestures and tap on the indicator to open

### Requirement 12: Remove In-Game Wind Indicator and Unify Wind System

**User Story:** As a player, I want wind information only in the yardage book, so that the game view is uncluttered.

#### Acceptance Criteria

1. THE System SHALL remove the wind indicator overlay from the game view
2. THE System SHALL remove the createWindIndicator and updateWindIndicator functions from ui.js
3. THE Yardage_Book SHALL be the single source of wind direction and speed display
4. THE Wind system in Yardage_Book SHALL control tree sway animation
5. THE Wind system in Yardage_Book SHALL control cloud movement
6. THE Wind system in Yardage_Book SHALL control flag flutter animation
7. THE Wind system in Yardage_Book SHALL provide wind data to shot simulation physics
8. THE System SHALL have a single wind state object shared across all systems
