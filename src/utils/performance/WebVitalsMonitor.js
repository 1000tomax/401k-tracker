/**
 * Web Vitals Performance Monitor
 *
 * Tracks Core Web Vitals and custom performance metrics
 * - LCP: Largest Contentful Paint
 * - FID: First Input Delay
 * - CLS: Cumulative Layout Shift
 * - FCP: First Contentful Paint
 * - TTFB: Time to First Byte
 * - INP: Interaction to Next Paint (new metric replacing FID)
 */

import { onCLS, onFCP, onLCP, onTTFB, onINP } from 'web-vitals';

class WebVitalsMonitor {
  constructor() {
    this.metrics = {};
    this.listeners = [];
    this.isProduction = import.meta.env.PROD;
    this.isDevelopment = import.meta.env.DEV;

    // Performance thresholds based on Google's recommendations
    this.thresholds = {
      LCP: { good: 2500, needsImprovement: 4000 },
      CLS: { good: 0.1, needsImprovement: 0.25 },
      FCP: { good: 1800, needsImprovement: 3000 },
      TTFB: { good: 800, needsImprovement: 1800 },
      INP: { good: 200, needsImprovement: 500 },
    };
  }

  /**
   * Initialize Web Vitals tracking
   */
  init() {
    // Track all Core Web Vitals
    onLCP(this.handleMetric.bind(this, 'LCP'));
    onCLS(this.handleMetric.bind(this, 'CLS'));
    onFCP(this.handleMetric.bind(this, 'FCP'));
    onTTFB(this.handleMetric.bind(this, 'TTFB'));
    onINP(this.handleMetric.bind(this, 'INP')); // INP replaces FID in web-vitals v4

    // Track navigation timing
    this.trackNavigationTiming();

    // Track resource timing
    this.trackResourceTiming();

    if (this.isDevelopment) {
      console.log('🔍 Web Vitals Monitor initialized');
    }
  }

  /**
   * Handle metric callback from web-vitals
   */
  handleMetric(metricName, metric) {
    const value = metric.value;
    const rating = this.getRating(metricName, value);

    const metricData = {
      name: metricName,
      value,
      rating,
      delta: metric.delta,
      id: metric.id,
      timestamp: Date.now(),
      navigationType: metric.navigationType || 'unknown',
    };

    // Store metric
    this.metrics[metricName] = metricData;

    // Log in development
    if (this.isDevelopment) {
      this.logMetric(metricData);
    }

    // Notify listeners
    this.notifyListeners(metricData);

    // Send to analytics (if configured)
    this.sendToAnalytics(metricData);
  }

  /**
   * Get performance rating based on thresholds
   */
  getRating(metricName, value) {
    const threshold = this.thresholds[metricName];
    if (!threshold) return 'unknown';

    if (value <= threshold.good) return 'good';
    if (value <= threshold.needsImprovement) return 'needs-improvement';
    return 'poor';
  }

  /**
   * Log metric to console (development only)
   */
  logMetric(metric) {
    const emoji = {
      good: '✅',
      'needs-improvement': '⚠️',
      poor: '❌',
      unknown: '❓',
    }[metric.rating];

    const color = {
      good: 'color: green',
      'needs-improvement': 'color: orange',
      poor: 'color: red',
      unknown: 'color: gray',
    }[metric.rating];

    console.log(
      `%c${emoji} ${metric.name}: ${metric.value.toFixed(2)}ms (${metric.rating})`,
      color
    );
  }

  /**
   * Track Navigation Timing API metrics
   */
  trackNavigationTiming() {
    if (typeof window === 'undefined' || !window.performance) return;

    // Wait for page load to complete
    window.addEventListener('load', () => {
      setTimeout(() => {
        const navigation = performance.getEntriesByType('navigation')[0];
        if (!navigation) return;

        const timings = {
          dns: navigation.domainLookupEnd - navigation.domainLookupStart,
          tcp: navigation.connectEnd - navigation.connectStart,
          request: navigation.responseStart - navigation.requestStart,
          response: navigation.responseEnd - navigation.responseStart,
          dom: navigation.domContentLoadedEventEnd - navigation.domContentLoadedEventStart,
          load: navigation.loadEventEnd - navigation.loadEventStart,
          total: navigation.loadEventEnd - navigation.fetchStart,
        };

        this.metrics.navigationTiming = {
          name: 'NavigationTiming',
          timings,
          timestamp: Date.now(),
        };

        if (this.isDevelopment) {
          console.log('📊 Navigation Timing:', timings);
        }

        this.notifyListeners(this.metrics.navigationTiming);
      }, 0);
    });
  }

  /**
   * Track Resource Timing API metrics
   */
  trackResourceTiming() {
    if (typeof window === 'undefined' || !window.performance) return;

    window.addEventListener('load', () => {
      setTimeout(() => {
        const resources = performance.getEntriesByType('resource');

        const resourceStats = {
          total: resources.length,
          byType: {},
          totalSize: 0,
          totalDuration: 0,
          largest: null,
          slowest: null,
        };

        resources.forEach(resource => {
          const type = resource.initiatorType || 'other';
          const size = resource.transferSize || 0;
          const duration = resource.duration;

          // Count by type
          resourceStats.byType[type] = (resourceStats.byType[type] || 0) + 1;

          // Sum totals
          resourceStats.totalSize += size;
          resourceStats.totalDuration += duration;

          // Track largest resource
          if (!resourceStats.largest || size > resourceStats.largest.size) {
            resourceStats.largest = {
              name: resource.name,
              size,
              type,
            };
          }

          // Track slowest resource
          if (!resourceStats.slowest || duration > resourceStats.slowest.duration) {
            resourceStats.slowest = {
              name: resource.name,
              duration,
              type,
            };
          }
        });

        this.metrics.resourceTiming = {
          name: 'ResourceTiming',
          stats: resourceStats,
          timestamp: Date.now(),
        };

        if (this.isDevelopment) {
          console.log('📦 Resource Timing:', resourceStats);
        }

        this.notifyListeners(this.metrics.resourceTiming);
      }, 1000);
    });
  }

  /**
   * Add listener for metric updates
   */
  addListener(callback) {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter(cb => cb !== callback);
    };
  }

  /**
   * Notify all listeners of metric update
   */
  notifyListeners(metric) {
    this.listeners.forEach(listener => {
      try {
        listener(metric);
      } catch (error) {
        console.error('Error in performance listener:', error);
      }
    });
  }

  /**
   * Send metric to analytics service
   * This is a placeholder - implement with your analytics provider
   */
  sendToAnalytics(metric) {
    // Example integration points:

    // Google Analytics 4
    if (typeof window !== 'undefined' && window.gtag) {
      window.gtag('event', metric.name, {
        event_category: 'Web Vitals',
        event_label: metric.id,
        value: Math.round(metric.value),
        metric_rating: metric.rating,
        non_interaction: true,
      });
    }

    // Plausible Analytics
    if (typeof window !== 'undefined' && window.plausible) {
      window.plausible('Web Vitals', {
        props: {
          metric: metric.name,
          value: Math.round(metric.value),
          rating: metric.rating,
        },
      });
    }

    // Cloudflare Web Analytics (only supports pageview tracking)
    // Custom metrics would need to be sent via Cloudflare Workers

    // Custom endpoint (implement your own)
    if (this.isProduction && window.fetch) {
      // Uncomment and configure when ready
      /*
      fetch('/api/analytics/web-vitals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(metric),
        keepalive: true, // Ensure beacon sends even during unload
      }).catch(err => {
        console.error('Failed to send web vitals:', err);
      });
      */
    }
  }

  /**
   * Get all collected metrics
   */
  getMetrics() {
    return { ...this.metrics };
  }

  /**
   * Get summary report
   */
  getSummary() {
    const coreVitals = ['LCP', 'CLS', 'FCP', 'TTFB', 'INP'];
    const summary = {
      timestamp: Date.now(),
      metrics: {},
      overallRating: 'unknown',
    };

    let goodCount = 0;
    let poorCount = 0;
    let totalCount = 0;

    coreVitals.forEach(name => {
      if (this.metrics[name]) {
        summary.metrics[name] = {
          value: this.metrics[name].value,
          rating: this.metrics[name].rating,
        };

        if (this.metrics[name].rating === 'good') goodCount++;
        if (this.metrics[name].rating === 'poor') poorCount++;
        totalCount++;
      }
    });

    // Determine overall rating
    if (totalCount > 0) {
      if (goodCount === totalCount) {
        summary.overallRating = 'good';
      } else if (poorCount > 0) {
        summary.overallRating = 'poor';
      } else {
        summary.overallRating = 'needs-improvement';
      }
    }

    return summary;
  }

  /**
   * Reset all metrics
   */
  reset() {
    this.metrics = {};
    if (this.isDevelopment) {
      console.log('🔄 Performance metrics reset');
    }
  }
}

// Create singleton instance
const webVitalsMonitor = new WebVitalsMonitor();

export default webVitalsMonitor;
