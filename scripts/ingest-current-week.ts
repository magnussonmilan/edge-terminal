/**
 * Ingest current-week (or dry-run historical week) injuries from nflverse.
 *
 * Usage:
 *   npm run ingest:current-week
 *   npm run ingest:current-week -- --dry-run-season=2025 --dry-run-week=17
 */
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { getCurrentNflSeason } from '../src/lib/season.ts'
import {
  filterInjuriesByWeek,
  injuriesUrlForSeason,
  latestWeekInInjuries,
  parseInjuriesCsv,
  type CurrentWeekInjuriesFile,
} from '../src/lib/injuryPipeline.ts'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT_DIR = path.join(__dirname, '../src/data/nfl')

function parseArgs(argv: string[]) {
  let dryRunSeason: number | null = null
  let dryRunWeek: number | null = null
  for (const arg of argv) {
    const seasonMatch = arg.match(/^--dry-run-season=(\d+)$/)
    if (seasonMatch) dryRunSeason = Number(seasonMatch[1])
    const weekMatch = arg.match(/^--dry-run-week=(\d+)$/)
    if (weekMatch) dryRunWeek = Number(weekMatch[1])
  }
  if ((dryRunSeason == null) !== (dryRunWeek == null)) {
    throw new Error(
      'Dry-run requires both --dry-run-season=YYYY and --dry-run-week=N',
    )
  }
  return { dryRunSeason, dryRunWeek }
}

async function main() {
  const { dryRunSeason, dryRunWeek } = parseArgs(process.argv.slice(2))
  const dryRun = dryRunSeason != null && dryRunWeek != null
  const season = dryRun ? dryRunSeason! : getCurrentNflSeason(new Date())

  const url = injuriesUrlForSeason(season)
  console.log(
    dryRun
      ? `Dry-run: season ${season} week ${dryRunWeek} ← ${url}`
      : `Current season ${season} ← ${url}`,
  )

  const res = await fetch(url)
  if (res.status === 404) {
    console.log(`No injury data yet for ${season}`)
    process.exit(0)
  }
  if (!res.ok) {
    console.error(`Failed to fetch injuries for ${season}: HTTP ${res.status}`)
    process.exit(1)
  }

  const text = await res.text()
  if (!text.trim()) {
    console.error(`Empty injury CSV for ${season} — refusing to write stale/synthetic data`)
    process.exit(1)
  }

  let injuries = parseInjuriesCsv(text)
  let week: number | null = dryRun ? dryRunWeek! : latestWeekInInjuries(injuries)

  if (week == null) {
    console.error(`No weeks found in injuries_${season}.csv`)
    process.exit(1)
  }

  injuries = filterInjuriesByWeek(injuries, season, week)
  if (injuries.length === 0) {
    console.error(
      `No injury rows for season ${season} week ${week} after dedupe — failing loudly`,
    )
    process.exit(1)
  }

  const payload: CurrentWeekInjuriesFile = {
    season,
    week,
    generatedAt: new Date().toISOString(),
    source: url,
    dryRun,
    injuries,
  }

  await mkdir(OUT_DIR, { recursive: true })
  const outPath = path.join(OUT_DIR, 'current-week-injuries.json')
  await writeFile(outPath, JSON.stringify(payload, null, 2))
  console.log(
    `Wrote ${injuries.length} injuries → ${outPath} (season ${season} week ${week}${dryRun ? ', dry-run' : ''})`,
  )
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
