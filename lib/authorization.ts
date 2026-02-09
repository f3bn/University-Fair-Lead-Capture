export function assertRole(userRole: 'admin' | 'operator', required: 'admin' | 'operator' = 'operator') {
  if (required === 'admin' && userRole !== 'admin') {
    throw new Error('Forbidden: Admin access required')
  }
}

export function assertExpoScope(resourceExpoId: string, userExpoId: string) {
  if (resourceExpoId !== userExpoId) {
    throw new Error('Forbidden: Expo scope mismatch')
  }
}
