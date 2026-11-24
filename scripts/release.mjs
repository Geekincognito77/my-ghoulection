// Publishes the current version as a GitHub release so installed apps can update to it.
//
//   1. Bump "version" in package.json (e.g. 0.3.0 -> 0.4.0) and commit.
//   2. npm run release -- "What changed in this version"
//
// Builds the installer, pushes your commits, then creates release vX.Y.Z on GitHub with
// the installer, its blockmap, and latest.yml (the file "Check for updates" reads).
import { execSync } from 'node:child_process';
import fs from 'node:fs';

const run = (cmd, opts = {}) => execSync(cmd, { stdio: 'inherit', ...opts });
const out = (cmd) => execSync(cmd, { encoding: 'utf8' }).trim();

const { version } = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const tag = `v${version}`;
const notes = process.argv.slice(2).join(' ').trim() || `My Ghoulection ${version}`;

if (out('git status --porcelain')) {
  console.error('You have uncommitted changes. Commit them first, then run the release again.');
  process.exit(1);
}
try {
  out(`gh release view ${tag}`);
  console.error(`Release ${tag} already exists. Bump "version" in package.json first.`);
  process.exit(1);
} catch {
  /* good: the release doesn't exist yet */
}

run('npm run dist');

const exe = `release/My-Ghoulection-Setup-${version}.exe`;
const files = [exe, `${exe}.blockmap`, 'release/latest.yml'];
for (const f of files) if (!fs.existsSync(f)) throw new Error(`Missing build output: ${f}`);

run('git push');
fs.writeFileSync('release/notes.md', notes);
run(`gh release create ${tag} ${files.map((f) => `"${f}"`).join(' ')} --title "My Ghoulection ${version}" --notes-file release/notes.md --target ${out('git rev-parse HEAD')}`);
console.log(`\nPublished ${tag}. Installed copies will offer this update.`);
