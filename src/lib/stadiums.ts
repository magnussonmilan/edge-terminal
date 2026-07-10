/**
 * NFL stadium metadata for weather gating.
 * isOutdoor: false for domed / retractable-roof venues (default roof closed).
 * Lat/lon are approximate stadium coordinates for api.weather.gov.
 */
export interface StadiumInfo {
  team: string
  name: string
  city: string
  lat: number
  lon: number
  isOutdoor: boolean
}

export const STADIUMS: StadiumInfo[] = [
  { team: 'ARI', name: 'State Farm Stadium', city: 'Glendale', lat: 33.5276, lon: -112.2626, isOutdoor: false },
  { team: 'ATL', name: 'Mercedes-Benz Stadium', city: 'Atlanta', lat: 33.7554, lon: -84.401, isOutdoor: false },
  { team: 'BAL', name: 'M&T Bank Stadium', city: 'Baltimore', lat: 39.278, lon: -76.6227, isOutdoor: true },
  { team: 'BUF', name: 'Highmark Stadium', city: 'Orchard Park', lat: 42.7738, lon: -78.787, isOutdoor: true },
  { team: 'CAR', name: 'Bank of America Stadium', city: 'Charlotte', lat: 35.2258, lon: -80.8528, isOutdoor: true },
  { team: 'CHI', name: 'Soldier Field', city: 'Chicago', lat: 41.8623, lon: -87.6167, isOutdoor: true },
  { team: 'CIN', name: 'Paycor Stadium', city: 'Cincinnati', lat: 39.0954, lon: -84.516, isOutdoor: true },
  { team: 'CLE', name: 'Huntington Bank Field', city: 'Cleveland', lat: 41.5061, lon: -81.6995, isOutdoor: true },
  { team: 'DAL', name: 'AT&T Stadium', city: 'Arlington', lat: 32.7473, lon: -97.0945, isOutdoor: false },
  { team: 'DEN', name: 'Empower Field', city: 'Denver', lat: 39.7439, lon: -105.0201, isOutdoor: true },
  { team: 'DET', name: 'Ford Field', city: 'Detroit', lat: 42.34, lon: -83.0456, isOutdoor: false },
  { team: 'GB', name: 'Lambeau Field', city: 'Green Bay', lat: 44.5013, lon: -88.0622, isOutdoor: true },
  { team: 'HOU', name: 'NRG Stadium', city: 'Houston', lat: 29.6847, lon: -95.4107, isOutdoor: false },
  { team: 'IND', name: 'Lucas Oil Stadium', city: 'Indianapolis', lat: 39.7601, lon: -86.1639, isOutdoor: false },
  { team: 'JAX', name: 'EverBank Stadium', city: 'Jacksonville', lat: 30.3239, lon: -81.6373, isOutdoor: true },
  { team: 'KC', name: 'GEHA Field at Arrowhead', city: 'Kansas City', lat: 39.0489, lon: -94.4839, isOutdoor: true },
  { team: 'LA', name: 'SoFi Stadium', city: 'Inglewood', lat: 33.9535, lon: -118.3392, isOutdoor: false },
  { team: 'LAC', name: 'SoFi Stadium', city: 'Inglewood', lat: 33.9535, lon: -118.3392, isOutdoor: false },
  { team: 'LAR', name: 'SoFi Stadium', city: 'Inglewood', lat: 33.9535, lon: -118.3392, isOutdoor: false },
  { team: 'LV', name: 'Allegiant Stadium', city: 'Las Vegas', lat: 36.0908, lon: -115.1836, isOutdoor: false },
  { team: 'MIA', name: 'Hard Rock Stadium', city: 'Miami Gardens', lat: 25.958, lon: -80.2389, isOutdoor: true },
  { team: 'MIN', name: 'U.S. Bank Stadium', city: 'Minneapolis', lat: 44.9738, lon: -93.2581, isOutdoor: false },
  { team: 'NE', name: 'Gillette Stadium', city: 'Foxborough', lat: 42.0909, lon: -71.2643, isOutdoor: true },
  { team: 'NO', name: 'Caesars Superdome', city: 'New Orleans', lat: 29.9511, lon: -90.0812, isOutdoor: false },
  { team: 'NYG', name: 'MetLife Stadium', city: 'East Rutherford', lat: 40.8128, lon: -74.0742, isOutdoor: true },
  { team: 'NYJ', name: 'MetLife Stadium', city: 'East Rutherford', lat: 40.8128, lon: -74.0742, isOutdoor: true },
  { team: 'PHI', name: 'Lincoln Financial Field', city: 'Philadelphia', lat: 39.9008, lon: -75.1675, isOutdoor: true },
  { team: 'PIT', name: 'Acrisure Stadium', city: 'Pittsburgh', lat: 40.4468, lon: -80.0158, isOutdoor: true },
  { team: 'SEA', name: 'Lumen Field', city: 'Seattle', lat: 47.5952, lon: -122.3316, isOutdoor: true },
  { team: 'SF', name: "Levi's Stadium", city: 'Santa Clara', lat: 37.403, lon: -121.97, isOutdoor: true },
  { team: 'TB', name: 'Raymond James Stadium', city: 'Tampa', lat: 27.9759, lon: -82.5033, isOutdoor: true },
  { team: 'TEN', name: 'Nissan Stadium', city: 'Nashville', lat: 36.1665, lon: -86.7713, isOutdoor: true },
  { team: 'WAS', name: 'Northwest Stadium', city: 'Landover', lat: 38.9077, lon: -76.8645, isOutdoor: true },
  { team: 'WSH', name: 'Northwest Stadium', city: 'Landover', lat: 38.9077, lon: -76.8645, isOutdoor: true },
]

const byTeam = new Map(STADIUMS.map((s) => [s.team, s]))

export function getStadium(team: string): StadiumInfo | undefined {
  return byTeam.get(team)
}

export function isOutdoorStadium(team: string): boolean {
  return getStadium(team)?.isOutdoor ?? true
}
