import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { STADIUMS } from '../src/lib/stadiums.ts'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const out = path.join(__dirname, '../src/data/nfl/stadiums.json')
writeFileSync(
  out,
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      notes: [
        'isOutdoor=false for domed/retractable roofs (default closed).',
        'Coordinates approximate; used only for api.weather.gov grid lookup.',
      ],
      stadiums: STADIUMS,
    },
    null,
    2,
  ),
)
console.log(`Wrote ${out}`)
