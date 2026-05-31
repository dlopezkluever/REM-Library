import { supabase } from '@/lib/supabase/client'
import type { Tables } from '@/types/database'
import type { EntityType } from '@/types/domain'

export type ExplorationRow = Tables<'explorations'>
export type ExplorationStepRow = Tables<'exploration_steps'>

export interface ExplorationSummary {
  id: string
  title: string
  description: string | null
  stepCount: number
  featuredType: EntityType | null
}

export interface ExplorationDetail {
  exploration: ExplorationRow
  steps: ExplorationStepRow[]
}

export interface ExplorationStepInput {
  entity_id: string | null
  prose_text: string
  focus_entity_ids: string[]
}

export interface CreateExplorationInput {
  title: string
  description: string | null
  steps: ExplorationStepInput[]
}

const unique = (values: string[]) => Array.from(new Set(values))

export const getPublishedExplorations = async (): Promise<ExplorationSummary[]> => {
  const { data: explorations, error } = await supabase
    .from('explorations')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) {
    throw error
  }

  if (explorations.length === 0) {
    return []
  }

  const explorationIds = explorations.map((exploration) => exploration.id)

  const { data: steps, error: stepsError } = await supabase
    .from('exploration_steps')
    .select('exploration_id, step_index, entity_id')
    .in('exploration_id', explorationIds)
    .order('step_index')

  if (stepsError) {
    throw stepsError
  }

  const entityIds = unique(
    steps
      .map((step) => step.entity_id)
      .filter((entityId): entityId is string => entityId !== null)
  )

  const typeById = new Map<string, EntityType>()

  if (entityIds.length > 0) {
    const { data: entities, error: entitiesError } = await supabase
      .from('entities')
      .select('id, type')
      .in('id', entityIds)
      .eq('status', 'published')

    if (entitiesError) {
      throw entitiesError
    }

    entities.forEach((entity) => typeById.set(entity.id, entity.type))
  }

  const stepsByExploration = new Map<string, typeof steps>()
  steps.forEach((step) => {
    const existing = stepsByExploration.get(step.exploration_id) ?? []
    existing.push(step)
    stepsByExploration.set(step.exploration_id, existing)
  })

  return explorations.map((exploration) => {
    const explorationSteps = stepsByExploration.get(exploration.id) ?? []
    const featuredStep = explorationSteps.find(
      (step) => step.entity_id !== null && typeById.has(step.entity_id)
    )

    return {
      id: exploration.id,
      title: exploration.title,
      description: exploration.description,
      stepCount: explorationSteps.length,
      featuredType: featuredStep?.entity_id ? (typeById.get(featuredStep.entity_id) ?? null) : null,
    }
  })
}

export const getExplorationById = async (id: string): Promise<ExplorationDetail | null> => {
  const { data: exploration, error } = await supabase
    .from('explorations')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (error) {
    throw error
  }

  if (!exploration) {
    return null
  }

  const { data: steps, error: stepsError } = await supabase
    .from('exploration_steps')
    .select('*')
    .eq('exploration_id', id)
    .order('step_index')

  if (stepsError) {
    throw stepsError
  }

  return { exploration, steps }
}

export const createExploration = async (
  input: CreateExplorationInput
): Promise<ExplorationRow> => {
  const { data: userData } = await supabase.auth.getUser()
  const createdBy = userData?.user?.id ?? null

  const { data: exploration, error } = await supabase
    .from('explorations')
    .insert({
      title: input.title,
      description: input.description,
      created_by: createdBy,
    })
    .select('*')
    .single()

  if (error) {
    throw error
  }

  if (input.steps.length > 0) {
    const stepRows = input.steps.map((step, index) => ({
      exploration_id: exploration.id,
      step_index: index,
      entity_id: step.entity_id,
      prose_text: step.prose_text,
      focus_entity_ids: step.focus_entity_ids,
    }))

    const { error: stepsError } = await supabase.from('exploration_steps').insert(stepRows)

    if (stepsError) {
      // Best-effort cleanup so a failed step insert does not leave an empty
      // exploration behind (the cascade removes any partially-written steps).
      await supabase.from('explorations').delete().eq('id', exploration.id)
      throw stepsError
    }
  }

  return exploration
}
