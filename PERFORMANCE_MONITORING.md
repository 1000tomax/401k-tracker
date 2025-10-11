# Performance Monitoring System

Comprehensive performance monitoring for the 401K-Tracker application, tracking Web Vitals, API performance, bundle sizes, and custom business metrics.

## Features

### 1. Web Vitals Tracking (Core Web Vitals)

Monitors key performance metrics defined by Google:

- **LCP (Largest Contentful Paint)**: Time to render largest content element
  - Good: < 2.5s
  - Needs Improvement: 2.5s - 4.0s
  - Poor: > 4.0s

- **CLS (Cumulative Layout Shift)**: Visual stability score
  - Good: < 0.1
  - Needs Improvement: 0.1 - 0.25
  - Poor: > 0.25

- **INP (Interaction to Next Paint)**: Responsiveness to user interactions (replaces FID)
  - Good: < 200ms
  - Needs Improvement: 200ms - 500ms
  - Poor: > 500ms

- **FCP (First Contentful Paint)**: Time to render first content
  - Good: < 1.8s
  - Needs Improvement: 1.8s - 3.0s
  - Poor: > 3.0s

- **TTFB (Time to First Byte)**: Server response time
  - Good: < 800ms
  - Needs Improvement: 800ms - 1800ms
  - Poor: > 1800ms

> **Note**: FID (First Input Delay) has been replaced by INP (Interaction to Next Paint) as of web-vitals v4. INP provides a more comprehensive measure of page responsiveness.

### 2. Real User Monitoring (RUM)

Tracks actual user behavior and experience:

- **Session tracking**: Duration, pages viewed, interactions
- **User interactions**: Clicks, form submissions, scroll depth
- **Device information**: Browser, platform, screen size
- **Network conditions**: Connection type, speed, online/offline status
- **Memory usage**: JavaScript heap size monitoring
- **Error tracking**: JavaScript errors, unhandled rejections, resource failures

### 3. API Performance Tracking

Monitors backend API calls:

- **Request/response times**: Average, P50, P75, P90, P95, P99 percentiles
- **Success rates**: Overall success vs failure rates
- **Status code distribution**: 2xx, 4xx, 5xx tracking
- **Endpoint analysis**: Performance by API endpoint
- **Slow request detection**: Automatic flagging of slow queries (> 3s)
- **Failed request logging**: Detailed error tracking

### 4. Bundle Size Analysis

Tracks JavaScript bundle sizes:

- **Total bundle size**: Compressed and uncompressed sizes
- **By file type**: JS, CSS, images, fonts
- **Compression ratio**: Gzip/Brotli effectiveness
- **Largest bundles**: Top 10 largest files
- **Third-party resources**: External dependencies tracking
- **Size trends**: Historical bundle size tracking
- **Regression detection**: Automatic alerts for size increases > 10%

### 5. Performance Budgets

Enforces performance limits:

- **Resource size budgets**: JS, CSS, images, fonts, total page weight
- **Resource count budgets**: Maximum number of files by type
- **Timing budgets**: FCP, LCP, TTI, Speed Index, TBT limits
- **Budget violations**: Automatic detection with severity levels (minor, warning, critical)
- **CI/CD integration**: Build fails on critical violations

### 6. Custom Metrics

Application-specific performance tracking:

- **Portfolio calculation time**: How long to compute holdings
- **Data load time**: Time to fetch and process data
- **Chart render time**: Visualization performance
- **CSV export time**: Export operation duration
- **Plaid connection time**: Authentication flow performance

## Installation

The monitoring system is already installed and integrated. No additional setup required.

## Usage

### Accessing the Performance Dashboard

In **development mode only**, visit: `http://localhost:5173/performance`

The dashboard provides:
- Real-time performance metrics
- Health check status
- Detailed breakdowns by category
- Export functionality

### Programmatic Access

Access monitoring tools from anywhere in your code:

```javascript
import performanceMonitor from './utils/performance/PerformanceMonitor';

// Get comprehensive report
const report = await performanceMonitor.getReport();

// Get quick health check
const health = await performanceMonitor.getHealthCheck();

// Download full report
performanceMonitor.downloadReport();

// Clear all data
performanceMonitor.clearAll();
```

### Individual Monitoring Tools

```javascript
import {
  webVitalsMonitor,
  realUserMonitoring,
  apiPerformanceTracker,
  customMetrics,
  bundleAnalyzer,
  performanceBudget,
} from './utils/performance/PerformanceMonitor';

// Web Vitals
const vitals = webVitalsMonitor.getSummary();

// RUM Session
const session = realUserMonitoring.getCurrentSession();

// API Stats
const apiStats = apiPerformanceTracker.getStatistics();

// Custom Metrics
customMetrics.start('my-operation');
// ... do work ...
customMetrics.end('my-operation');
```

### Tracking Custom Metrics

For portfolio-specific operations:

```javascript
import { customMetrics } from './utils/performance/PerformanceMonitor';

// Track portfolio calculation
const tracker = customMetrics.portfolioMetrics.trackCalculation(holdings);
const result = calculatePortfolio(holdings);
tracker.end(result);

// Track data load
const loadTracker = customMetrics.portfolioMetrics.trackDataLoad('plaid');
const data = await fetchData();
loadTracker.end(data.length);

// Track chart render
const chartTracker = customMetrics.portfolioMetrics.trackChartRender('line', dataPoints.length);
renderChart(data);
chartTracker.end();
```

## Build Scripts

### Analyze Bundle After Build

```bash
npm run build:analyze
```

This will:
1. Build the production bundle
2. Analyze bundle sizes
3. Check against performance budgets
4. Display detailed size breakdown
5. Exit with error if budgets are violated

### Analyze Existing Build

```bash
npm run perf:analyze
```

Analyzes the current `dist/` directory without rebuilding.

### View Bundle Visualizer

After building, open `dist/stats.html` in your browser to see an interactive bundle visualization powered by rollup-plugin-visualizer.

## Performance Budgets Configuration

Budgets are defined in `performance-budgets.json`:

```json
{
  "budget": {
    "resourceSizes": [
      { "resourceType": "script", "budget": 600 },
      { "resourceType": "stylesheet", "budget": 50 },
      { "resourceType": "total", "budget": 1000 }
    ],
    "timings": [
      { "metric": "first-contentful-paint", "budget": 1800 },
      { "metric": "largest-contentful-paint", "budget": 2500 }
    ]
  }
}
```

Adjust these values based on your performance requirements.

## Analytics Integration

The monitoring system is designed to be analytics-agnostic but includes integration points for:

### Google Analytics 4

Uncomment integration code in monitoring files and ensure `gtag` is loaded:

```javascript
// Automatically sends Web Vitals and custom metrics
window.gtag('event', 'web_vitals', {
  metric: 'LCP',
  value: 2400,
  rating: 'good'
});
```

### Plausible Analytics

Uncomment integration code and ensure Plausible script is loaded:

```javascript
window.plausible('Web Vitals', {
  props: {
    metric: 'LCP',
    value: 2400,
    rating: 'good'
  }
});
```

### Cloudflare Analytics

Cloudflare Web Analytics provides basic pageview tracking. For custom metrics, implement a Cloudflare Worker endpoint:

```javascript
// POST /api/analytics/web-vitals
fetch('/api/analytics/web-vitals', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(metric)
});
```

### Custom Endpoint

Uncomment the custom endpoint code in monitoring files and implement your backend:

```javascript
// Example endpoint to receive metrics
POST /api/analytics/web-vitals
POST /api/analytics/api-performance
POST /api/analytics/custom-metrics
POST /api/analytics/session
POST /api/analytics/error
```

## Console Logging

In **development mode**, the monitoring system logs detailed information:

- ✅ Good metrics (green)
- ⚠️ Metrics needing improvement (orange)
- ❌ Poor metrics (red)
- 🔍 Debug information
- 📊 Statistics summaries

In **production mode**, logging is minimized to reduce performance impact.

## Browser DevTools Integration

Access monitoring data via browser console in development:

```javascript
// Access the monitoring instance
__performanceMonitor.getReport()
__performanceMonitor.getHealthCheck()
__performanceMonitor.webVitals.getMetrics()
__performanceMonitor.api.getStatistics()
__performanceMonitor.metrics.getAllStats()
```

## Performance Recommendations

### JavaScript Bundle Size
- **Current limit**: 600 KB (gzipped)
- Keep code-splitting effective by using lazy loading
- Review `dist/stats.html` to identify large dependencies
- Consider alternatives to large libraries

### CSS Bundle Size
- **Current limit**: 50 KB (gzipped)
- Use CSS-in-JS sparingly
- Remove unused styles
- Consider critical CSS extraction

### Images
- **Current limit**: 200 KB total
- Use WebP or AVIF formats
- Implement lazy loading for off-screen images
- Serve appropriately sized images

### API Performance
- **Target**: < 1s average response time, < 3s P95
- Implement caching where appropriate
- Consider GraphQL to reduce over-fetching
- Monitor slow endpoints and optimize queries

### Web Vitals
- **LCP**: Optimize largest content element, consider lazy loading
- **INP**: Optimize event handlers, reduce JavaScript execution time, break up long tasks
- **CLS**: Reserve space for dynamic content, avoid layout shifts
- **FCP**: Optimize critical rendering path, inline critical CSS
- **TTFB**: Improve server response time, use CDN, enable caching

## Monitoring in Production

### What's Tracked in Production

- All Web Vitals metrics (sent on page unload)
- Failed API requests (immediate)
- JavaScript errors (immediate)
- Session summaries (on session end)
- Custom metrics (sent in batches)

### What's NOT Tracked

- Console logs (stripped during build)
- Verbose debug information
- Individual user interactions (privacy)
- Personally identifiable information (PII)

### Privacy Considerations

The monitoring system is designed with privacy in mind:

- No external analytics services by default
- All data stored locally in browser
- No cookies or tracking pixels
- No PII collected
- Session IDs are random and not linked to users

To comply with privacy regulations:
- No GDPR consent required (no external tracking)
- No CCPA disclosure needed (no data sale)
- User data never leaves their browser (unless you add analytics)

## Troubleshooting

### Performance Dashboard Not Showing

The dashboard is only available in development mode. Ensure:
- You're running `npm run dev`
- Visit `http://localhost:5173/performance`

### No Metrics Showing

- Refresh the page to trigger Web Vitals collection
- Interact with the page to generate FID/INP metrics
- Make API calls to populate API performance data

### Build Failing Due to Budget Violations

1. Run `npm run perf:analyze` to see which budgets are exceeded
2. Review `dist/stats.html` for bundle visualization
3. Consider:
   - Lazy loading more components
   - Removing unused dependencies
   - Using smaller alternatives
   - Adjusting budgets (if justified)

### Memory Leaks

The monitoring system limits stored data:
- Last 100 Web Vitals measurements
- Last 200 API requests
- Last 100 sessions
- Last 50 bundle analyses

Older data is automatically discarded to prevent memory leaks.

## Development vs Production

| Feature | Development | Production |
|---------|-------------|------------|
| Console Logging | ✅ Verbose | ❌ Minimal |
| Performance Dashboard | ✅ Available at /performance | ❌ Not available |
| Bundle Visualizer | ✅ Generated | ❌ Not generated |
| Analytics Sending | ❌ Disabled | ✅ Enabled (if configured) |
| Error Details | ✅ Full stack traces | ⚠️ Limited details |

## Future Enhancements

Potential additions:

- [ ] Server-side rendering (SSR) performance tracking
- [ ] Long task detection and reporting
- [ ] Memory leak detection
- [ ] Network waterfall visualization
- [ ] A/B testing integration
- [ ] Performance regression testing in CI
- [ ] Real-time alerting for production issues
- [ ] Historical trend analysis
- [ ] Correlation with business metrics
- [ ] User flow performance tracking

## Resources

- [Web Vitals Documentation](https://web.dev/vitals/)
- [Performance Budgets Guide](https://web.dev/performance-budgets-101/)
- [Chrome DevTools Performance](https://developer.chrome.com/docs/devtools/performance/)
- [Lighthouse CI](https://github.com/GoogleChrome/lighthouse-ci)

## Support

For issues or questions:
1. Check browser console for errors
2. Review `PERFORMANCE_MONITORING.md` (this file)
3. Examine monitoring code in `src/utils/performance/`
4. Open an issue with performance report attached
