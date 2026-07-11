import { Navigate } from 'react-router-dom'

/** Hub → power ratings. */
export function RankingsIndexPage() {
  return <Navigate to="/rankings/power" replace />
}
