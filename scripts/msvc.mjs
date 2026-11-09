// Run Cargo or Tauri with the x64 Visual C++ environment on Windows.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

let [command, ...args] = process.argv.slice(2);
if (!command) {
  console.error('usage: node scripts/msvc.mjs <command> [args...]');
  process.exit(1);
}

if (command === 'tauri') {
  const require = createRequire(import.meta.url);
  args.unshift(require.resolve('@tauri-apps/cli/tauri.js'));
  command = process.execPath;
}

const env = { ...process.env };
if (process.platform === 'win32') {
  const vswhere = path.join(env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)',
    'Microsoft Visual Studio', 'Installer', 'vswhere.exe');
  if (existsSync(vswhere)) {
    const query = spawnSync(vswhere, ['-latest', '-products', '*', '-utf8', '-requires',
      'Microsoft.VisualStudio.Component.VC.Tools.x86.x64', '-find', 'VC\\Auxiliary\\Build\\vcvars64.bat'],
      { encoding: 'utf8' });
    const vcvars = query.stdout?.trim();
    if (vcvars) {
      // Only the fixed environment setup runs in cmd.exe. Forward the user's arguments directly.
      const result = spawnSync('cmd.exe', ['/d', '/u', '/c', 'call "%PLAMO_VCVARS%" >nul && set'], {
        windowsVerbatimArguments: true, encoding: 'utf16le', env: { ...env, PLAMO_VCVARS: vcvars },
      });
      if (result.status !== 0) {
        console.error('Failed to initialize Visual C++ Build Tools');
        process.exit(1);
      }
      for (const line of result.stdout.split(/\r?\n/)) {
        const separator = line.indexOf('=');
        if (separator > 0) env[line.slice(0, separator)] = line.slice(separator + 1);
      }
    }
  }

  const projectRoot = fileURLToPath(new URL('../', import.meta.url));
  env.TEMP = env.TMP = path.join(projectRoot, 'src-tauri', 'target', 'tmp');
  mkdirSync(env.TEMP, { recursive: true });
}

const result = spawnSync(command, args, { stdio: 'inherit', env });
if (result.error) console.error(result.error.message);
process.exit(result.status ?? 1);
