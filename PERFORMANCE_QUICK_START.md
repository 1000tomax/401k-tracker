# Performance Monitoring - Quick Start Guide

## 🚀 What's Been Added

A comprehensive performance monitoring system for the 401K-Tracker application that tracks:

- **Web Vitals**: LCP, CLS, INP, FCP, TTFB
- **Real User Monitoring**: Session tracking, interactions, errors
- **API Performance**: Request times, success rates, slow queries
- **Bundle Analysis**: Size tracking, regression detection
- **Custom Metrics**: Portfolio calculations, data loads, chart renders

## 📊 Accessing the Dashboard

**Development Only**: Visit `http://localhost:5173/performance`

The dashboard shows:
- Real-time performance health check
- Web Vitals metrics with ratings (good/needs-improvement/poor)
- API performance statistics (P50, P75, P90, P95, P99)
- Bundle size trends
- Performance budget compliance
- Custom application metrics

## 🛠️ Using the Monitoring System

### In Development

```bash
# Start dev server with monitoring enabled
npm run dev

# Visit /performance to see the dashboard
open http://localhost:5173/performance
```

### Build with Performance Analysis

```bash
# Build and analyze bundle sizes
npm run build:analyze

# Analyze existing build
npm run perf:analyze
```

### In Your Code

```javascript
import { customMetrics } from './utils/performance/PerformanceMonitor';

// Track portfolio calculation
const tracker = customMetrics.portfolioMetrics.trackCalculation(holdings);
const result = calculatePortfolio(holdings);
tracker.end(result);

// Track any custom operation
customMetrics.start('my-operation');
// ... do work ...
customMetrics.end('my-operation');

// Record instant metric
customMetrics.record('items-processed', 100, { type: 'portfolio' });
```

## 📦 What's Installed

### New Files Created

```
src/utils/performance/
├── PerformanceMonitor.js          # Main entry point
├── WebVitalsMonitor.js            # Core Web Vitals tracking
├── RealUserMonitoring.js          # Session & interaction tracking
├── ApiPerformanceTracker.js       # API request monitoring
├── CustomMetrics.js               # Application-specific metrics
├── BundleAnalyzer.js              # Bundle size analysis
└── PerformanceBudget.js           # Budget enforcement

src/components/
└── PerformanceDashboard.jsx       # Dashboard UI (dev only)

scripts/
└── analyze-bundle.js              # Build-time bundle analyzer

performance-budgets.json           # Performance budget config
PERFORMANCE_MONITORING.md          # Full documentation
PERFORMANCE_QUICK_START.md         # This file
```

### Updated Files

- `src/main.jsx`: Added performance monitor initialization
- `src/App.jsx`: Added /performance route (dev only)
- `package.json`: Added new scripts (`build:analyze`, `perf:analyze`)

### New Dependencies

- `web-vitals@^5.1.0`: Core Web Vitals library

## 🎯 Key Features

### 1. Automatic Tracking

Performance monitoring starts automatically when the app loads:
- Web Vitals collected on page load and interactions
- API calls intercepted and timed automatically
- Errors tracked and logged
- Session data collected throughout user journey

### 2. Performance Budgets

Enforces size and timing limits:
- JS: 800 KB (94% used)
- CSS: 60 KB (88% used)
- Images: 200 KB (33% used)
- Total: 1400 KB (95% used)

Violations trigger warnings in development and can fail CI builds.

### 3. Privacy-Focused

- No external analytics by default
- All data stored locally in browser
- No cookies or tracking
- No PII collected
- Easy to integrate with analytics later

### 4. Analytics Integration Ready

Built-in integration points for:
- Google Analytics 4
- Plausible Analytics
- Cloudflare Analytics
- Custom endpoints

Simply uncomment the relevant code in monitoring files.

## 📈 Current Performance Status

### Bundle Sizes (Build Output)

```
JavaScript:  755 KB (15 files)    [✅ 94.4% of budget]
CSS:          53 KB (2 files)     [✅ 88.3% of budget]
Images:       66 KB (12 files)    [✅ 32.9% of budget]
Total:      1.30 MB (34 files)    [✅ 95.1% of budget]
```

### Gzipped Sizes (Actual Delivery)

- Total JS: ~250 KB (gzipped)
- Total CSS: ~10 KB (gzipped)
- Total Page: ~400 KB (gzipped)

### Largest Bundles

1. **charts-M8cYCTD-.js** (284 KB) - Recharts library
2. **react-vendor-Bfcvt8bx.js** (171 KB) - React + React Router
3. **vendor-ksvmjbBW.js** (107 KB) - Other dependencies
4. **index-CYacSL_c.js** (61 KB) - Main app code

## 🔍 Monitoring in Different Environments

### Development
- Full console logging with colors
- Performance dashboard at /performance
- Detailed debug information
- Bundle visualizer at dist/stats.html

### Production
- Minimal logging (errors only)
- No performance dashboard
- Metrics collected silently
- Ready for analytics integration

## 🎨 Using Custom Metrics

### Portfolio Operations

```javascript
import { customMetrics } from './utils/performance/PerformanceMonitor';

// Track calculation time
const calc = customMetrics.portfolioMetrics.trackCalculation(holdings, {
  accountCount: 3
});
const result = computePortfolio(holdings);
calc.end(result);

// Track data loading
const load = customMetrics.portfolioMetrics.trackDataLoad('plaid', {
  accountId: 'acc_123'
});
const data = await fetchPlaidData();
load.end(data.length);

// Track chart rendering
const chart = customMetrics.portfolioMetrics.trackChartRender('line', 365);
renderLineChart(data);
chart.end();
```

### Generic Operations

```javascript
// Start timing
customMetrics.start('export-csv', { format: 'csv', rows: 1000 });

// ... do work ...

// End timing with additional metadata
customMetrics.end('export-csv', { fileSize: 50000, success: true });

// Or measure a function
const result = await customMetrics.measure('api-call', async () => {
  return await fetch('/api/data');
}, { endpoint: '/api/data' });
```

## 📊 Accessing Metrics Programmatically

```javascript
// In browser console (development only)
__performanceMonitor.getReport()
__performanceMonitor.getHealthCheck()
__performanceMonitor.downloadReport()

// Get specific monitoring tools
__performanceMonitor.webVitals.getSummary()
__performanceMonitor.api.getStatistics()
__performanceMonitor.metrics.getAllStats()
__performanceMonitor.bundles.getTrends()
```

## 🚨 Performance Budget Violations

If a build fails due to budget violations:

1. **Check what exceeded**:
   ```bash
   npm run perf:analyze
   ```

2. **View bundle composition**:
   - Open `dist/stats.html` in browser
   - Identify large dependencies

3. **Fix or adjust**:
   - Lazy load components
   - Remove unused dependencies
   - Use smaller alternatives
   - Or adjust budgets in `performance-budgets.json`

## 📝 Console Output Examples

### Development Mode

```
🔍 Web Vitals Monitor initialized
👤 Real User Monitoring initialized
🌐 API Performance Tracker initialized

✅ LCP: 1823.45ms (good)
✅ CLS: 0.08 (good)
⚠️ INP: 320.12ms (needs-improvement)
✅ FCP: 1456.78ms (good)
✅ TTFB: 654.32ms (good)

⚡ GET /api/holdings - 245.67ms (200)
🐌 GET /api/transactions - 3245.12ms (200)

📊 Metric [portfolio-calculation]: 45.23ms
```

### Build Analysis

```
📦 Bundle Analysis

Bundle Sizes:
  JavaScript:  755.14 KB (15 files)
  CSS:         52.96 KB (2 files)
  Images:      65.84 KB (12 files)
  Total:       1.30 MB (34 files)

Budget Compliance:
  ✅ JavaScript: 755.14 KB / 800 KB (94.4%)
  ✅ CSS: 52.96 KB / 60 KB (88.3%)
  ✅ Images: 65.84 KB / 200 KB (32.9%)
  ✅ Total: 1.30 MB / 1400 KB (95.1%)

✅ All budgets met!
```

## 🔧 Troubleshooting

### Dashboard not showing
- Ensure you're in development mode (`npm run dev`)
- Check that you're visiting `/performance` path
- Look for errors in browser console

### No metrics appearing
- Refresh the page to trigger collection
- Interact with the page (INP requires user interaction)
- Make API calls to populate API stats

### Build failures
- Run `npm run perf:analyze` to diagnose
- Check `dist/stats.html` for visualization
- Review and adjust budgets if needed

## 📚 Additional Resources

- **Full Documentation**: See `PERFORMANCE_MONITORING.md`
- **Web Vitals Guide**: https://web.dev/vitals/
- **Performance Budgets**: https://web.dev/performance-budgets-101/

## 🎯 Next Steps

1. **Run the app**: `npm run dev`
2. **Visit dashboard**: http://localhost:5173/performance
3. **Interact with app**: Navigate, load data, interact
4. **Review metrics**: Check health status and metrics
5. **Export report**: Download JSON for analysis
6. **Integrate analytics**: Uncomment integration code if desired

## ✅ Summary

The performance monitoring system is fully integrated and operational. It provides:

- **Real-time insights** into application performance
- **Historical tracking** of metrics over time
- **Budget enforcement** to prevent regressions
- **Privacy-focused** design with no external tracking
- **Easy integration** with popular analytics platforms

All monitoring happens automatically - no additional code changes needed unless you want to track custom operations!
