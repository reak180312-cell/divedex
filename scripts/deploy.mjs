// Publishes the built app (dist/) to the `gh-pages` branch, which GitHub Pages serves.
// Usage: npm run deploy   (builds first)
import { execSync } from 'node:child_process';
import fs from 'node:fs';

const run = (cmd, opts = {}) => execSync(cmd, { stdio: 'inherit', ...opts });
const remote = execSync('git remote get-url origin').toString().trim();
const name = execSync('git config user.name').toString().trim();
const email = execSync('git config user.email').toString().trim();

fs.writeFileSync('dist/.nojekyll', ''); // serve files as-is
fs.rmSync('dist/.git', { recursive: true, force: true });
run('git init -q -b gh-pages', { cwd: 'dist' });
run('git add -A', { cwd: 'dist' });
run(`git -c user.name="${name}" -c user.email="${email}" commit -q -m "Deploy DiveDex ${new Date().toISOString()}"`, { cwd: 'dist' });
run(`git push -f "${remote}" gh-pages`, { cwd: 'dist' });
fs.rmSync('dist/.git', { recursive: true, force: true });
console.log('Published. GitHub Pages updates within a minute.');
