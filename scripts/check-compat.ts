// Verifies the tier patches against DeepSeek Harness builds with the DSH patch parser and
// patch algorithm. Target builds are read as data only; their code never runs.
import { spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { engineAsar, loadEngine, relaunchInDsh } from './dsh-runtime.ts'
import { buildTier, tierPatchFile, TIERS } from './tiers.ts'

relaunchInDsh(import.meta.url)

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const BASE_BUNDLES = ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app']
const PRESET = '@deepseek-ai/dsh-agent-preset'
// The verdict relies on these files; a target must match the checking build byte for byte.
const ENGINE_FILES = [
  '@deepseek-ai/cordis-plugin-include/src/patch.ts',
  '@deepseek-ai/dsh-app-boot/src/plugin-compatibility.ts',
  '@deepseek-ai/dsh-agent-preset-registry/src/definition.ts',
]

const targets: string[] = []
let e2e = true
const argv = process.argv.slice(2)
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--target') targets.push(resolve(argv[++i]))
  else if (argv[i] === '--no-e2e') e2e = false
  else throw new Error(`unknown argument ${argv[i]}`)
}

const engine = await loadEngine()
const readJson = (path: string) => JSON.parse(readFileSync(path, 'utf8'))
const failures: string[] = []
const fail = (label: string, message: string) => { failures.push(`${label}: ${message}`) }
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

type Entry = { id?: string, name?: string, group?: boolean, config?: any, [key: string]: unknown }

function rowsById(entries: Entry[], map = new Map<string, Entry>()): Map<string, Entry> {
  for (const entry of entries) {
    if (typeof entry.id === 'string') map.set(entry.id, entry)
    if (entry.group && Array.isArray(entry.config)) rowsById(entry.config, map)
  }
  return map
}

function compose(patches: unknown[]): { rows: Map<string, Entry>, warnings: string[] } {
  const warnings: string[] = []
  const tree = engine.applyEntryPatches([], structuredClone(patches), (...args: unknown[]) => {
    warnings.push(args.map(String).join(' '))
  })
  return { rows: rowsById(tree), warnings }
}

function basePatches(modules: string): unknown[] {
  return BASE_BUNDLES.flatMap((bundle) => {
    const declared = readJson(join(modules, bundle, 'package.json')).dsh?.bundle?.patch
    const files: string[] = typeof declared === 'string' ? [declared] : declared
    return files.map(file => join(modules, bundle, file))
  }).flatMap(file => engine.loadOverlayPatches('check', file))
}

const ownFiles: string[] = (() => {
  const declared = readJson(join(ROOT, 'package.json')).dsh.bundle.patch
  return (typeof declared === 'string' ? [declared] : declared).map((file: string) => join(ROOT, file))
})()
const ownPatches = ownFiles.flatMap(file => engine.loadOverlayPatches('check', file))

function checkManifest(): void {
  const expected = TIERS.map(tier => join(ROOT, tierPatchFile(tier.folder)))
  if (!same(ownFiles, expected)) fail('package.json', 'dsh.bundle.patch must list every tier file in TIERS order')
}

// Every plugin row must name a package that ships in the target build.
function checkPackages(label: string, modules: string, rows: Entry[]): void {
  for (const row of rowsById(rows).values()) {
    if (typeof row.name !== 'string' || row.name.startsWith('cordis:')) continue
    const parts = row.name.split('/')
    const pkg = parts[0].startsWith('@') ? parts.slice(0, 2).join('/') : parts[0]
    if (!existsSync(join(modules, pkg, 'package.json'))) fail(label, `plugin package ${pkg} (row ${row.id}) is missing`)
  }
}

function checkComposition(label: string, before: Map<string, Entry>, after: Map<string, Entry>, modules?: string): void {
  for (const [id, row] of before) {
    if (!same(row, after.get(id))) fail(label, `existing row ${id} changed`)
  }
  const added = [...after.keys()].filter(id => !before.has(id))
  const expected = TIERS.map(tier => tier.rowId)
  if (!same([...added].sort(), [...expected].sort())) fail(label, `added rows ${JSON.stringify(added)}, expected ${JSON.stringify(expected)}`)
  const presetIds = [...after.values()].filter(row => row.name === PRESET).map(row => row.config?.id)
  const duplicates = presetIds.filter((id, index) => presetIds.indexOf(id) !== index)
  if (duplicates.length > 0) fail(label, `duplicate agent preset ids ${JSON.stringify(duplicates)}`)
  for (const tier of TIERS) {
    const row = after.get(tier.rowId)
    if (row === undefined) continue
    if (row.name !== PRESET || row.disabled === true) fail(label, `row ${tier.rowId} is not an enabled ${PRESET} row`)
    if (row.config?.id !== tier.presetId) fail(label, `row ${tier.rowId} declares preset ${row.config?.id}`)
    if (modules !== undefined) checkPackages(label, modules, row.config?.plugins ?? [])
  }
}

function checkTarget(target: string): void {
  const modules = join(target, 'dsh', 'node_modules')
  const version: string = readJson(join(modules, '@deepseek-ai/dsh-app-boot/package.json')).version
  const label = `${version} (${target})`
  const range: string = readJson(join(ROOT, 'package.json')).engines?.dsh
  if (!engine.semver.satisfies(version, range, { includePrerelease: true })) fail(label, `engines.dsh "${range}" does not include ${version}`)
  for (const file of ENGINE_FILES) {
    if (!readFileSync(join(modules, file)).equals(readFileSync(join(engine.modules, file)))) {
      fail(label, `${file} differs from the checking DSH build; run this check with that version's own DeepSeek Harness.exe`)
    }
  }
  for (const tier of TIERS) {
    try {
      const file = engine.loadOverlayPatches('check', join(ROOT, tierPatchFile(tier.folder)))
      if (!same(file, buildTier(tier, modules, engine.loadOverlayPatches))) {
        fail(label, `${tierPatchFile(tier.folder)} no longer matches the official "${tier.source}" preset; run npm run generate`)
      }
    } catch (error) {
      fail(label, `tier ${tier.folder}: ${String(error)}`)
    }
  }
  const base = basePatches(modules)
  const before = compose(base)
  const after = compose([...base, ...ownPatches])
  for (const warning of after.warnings.slice(before.warnings.length)) fail(label, `loader warning from this plugin: ${warning}`)
  checkComposition(label, before.rows, after.rows, modules)
  console.log(`checked ${label}: ${TIERS.length} tiers, ${before.rows.size} existing rows unchanged`)
}

// Boots nothing: runs the real `dsh --dump-config` on a throwaway profile in a temporary DSH_HOME.
function checkEndToEnd(): void {
  const home = mkdtempSync(join(tmpdir(), 'dsh-agent-tiers-e2e-'))
  const label = 'end-to-end dump-config'
  try {
    const profile = join(home, 'profiles', 'tiers-check')
    const pkg = join(profile, 'node_modules', 'dsh-agent-tiers')
    mkdirSync(pkg, { recursive: true })
    cpSync(join(ROOT, 'package.json'), join(pkg, 'package.json'))
    cpSync(join(ROOT, 'tiers'), join(pkg, 'tiers'), { recursive: true })
    writeFileSync(join(profile, 'package.json'), JSON.stringify({
      name: 'dsh-profile-tiers-check', private: true,
      dsh: { profile: { bundles: [...BASE_BUNDLES, 'dsh-agent-tiers'] } },
    }))
    const bin = join(engine.modules, '@deepseek-ai/dsh/lib/bin.js')
    const run = spawnSync(process.execPath, [bin, '--profile', 'tiers-check', '--dump-config'], {
      cwd: home, encoding: 'utf8', env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', DSH_HOME: home },
    })
    if (run.status !== 0) { fail(label, `exit ${run.status}: ${run.stderr}`); return }
    if (run.stderr.trim() !== '') fail(label, `stderr: ${run.stderr.trim()}`)
    const dumpFile = join(home, 'dump.yml')
    writeFileSync(dumpFile, run.stdout)
    checkComposition(label, compose(basePatches(engine.modules)).rows, rowsById(engine.loadOverlayPatches('check', dumpFile)))
    console.log(`checked ${label}: bundle accepted`)
  } finally {
    rmSync(home, { recursive: true, force: true })
  }
}

checkManifest()
for (const target of targets.length > 0 ? targets : [engineAsar()]) checkTarget(target)
if (e2e) checkEndToEnd()

if (failures.length > 0) {
  console.error(`\nFAILED (${failures.length}):\n- ${failures.join('\n- ')}`)
  process.exit(1)
}
console.log('\nOK: dsh-agent-tiers is compatible with every checked build.')
