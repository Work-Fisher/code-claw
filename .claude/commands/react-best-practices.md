---
name: react-best-practices
description: React and Next.js performance optimization guidelines from Vercel Engineering. This skill should be used when writing, reviewing, or refactoring React code to ensure optimal performance patterns. Triggers on tasks involving React components, data fetching, bundle optimization, or performance improvements.
---

# React Best Practices

Comprehensive performance optimization guide for React applications, adapted from Vercel Engineering. Contains 65 rules across 8 categories, prioritized by impact.

## When to Apply

Reference these guidelines when:
- Writing new React components
- Reviewing code for performance issues
- Refactoring existing React code
- Optimizing bundle size or load times

## Rule Categories by Priority

| Priority | Category | Impact | Prefix |
|----------|----------|--------|--------|
| 1 | Eliminating Waterfalls | CRITICAL | `async-` |
| 2 | Bundle Size Optimization | CRITICAL | `bundle-` |
| 3 | Client-Side Data Fetching | MEDIUM-HIGH | `client-` |
| 4 | Re-render Optimization | MEDIUM | `rerender-` |
| 5 | Rendering Performance | MEDIUM | `rendering-` |
| 6 | JavaScript Performance | LOW-MEDIUM | `js-` |

## Key Rules (Most Relevant to Electron + React)

### 1. Eliminating Waterfalls (CRITICAL)

- `async-defer-await` - Move await into branches where actually used
- `async-parallel` - Use Promise.all() for independent operations
- `async-dependencies` - Use better-all for partial dependencies

### 2. Bundle Size Optimization (CRITICAL)

- `bundle-barrel-imports` - Import directly, avoid barrel files
- `bundle-dynamic-imports` - Use dynamic imports for heavy components
- `bundle-conditional` - Load modules only when feature is activated

### 3. Re-render Optimization (MEDIUM)

- `rerender-defer-reads` - Don't subscribe to state only used in callbacks
- `rerender-memo` - Extract expensive work into memoized components
- `rerender-memo-with-default-value` - Hoist default non-primitive props
- `rerender-dependencies` - Use primitive dependencies in effects
- `rerender-derived-state` - Subscribe to derived booleans, not raw values
- `rerender-derived-state-no-effect` - Derive state during render, not effects
- `rerender-functional-setstate` - Use functional setState for stable callbacks
- `rerender-lazy-state-init` - Pass function to useState for expensive values
- `rerender-split-combined-hooks` - Split hooks with independent dependencies
- `rerender-move-effect-to-event` - Put interaction logic in event handlers
- `rerender-transitions` - Use startTransition for non-urgent updates
- `rerender-no-inline-components` - Don't define components inside components

### 4. Rendering Performance (MEDIUM)

- `rendering-content-visibility` - Use content-visibility for long lists
- `rendering-hoist-jsx` - Extract static JSX outside components
- `rendering-conditional-render` - Use ternary, not && for conditionals

### 5. JavaScript Performance (LOW-MEDIUM)

- `js-batch-dom-css` - Group CSS changes via classes or cssText
- `js-index-maps` - Build Map for repeated lookups
- `js-combine-iterations` - Combine multiple filter/map into one loop
- `js-early-exit` - Return early from functions
- `js-set-map-lookups` - Use Set/Map for O(1) lookups
