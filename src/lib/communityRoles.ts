import type { Enums } from '@/types/database'

type AdminRole = Enums<'admin_role'>

export const communityContributorRoles = new Set<AdminRole>([
  'contributor',
  'editor',
  'super_admin',
])

export const communityAdminRoles = new Set<AdminRole>(['editor', 'super_admin'])

export const canContributeToCommunity = (role: AdminRole | null) =>
  Boolean(role && communityContributorRoles.has(role))

