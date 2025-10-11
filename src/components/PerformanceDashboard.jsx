import { useState, useEffect } from 'react';
import performanceMonitor from '../utils/performance/PerformanceMonitor';

export default function PerformanceDashboard() {
  const [report, setReport] = useState(null);
  const [healthCheck, setHealthCheck] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 10000); // Refresh every 10 seconds
    return () => clearInterval(interval);
  }, []);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [reportData, healthData] = await Promise.all([
        performanceMonitor.getReport(),
        performanceMonitor.getHealthCheck(),
      ]);
      setReport(reportData);
      setHealthCheck(healthData);
    } catch (error) {
      console.error('Failed to load performance data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDownload = () => {
    performanceMonitor.downloadReport();
  };

  const handleClear = () => {
    if (confirm('Are you sure you want to clear all performance data?')) {
      performanceMonitor.clearAll();
      loadData();
    }
  };

  if (isLoading && !report) {
    return (
      <div className="min-h-screen bg-slate-900 text-white p-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
            <p className="mt-4 text-gray-400">Loading performance data...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 text-white p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold">Performance Dashboard</h1>
            <p className="text-gray-400 mt-2">Real-time application performance monitoring</p>
          </div>
          <div className="flex gap-4">
            <button
              onClick={loadData}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
            >
              Refresh
            </button>
            <button
              onClick={handleDownload}
              className="px-4 py-2 bg-green-600 hover:bg-green-700 rounded-lg transition-colors"
            >
              Download Report
            </button>
            <button
              onClick={handleClear}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg transition-colors"
            >
              Clear Data
            </button>
          </div>
        </div>

        {/* Health Check */}
        {healthCheck && (
          <div className={`mb-8 p-6 rounded-lg ${
            healthCheck.status === 'healthy' ? 'bg-green-900/30 border border-green-700' :
            healthCheck.status === 'warning' ? 'bg-yellow-900/30 border border-yellow-700' :
            'bg-red-900/30 border border-red-700'
          }`}>
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-xl font-bold mb-2">
                  {healthCheck.status === 'healthy' ? '✅ Healthy' :
                   healthCheck.status === 'warning' ? '⚠️ Warning' :
                   '❌ Unhealthy'}
                </h2>
                <p className="text-gray-300">Performance Score: {healthCheck.score}/100</p>
              </div>
              {healthCheck.issues.length > 0 && (
                <div className="text-right">
                  <p className="text-sm text-gray-400">{healthCheck.issues.length} issues detected</p>
                </div>
              )}
            </div>
            {healthCheck.issues.length > 0 && (
              <div className="mt-4 space-y-2">
                {healthCheck.issues.map((issue, idx) => (
                  <div key={idx} className="flex items-center gap-2 text-sm">
                    <span className={`px-2 py-1 rounded ${
                      issue.severity === 'high' ? 'bg-red-700' :
                      issue.severity === 'medium' ? 'bg-yellow-700' :
                      'bg-gray-700'
                    }`}>
                      {issue.severity}
                    </span>
                    <span>{issue.message}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-2 mb-6 border-b border-gray-700">
          {['overview', 'web-vitals', 'api', 'bundles', 'budgets', 'custom'].map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 font-medium transition-colors ${
                activeTab === tab
                  ? 'text-blue-400 border-b-2 border-blue-400'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1).replace('-', ' ')}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="space-y-6">
          {activeTab === 'overview' && report && <OverviewTab report={report} />}
          {activeTab === 'web-vitals' && report && <WebVitalsTab data={report.webVitals} />}
          {activeTab === 'api' && report && <ApiTab data={report.api} />}
          {activeTab === 'bundles' && report && <BundlesTab data={report.bundles} />}
          {activeTab === 'budgets' && report && <BudgetsTab data={report.budgets} />}
          {activeTab === 'custom' && report && <CustomMetricsTab data={report.customMetrics} />}
        </div>
      </div>
    </div>
  );
}

function OverviewTab({ report }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {/* Web Vitals Summary */}
      <div className="bg-slate-800 rounded-lg p-6">
        <h3 className="text-lg font-bold mb-4">Web Vitals</h3>
        <div className="space-y-3">
          {Object.entries(report.webVitals.metrics || {}).map(([key, data]) => (
            <div key={key} className="flex justify-between items-center">
              <span className="text-gray-400">{key}</span>
              <span className={`font-mono ${
                data.rating === 'good' ? 'text-green-400' :
                data.rating === 'needs-improvement' ? 'text-yellow-400' :
                'text-red-400'
              }`}>
                {data.value.toFixed(0)}ms
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* API Performance */}
      {report.api && (
        <div className="bg-slate-800 rounded-lg p-6">
          <h3 className="text-lg font-bold mb-4">API Performance</h3>
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-gray-400">Total Requests</span>
              <span className="font-mono">{report.api.total}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Success Rate</span>
              <span className="font-mono text-green-400">{report.api.successRate.toFixed(1)}%</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Avg Response</span>
              <span className="font-mono">{report.api.performance.avg.toFixed(0)}ms</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">P95 Response</span>
              <span className="font-mono">{report.api.performance.p95.toFixed(0)}ms</span>
            </div>
          </div>
        </div>
      )}

      {/* Session Info */}
      {report.rum && (
        <div className="bg-slate-800 rounded-lg p-6">
          <h3 className="text-lg font-bold mb-4">Session Info</h3>
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-gray-400">Session Duration</span>
              <span className="font-mono">{Math.floor(report.rum.duration / 1000)}s</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Pages Viewed</span>
              <span className="font-mono">{report.rum.pages}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Interactions</span>
              <span className="font-mono">{report.rum.interactions}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Errors</span>
              <span className={`font-mono ${report.rum.errors > 0 ? 'text-red-400' : 'text-green-400'}`}>
                {report.rum.errors}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function WebVitalsTab({ data }) {
  return (
    <div className="space-y-6">
      {Object.entries(data.metrics || {}).map(([key, metric]) => (
        <div key={key} className="bg-slate-800 rounded-lg p-6">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-bold">{key}</h3>
            <span className={`px-3 py-1 rounded-full text-sm ${
              metric.rating === 'good' ? 'bg-green-600' :
              metric.rating === 'needs-improvement' ? 'bg-yellow-600' :
              'bg-red-600'
            }`}>
              {metric.rating}
            </span>
          </div>
          <div className="text-3xl font-mono">{metric.value.toFixed(2)}ms</div>
        </div>
      ))}
    </div>
  );
}

function ApiTab({ data }) {
  if (!data) return <div className="text-gray-400">No API data available</div>;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-slate-800 rounded-lg p-6">
          <h3 className="text-lg font-bold mb-4">Response Times</h3>
          <div className="space-y-2">
            <div className="flex justify-between">
              <span>Average</span>
              <span className="font-mono">{data.performance.avg.toFixed(0)}ms</span>
            </div>
            <div className="flex justify-between">
              <span>P50 (Median)</span>
              <span className="font-mono">{data.performance.p50.toFixed(0)}ms</span>
            </div>
            <div className="flex justify-between">
              <span>P90</span>
              <span className="font-mono">{data.performance.p90.toFixed(0)}ms</span>
            </div>
            <div className="flex justify-between">
              <span>P95</span>
              <span className="font-mono">{data.performance.p95.toFixed(0)}ms</span>
            </div>
            <div className="flex justify-between">
              <span>P99</span>
              <span className="font-mono">{data.performance.p99.toFixed(0)}ms</span>
            </div>
          </div>
        </div>

        <div className="bg-slate-800 rounded-lg p-6">
          <h3 className="text-lg font-bold mb-4">Status Codes</h3>
          <div className="space-y-2">
            {Object.entries(data.byStatus || {}).map(([status, stats]) => (
              <div key={status} className="flex justify-between">
                <span>{status}</span>
                <span className="font-mono">{stats.count} ({stats.avgDuration.toFixed(0)}ms)</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function BundlesTab({ data }) {
  if (!data) return <div className="text-gray-400">No bundle data available</div>;

  return (
    <div className="space-y-6">
      <div className="bg-slate-800 rounded-lg p-6">
        <h3 className="text-lg font-bold mb-4">Bundle Size Trends</h3>
        <div className="space-y-3">
          <div className="flex justify-between">
            <span>Latest Size</span>
            <span className="font-mono">{formatBytes(data.latest)}</span>
          </div>
          <div className="flex justify-between">
            <span>Average Size</span>
            <span className="font-mono">{formatBytes(data.average)}</span>
          </div>
          <div className="flex justify-between">
            <span>Min Size</span>
            <span className="font-mono text-green-400">{formatBytes(data.min)}</span>
          </div>
          <div className="flex justify-between">
            <span>Max Size</span>
            <span className="font-mono text-red-400">{formatBytes(data.max)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function BudgetsTab({ data }) {
  return (
    <div className="space-y-6">
      <div className="bg-slate-800 rounded-lg p-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-bold">Budget Status</h3>
          <span className={`px-3 py-1 rounded-full text-sm ${
            data.status === 'pass' ? 'bg-green-600' :
            data.status === 'warning' ? 'bg-yellow-600' :
            'bg-red-600'
          }`}>
            {data.status}
          </span>
        </div>
        <div className="grid grid-cols-4 gap-4">
          <div className="text-center">
            <div className="text-2xl font-bold">{data.summary.total}</div>
            <div className="text-sm text-gray-400">Total Violations</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-red-400">{data.summary.critical}</div>
            <div className="text-sm text-gray-400">Critical</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-yellow-400">{data.summary.warning}</div>
            <div className="text-sm text-gray-400">Warning</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-blue-400">{data.summary.minor}</div>
            <div className="text-sm text-gray-400">Minor</div>
          </div>
        </div>
      </div>

      {data.violations && data.violations.length > 0 && (
        <div className="bg-slate-800 rounded-lg p-6">
          <h3 className="text-lg font-bold mb-4">Violations</h3>
          <div className="space-y-3">
            {data.violations.map((violation, idx) => (
              <div key={idx} className="flex justify-between items-center p-3 bg-slate-700 rounded">
                <div>
                  <div className="font-medium">{violation.metric}</div>
                  <div className="text-sm text-gray-400">{violation.category}</div>
                </div>
                <div className="text-right">
                  <div className="font-mono">{formatValue(violation.actual, violation.unit)}</div>
                  <div className="text-sm text-red-400">+{violation.percentage}%</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function CustomMetricsTab({ data }) {
  const metrics = Object.entries(data || {});

  if (metrics.length === 0) {
    return <div className="text-gray-400">No custom metrics available</div>;
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {metrics.map(([name, stats]) => (
        <div key={name} className="bg-slate-800 rounded-lg p-6">
          <h3 className="text-lg font-bold mb-4">{name}</h3>
          <div className="space-y-2">
            <div className="flex justify-between">
              <span>Count</span>
              <span className="font-mono">{stats.count}</span>
            </div>
            <div className="flex justify-between">
              <span>Average</span>
              <span className="font-mono">{stats.avg.toFixed(2)}ms</span>
            </div>
            <div className="flex justify-between">
              <span>Min</span>
              <span className="font-mono text-green-400">{stats.min.toFixed(2)}ms</span>
            </div>
            <div className="flex justify-between">
              <span>Max</span>
              <span className="font-mono text-red-400">{stats.max.toFixed(2)}ms</span>
            </div>
            <div className="flex justify-between">
              <span>P95</span>
              <span className="font-mono">{stats.p95.toFixed(2)}ms</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 10) / 10 + ' ' + sizes[i];
}

function formatValue(value, unit) {
  if (unit === 'bytes') return formatBytes(value);
  if (unit === 'ms') return `${Math.round(value)}ms`;
  return value;
}
