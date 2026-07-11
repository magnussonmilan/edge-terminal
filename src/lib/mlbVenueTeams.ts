/**
 * Map Kalshi / Polymarket MLB team labels → franchise IDs.
 * Reuses mlbTeamIds.resolveFranchiseId; adds venue-specific nicknames/abbrevs.
 */

import {
  MLB_FRANCHISES,
  normalizeMlbTeamAbbr,
  resolveFranchiseId,
} from './mlbTeamIds'

/** Common venue aliases → franchise id (uppercase). */
const ALIAS_TO_FRANCHISE: Record<string, string> = {
  // Kalshi short city / nicknames seen in titles
  TORONTO: 'TOR',
  'BLUE JAYS': 'TOR',
  'SAN DIEGO': 'SDP',
  PADRES: 'SDP',
  'LOS ANGELES D': 'LAD',
  'LA DODGERS': 'LAD',
  DODGERS: 'LAD',
  ARIZONA: 'ARI',
  'DIAMONDBACKS': 'ARI',
  'D-BACKS': 'ARI',
  DBACKS: 'ARI',
  'NEW YORK Y': 'NYY',
  YANKEES: 'NYY',
  'NEW YORK M': 'NYM',
  METS: 'NYM',
  'BOSTON': 'BOS',
  'RED SOX': 'BOS',
  'CHICAGO C': 'CHC',
  CUBS: 'CHC',
  'CHICAGO W': 'CHW',
  'WHITE SOX': 'CHW',
  'SAN FRANCISCO': 'SFG',
  GIANTS: 'SFG',
  'ST LOUIS': 'STL',
  'ST. LOUIS': 'STL',
  CARDINALS: 'STL',
  'TAMPA BAY': 'TBR',
  RAYS: 'TBR',
  'KANSAS CITY': 'KCR',
  ROYALS: 'KCR',
  'ATHLETICS': 'OAK',
  "A'S": 'OAK',
  AS: 'OAK',
  ATH: 'OAK',
  'WASHINGTON': 'WSN',
  NATIONALS: 'WSN',
  'MIAMI': 'MIA',
  MARLINS: 'MIA',
  'COLORADO': 'COL',
  ROCKIES: 'COL',
  'MILWAUKEE': 'MIL',
  BREWERS: 'MIL',
  'MINNESOTA': 'MIN',
  TWINS: 'MIN',
  'CLEVELAND': 'CLE',
  GUARDIANS: 'CLE',
  'DETROIT': 'DET',
  TIGERS: 'DET',
  'HOUSTON': 'HOU',
  ASTROS: 'HOU',
  'TEXAS': 'TEX',
  RANGERS: 'TEX',
  'SEATTLE': 'SEA',
  MARINERS: 'SEA',
  'PHILADELPHIA': 'PHI',
  PHILLIES: 'PHI',
  'PITTSBURGH': 'PIT',
  PIRATES: 'PIT',
  'CINCINNATI': 'CIN',
  REDS: 'CIN',
  'ATLANTA': 'ATL',
  BRAVES: 'ATL',
  'BALTIMORE': 'BAL',
  ORIOLES: 'BAL',
  'ANGELS': 'ANA',
  'LA ANGELS': 'ANA',
  'LOS ANGELES A': 'ANA',
  // Polymarket abbreviations
  TOR: 'TOR',
  SD: 'SDP',
  SDP: 'SDP',
  LAD: 'LAD',
  AZ: 'ARI',
  ARI: 'ARI',
  NYY: 'NYY',
  NYM: 'NYM',
  BOS: 'BOS',
  CHC: 'CHC',
  CWS: 'CHW',
  CHW: 'CHW',
  SF: 'SFG',
  SFG: 'SFG',
  STL: 'STL',
  TB: 'TBR',
  TBR: 'TBR',
  KC: 'KCR',
  KCR: 'KCR',
  OAK: 'OAK',
  WSH: 'WSN',
  WSN: 'WSN',
  WAS: 'WSN',
  MIA: 'MIA',
  FLA: 'MIA',
  COL: 'COL',
  MIL: 'MIL',
  MIN: 'MIN',
  CLE: 'CLE',
  DET: 'DET',
  HOU: 'HOU',
  TEX: 'TEX',
  SEA: 'SEA',
  PHI: 'PHI',
  PIT: 'PIT',
  CIN: 'CIN',
  ATL: 'ATL',
  BAL: 'BAL',
  LAA: 'ANA',
  ANA: 'ANA',
}

function stripTeamNoise(raw: string): string {
  return raw
    .replace(/\b(vs\.?|at|@)\b/gi, ' ')
    .replace(/[^a-zA-Z0-9'.\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Resolve a venue team label / abbrev to a franchise id, or null if unknown.
 */
export function resolveMlbVenueTeam(raw: string): string | null {
  const cleaned = stripTeamNoise(raw)
  if (!cleaned) return null

  const upper = cleaned.toUpperCase()
  if (ALIAS_TO_FRANCHISE[upper]) {
    return resolveFranchiseId(ALIAS_TO_FRANCHISE[upper])
  }

  // Try as abbreviation first
  const abbr = normalizeMlbTeamAbbr(cleaned)
  if (abbr.length <= 3 && MLB_FRANCHISES[abbr]) {
    return resolveFranchiseId(abbr)
  }
  if (ALIAS_TO_FRANCHISE[abbr]) {
    return resolveFranchiseId(ALIAS_TO_FRANCHISE[abbr])
  }

  // Match current franchise name / nickname substring
  const lower = cleaned.toLowerCase()
  for (const f of Object.values(MLB_FRANCHISES)) {
    if (f.currentName.toLowerCase() === lower) return f.franchiseId
    const nick = f.currentName.split(' ').pop()?.toLowerCase()
    if (nick && nick === lower) return f.franchiseId
    if (f.currentName.toLowerCase().includes(lower) && lower.length >= 5) {
      return f.franchiseId
    }
  }

  // City-only from ALIAS (first word / full)
  if (ALIAS_TO_FRANCHISE[upper]) {
    return resolveFranchiseId(ALIAS_TO_FRANCHISE[upper])
  }

  return null
}

/** Sort two franchise ids into a stable [a,b] tuple. */
export function sortedTeamPair(
  a: string,
  b: string,
): [string, string] | null {
  if (!a || !b || a === b) return null
  return a < b ? [a, b] : [b, a]
}
