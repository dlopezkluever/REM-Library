import { supabase } from '@/lib/supabase/client'
import type { Tables } from '@/types/database'

export type FeaturedConnectionRow = Tables<'featured_connections'>

export const getFeaturedConnections = async () => {
  const { data, error } = await supabase
    .from('featured_connections')
    .select('*')
    .order('created_at')
    .limit(3)

  if (error) {
    throw error
  }

  return data
}
