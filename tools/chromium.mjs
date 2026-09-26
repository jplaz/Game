/*
 * The browser every check here drives, wherever this machine keeps it.
 *
 * Nineteen of these scripts reached for Playwright and for Chromium by the
 * paths one build machine happened to have them at - a global install under
 * /opt/node22 and a browser under /opt/pw-browsers - so on any other machine
 * not one of them would start, and the export, the drivers and every picture
 * of the game went with them. They ask here instead.
 *
 * Playwright: a local install first (npm install playwright), then the global
 * one, wherever `npm root -g` says that is.
 * Chromium: CHROMIUM_PATH if you name one, then the build machine's own copy,
 * and otherwise whichever one Playwright installed for itself
 * (npx playwright install chromium).
 */
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join } from 'node:path';

const require = createRequire(import.meta.url);

function playwright() {
  try { return require('playwright'); } catch { /* not installed beside the game */ }
  try {
    const root = execSync('npm root -g', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    return require(join(root, 'playwright'));
  } catch { /* nor anywhere npm knows about */ }
  throw new Error('Playwright is not installed. Run `npm install playwright` and '
    + '`npx playwright install chromium`, then try again.');
}

export const { chromium } = playwright();

const BUILD_MACHINE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
export const executablePath = process.env.CHROMIUM_PATH
  || (existsSync(BUILD_MACHINE) ? BUILD_MACHINE : undefined);
