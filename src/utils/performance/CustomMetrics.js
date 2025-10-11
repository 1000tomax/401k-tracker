/**
 * Custom Performance Metrics
 *
 * Application-specific performance tracking:
 * - Portfolio calculation time
 * - Data load performance
 * - Component render times
 * - User action latency
 * - Business metrics
 */

class CustomMetrics {
  constructor() {
    this.metrics = new Map();
    this.timers = new Map();
    this.isDevelopment = import.meta.env.DEV;
    this.isProduction = import.meta.env.PROD;
  }

  /**
   * Start timing a metric
   */
  start(metricName, metadata = {}) {
    const startTime = performance.now();
    const startMark = `${metricName}-start`;

    // Use Performance API marks
    if (typeof performance !== 'undefined' && performance.mark) {
      performance.mark(startMark);
    }

    this.timers.set(metricName, {
      startTime,
      startMark,
      metadata,
    });

    if (this.isDevelopment) {
      console.log(`⏱️  Started timing: ${metricName}`);
    }
  }

  /**
   * End timing a metric
   */
  end(metricName, additionalMetadata = {}) {
    const timer = this.timers.get(metricName);
    if (!timer) {
      console.warn(`No timer found for metric: ${metricName}`);
      return null;
    }

    const endTime = performance.now();
    const duration = endTime - timer.startTime;
    const endMark = `${metricName}-end`;

    // Use Performance API marks and measures
    if (typeof performance !== 'undefined' && performance.mark) {
      performance.mark(endMark);
      try {
        performance.measure(metricName, timer.startMark, endMark);
      } catch (error) {
        // Ignore if marks don't exist
      }
    }

    const metric = {
      name: metricName,
      duration,
      timestamp: Date.now(),
      ...timer.metadata,
      ...additionalMetadata,
    };

    this.recordMetric(metric);
    this.timers.delete(metricName);

    return metric;
  }

  /**
   * Record a metric value
   */
  recordMetric(metric) {
    // Get or create metric history
    if (!this.metrics.has(metric.name)) {
      this.metrics.set(metric.name, []);
    }

    const history = this.metrics.get(metric.name);
    history.push(metric);

    // Keep last 100 measurements
    if (history.length > 100) {
      history.shift();
    }

    if (this.isDevelopment) {
      this.logMetric(metric);
    }

    // Send to analytics
    this.sendToAnalytics(metric);
  }

  /**
   * Record instant metric (no timing needed)
   */
  record(metricName, value, metadata = {}) {
    const metric = {
      name: metricName,
      value,
      timestamp: Date.now(),
      ...metadata,
    };

    this.recordMetric(metric);
    return metric;
  }

  /**
   * Time a function execution
   */
  async measure(metricName, fn, metadata = {}) {
    this.start(metricName, metadata);

    try {
      const result = await fn();
      this.end(metricName, { success: true });
      return result;
    } catch (error) {
      this.end(metricName, { success: false, error: error.message });
      throw error;
    }
  }

  /**
   * Portfolio-specific metrics
   */
  portfolioMetrics = {
    /**
     * Track portfolio calculation time
     */
    trackCalculation: (holdings, metadata = {}) => {
      const metricName = 'portfolio-calculation';
      this.start(metricName, {
        holdingsCount: holdings?.length || 0,
        ...metadata,
      });

      return {
        end: (result) => {
          this.end(metricName, {
            totalValue: result?.totalValue || 0,
            totalGain: result?.totalGain || 0,
            holdingsProcessed: result?.holdings?.length || 0,
          });
        },
      };
    },

    /**
     * Track data load time
     */
    trackDataLoad: (source, metadata = {}) => {
      const metricName = `data-load-${source}`;
      this.start(metricName, { source, ...metadata });

      return {
        end: (rowCount, hasError = false) => {
          this.end(metricName, {
            rowCount,
            hasError,
            success: !hasError,
          });
        },
      };
    },

    /**
     * Track Plaid connection time
     */
    trackPlaidConnection: () => {
      const metricName = 'plaid-connection';
      this.start(metricName);

      return {
        end: (success, accountsCount = 0) => {
          this.end(metricName, {
            success,
            accountsCount,
          });
        },
      };
    },

    /**
     * Track CSV export time
     */
    trackExport: (exportType, metadata = {}) => {
      const metricName = `export-${exportType}`;
      this.start(metricName, { exportType, ...metadata });

      return {
        end: (rowCount, fileSize) => {
          this.end(metricName, {
            rowCount,
            fileSize,
          });
        },
      };
    },

    /**
     * Track chart render time
     */
    trackChartRender: (chartType, dataPoints) => {
      const metricName = `chart-render-${chartType}`;
      this.start(metricName, {
        chartType,
        dataPoints,
      });

      return {
        end: () => {
          this.end(metricName);
        },
      };
    },
  };

  /**
   * Get metric statistics
   */
  getStats(metricName) {
    const history = this.metrics.get(metricName);
    if (!history || history.length === 0) {
      return null;
    }

    const durations = history.map(m => m.duration || m.value).filter(d => d != null);
    if (durations.length === 0) {
      return null;
    }

    const sorted = durations.slice().sort((a, b) => a - b);

    return {
      name: metricName,
      count: history.length,
      min: Math.min(...durations),
      max: Math.max(...durations),
      avg: durations.reduce((a, b) => a + b, 0) / durations.length,
      median: sorted[Math.floor(sorted.length / 2)],
      p75: sorted[Math.floor(sorted.length * 0.75)],
      p90: sorted[Math.floor(sorted.length * 0.90)],
      p95: sorted[Math.floor(sorted.length * 0.95)],
      p99: sorted[Math.floor(sorted.length * 0.99)],
      latest: durations[durations.length - 1],
      history: history.slice(-10), // Last 10 measurements
    };
  }

  /**
   * Get all metrics statistics
   */
  getAllStats() {
    const stats = {};
    this.metrics.forEach((_, name) => {
      const metricStats = this.getStats(name);
      if (metricStats) {
        stats[name] = metricStats;
      }
    });
    return stats;
  }

  /**
   * Get metrics by prefix
   */
  getMetricsByPrefix(prefix) {
    const results = {};
    this.metrics.forEach((value, key) => {
      if (key.startsWith(prefix)) {
        results[key] = this.getStats(key);
      }
    });
    return results;
  }

  /**
   * Clear metric history
   */
  clear(metricName = null) {
    if (metricName) {
      this.metrics.delete(metricName);
      this.timers.delete(metricName);
    } else {
      this.metrics.clear();
      this.timers.clear();
    }
  }

  /**
   * Log metric to console
   */
  logMetric(metric) {
    const duration = metric.duration || metric.value;
    const unit = metric.duration ? 'ms' : '';

    console.log(
      `📊 Metric [${metric.name}]: ${duration.toFixed(2)}${unit}`,
      metric
    );
  }

  /**
   * Send metric to analytics
   */
  sendToAnalytics(metric) {
    // Integration points for analytics services

    // Google Analytics 4
    if (typeof window !== 'undefined' && window.gtag) {
      window.gtag('event', 'custom_metric', {
        event_category: 'Performance',
        event_label: metric.name,
        value: Math.round(metric.duration || metric.value),
        metric_metadata: JSON.stringify(metric),
        non_interaction: true,
      });
    }

    // Plausible Analytics
    if (typeof window !== 'undefined' && window.plausible) {
      window.plausible('Custom Metric', {
        props: {
          metric: metric.name,
          value: Math.round(metric.duration || metric.value),
        },
      });
    }

    // Custom endpoint
    if (this.isProduction && typeof window !== 'undefined' && window.fetch) {
      // Uncomment when ready
      /*
      fetch('/api/analytics/custom-metrics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(metric),
        keepalive: true,
      }).catch(err => {
        console.error('Failed to send custom metric:', err);
      });
      */
    }
  }

  /**
   * Get performance marks
   */
  getPerformanceMarks() {
    if (typeof performance === 'undefined' || !performance.getEntriesByType) {
      return [];
    }

    return performance.getEntriesByType('mark');
  }

  /**
   * Get performance measures
   */
  getPerformanceMeasures() {
    if (typeof performance === 'undefined' || !performance.getEntriesByType) {
      return [];
    }

    return performance.getEntriesByType('measure');
  }

  /**
   * Export metrics as JSON
   */
  exportMetrics() {
    return {
      generated: new Date().toISOString(),
      stats: this.getAllStats(),
      marks: this.getPerformanceMarks(),
      measures: this.getPerformanceMeasures(),
    };
  }

  /**
   * Create metric report
   */
  createReport() {
    const stats = this.getAllStats();
    const report = {
      timestamp: Date.now(),
      summary: {
        totalMetrics: Object.keys(stats).length,
        slowestMetrics: [],
        fastestMetrics: [],
      },
      metrics: stats,
    };

    // Find slowest and fastest
    const sortedByAvg = Object.entries(stats)
      .sort(([, a], [, b]) => b.avg - a.avg);

    report.summary.slowestMetrics = sortedByAvg.slice(0, 5).map(([name, data]) => ({
      name,
      avg: data.avg,
      max: data.max,
    }));

    report.summary.fastestMetrics = sortedByAvg.slice(-5).reverse().map(([name, data]) => ({
      name,
      avg: data.avg,
      min: data.min,
    }));

    return report;
  }
}

// Create singleton instance
const customMetrics = new CustomMetrics();

export default customMetrics;
