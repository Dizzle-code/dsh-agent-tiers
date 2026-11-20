// Runs a script inside the DeepSeek Harness bundled runtime, which can read app.asar,
// and exposes the DSH patch parser and patch algorithm of that installation.
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

// Outside DSH this re-runs `scriptUrl` in DeepSeek Harness.exe and exits with its status.
export function relaunchInDsh(scriptUrl: string): void {
  if (process.versions.electron !== undefined) return
  const argv = process.argv.slice(2)
  const index = argv.indexOf('--dsh')
  const exe = (index >= 0 ? argv[index + 1] : undefined) ?? process.env.DSH_EXE
    ?? join(process.env.LOCALAPPDATA ?? '', 'Programs', 'DeepSeek Harness', 'DeepSeek Harness.exe')
  if (!existsSync(exe)) {
    console.error(`DeepSeek Harness executable not found: ${exe}\nPass --dsh <path to DeepSeek Harness.exe>.`)
    process.exit(2)
  }
  const forwarded = index >= 0 ? [...argv.slice(0, index), ...argv.slice(index + 2)] : argv
  const result = spawnSync(exe, [fileURLToPath(scriptUrl), ...forwarded], {
    stdio: 'inherit', env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
  })
  process.exit(result.status ?? 1)
}

export const engineAsar = () => join(dirname(process.execPath), 'resources', 'app.asar')
export const engineModules = () => join(engineAsar(), 'dsh', 'node_modules')

export async function loadEngine() {
  const modules = engineModules()
  const url = (path: string) => pathToFileURL(join(modules, path)).href
  const boot = await import(url('@deepseek-ai/dsh-app-boot/lib/index.js'))
  const include = await import(url('@deepseek-ai/cordis-plugin-include/lib/index.js'))
  const requireFromInclude = createRequire(join(modules, '@deepseek-ai/cordis-plugin-include/lib/index.js'))
  return {
    modules,
    loadOverlayPatches: boot.loadOverlayPatches as (bin: string, file: string) => any[],
    applyEntryPatches: include.applyEntryPatches as (data: any[], patches: any[], warn: (...args: unknown[]) => void) => any[],
    entryListSchema: include.entryListSchema,
    yaml: requireFromInclude('js-yaml'),
    semver: createRequire(join(modules, 'noop.js'))('semver'),
  }
}
