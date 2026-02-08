# Implementation Plan: Pixel UI Theme

## Overview

This implementation plan provides file-by-file tasks to update the golf game application with a consistent pixel-style UI theme. Each task focuses on a specific file, ensuring systematic coverage of the entire codebase.

## Tasks

- [x] 1. Create centralized theme color constants file
  - [x] 1.1 Create js/theme-colors.js with THEME_COLORS export
    - Define terrain colors (rough, fairway, water, bunker, green, path)
    - Define marker colors (red, white, blue)
    - Define UI colors (textDark, compassRed, accentGreen, etc.)
    - _Requirements: 9.14, 9.15_

- [x] 2. Update index.html with pixel font import
  - [x] 2.1 Add Google Fonts preconnect links
    - Add preconnect to fonts.googleapis.com
    - Add preconnect to fonts.gstatic.com with crossorigin
    - _Requirements: 2.1_
  - [x] 2.2 Add Google Fonts stylesheet link for "Press Start 2P"
    - _Requirements: 2.1_

- [x] 3. Update styles.css with pixel theme variables
  - [x] 3.1 Update :root CSS variables for pixel theme
    - Add --pixel-font variable with "Press Start 2P", monospace fallback
    - Update --font-family to use --pixel-font
    - Set --radius-sm, --radius-md, --radius-lg, --radius-xl to 0
    - Set --radius-round to 0 (critical for aim button)
    - _Requirements: 1.1, 1.2, 1.3, 3.1_
  - [x] 3.2 Update button styles to remove shadows and gradients
    - Remove box-shadow from .control-btn
    - Remove backdrop-filter from .control-btn
    - Simplify hover/active states to color changes only
    - _Requirements: 4.1, 4.2, 4.4, 4.6_
  - [x] 3.3 Update aim button to be square
    - Change .aim-btn border-radius from --radius-round to 0
    - Remove any circular styling
    - _Requirements: 3.5, 4.3_
  - [x] 3.4 Update modal styles to use square corners
    - Set .modal border-radius to 0
    - Remove any shadows or gradients
    - _Requirements: 3.4, 5.5_
  - [x] 3.5 Update card and section styles
    - Set .stat-section, .course-section, .club-expandable border-radius to 0
    - Remove box-shadow from cards
    - _Requirements: 5.1, 5.2, 5.3_
  - [x] 3.6 Update slider styles to use square corners
    - Set slider thumb border-radius to 0
    - Set slider track border-radius to 0
    - _Requirements: 8.1, 8.2, 8.3, 8.4_
  - [x] 3.7 Update tab button styles
    - Set .tab-btn border-radius to 0
    - Remove any rounded indicators
    - _Requirements: 4.5, 7.1_
  - [x] 3.8 Update yardage book overlay styles
    - Set .yardage-overlay border-radius to 0
    - Set .yardage-content border-radius to 0
    - _Requirements: 7.2, 7.3_
  - [x] 3.9 Update lie window styles
    - Set .lie-window border-radius to 0
    - _Requirements: 5.4_
  - [x] 3.10 Update club selector styles
    - Set .club-selector, .club-scroll, .club-selector-item border-radius to 0
    - _Requirements: 3.2_
  - [x] 3.11 Update power slider expandable styles
    - Set .power-slider-expandable, .power-slider-track border-radius to 0
    - _Requirements: 8.3_
  - [x] 3.12 Update shape slider expandable styles
    - Set .shape-slider-expandable, .shape-slider-track border-radius to 0
    - _Requirements: 8.4_
  - [x] 3.13 Update wind indicator styles
    - Set .wind-indicator border-radius to 0
    - Remove backdrop-filter
    - _Requirements: 5.6_
  - [x] 3.14 Update shot data display styles
    - Set .shot-data-display border-radius to 0
    - Remove gradients and shadows
    - _Requirements: 5.6_
  - [x] 3.15 Update continue button styles
    - Set .continue-button border-radius to 0
    - Remove gradient background, use flat color
    - _Requirements: 4.6_
  - [x] 3.16 Update yardage indicator styles
    - Remove gradient background from .yardage-indicator
    - Use flat background color
    - _Requirements: 5.6_
  - [x] 3.17 Update input field styles
    - Set input border-radius to 0
    - _Requirements: 8.5_

- [x] 4. Checkpoint - Verify CSS changes
  - Ensure all tests pass, ask the user if questions arise.
  - Visually verify square corners throughout the UI

- [x] 5. Update js/ui.js for theme consistency
  - [x] 5.1 Review and update inline styles in js/ui.js
    - Ensure opacity changes use CSS classes where possible
    - Verify power color HSL calculation doesn't conflict with theme
    - _Requirements: 9.3_

- [x] 6. Update js/aim.js for theme consistency
  - [x] 6.1 Review js/aim.js for any inline styles
    - Verify no hardcoded colors or styles
    - _Requirements: 9.4_

- [x] 7. Update js/lieWindow.js for theme consistency
  - [x] 7.1 Review js/lieWindow.js for any inline styles
    - Verify display style changes are minimal
    - _Requirements: 9.5_

- [x] 8. Update js/trees.js for theme consistency
  - [x] 8.1 Review and update js/trees.js inline styles
    - Import THEME_COLORS if needed
    - Replace any hardcoded colors with theme constants
    - _Requirements: 9.6_

- [x] 9. Update js/yardagebook/index.js for theme consistency
  - [x] 9.1 Review js/yardagebook/index.js for inline styles
    - Verify transition/transform styles are animation-only
    - No color changes needed (uses CSS classes)
    - _Requirements: 9.7_

- [x] 10. Update js/yardagebook/hole-tab.js for theme consistency
  - [x] 10.1 Import THEME_COLORS in hole-tab.js
    - Add import statement at top of file
    - _Requirements: 9.8_
  - [x] 10.2 Replace terrain color hardcodes in hole-tab.js
    - Replace '#90c090' with THEME_COLORS.rough
    - Replace '#b8e8b8' with THEME_COLORS.fairway
    - Replace '#a0c8e8' with THEME_COLORS.water
    - Replace '#e8dca0' with THEME_COLORS.bunker
    - Replace '#98e898' with THEME_COLORS.green
    - Replace '#c8c0b0' with THEME_COLORS.path
    - _Requirements: 9.8, 9.14_
  - [x] 10.3 Replace marker color hardcodes in hole-tab.js
    - Replace '#ff4444' with THEME_COLORS.markerRed
    - Replace '#ffffff' with THEME_COLORS.markerWhite
    - Replace '#4488ff' with THEME_COLORS.markerBlue
    - Replace '#333333' with THEME_COLORS.textDark
    - Replace '#ff8c00' with THEME_COLORS.accentOrange
    - _Requirements: 9.8, 9.14_
  - [x] 10.4 Replace compass rose color hardcodes in hole-tab.js
    - Replace '#cc0000' with THEME_COLORS.compassRed
    - Replace '#990000' with THEME_COLORS.compassDarkRed
    - Replace '#333' with THEME_COLORS.textDark
    - _Requirements: 9.8, 9.14_

- [x] 11. Update js/yardagebook/green-tab.js for theme consistency
  - [x] 11.1 Review js/yardagebook/green-tab.js for inline styles
    - Import THEME_COLORS if any hardcoded colors exist
    - Replace hardcoded colors with theme constants
    - _Requirements: 9.9_

- [x] 12. Update js/yardagebook/golfer-tab.js for theme consistency
  - [x] 12.1 Review js/yardagebook/golfer-tab.js for inline styles
    - Import THEME_COLORS if any hardcoded colors exist
    - Replace hardcoded colors with theme constants
    - _Requirements: 9.10_

- [x] 13. Update js/yardagebook/clubs-tab.js for theme consistency
  - [x] 13.1 Review js/yardagebook/clubs-tab.js for inline styles
    - Import THEME_COLORS if any hardcoded colors exist
    - Replace hardcoded colors with theme constants
    - _Requirements: 9.11_

- [x] 14. Update js/yardagebook/course-tab.js for theme consistency
  - [x] 14.1 Review js/yardagebook/course-tab.js for inline styles
    - Import THEME_COLORS if any hardcoded colors exist
    - Replace hardcoded colors with theme constants
    - _Requirements: 9.12_

- [x] 15. Update js/yardagebook/utils.js for theme consistency
  - [x] 15.1 Import THEME_COLORS in utils.js
    - Add import statement at top of file
    - _Requirements: 9.13_
  - [x] 15.2 Replace compass rose color hardcodes in utils.js
    - Replace '#cc0000' with THEME_COLORS.compassRed
    - Replace '#990000' with THEME_COLORS.compassDarkRed
    - Replace '#333' with THEME_COLORS.textDark
    - Replace '#ffffff' with THEME_COLORS.markerWhite
    - _Requirements: 9.13, 9.14_

- [x] 16. Final checkpoint - Verify all changes
  - Ensure all tests pass, ask the user if questions arise.
  - Visually verify pixel theme is consistent across entire application
  - Verify all corners are square
  - Verify pixel font is applied throughout
  - Verify no shadows or gradients remain on interactive elements

## Notes

- Each task focuses on a single file for systematic implementation
- CSS changes in styles.css should be done first as they affect all components
- JavaScript files should import THEME_COLORS only if they contain hardcoded colors
- Visual verification is important after each major section
- The pixel font may require font-size adjustments as pixel fonts are typically smaller
