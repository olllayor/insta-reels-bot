import { Metrics, LogLevel, LogData } from '../types/index.js';

export const log = (level: LogLevel, message: string, data?: LogData) => {
  const timestamp = new Date().toISOString();
  const prefix = `[${timestamp}] [${level}]`;
  if (data) {
    console.log(`${prefix} ${message}`, data);
  } else {
    console.log(`${prefix} ${message}`);
  }
};

export const metrics: Metrics = {
  totalRequests: 0,
  totalTime: 0,
  minTime: Infinity,
  maxTime: 0,
  avgTime: function () {
    return this.totalRequests === 0 ? 0 : Math.round(this.totalTime / this.totalRequests);
  },
};

export const trackMetric = (elapsedMs: number) => {
  metrics.totalRequests++;
  metrics.totalTime += elapsedMs;
  metrics.minTime = Math.min(metrics.minTime, elapsedMs);
  metrics.maxTime = Math.max(metrics.maxTime, elapsedMs);
};

export const logMetricsIfNeeded = () => {
  if (metrics.totalRequests > 0 && metrics.totalRequests % 10 === 0) {
    log('INFO', `Metrics (${metrics.totalRequests} downloads)`, {
      avgMs: metrics.avgTime(),
      minMs: metrics.minTime,
      maxMs: metrics.maxTime,
    });
  }
};