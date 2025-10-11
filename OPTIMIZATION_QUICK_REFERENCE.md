# Performance Optimization Quick Reference

## Build Commands

```bash
# Development build (with source maps)
npm run dev

# Production build (optimized)
npm run build

# View bundle analysis
npm run build && open dist/stats.html

# Preview production build
npm run preview
```

## Key Performance Features

### 1. Code Splitting
- ✅ Route-based splitting (lazy loading)
- ✅ Vendor chunk separation
- ✅ Charts library split (290 KB separate)
- ✅ Utils and dependencies split

### 2. React Optimizations
- ✅ React.memo on Dashboard
- ✅ useCallback for event handlers
- ✅ useMemo for computed values
- ✅ Lazy loading for routes

### 3. Asset Optimizations
- ✅ System fonts (zero download)
- ✅ CSS code splitting
- ✅ GPU-accelerated animations
- ✅ Optimized images with service worker

### 4. PWA Caching
- ✅ API: NetworkFirst (24h fallback)
- ✅ Images: CacheFirst (1 year)
- ✅ Fonts: CacheFirst (1 year)
- ✅ External: StaleWhileRevalidate (7 days)

## Bundle Size Targets

| Chunk | Target | Current | Status |
|-------|--------|---------|--------|
| Main | < 50 KB | 32.89 KB | ✅ |
| React | < 200 KB | 174.68 KB | ✅ |
| Charts | < 350 KB | 290.84 KB | ✅ |
| Routes | < 20 KB | 5-19 KB | ✅ |
| CSS | < 60 KB | 49.89 KB | ✅ |

## Performance Checklist

### Before Deployment
- [ ] Run `npm run build`
- [ ] Check bundle sizes in dist/
- [ ] Review dist/stats.html
- [ ] Test offline functionality
- [ ] Verify lazy loading works

### After Deployment
- [ ] Run Lighthouse audit
- [ ] Check Core Web Vitals
- [ ] Test on mobile devices
- [ ] Monitor loading times
- [ ] Check PWA installability

## Common Performance Patterns

### Adding a New Route Component
```javascript
// ❌ Don't: Import directly
import NewPage from './pages/NewPage.jsx';

// ✅ Do: Lazy load
const NewPage = lazy(() => import('./pages/NewPage.jsx'));

// Add to routes with Suspense wrapper (already in place)
<Route path="/new" element={<NewPage />} />
```

### Adding a New Heavy Component
```javascript
// ❌ Don't: Import at top level
import HeavyChart from './components/HeavyChart.jsx';

// ✅ Do: Lazy load conditionally
const HeavyChart = lazy(() => import('./components/HeavyChart.jsx'));

function MyComponent() {
  const [showChart, setShowChart] = useState(false);

  return (
    <>
      <button onClick={() => setShowChart(true)}>Show Chart</button>
      {showChart && (
        <Suspense fallback={<div>Loading...</div>}>
          <HeavyChart />
        </Suspense>
      )}
    </>
  );
}
```

### Optimizing Event Handlers
```javascript
// ❌ Don't: Create functions inline
<button onClick={() => handleClick(id)}>Click</button>

// ✅ Do: Use useCallback
const handleClick = useCallback((id) => {
  // handler logic
}, []);

<button onClick={() => handleClick(id)}>Click</button>
```

### Optimizing Computed Values
```javascript
// ❌ Don't: Compute on every render
function MyComponent({ data }) {
  const filtered = data.filter(item => item.active); // Recalculates on every render
  const sorted = filtered.sort((a, b) => b.value - a.value);

  return <List items={sorted} />;
}

// ✅ Do: Use useMemo
function MyComponent({ data }) {
  const filtered = useMemo(
    () => data.filter(item => item.active),
    [data]
  );

  const sorted = useMemo(
    () => filtered.sort((a, b) => b.value - a.value),
    [filtered]
  );

  return <List items={sorted} />;
}
```

### Optimizing Child Components
```javascript
// ❌ Don't: Re-render on parent change
function ChildComponent({ name }) {
  return <div>{name}</div>;
}

// ✅ Do: Memoize child component
const ChildComponent = memo(({ name }) => {
  return <div>{name}</div>;
});
```

## Troubleshooting

### Bundle Size Increasing
1. Run `npm run build`
2. Open `dist/stats.html`
3. Identify large dependencies
4. Consider:
   - Lazy loading
   - Tree shaking
   - Alternative lighter libraries

### Slow Page Loads
1. Check Network tab in DevTools
2. Look for:
   - Large chunks loading
   - Blocking resources
   - Slow API calls
3. Solutions:
   - Add loading states
   - Implement prefetching
   - Optimize API responses

### Poor Mobile Performance
1. Test on actual devices
2. Use Chrome DevTools throttling
3. Check:
   - JavaScript parsing time
   - Layout shift issues
   - Touch responsiveness
4. Solutions:
   - Reduce bundle size
   - Use CSS transforms (not layout props)
   - Add passive event listeners

### Service Worker Issues
1. Clear cache: DevTools → Application → Clear Storage
2. Unregister: DevTools → Application → Service Workers
3. Hard reload: Cmd/Ctrl + Shift + R
4. Check: Network tab → "Disable cache" option

## Monitoring Tools

### Development
- Vite bundle analyzer (dist/stats.html)
- React DevTools Profiler
- Chrome DevTools Performance tab
- Network throttling

### Production
- Lighthouse (Chrome DevTools)
- Google Search Console (Core Web Vitals)
- Chrome User Experience Report
- Real User Monitoring (RUM)

## Additional Resources

- [Performance Optimizations Report](./PERFORMANCE_OPTIMIZATIONS.md) - Detailed analysis
- [Web.dev Performance](https://web.dev/performance/) - Best practices
- [React Performance](https://react.dev/learn/render-and-commit) - Official docs
- [Vite Performance](https://vitejs.dev/guide/performance.html) - Build optimization

---

**Last Updated:** 2025-10-10
**Next Review:** After major feature additions or dependency updates
