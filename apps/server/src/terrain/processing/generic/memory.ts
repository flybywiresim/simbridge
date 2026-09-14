import { getHeapSpaceStatistics } from 'v8';

const mb = (bytes: number): number => Math.round(bytes / (1024 * 1024));

/*
 * rss is process-wide (main thread plus every worker isolate); heap and external are this
 * isolate only, so never subtract one from the other. The per-space split is what
 * localises a problem: large_object holds big TypedArrays and arrays, i.e. allocation
 * churn, while old holds many small long-lived objects, i.e. real retention.
 */
export function memorySnapshot(): string {
  const usage = process.memoryUsage();

  let spaces = 'unavailable';
  try {
    spaces = getHeapSpaceStatistics()
      .filter((space) => space.space_used_size > 8 * 1024 * 1024)
      .map((space) => `${space.space_name.replace('_space', '')}=${mb(space.space_used_size)}MB`)
      .join(' ');
  } catch {
    // v8 statistics are best-effort diagnostics, never worth failing a render for
  }

  return (
    `rss=${mb(usage.rss)}MB(process) heapUsed=${mb(usage.heapUsed)}MB heapTotal=${mb(usage.heapTotal)}MB ` +
    `external=${mb(usage.external)}MB arrayBuffers=${mb(usage.arrayBuffers)}MB | spaces: ${spaces}`
  );
}
