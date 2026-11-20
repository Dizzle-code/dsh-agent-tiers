// Tier definitions. Every tier copies rows verbatim from one official dsh-web-app preset,
// so upstream configuration (plan-mode text, compaction limits, ...) is never retyped.
import { join } from 'node:path'

export interface Tier {
  folder: string
  rowId: string
  presetId: string
  name: string
  description: string
  order: number
  source: 'standard' | 'cordis'
  // Official row ids to keep; undefined keeps every row of the source preset.
  keep?: string[]
  drop?: string[]
}

export const TIERS: Tier[] = [
  {
    folder: 'creator',
    rowId: 'agent-tier-creator',
    presetId: 'tier-creator',
    name: 'Creator',
    description: 'Passt DeepSeek Harness selbst an (offizieller Creator-Modus).',
    order: 10,
    source: 'cordis',
  },
  {
    folder: 'coding-extra',
    rowId: 'agent-tier-coding-extra',
    presetId: 'tier-coding-extra',
    name: 'Coding Extra Tools',
    description: 'Alle Standard-Werkzeuge: Web, Subagenten, Workflows, Office, Zeitplan, Plugin-Verwaltung.',
    order: 11,
    source: 'standard',
  },
  {
    folder: 'coding-normal',
    rowId: 'agent-tier-coding-normal',
    presetId: 'tier-coding-normal',
    name: 'Coding Normal',
    description: 'Standard ohne Web, Zeitplan, Plugin-Verwaltung und Plugin-Marktplatz.',
    order: 12,
    source: 'standard',
    drop: ['tool-web', 'tool-schedule', 'tool-plugin-manager', 'tool-plugin-market'],
  },
  {
    folder: 'coding-minimal',
    rowId: 'agent-tier-coding-minimal',
    presetId: 'tier-coding-minimal',
    name: 'Coding Minimal',
    description: 'Nur Terminal, Dateien lesen/schreiben/suchen, Todo-Liste und Rückfragen.',
    order: 13,
    source: 'standard',
    keep: ['persona', 'agent-instructions', 'tool-bash', 'tool-pwsh', 'tool-fs', 'tool-fs-search',
      'compaction', 'tool-ask-user', 'tool-todo'],
  },
]

export const SOURCE_FILES: Record<Tier['source'], string> = {
  standard: '@deepseek-ai/dsh-web-app/presets/standard.patch.yml',
  cordis: '@deepseek-ai/dsh-web-app/presets/cordis.patch.yml',
}

export const tierPatchFile = (folder: string) => `tiers/${folder}/cordis.patch.yml`

type Row = { id?: string, name?: string, config?: any, [key: string]: unknown }
type Load = (bin: string, file: string) => any[]

// Builds one tier patch list from the official preset files of a DSH build.
export function buildTier(tier: Tier, modules: string, load: Load): any[] {
  const patches = load('tiers', join(modules, SOURCE_FILES[tier.source]))
  const official: Row | undefined = patches.flatMap(patch => patch.insert ?? [])
    .find((row: Row) => row.name === '@deepseek-ai/dsh-agent-preset' && row.config?.id === tier.source)
  if (official === undefined) throw new Error(`official preset "${tier.source}" not found`)
  const rows: Row[] = official.config.plugins
  const known = new Set(rows.map(row => row.id))
  for (const id of [...tier.keep ?? [], ...tier.drop ?? []]) {
    if (!known.has(id)) throw new Error(`tier ${tier.folder}: official preset "${tier.source}" has no row ${id}`)
  }
  const plugins = rows.filter(row => (tier.keep === undefined || tier.keep.includes(row.id!))
    && !(tier.drop ?? []).includes(row.id!))
  return [{
    insert: [{
      id: tier.rowId,
      name: '@deepseek-ai/dsh-agent-preset',
      config: {
        id: tier.presetId, name: tier.name, description: tier.description, order: tier.order, plugins,
      },
    }],
  }]
}
