#!/usr/bin/env node
// After `next build` (output: 'standalone') Next sometimes nests the runnable
// server under .next/standalone/<basename>/server.js (basename = dir you built in).
// We create a stable symlink .next/standalone/server.js -> <basename>/server.js
// so that all systemd units and docs that reference .../standalone/server.js continue to work
// without caring about the build-time directory name.

/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('fs');
const path = require('path');
/* eslint-enable @typescript-eslint/no-require-imports */

const stand = path.join('.next', 'standalone');
if (!fs.existsSync(stand)) {
  console.log('[flatten] no .next/standalone — skipping');
  process.exit(0);
}

const target = path.join(stand, 'server.js');
if (fs.existsSync(target)) {
  // Could be a file or valid symlink already
  console.log('[flatten] server.js already present at top level');
  process.exit(0);
}

// Locate the app sub-folder that contains server.js
const entries = fs.readdirSync(stand, { withFileTypes: true });
let subName = null;
for (const e of entries) {
  if (e.isDirectory()) {
    const cand = path.join(stand, e.name, 'server.js');
    if (fs.existsSync(cand)) {
      subName = e.name;
      break;
    }
  }
}

if (!subName) {
  console.log('[flatten] could not find app subdir containing server.js');
  process.exit(0);
}

const linkTarget = path.join(subName, 'server.js'); // relative symlink
try {
  fs.symlinkSync(linkTarget, target);
  console.log(`[flatten] created ${target} -> ${linkTarget}`);
} catch (e) {
  if (e.code === 'EEXIST') {
    console.log('[flatten] symlink already exists');
  } else {
    throw e;
  }
}
