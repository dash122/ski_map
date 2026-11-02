// Runs every tools/test-*.mjs in its own Node process and fails if any of them fails.
// `npm test` uses this locally and the Checks workflow runs it on every pull request.
import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
const dir = new URL('.', import.meta.url);
const tests = readdirSync(dir).filter(f => /^test-.*\.mjs$/.test(f)).sort();
const failed = [];
for (const t of tests) {
  const r = spawnSync(process.execPath, [new URL(t, dir).pathname], { encoding: 'utf8' });
  const ok = r.status === 0;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${t}`);
  if (!ok) { failed.push(t); console.log((r.stdout + r.stderr).trim().split('\n').slice(-15).join('\n')); }
}
console.log(`\n${tests.length - failed.length} of ${tests.length} test files passed.`);
if (failed.length) process.exit(1);
