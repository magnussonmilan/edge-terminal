/**
 * MLB stadium reference — roof type + coordinates for postponement context.
 * Informational only: never feeds verifiedEquivalent / auto-approval.
 *
 * Roof types (2026 season):
 * - dome: fixed roof (weather structurally irrelevant)
 * - retractable: roof open/closed is a game-day ops decision — unknowable here
 * - open_air: weather is situationally relevant
 */

export type MlbRoofType = 'dome' | 'retractable' | 'open_air'

export interface MlbStadiumInfo {
  team: string
  stadium: string
  roofType: MlbRoofType
  /** null for fixed dome — no weather lookup. */
  latitude: number | null
  longitude: number | null
}

/**
 * All 30 MLB clubs keyed by franchise id (same ids as mlbTeamIds / venue matcher).
 * Lat/lon approximate park coordinates for api.weather.gov.
 */
export const MLB_STADIUMS: MlbStadiumInfo[] = [
  { team: 'ARI', stadium: 'Chase Field', roofType: 'retractable', latitude: 33.4453, longitude: -112.0667 },
  { team: 'ATL', stadium: 'Truist Park', roofType: 'open_air', latitude: 33.8907, longitude: -84.4677 },
  { team: 'BAL', stadium: 'Oriole Park at Camden Yards', roofType: 'open_air', latitude: 39.2839, longitude: -76.6217 },
  { team: 'BOS', stadium: 'Fenway Park', roofType: 'open_air', latitude: 42.3467, longitude: -71.0972 },
  { team: 'CHC', stadium: 'Wrigley Field', roofType: 'open_air', latitude: 41.9484, longitude: -87.6553 },
  { team: 'CHW', stadium: 'Rate Field', roofType: 'open_air', latitude: 41.8299, longitude: -87.6338 },
  { team: 'CIN', stadium: 'Great American Ball Park', roofType: 'open_air', latitude: 39.0979, longitude: -84.5082 },
  { team: 'CLE', stadium: 'Progressive Field', roofType: 'open_air', latitude: 41.4962, longitude: -81.6852 },
  { team: 'COL', stadium: 'Coors Field', roofType: 'open_air', latitude: 39.7559, longitude: -104.9942 },
  { team: 'DET', stadium: 'Comerica Park', roofType: 'open_air', latitude: 42.339, longitude: -83.0485 },
  { team: 'HOU', stadium: 'Daikin Park', roofType: 'retractable', latitude: 29.7573, longitude: -95.3555 },
  { team: 'KCR', stadium: 'Kauffman Stadium', roofType: 'open_air', latitude: 39.0517, longitude: -94.4803 },
  { team: 'ANA', stadium: 'Angel Stadium', roofType: 'open_air', latitude: 33.8003, longitude: -117.8827 },
  { team: 'LAD', stadium: 'Dodger Stadium', roofType: 'open_air', latitude: 34.0739, longitude: -118.24 },
  { team: 'MIA', stadium: 'loanDepot park', roofType: 'retractable', latitude: 25.7781, longitude: -80.2197 },
  { team: 'MIL', stadium: 'American Family Field', roofType: 'retractable', latitude: 43.028, longitude: -87.9712 },
  { team: 'MIN', stadium: 'Target Field', roofType: 'open_air', latitude: 44.9817, longitude: -93.2776 },
  { team: 'NYM', stadium: 'Citi Field', roofType: 'open_air', latitude: 40.7571, longitude: -73.8458 },
  { team: 'NYY', stadium: 'Yankee Stadium', roofType: 'open_air', latitude: 40.8296, longitude: -73.9262 },
  { team: 'OAK', stadium: 'Sutter Health Park', roofType: 'open_air', latitude: 38.5802, longitude: -121.5133 },
  { team: 'PHI', stadium: 'Citizens Bank Park', roofType: 'open_air', latitude: 39.9061, longitude: -75.1665 },
  { team: 'PIT', stadium: 'PNC Park', roofType: 'open_air', latitude: 40.4469, longitude: -80.0057 },
  { team: 'SDP', stadium: 'Petco Park', roofType: 'open_air', latitude: 32.7076, longitude: -117.157 },
  { team: 'SEA', stadium: 'T-Mobile Park', roofType: 'retractable', latitude: 47.5914, longitude: -122.3325 },
  { team: 'SFG', stadium: 'Oracle Park', roofType: 'open_air', latitude: 37.7786, longitude: -122.3893 },
  { team: 'STL', stadium: 'Busch Stadium', roofType: 'open_air', latitude: 38.6226, longitude: -90.1928 },
  { team: 'TBR', stadium: 'Tropicana Field', roofType: 'dome', latitude: null, longitude: null },
  { team: 'TEX', stadium: 'Globe Life Field', roofType: 'retractable', latitude: 32.7473, longitude: -97.0842 },
  { team: 'TOR', stadium: 'Rogers Centre', roofType: 'retractable', latitude: 43.6414, longitude: -79.3891 },
  { team: 'WSN', stadium: 'Nationals Park', roofType: 'open_air', latitude: 38.873, longitude: -77.0074 },
]

const byTeam = new Map(MLB_STADIUMS.map((s) => [s.team, s]))

/** Alias codes that appear in venue tickers → franchise id used in MLB_STADIUMS. */
const TEAM_ALIASES: Record<string, string> = {
  LAA: 'ANA',
  SD: 'SDP',
  SF: 'SFG',
  TB: 'TBR',
  KC: 'KCR',
  CWS: 'CHW',
  WSH: 'WSN',
  WAS: 'WSN',
  AZ: 'ARI',
  ATH: 'OAK',
}

export function normalizeMlbStadiumTeam(team: string): string {
  const t = team.trim().toUpperCase()
  return TEAM_ALIASES[t] ?? t
}

export function getMlbStadium(team: string): MlbStadiumInfo | undefined {
  return byTeam.get(normalizeMlbStadiumTeam(team))
}

export function mlbRoofLabel(roofType: MlbRoofType): string {
  switch (roofType) {
    case 'dome':
      return 'dome'
    case 'retractable':
      return 'retractable'
    case 'open_air':
      return 'open air'
  }
}

/** Retractable roofs: never guess open/closed. */
export const RETRACTABLE_ROOF_NOTE =
  'retractable roof — open/closed status not knowable in advance'

export const DOME_WEATHER_NOTE =
  'fixed dome — weather is structurally irrelevant; no forecast fetched'
