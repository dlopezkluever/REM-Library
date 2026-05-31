import { createClient } from '@supabase/supabase-js'

const corsHeaders = {
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Origin': '*',
}

interface SearchRequest {
  query?: unknown
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const body = (await request.json()) as SearchRequest
    const query = typeof body.query === 'string' ? body.query.trim() : ''

    if (!query) {
      return Response.json(
        { entities: [], claims: [], sources: [] },
        { headers: corsHeaders }
      )
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseKey =
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY')

    if (!supabaseUrl || !supabaseKey) {
      return Response.json(
        { error: 'Search function is missing Supabase configuration.' },
        { headers: corsHeaders, status: 500 }
      )
    }

    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: {
        headers: {
          Authorization: request.headers.get('Authorization') ?? `Bearer ${supabaseKey}`,
        },
      },
    })

    const { data, error } = await supabase.rpc('search_global', { search_query: query })

    if (error) {
      return Response.json({ error: error.message }, { headers: corsHeaders, status: 500 })
    }

    return Response.json(data, { headers: corsHeaders })
  } catch {
    return Response.json(
      { error: 'Search request could not be processed.' },
      { headers: corsHeaders, status: 400 }
    )
  }
})
