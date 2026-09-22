const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
function walk(dir) {
  return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>{const p=path.join(dir,e.name);return e.isDirectory()?walk(p):[p];});
}
const js = walk(root).filter(p => p.endsWith('.js') && !p.includes('node_modules'));
let failed = 0;
for (const file of js) {
  const r = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (r.status !== 0) { failed++; console.error(`FAIL ${path.relative(root,file)}\n${r.stderr}`); }
  else console.log(`PASS ${path.relative(root,file)}`);
}
if (!failed) console.log(`\nSyntax check passed for ${js.length} JavaScript files.`); else process.exitCode = 1;
