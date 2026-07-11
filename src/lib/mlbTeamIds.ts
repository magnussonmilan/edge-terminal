/**
 * MLB franchise identity across relocations and renames.
 *
 * FiveThirtyEight's mlb_elo.csv already collapses many franchises into a
 * single continuous abbreviation (verified from the raw file: e.g. WSN rows
 * exist for 1969–2004 covering the Montreal Expos years; LAD spans Brooklyn
 * eras; SFG spans the New York Giants years). Treating those abbreviations as
 * "new teams" at a rename would silently break rating continuity.
 *
 * This module makes that continuity explicit: every 538 team code maps to a
 * stable `franchiseId`, with documented historical names. Unknown / extinct
 * 19th-century codes get a franchiseId equal to their normalized abbreviation
 * so they never silently merge with a modern club.
 *
 * Mapping basis: continuous season spans observed in the 538 CSV + standard
 * MLB franchise history (not silent guessing).
 */

export interface FranchiseNameSpan {
  name: string
  fromSeason: number
  toSeason: number
}

export interface MlbFranchise {
  franchiseId: string
  /** Canonical 538 abbreviation used in the continuous series. */
  eloAbbr: string
  currentName: string
  historicalNames: FranchiseNameSpan[]
  notes: string
}

/**
 * Modern / continuous franchise table keyed by uppercase 538 abbr.
 * Extinct 19th-century clubs are handled by `resolveFranchiseId` fallback.
 */
export const MLB_FRANCHISES: Record<string, MlbFranchise> = {
  ARI: {
    franchiseId: 'ARI',
    eloAbbr: 'ARI',
    currentName: 'Arizona Diamondbacks',
    historicalNames: [
      { name: 'Arizona Diamondbacks', fromSeason: 1998, toSeason: 9999 },
    ],
    notes: 'Expansion franchise; continuous ARI in 538 file.',
  },
  ATL: {
    franchiseId: 'ATL',
    eloAbbr: 'ATL',
    currentName: 'Atlanta Braves',
    historicalNames: [
      { name: 'Boston Red Stockings / Beaneaters / Braves lineage', fromSeason: 1871, toSeason: 1952 },
      { name: 'Milwaukee Braves', fromSeason: 1953, toSeason: 1965 },
      { name: 'Atlanta Braves', fromSeason: 1966, toSeason: 9999 },
    ],
    notes:
      '538 uses ATL continuously from 1871 for the Braves franchise (Boston → Milwaukee → Atlanta).',
  },
  BAL: {
    franchiseId: 'BAL',
    eloAbbr: 'BAL',
    currentName: 'Baltimore Orioles',
    historicalNames: [
      { name: 'Milwaukee Brewers (AL 1901)', fromSeason: 1901, toSeason: 1901 },
      { name: 'St. Louis Browns', fromSeason: 1902, toSeason: 1953 },
      { name: 'Baltimore Orioles', fromSeason: 1954, toSeason: 9999 },
    ],
    notes: '538 uses BAL continuously for the Browns → Orioles franchise.',
  },
  BOS: {
    franchiseId: 'BOS',
    eloAbbr: 'BOS',
    currentName: 'Boston Red Sox',
    historicalNames: [
      { name: 'Boston Americans / Red Sox', fromSeason: 1901, toSeason: 9999 },
    ],
    notes: 'Continuous BOS in 538 file.',
  },
  CHC: {
    franchiseId: 'CHC',
    eloAbbr: 'CHC',
    currentName: 'Chicago Cubs',
    historicalNames: [
      { name: 'Chicago White Stockings / Colts / Orphans / Cubs', fromSeason: 1876, toSeason: 9999 },
    ],
    notes: 'Continuous CHC in 538 file.',
  },
  CHW: {
    franchiseId: 'CHW',
    eloAbbr: 'CHW',
    currentName: 'Chicago White Sox',
    historicalNames: [
      { name: 'Chicago White Sox', fromSeason: 1901, toSeason: 9999 },
    ],
    notes: 'Continuous CHW in 538 file.',
  },
  CIN: {
    franchiseId: 'CIN',
    eloAbbr: 'CIN',
    currentName: 'Cincinnati Reds',
    historicalNames: [
      { name: 'Cincinnati Red Stockings / Reds', fromSeason: 1882, toSeason: 9999 },
    ],
    notes: 'Continuous CIN in 538 file.',
  },
  CLE: {
    franchiseId: 'CLE',
    eloAbbr: 'CLE',
    currentName: 'Cleveland Guardians',
    historicalNames: [
      { name: 'Cleveland Blues / Bronchos / Naps / Indians / Guardians', fromSeason: 1901, toSeason: 9999 },
    ],
    notes: 'Continuous CLE across Indians → Guardians rename.',
  },
  COL: {
    franchiseId: 'COL',
    eloAbbr: 'COL',
    currentName: 'Colorado Rockies',
    historicalNames: [
      { name: 'Colorado Rockies', fromSeason: 1993, toSeason: 9999 },
    ],
    notes: 'Expansion; continuous COL.',
  },
  DET: {
    franchiseId: 'DET',
    eloAbbr: 'DET',
    currentName: 'Detroit Tigers',
    historicalNames: [
      { name: 'Detroit Tigers', fromSeason: 1901, toSeason: 9999 },
    ],
    notes: 'Continuous DET.',
  },
  HOU: {
    franchiseId: 'HOU',
    eloAbbr: 'HOU',
    currentName: 'Houston Astros',
    historicalNames: [
      { name: 'Houston Colt .45s / Astros', fromSeason: 1962, toSeason: 9999 },
    ],
    notes: 'Continuous HOU (NL → AL switch does not change franchise id).',
  },
  KCR: {
    franchiseId: 'KCR',
    eloAbbr: 'KCR',
    currentName: 'Kansas City Royals',
    historicalNames: [
      { name: 'Kansas City Royals', fromSeason: 1969, toSeason: 9999 },
    ],
    notes: 'Continuous KCR (not the 1950s Athletics years in KC).',
  },
  LAA: {
    franchiseId: 'LAA',
    eloAbbr: 'ANA',
    currentName: 'Los Angeles Angels',
    historicalNames: [
      { name: 'Los Angeles Angels', fromSeason: 1961, toSeason: 1964 },
      { name: 'California Angels', fromSeason: 1965, toSeason: 1996 },
      { name: 'Anaheim / Los Angeles Angels of Anaheim / Angels', fromSeason: 1997, toSeason: 9999 },
    ],
    notes:
      '538 uses ANA for the entire Angels franchise (not LAA/CAL). Map ANA → franchise LAA.',
  },
  ANA: {
    franchiseId: 'LAA',
    eloAbbr: 'ANA',
    currentName: 'Los Angeles Angels',
    historicalNames: [
      { name: 'Los Angeles / California / Anaheim Angels lineage', fromSeason: 1961, toSeason: 9999 },
    ],
    notes: 'Alias of LAA; 538 file key is ANA.',
  },
  LAD: {
    franchiseId: 'LAD',
    eloAbbr: 'LAD',
    currentName: 'Los Angeles Dodgers',
    historicalNames: [
      { name: 'Brooklyn Bridegrooms / Superbas / Robins / Dodgers', fromSeason: 1884, toSeason: 1957 },
      { name: 'Los Angeles Dodgers', fromSeason: 1958, toSeason: 9999 },
    ],
    notes: '538 uses LAD continuously including Brooklyn years (no separate BRO code).',
  },
  MIA: {
    franchiseId: 'MIA',
    eloAbbr: 'FLA',
    currentName: 'Miami Marlins',
    historicalNames: [
      { name: 'Florida Marlins', fromSeason: 1993, toSeason: 2011 },
      { name: 'Miami Marlins', fromSeason: 2012, toSeason: 9999 },
    ],
    notes: '538 uses FLA for the full Marlins history (no MIA code in file).',
  },
  FLA: {
    franchiseId: 'MIA',
    eloAbbr: 'FLA',
    currentName: 'Miami Marlins',
    historicalNames: [
      { name: 'Florida / Miami Marlins', fromSeason: 1993, toSeason: 9999 },
    ],
    notes: 'Alias of MIA; 538 file key is FLA.',
  },
  MIL: {
    franchiseId: 'MIL',
    eloAbbr: 'MIL',
    currentName: 'Milwaukee Brewers',
    historicalNames: [
      { name: 'Seattle Pilots', fromSeason: 1969, toSeason: 1969 },
      { name: 'Milwaukee Brewers', fromSeason: 1970, toSeason: 9999 },
    ],
    notes: '538 uses MIL continuously including the 1969 Pilots season.',
  },
  MIN: {
    franchiseId: 'MIN',
    eloAbbr: 'MIN',
    currentName: 'Minnesota Twins',
    historicalNames: [
      { name: 'Washington Senators (original)', fromSeason: 1901, toSeason: 1960 },
      { name: 'Minnesota Twins', fromSeason: 1961, toSeason: 9999 },
    ],
    notes: '538 uses MIN continuously for original Senators → Twins.',
  },
  NYM: {
    franchiseId: 'NYM',
    eloAbbr: 'NYM',
    currentName: 'New York Mets',
    historicalNames: [
      { name: 'New York Mets', fromSeason: 1962, toSeason: 9999 },
    ],
    notes: 'Continuous NYM.',
  },
  NYY: {
    franchiseId: 'NYY',
    eloAbbr: 'NYY',
    currentName: 'New York Yankees',
    historicalNames: [
      { name: 'Baltimore Orioles (1901–02) / Highlanders / Yankees', fromSeason: 1901, toSeason: 9999 },
    ],
    notes: 'Continuous NYY in 538 file.',
  },
  OAK: {
    franchiseId: 'OAK',
    eloAbbr: 'OAK',
    currentName: 'Athletics',
    historicalNames: [
      { name: 'Philadelphia Athletics', fromSeason: 1901, toSeason: 1954 },
      { name: 'Kansas City Athletics', fromSeason: 1955, toSeason: 1967 },
      { name: 'Oakland Athletics', fromSeason: 1968, toSeason: 9999 },
    ],
    notes: '538 uses OAK continuously across Philadelphia → KC → Oakland.',
  },
  PHI: {
    franchiseId: 'PHI',
    eloAbbr: 'PHI',
    currentName: 'Philadelphia Phillies',
    historicalNames: [
      { name: 'Philadelphia Quakers / Phillies', fromSeason: 1883, toSeason: 9999 },
    ],
    notes: 'Continuous PHI.',
  },
  PIT: {
    franchiseId: 'PIT',
    eloAbbr: 'PIT',
    currentName: 'Pittsburgh Pirates',
    historicalNames: [
      { name: 'Pittsburgh Alleghenys / Pirates', fromSeason: 1882, toSeason: 9999 },
    ],
    notes: 'Continuous PIT.',
  },
  SDP: {
    franchiseId: 'SDP',
    eloAbbr: 'SDP',
    currentName: 'San Diego Padres',
    historicalNames: [
      { name: 'San Diego Padres', fromSeason: 1969, toSeason: 9999 },
    ],
    notes: 'Continuous SDP.',
  },
  SEA: {
    franchiseId: 'SEA',
    eloAbbr: 'SEA',
    currentName: 'Seattle Mariners',
    historicalNames: [
      { name: 'Seattle Mariners', fromSeason: 1977, toSeason: 9999 },
    ],
    notes: 'Continuous SEA (distinct from 1969 Pilots → MIL).',
  },
  SFG: {
    franchiseId: 'SFG',
    eloAbbr: 'SFG',
    currentName: 'San Francisco Giants',
    historicalNames: [
      { name: 'New York Gothams / Giants', fromSeason: 1883, toSeason: 1957 },
      { name: 'San Francisco Giants', fromSeason: 1958, toSeason: 9999 },
    ],
    notes: '538 uses SFG continuously including New York Giants years (no NYG code).',
  },
  STL: {
    franchiseId: 'STL',
    eloAbbr: 'STL',
    currentName: 'St. Louis Cardinals',
    historicalNames: [
      { name: 'St. Louis Brown Stockings / Perfectos / Cardinals', fromSeason: 1882, toSeason: 9999 },
    ],
    notes: 'Continuous STL.',
  },
  TBR: {
    franchiseId: 'TBR',
    eloAbbr: 'TBD',
    currentName: 'Tampa Bay Rays',
    historicalNames: [
      { name: 'Tampa Bay Devil Rays', fromSeason: 1998, toSeason: 2007 },
      { name: 'Tampa Bay Rays', fromSeason: 2008, toSeason: 9999 },
    ],
    notes: '538 uses TBD for the full Rays history (no TBR code in file).',
  },
  TBD: {
    franchiseId: 'TBR',
    eloAbbr: 'TBD',
    currentName: 'Tampa Bay Rays',
    historicalNames: [
      { name: 'Tampa Bay Devil Rays / Rays', fromSeason: 1998, toSeason: 9999 },
    ],
    notes: 'Alias of TBR; 538 file key is TBD.',
  },
  TEX: {
    franchiseId: 'TEX',
    eloAbbr: 'TEX',
    currentName: 'Texas Rangers',
    historicalNames: [
      { name: 'Washington Senators (expansion)', fromSeason: 1961, toSeason: 1971 },
      { name: 'Texas Rangers', fromSeason: 1972, toSeason: 9999 },
    ],
    notes: '538 uses TEX continuously for expansion Senators → Rangers (distinct from MIN).',
  },
  TOR: {
    franchiseId: 'TOR',
    eloAbbr: 'TOR',
    currentName: 'Toronto Blue Jays',
    historicalNames: [
      { name: 'Toronto Blue Jays', fromSeason: 1977, toSeason: 9999 },
    ],
    notes: 'Continuous TOR.',
  },
  WSN: {
    franchiseId: 'WSN',
    eloAbbr: 'WSN',
    currentName: 'Washington Nationals',
    historicalNames: [
      { name: 'Montreal Expos', fromSeason: 1969, toSeason: 2004 },
      { name: 'Washington Nationals', fromSeason: 2005, toSeason: 9999 },
    ],
    notes:
      'Critical continuity case: 538 uses WSN for Expos years too (no MON code). Verified in raw file.',
  },
  MON: {
    franchiseId: 'WSN',
    eloAbbr: 'WSN',
    currentName: 'Washington Nationals',
    historicalNames: [
      { name: 'Montreal Expos', fromSeason: 1969, toSeason: 2004 },
    ],
    notes: 'Alias only — 538 file uses WSN, not MON.',
  },
}

/** Normalize 538 / mirror team codes to uppercase. */
export function normalizeMlbTeamAbbr(abbr: string): string {
  return abbr.trim().toUpperCase()
}

/**
 * Resolve a stable franchise id for rating continuity.
 * Unknown codes (mostly 19th-century clubs) stay as their own id — never
 * silently merge into a modern franchise.
 */
export function resolveFranchiseId(teamAbbr: string): string {
  const key = normalizeMlbTeamAbbr(teamAbbr)
  const hit = MLB_FRANCHISES[key]
  if (hit) return hit.franchiseId
  return key
}

export function franchiseDisplayName(
  teamAbbr: string,
  season: number,
): string {
  const key = normalizeMlbTeamAbbr(teamAbbr)
  const fr = MLB_FRANCHISES[key]
  if (!fr) return key
  for (const span of fr.historicalNames) {
    if (season >= span.fromSeason && season <= span.toSeason) return span.name
  }
  return fr.currentName
}
