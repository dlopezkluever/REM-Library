import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.106.1'

export const corsHeaders = {
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-assemblyai-webhook-secret',
  'Access-Control-Allow-Origin': '*',
}

export type PipelineStage =
  | 'uploaded'
  | 'transcribing'
  | 'transcribing_failed'
  | 'chunking'
  | 'chunking_failed'
  | 'extracting'
  | 'extracting_failed'
  | 'review'
  | 'curated'
  | 'published'

export interface SourceRow {
  file_path: string | null
  format: string
  id: string
  pipeline_error?: string | null
  pipeline_stage: PipelineStage
  status: string
  transcript_id: string | null
  url: string | null
}

interface EdgeRuntimeGlobal {
  waitUntil: (promise: Promise<unknown>) => void
}

export const jsonResponse = (body: unknown, status = 200) => {
  return Response.json(body, { headers: corsHeaders, status })
}

export const requireEnv = (name: string) => {
  const value = Deno.env.get(name)

  if (!value) {
    throw new Error(`${name} is not configured.`)
  }

  return value
}

export const createServiceClient = () => {
  const supabaseUrl = requireEnv('SUPABASE_URL')
  const serviceRoleKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY')

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    global: {
      headers: {
        Authorization: `Bearer ${serviceRoleKey}`,
      },
    },
  })
}

export const requireAdminOrServiceRole = async (
  request: Request,
  supabase: SupabaseClient
) => {
  const serviceRoleKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY')
  const authorization = request.headers.get('Authorization') ?? ''
  const token = authorization.replace(/^Bearer\s+/i, '').trim()

  if (token && token === serviceRoleKey) {
    return
  }

  if (!token) {
    throw new Error('Authentication is required.')
  }

  const { data: userData, error: userError } = await supabase.auth.getUser(token)

  if (userError || !userData.user) {
    throw new Error('Authentication is invalid.')
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', userData.user.id)
    .single()

  if (profileError || !profile) {
    throw new Error('Admin profile could not be verified.')
  }

  const role = typeof profile.role === 'string' ? profile.role : ''

  if (role !== 'super_admin' && role !== 'editor') {
    throw new Error('Editor access is required.')
  }
}

export const updateSourceStage = async (
  supabase: SupabaseClient,
  sourceId: string,
  stage: PipelineStage,
  extraValues: Record<string, unknown> = {}
) => {
  const nextValues: Record<string, unknown> = {
    ...extraValues,
    pipeline_stage: stage,
  }

  if (!stage.endsWith('_failed') && !('pipeline_error' in nextValues)) {
    nextValues.pipeline_error = null
  }

  const { error } = await supabase
    .from('sources')
    .update(nextValues)
    .eq('id', sourceId)

  if (error) {
    throw error
  }
}

export const failSourceStage = async (
  supabase: SupabaseClient,
  sourceId: string,
  stage: Extract<PipelineStage, 'transcribing_failed' | 'chunking_failed' | 'extracting_failed'>,
  error: unknown
) => {
  await updateSourceStage(supabase, sourceId, stage, {
    pipeline_error: errorMessage(error),
  })
}

export const invokeInternalFunction = async (functionName: string, body: unknown) => {
  const supabaseUrl = requireEnv('SUPABASE_URL')
  const serviceRoleKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY')
  const response = await fetch(`${supabaseUrl}/functions/v1/${functionName}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${serviceRoleKey}`,
      apikey: serviceRoleKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const responseText = await response.text()
    throw new Error(`${functionName} returned ${response.status}: ${responseText}`)
  }
}

export const runInBackground = (promise: Promise<unknown>) => {
  const runtime = (globalThis as typeof globalThis & { EdgeRuntime?: EdgeRuntimeGlobal })
    .EdgeRuntime
  const guardedPromise = promise.catch((error) => {
    console.error(errorMessage(error))
  })

  if (runtime) {
    runtime.waitUntil(guardedPromise)
    return
  }

  void guardedPromise
}

export const readJsonBody = async (request: Request) => {
  try {
    return (await request.json()) as unknown
  } catch {
    throw new Error('Request body must be valid JSON.')
  }
}

export const getSourceId = (body: unknown) => {
  if (typeof body !== 'object' || body === null || !('source_id' in body)) {
    throw new Error('source_id is required.')
  }

  const sourceId = (body as { source_id: unknown }).source_id

  if (typeof sourceId !== 'string' || !sourceId.trim()) {
    throw new Error('source_id is required.')
  }

  return sourceId
}

export const getBooleanFlag = (body: unknown, key: string) => {
  if (typeof body !== 'object' || body === null || !(key in body)) {
    return false
  }

  return (body as Record<string, unknown>)[key] === true
}

export const errorMessage = (error: unknown) => {
  if (error instanceof Error) {
    return error.message
  }

  if (typeof error === 'string' && error.trim()) {
    return error
  }

  return 'Unexpected pipeline error.'
}
