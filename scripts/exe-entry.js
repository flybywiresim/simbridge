const childProcess = require('node:child_process');
const { promisify } = require('node:util');

// pkg's SEA bootstrap wraps these functions without retaining Node's custom promisifiers.
// Restore their { stdout, stderr } results before libraries such as pdf-to-printer load.
for (const method of ['exec', 'execFile']) {
  const fn = childProcess[method];
  if (fn[promisify.custom]) continue;

  Object.defineProperty(fn, promisify.custom, {
    configurable: true,
    value: (...args) => {
      let child;
      const promise = new Promise((resolve, reject) => {
        child = fn(...args, (error, stdout, stderr) => {
          if (error) {
            error.stdout = stdout;
            error.stderr = stderr;
            reject(error);
          } else {
            resolve({ stdout, stderr });
          }
        });
      });
      promise.child = child;
      return promise;
    },
  });
}

require('../dist/main.js');
