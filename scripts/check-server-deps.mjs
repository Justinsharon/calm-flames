// Fails the build if the bundled server imports a package that the production image won't install.
// The Dockerfile runs `npm ci --omit=dev`, so every package dist-server/server.js imports must be in
// "dependencies" (not "devDependencies"), or the container crashes on start.
import { readFileSync } from 'node:fs';
import { builtinModules } from 'node:module';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const prod = new Set(Object.keys(pkg.dependencies || {}));
// Loaded only in local development (dynamic import behind a NODE_ENV check), never in the image.
const DEV_ONLY = new Set(['vite']);
const code = readFileSync(new URL('../dist-server/server.js', import.meta.url), 'utf8');

const specifiers = new Set();
for (const m of code.matchAll(/(?:from\s*|import\s*\(\s*|import\s+)["']([^"'.\/][^"']*)["']/g)) specifiers.add(m[1]);

const missing = [];
for (const s of specifiers) {
  if (s.startsWith('node:') || builtinModules.includes(s)) continue;
  const name = s.startsWith('@') ? s.split('/').slice(0, 2).join('/') : s.split('/')[0];
  if (!prod.has(name) && !DEV_ONLY.has(name)) missing.push(name);
}

if (missing.length) {
  console.error(`Server imports packages missing from "dependencies": ${[...new Set(missing)].join(', ')}.`);
  console.error('Move them from devDependencies to dependencies, or the Cloud Run container will fail to start.');
  process.exit(1);
}
console.log(`Server runtime dependencies OK (${specifiers.size} package imports checked).`);
