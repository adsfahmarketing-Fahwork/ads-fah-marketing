import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from './AuthProvider'
import type { Role } from '../lib/roles'
import { Spinner } from '../components/ui'

export function RequireAuth({ children, roles }: { children: ReactNode; roles?: Role[] }) {
  const { session, profile, loading, recovery } = useAuth()
  const loc = useLocation()
  if (loading) return <Spinner full />
  if (recovery) return <Navigate to="/reset-password" replace />
  if (!session || !profile) return <Navigate to="/login" replace state={{ from: loc.pathname }} />
  if (roles && !roles.includes(profile.role)) return <Navigate to="/no-access" replace />
  return <>{children}</>
}
