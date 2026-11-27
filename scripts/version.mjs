// Monte la version de Ceionia d'un cran (0.0.1 → 0.0.2), dans src/version.ts et package.json : avant chaque push qui déploie
import { readFileSync, writeFileSync } from 'node:fs';

const file = 'src/version.ts';
const src = readFileSync(file, 'utf8');
const m = /VERSION = '(\d+)\.(\d+)\.(\d+)'/.exec(src);
if (!m) throw new Error(`version introuvable dans ${file}`);
const next = `${m[1]}.${m[2]}.${Number(m[3]) + 1}`;
writeFileSync(file, src.replace(m[0], `VERSION = '${next}'`));
const pkg = readFileSync('package.json', 'utf8');
writeFileSync('package.json', pkg.replace(/"version": "[^"]*"/, `"version": "${next}"`));
console.log(`Version ${next}`);
