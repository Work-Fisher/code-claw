---
name: canvas-design
description: Create beautiful visual designs and canvas-based UI layouts. Use when designing canvas/node-based workflow interfaces, creating visual compositions, or when the project transitions to canvas-based workflow UI.
---

# Canvas Design Skill

This skill guides creation of canvas-based visual designs and workflow interfaces. For WorkFisher, this will be critical when transitioning from linear flow to canvas-based workflow UI.

## WorkFisher Canvas Vision

The long-term vision is a canvas/node-based workflow where:
- Each module (Script, Image, Video) is a node on the canvas
- Nodes connect visually showing the data flow pipeline
- Users can drag, zoom, and rearrange their workflow
- Each node expands to show its full interface

## Design Principles for Canvas UI

### Visual Language
- **Nodes**: Glass-panel cards with the dark cinematic aesthetic
- **Connections**: Smooth bezier curves with subtle animation
- **Flow Direction**: Left-to-right or top-to-bottom pipeline
- **Interaction**: Drag to move, scroll to zoom, click to expand

### Layout Architecture
- **Mini-map**: Small overview in corner showing full canvas
- **Toolbar**: Floating tools for zoom, fit, add nodes
- **Side Panel**: Expandable detail view when node is selected
- **Status Bar**: Pipeline execution status at bottom

### Technical Approach
- Consider libraries: React Flow, xyflow, or custom Canvas/SVG
- State management for node positions, connections, zoom level
- Smooth 60fps pan/zoom with hardware acceleration
- Responsive: works on various screen sizes

## Design Philosophy

Create interfaces that feel like professional creative tools (Figma, Unreal Blueprint, ComfyUI) rather than generic flowchart builders. Every element should feel crafted and intentional, with the dark cinematic WorkFisher aesthetic throughout.
