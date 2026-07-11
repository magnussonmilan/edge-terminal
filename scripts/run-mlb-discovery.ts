import { runMlbMarketDiscovery } from '../src/lib/mlbPairDiscovery.ts'

async function main() {
  const r = await runMlbMarketDiscovery()
  console.log(
    JSON.stringify(
      {
        scannedAt: r.scannedAt,
        kalshiCount: r.kalshiCount,
        polymarketCount: r.polymarketCount,
        matchedCount: r.matchedCount,
        unmatchedKalshi: r.unmatchedKalshi,
        unmatchedPolymarket: r.unmatchedPolymarket,
        autoApproved: r.autoApproved.length,
        needsReview: r.needsReview.length,
        sampleFlags: r.needsReview.slice(0, 5).map((i) => ({
          desc: i.proposed.description,
          flags: i.flags.map((f) => `${f.category}:${f.severity}`),
        })),
        sampleAuto: r.autoApproved.slice(0, 5).map((i) => i.proposed.description),
        flagCategoryCounts: r.needsReview.reduce(
          (acc, i) => {
            for (const f of i.flags) {
              acc[f.category] = (acc[f.category] ?? 0) + 1
            }
            return acc
          },
          {} as Record<string, number>,
        ),
      },
      null,
      2,
    ),
  )
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
