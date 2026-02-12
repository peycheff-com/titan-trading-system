# Performance & Cost: M11 (Titan Console)

## Performance Budgets
- **First Contentful Paint (FCP)**: < 1.0s
- **Time to Interactive (TTI)**: < 1.5s
- **Input Delay**: < 100ms (Optimistic updates)

## Rendering
- **React**: version 18 (Concurrent features enabled)
- **State**: React Query (Cache hydration < 50ms)

## Bundle Size
- **Target**: < 500KB (Gzipped) initial chunk
- **Code Splitting**: Route-based (Lazy loading pages)

## Cost
- **Hosting**: Static site hosting (DigitalOcean App Platform)
- **Compute**: Client-side (User's device)
