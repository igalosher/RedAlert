import fs from 'fs';
import path from 'path';

const pkgPath = path.resolve(process.cwd(), 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

const current = parseFloat(pkg.version);
if (Number.isNaN(current)) {
  console.error('Current version is not a number:', pkg.version);
  process.exit(1);
}

const next = current + 0.01;
pkg.version = next.toFixed(2);

fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
console.log(`Version bumped from ${current.toFixed(2)} to ${pkg.version}`);
