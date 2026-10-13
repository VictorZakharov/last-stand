// `npm run icons -- <command>`: runs the icons tool (tools/icons/icons.py, README.md) with the system's Python
// (`python` on Windows, `python3` elsewhere), which needs Pillow and numpy (requirements.txt).
import { spawnSync } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const HERE = dirname(fileURLToPath(import.meta.url));
const PYTHON = process.platform === 'win32' ? 'python' : 'python3';

const run = spawnSync(PYTHON, [join(HERE, 'icons.py'), ...process.argv.slice(2)], { stdio: 'inherit' });
if (run.error) {
  console.error(`couldn't run ${PYTHON}: ${run.error.message}`);
  process.exit(1);
}
process.exit(run.status ?? 1);
