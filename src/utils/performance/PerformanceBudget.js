/**
 * Performance Budget Monitor
 *
 * Monitors and enforces performance budgets for:
 * - Bundle sizes
 * - Resource counts
 * - Web Vitals metrics
 * - Load times
 */

import budgetConfig from '../../../performance-budgets.json';

class PerformanceBudget {
  constructor() {
    this.config = budgetConfig;
    this.violations = [];
    this.isDevelopment = import.meta.env.DEV;
    this.isProduction = import.meta.env.PROD;
  }

  /**
   * Check all performance budgets
   */
  async checkBudgets() {
    if (typeof window === 'undefined' || !window.performance) {
      return { status: 'unknown', violations: [] };
    }

    this.violations = [];

    // Wait for page load to complete
    await this.waitForLoad();

    // Check resource budgets
    this.checkResourceBudgets();

    // Check timing budgets
    this.checkTimingBudgets();

    // Generate report
    const report = this.generateReport();

    if (this.isDevelopment && this.violations.length > 0) {
      console.warn('⚠️ Performance Budget Violations:', this.violations);
    }

    return report;
  }

  /**
   * Wait for page load to complete
   */
  waitForLoad() {
    return new Promise(resolve => {
      if (document.readyState === 'complete') {
        resolve();
      } else {
        window.addEventListener('load', resolve, { once: true });
      }
    });
  }

  /**
   * Check resource size and count budgets
   */
  checkResourceBudgets() {
    const resources = performance.getEntriesByType('resource');

    // Group resources by type
    const resourcesByType = {
      script: [],
      stylesheet: [],
      image: [],
      font: [],
      other: [],
    };

    resources.forEach(resource => {
      const type = this.getResourceType(resource);
      resourcesByType[type].push(resource);
    });

    // Check size budgets
    this.config.budget.resourceSizes.forEach(budget => {
      const type = budget.resourceType;

      if (type === 'total') {
        const totalSize = resources.reduce((sum, r) => sum + (r.transferSize || 0), 0);
        this.checkBudget('resourceSize', 'total', totalSize, budget.budget * 1024, 'bytes');
      } else {
        const typeResources = resourcesByType[type] || [];
        const typeSize = typeResources.reduce((sum, r) => sum + (r.transferSize || 0), 0);
        this.checkBudget('resourceSize', type, typeSize, budget.budget * 1024, 'bytes');
      }
    });

    // Check count budgets
    this.config.budget.resourceCounts.forEach(budget => {
      const type = budget.resourceType;
      const typeResources = resourcesByType[type] || [];
      this.checkBudget('resourceCount', type, typeResources.length, budget.budget, 'count');
    });
  }

  /**
   * Check timing budgets
   */
  checkTimingBudgets() {
    const navigation = performance.getEntriesByType('navigation')[0];
    if (!navigation) return;

    // Check FCP
    const fcpEntry = performance.getEntriesByName('first-contentful-paint')[0];
    if (fcpEntry) {
      const fcpBudget = this.config.budget.timings.find(
        t => t.metric === 'first-contentful-paint'
      );
      if (fcpBudget) {
        this.checkBudget('timing', 'FCP', fcpEntry.startTime, fcpBudget.budget, 'ms');
      }
    }

    // Check TTI (approximation using domInteractive)
    const tti = navigation.domInteractive;
    const ttiBudget = this.config.budget.timings.find(t => t.metric === 'time-to-interactive');
    if (ttiBudget) {
      this.checkBudget('timing', 'TTI', tti, ttiBudget.budget, 'ms');
    }
  }

  /**
   * Check if a value exceeds budget
   */
  checkBudget(category, metric, actual, budget, unit) {
    if (actual > budget) {
      const violation = {
        category,
        metric,
        actual,
        budget,
        unit,
        exceeded: actual - budget,
        percentage: ((actual / budget - 1) * 100).toFixed(2),
        severity: this.calculateSeverity(actual, budget),
        timestamp: Date.now(),
      };

      this.violations.push(violation);

      if (this.isDevelopment) {
        const emoji = violation.severity === 'critical' ? '🚨' : '⚠️';
        console.warn(
          `${emoji} Budget exceeded: ${metric} - ` +
          `Actual: ${this.formatValue(actual, unit)}, ` +
          `Budget: ${this.formatValue(budget, unit)} ` +
          `(+${violation.percentage}%)`
        );
      }
    }
  }

  /**
   * Calculate severity of budget violation
   */
  calculateSeverity(actual, budget) {
    const ratio = actual / budget;
    if (ratio >= 1.5) return 'critical';
    if (ratio >= 1.25) return 'warning';
    return 'minor';
  }

  /**
   * Format value based on unit
   */
  formatValue(value, unit) {
    if (unit === 'bytes') {
      return this.formatBytes(value);
    }
    if (unit === 'ms') {
      return `${Math.round(value)}ms`;
    }
    return value;
  }

  /**
   * Format bytes to human-readable size
   */
  formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i)) + ' ' + sizes[i];
  }

  /**
   * Get resource type from performance entry
   */
  getResourceType(resource) {
    const name = resource.name.toLowerCase();

    if (resource.initiatorType === 'script' || name.endsWith('.js')) {
      return 'script';
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
    return 'other';
  }

  /**
   * Check if metric is within budget
   */
  isWithinBudget(metric, value) {
    const targets = this.config.targets.desktop;
    const budget = targets[metric.toLowerCase()];

    if (!budget) return null;

    return value <= budget;
  }

  /**
   * Get alert level for metric value
   */
  getAlertLevel(metric, value) {
    const thresholds = this.config.monitoring.alertThresholds[metric.toLowerCase()];

    if (!thresholds) return 'none';

    if (value >= thresholds.critical) return 'critical';
    if (value >= thresholds.warning) return 'warning';
    return 'none';
  }

  /**
   * Generate performance budget report
   */
  generateReport() {
    const totalViolations = this.violations.length;
    const criticalViolations = this.violations.filter(v => v.severity === 'critical').length;
    const warningViolations = this.violations.filter(v => v.severity === 'warning').length;

    let status = 'pass';
    if (criticalViolations > 0) {
      status = 'critical';
    } else if (warningViolations > 0) {
      status = 'warning';
    } else if (totalViolations > 0) {
      status = 'minor';
    }

    const report = {
      status,
      timestamp: Date.now(),
      summary: {
        total: totalViolations,
        critical: criticalViolations,
        warning: warningViolations,
        minor: totalViolations - criticalViolations - warningViolations,
      },
      violations: this.violations,
      budgets: this.config.budget,
    };

    // Log summary in development
    if (this.isDevelopment) {
      if (status === 'pass') {
        console.log('✅ All performance budgets met!');
      } else {
        console.warn('⚠️ Performance Budget Report:', report.summary);
      }
    }

    return report;
  }

  /**
   * Get current violations
   */
  getViolations() {
    return [...this.violations];
  }

  /**
   * Clear violations
   */
  clearViolations() {
    this.violations = [];
  }
}

// Create singleton instance
const performanceBudget = new PerformanceBudget();

export default performanceBudget;
