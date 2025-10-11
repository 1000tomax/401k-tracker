/**
 * Bundle Size Analyzer and Monitor
 *
 * Tracks and reports on:
 * - Bundle sizes over time
 * - Chunk sizes
 * - Code splitting effectiveness
 * - Third-party dependencies
 * - Size regressions
 */

class BundleAnalyzer {
  constructor() {
    this.isDevelopment = import.meta.env.DEV;
    this.isProduction = import.meta.env.PROD;
    this.history = this.loadHistory();
  }

  /**
   * Analyze current bundle
   */
  analyzeBundles() {
    if (typeof window === 'undefined' || !window.performance) {
      return null;
    }

    const resources = performance.getEntriesByType('resource');

    const analysis = {
      timestamp: Date.now(),
      chunks: [],
      summary: {
        totalSize: 0,
        totalTransferred: 0,
        totalCount: 0,
        byType: {},
      },
      compression: {
        ratio: 0,
        savings: 0,
      },
      thirdParty: [],
    };

    // Analyze each resource
    resources.forEach(resource => {
      const chunk = this.analyzeResource(resource);
      if (chunk) {
        analysis.chunks.push(chunk);

        // Update summary
        analysis.summary.totalSize += chunk.size;
        analysis.summary.totalTransferred += chunk.transferred;
        analysis.summary.totalCount++;

        // Count by type
        if (!analysis.summary.byType[chunk.type]) {
          analysis.summary.byType[chunk.type] = {
            count: 0,
            size: 0,
            transferred: 0,
          };
        }
        analysis.summary.byType[chunk.type].count++;
        analysis.summary.byType[chunk.type].size += chunk.size;
        analysis.summary.byType[chunk.type].transferred += chunk.transferred;

        // Track third-party resources
        if (chunk.isThirdParty) {
          analysis.thirdParty.push(chunk);
        }
      }
    });

    // Calculate compression ratio
    if (analysis.summary.totalSize > 0) {
      analysis.compression.ratio =
        (1 - analysis.summary.totalTransferred / analysis.summary.totalSize) * 100;
      analysis.compression.savings =
        analysis.summary.totalSize - analysis.summary.totalTransferred;
    }

    // Sort chunks by size
    analysis.chunks.sort((a, b) => b.transferred - a.transferred);

    // Add to history
    this.addToHistory(analysis);

    if (this.isDevelopment) {
      this.logAnalysis(analysis);
    }

    return analysis;
  }

  /**
   * Analyze individual resource
   */
  analyzeResource(resource) {
    const url = new URL(resource.name, window.location.origin);
    const filename = url.pathname.split('/').pop();

    // Only analyze relevant resources (skip data URIs, etc.)
    if (
      !filename ||
      resource.name.startsWith('data:') ||
      resource.name.startsWith('blob:')
    ) {
      return null;
    }

    const type = this.getResourceType(resource);
    const isThirdParty = !url.hostname.includes(window.location.hostname);

    return {
      name: filename,
      url: resource.name,
      type,
      size: resource.decodedBodySize || 0,
      transferred: resource.transferSize || 0,
      duration: resource.duration,
      cached: resource.transferSize === 0 && resource.decodedBodySize > 0,
      compression: resource.transferSize > 0
        ? ((1 - resource.transferSize / resource.decodedBodySize) * 100).toFixed(1)
        : 0,
      isThirdParty,
      initiator: resource.initiatorType,
    };
  }

  /**
   * Get resource type
   */
  getResourceType(resource) {
    const name = resource.name.toLowerCase();

    if (resource.initiatorType === 'script' || name.endsWith('.js')) {
      return 'javascript';
    }
    if (resource.initiatorType === 'css' || name.endsWith('.css')) {
      return 'stylesheet';
    }
    if (resource.initiatorType === 'img' || /\.(png|jpg|jpeg|gif|svg|webp|avif)/.test(name)) {
      return 'image';
    }
    if (/\.(woff2?|ttf|eot|otf)/.test(name)) {
      return 'font';
    }
    if (name.endsWith('.json')) {
      return 'json';
    }
    return 'other';
  }

  /**
   * Detect size regressions
   */
  detectRegressions() {
    if (this.history.length < 2) {
      return { hasRegression: false, changes: [] };
    }

    const current = this.history[this.history.length - 1];
    const previous = this.history[this.history.length - 2];

    const changes = [];
    const threshold = 0.1; // 10% increase is a regression

    // Compare total size
    const totalChange =
      (current.summary.totalTransferred - previous.summary.totalTransferred) /
      previous.summary.totalTransferred;

    if (totalChange > threshold) {
      changes.push({
        type: 'total',
        previous: previous.summary.totalTransferred,
        current: current.summary.totalTransferred,
        change: totalChange,
        changePercent: (totalChange * 100).toFixed(2),
      });
    }

    // Compare by type
    Object.keys(current.summary.byType).forEach(type => {
      const currentSize = current.summary.byType[type].transferred;
      const previousSize = previous.summary.byType[type]?.transferred || 0;

      if (previousSize > 0) {
        const change = (currentSize - previousSize) / previousSize;
        if (change > threshold) {
          changes.push({
            type,
            previous: previousSize,
            current: currentSize,
            change,
            changePercent: (change * 100).toFixed(2),
          });
        }
      }
    });

    const hasRegression = changes.length > 0;

    if (hasRegression && this.isDevelopment) {
      console.warn('📈 Bundle size regression detected:', changes);
    }

    return { hasRegression, changes };
  }

  /**
   * Get top N largest bundles
   */
  getTopBundles(n = 10) {
    if (this.history.length === 0) return [];

    const latest = this.history[this.history.length - 1];
    return latest.chunks.slice(0, n);
  }

  /**
   * Get bundle size trends
   */
  getTrends() {
    if (this.history.length === 0) return null;

    const timestamps = this.history.map(h => h.timestamp);
    const totalSizes = this.history.map(h => h.summary.totalTransferred);

    return {
      timestamps,
      totalSizes,
      average: totalSizes.reduce((a, b) => a + b, 0) / totalSizes.length,
      min: Math.min(...totalSizes),
      max: Math.max(...totalSizes),
      latest: totalSizes[totalSizes.length - 1],
    };
  }

  /**
   * Load history from storage
   */
  loadHistory() {
    try {
      const stored = localStorage.getItem('bundleAnalysisHistory');
      if (stored) {
        const history = JSON.parse(stored);
        // Keep last 50 entries
        return history.slice(-50);
      }
    } catch (error) {
      console.error('Failed to load bundle history:', error);
    }
    return [];
  }

  /**
   * Add analysis to history
   */
  addToHistory(analysis) {
    this.history.push(analysis);

    // Keep last 50 entries
    if (this.history.length > 50) {
      this.history.shift();
    }

    // Save to storage
    try {
      localStorage.setItem('bundleAnalysisHistory', JSON.stringify(this.history));
    } catch (error) {
      console.error('Failed to save bundle history:', error);
    }
  }

  /**
   * Clear history
   */
  clearHistory() {
    this.history = [];
    try {
      localStorage.removeItem('bundleAnalysisHistory');
    } catch (error) {
      console.error('Failed to clear bundle history:', error);
    }
  }

  /**
   * Log analysis to console
   */
  logAnalysis(analysis) {
    console.group('📦 Bundle Analysis');

    console.log('Total Size:', this.formatBytes(analysis.summary.totalSize));
    console.log('Transferred:', this.formatBytes(analysis.summary.totalTransferred));
    console.log('Compression Ratio:', `${analysis.compression.ratio.toFixed(1)}%`);
    console.log('Compression Savings:', this.formatBytes(analysis.compression.savings));

    console.group('By Type:');
    Object.entries(analysis.summary.byType).forEach(([type, stats]) => {
      console.log(
        `${type}: ${stats.count} files, ${this.formatBytes(stats.transferred)}`
      );
    });
    console.groupEnd();

    if (analysis.thirdParty.length > 0) {
      console.group('Third-Party Resources:');
      analysis.thirdParty.forEach(chunk => {
        console.log(`${chunk.name}: ${this.formatBytes(chunk.transferred)}`);
      });
      console.groupEnd();
    }

    console.group('Top 10 Largest Bundles:');
    analysis.chunks.slice(0, 10).forEach((chunk, index) => {
      console.log(
        `${index + 1}. ${chunk.name}: ${this.formatBytes(chunk.transferred)} ` +
        `(${chunk.compression}% compressed)`
      );
    });
    console.groupEnd();

    console.groupEnd();
  }

  /**
   * Format bytes to human-readable size
   */
  formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 10) / 10 + ' ' + sizes[i];
  }

  /**
   * Export analysis as JSON
   */
  exportAnalysis() {
    if (this.history.length === 0) return null;

    return {
      generated: new Date().toISOString(),
      history: this.history,
      trends: this.getTrends(),
      topBundles: this.getTopBundles(20),
      regressions: this.detectRegressions(),
    };
  }
}

// Create singleton instance
const bundleAnalyzer = new BundleAnalyzer();

export default bundleAnalyzer;
