---
name: theme-factory
description: Toolkit for styling artifacts with a theme. Use when building or switching between visual themes for the application, creating theme variants, or when the project moves to canvas-based UI with customizable themes.
---

# Theme Factory Skill

This skill provides a curated collection of professional font and color themes, each with carefully selected color palettes and font pairings. Once a theme is chosen, it can be applied to any artifact.

## Purpose

To apply consistent, professional styling to UI components, pages, or the entire application. Each theme includes:
- A cohesive color palette with hex codes
- Complementary font pairings for headers and body text
- A distinct visual identity suitable for different contexts and audiences

## WorkFisher Context

WorkFisher currently uses a dark cinematic theme with orange accent (#f27d26). When the project evolves to canvas-based UI, this skill will be used to:
1. Create multiple theme options for users
2. Allow theme switching within the application
3. Generate new themes that maintain the app's professional aesthetic

## Usage

1. **Define theme requirements**: What mood/context is needed?
2. **Generate theme**: Create color palette + font pairing
3. **Apply consistently**: Use CSS variables for system-wide application
4. **Test contrast**: Ensure readability across all components

## Create Custom Theme

Based on provided inputs, generate a new theme with:
- A descriptive name
- Primary, secondary, accent colors with hex codes
- Background and surface colors
- Font pairings (heading + body)
- CSS variable definitions ready for integration
