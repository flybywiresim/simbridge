// Real-time memory monitor for running SimBridge
// Run: node dist/monitor.js
// Tracks: heap, rss, external, handle count over time

const http = require('http');
const { execSync } = require('child_process');

const INTERVAL_MS = 5000; // 5 seconds
const DURATION_S = 120; // 2 minutes

function getServerPID() {
  try {
    const out = execSync('wmic process where "name=\'node.exe\'" get ProcessId,CommandLine /format:csv', { encoding: 'utf8' });
    const lines = out.split('\n').filter(l => l.includes('dist/main.js'));
    if (lines.length > 0) {
      const parts = lines[0].split(',');
      return parseInt(parts[parts.length - 1]);
    }
  } catch {}
  return null;
}

function getProcessMemory(pid) {
  try {
    const out = execSync(`wmic process where "ProcessId=${pid}" get WorkingSetSize,PrivatePageCount,HandleCount,ThreadCount /format:csv`, { encoding: 'utf8' });
    const lines = out.split('\n').filter(l => l.includes(','));
    if (lines.length > 1) {
      const parts = lines[1].split(',');
      return {
        workingSetMB: (parseInt(parts[4]) / 1024 / 1024).toFixed(2),
        privateMB: (parseInt(parts[2]) / 1024 / 1024).toFixed(2),
        handles: parseInt(parts[1]),
        threads: parseInt(parts[3]),
      };
    }
  } catch {}
  return null;
}

function healthCheck() {
  return new Promise((resolve) => {
    http.get('http://127.0.0.1:8380/health', (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => resolve(JSON.parse(data)));
    }).on('error', () => resolve(null));
  });
}

function formatRow(time, mem, health) {
  const status = health?.status === 'ok' ? 'UP' : 'DOWN';
  return `[${time}s] ${mem.workingSetMB}MB working | ${mem.privateMB}MB private | ${mem.handles} handles | ${mem.threads} threads | API: ${status}`;
}

async function monitor() {
  console.log('='.repeat(70));
  console.log(' SimBridge Memory Monitor');
  console.log('='.repeat(70));
  
  const pid = getServerPID();
  if (!pid) {
    console.log('ERROR: SimBridge process not found');
    return;
  }
  console.log(`PID: ${pid}`);
  console.log(`Monitoring for ${DURATION_S}s, sampling every ${INTERVAL_MS/1000}s`);
  console.log('');
  
  const samples = [];
  const startTime = Date.now();
  
  while ((Date.now() - startTime) / 1000 < DURATION_S) {
    const elapsed = Math.round((Date.now() - startTime) / 1000);
    const mem = getProcessMemory(pid);
    const health = await healthCheck();
    
    if (mem) {
      samples.push({ time: elapsed, ...mem });
      console.log(formatRow(elapsed, mem, health));
    } else {
      console.log(`[${elapsed}s] Process not responding`);
    }
    
    await new Promise(r => setTimeout(r, INTERVAL_MS));
  }
  
  // Summary
  console.log('');
  console.log('='.repeat(70));
  console.log(' SUMMARY');
  console.log('='.repeat(70));
  if (samples.length >= 2) {
    const first = samples[0];
    const last = samples[samples.length - 1];
    console.log(`Duration: ${last.time}s`);
    console.log(`Working Set: ${first.workingSetMB}MB → ${last.workingSetMB}MB (Δ${(last.workingSetMB - first.workingSetMB).toFixed(2)}MB)`);
    console.log(`Private: ${first.privateMB}MB → ${last.privateMB}MB (Δ${(last.privateMB - first.privateMB).toFixed(2)}MB)`);
    console.log(`Handles: ${first.handles} → ${last.handles} (Δ${last.handles - first.handles})`);
  }
  console.log('='.repeat(70));
}

monitor().catch(console.error);
