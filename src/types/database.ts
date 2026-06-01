export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: '14.5'
  }
  public: {
    Tables: {
      chunks: {
        Row: {
          chunk_index: number
          created_at: string
          end_sec: number | null
          fts: unknown
          id: string
          raw_text: string
          source_id: string
          speaker: string | null
          speaker_turns: Json
          start_sec: number | null
        }
        Insert: {
          chunk_index: number
          created_at?: string
          end_sec?: number | null
          fts?: unknown
          id?: string
          raw_text: string
          source_id: string
          speaker?: string | null
          speaker_turns?: Json
          start_sec?: number | null
        }
        Update: {
          chunk_index?: number
          created_at?: string
          end_sec?: number | null
          fts?: unknown
          id?: string
          raw_text?: string
          source_id?: string
          speaker?: string | null
          speaker_turns?: Json
          start_sec?: number | null
        }
        Relationships: [
          {
            foreignKeyName: 'chunks_source_id_fkey'
            columns: ['source_id']
            isOneToOne: false
            referencedRelation: 'sources'
            referencedColumns: ['id']
          },
        ]
      }
      claim_entities: {
        Row: {
          claim_id: string
          entity_id: string
        }
        Insert: {
          claim_id: string
          entity_id: string
        }
        Update: {
          claim_id?: string
          entity_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'claim_entities_claim_id_fkey'
            columns: ['claim_id']
            isOneToOne: false
            referencedRelation: 'claims'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'claim_entities_entity_id_fkey'
            columns: ['entity_id']
            isOneToOne: false
            referencedRelation: 'entities'
            referencedColumns: ['id']
          },
        ]
      }
      claim_evidence: {
        Row: {
          anchor_id: string
          claim_id: string
        }
        Insert: {
          anchor_id: string
          claim_id: string
        }
        Update: {
          anchor_id?: string
          claim_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'claim_evidence_anchor_id_fkey'
            columns: ['anchor_id']
            isOneToOne: false
            referencedRelation: 'source_anchors'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'claim_evidence_claim_id_fkey'
            columns: ['claim_id']
            isOneToOne: false
            referencedRelation: 'claims'
            referencedColumns: ['id']
          },
        ]
      }
      claims: {
        Row: {
          author_id: string | null
          confidence_override: number | null
          confidence_score: number
          created_at: string
          detailed_argument: string | null
          id: string
          statement: string
          status: Database['public']['Enums']['content_status']
          updated_at: string
        }
        Insert: {
          author_id?: string | null
          confidence_override?: number | null
          confidence_score?: number
          created_at?: string
          detailed_argument?: string | null
          id?: string
          statement: string
          status?: Database['public']['Enums']['content_status']
          updated_at?: string
        }
        Update: {
          author_id?: string | null
          confidence_override?: number | null
          confidence_score?: number
          created_at?: string
          detailed_argument?: string | null
          id?: string
          statement?: string
          status?: Database['public']['Enums']['content_status']
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'claims_author_id_fkey'
            columns: ['author_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      admin_audit_events: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          details: Json
          id: string
          target_id: string | null
          target_table: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          details?: Json
          id?: string
          target_id?: string | null
          target_table: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          details?: Json
          id?: string
          target_id?: string | null
          target_table?: string
        }
        Relationships: [
          {
            foreignKeyName: 'admin_audit_events_actor_id_fkey'
            columns: ['actor_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      entities: {
        Row: {
          aliases: string[]
          confidence_override: number | null
          confidence_score: number
          created_at: string
          description: string | null
          fts: unknown
          id: string
          name: string
          position_x: number | null
          position_y: number | null
          slug: string
          status: Database['public']['Enums']['content_status']
          type: Database['public']['Enums']['entity_type']
          updated_at: string
        }
        Insert: {
          aliases?: string[]
          confidence_override?: number | null
          confidence_score?: number
          created_at?: string
          description?: string | null
          fts?: unknown
          id?: string
          name: string
          position_x?: number | null
          position_y?: number | null
          slug: string
          status?: Database['public']['Enums']['content_status']
          type: Database['public']['Enums']['entity_type']
          updated_at?: string
        }
        Update: {
          aliases?: string[]
          confidence_override?: number | null
          confidence_score?: number
          created_at?: string
          description?: string | null
          fts?: unknown
          id?: string
          name?: string
          position_x?: number | null
          position_y?: number | null
          slug?: string
          status?: Database['public']['Enums']['content_status']
          type?: Database['public']['Enums']['entity_type']
          updated_at?: string
        }
        Relationships: []
      }
      entity_source_anchors: {
        Row: {
          anchor_id: string
          created_at: string
          entity_id: string
          extraction_id: string | null
        }
        Insert: {
          anchor_id: string
          created_at?: string
          entity_id: string
          extraction_id?: string | null
        }
        Update: {
          anchor_id?: string
          created_at?: string
          entity_id?: string
          extraction_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'entity_source_anchors_anchor_id_fkey'
            columns: ['anchor_id']
            isOneToOne: false
            referencedRelation: 'source_anchors'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'entity_source_anchors_entity_id_fkey'
            columns: ['entity_id']
            isOneToOne: false
            referencedRelation: 'entities'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'entity_source_anchors_extraction_id_fkey'
            columns: ['extraction_id']
            isOneToOne: false
            referencedRelation: 'extractions'
            referencedColumns: ['id']
          },
        ]
      }
      extractions: {
        Row: {
          chunk_id: string
          created_at: string
          extraction_data: Json
          id: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database['public']['Enums']['extraction_status']
        }
        Insert: {
          chunk_id: string
          created_at?: string
          extraction_data: Json
          id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database['public']['Enums']['extraction_status']
        }
        Update: {
          chunk_id?: string
          created_at?: string
          extraction_data?: Json
          id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database['public']['Enums']['extraction_status']
        }
        Relationships: [
          {
            foreignKeyName: 'extractions_chunk_id_fkey'
            columns: ['chunk_id']
            isOneToOne: false
            referencedRelation: 'chunks'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'extractions_reviewed_by_fkey'
            columns: ['reviewed_by']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      featured_connections: {
        Row: {
          created_at: string
          description: string
          entity_color: string
          id: string
          title: string
        }
        Insert: {
          created_at?: string
          description: string
          entity_color: string
          id?: string
          title: string
        }
        Update: {
          created_at?: string
          description?: string
          entity_color?: string
          id?: string
          title?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          email: string
          id: string
          role: Database['public']['Enums']['admin_role']
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          email: string
          id: string
          role?: Database['public']['Enums']['admin_role']
        }
        Update: {
          created_at?: string
          display_name?: string | null
          email?: string
          id?: string
          role?: Database['public']['Enums']['admin_role']
        }
        Relationships: []
      }
      relationships: {
        Row: {
          claim_ids: string[]
          created_at: string
          from_entity_id: string
          id: string
          to_entity_id: string
          type: Database['public']['Enums']['relationship_type']
          weight: number
        }
        Insert: {
          claim_ids?: string[]
          created_at?: string
          from_entity_id: string
          id?: string
          to_entity_id: string
          type: Database['public']['Enums']['relationship_type']
          weight?: number
        }
        Update: {
          claim_ids?: string[]
          created_at?: string
          from_entity_id?: string
          id?: string
          to_entity_id?: string
          type?: Database['public']['Enums']['relationship_type']
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: 'relationships_from_entity_id_fkey'
            columns: ['from_entity_id']
            isOneToOne: false
            referencedRelation: 'entities'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'relationships_to_entity_id_fkey'
            columns: ['to_entity_id']
            isOneToOne: false
            referencedRelation: 'entities'
            referencedColumns: ['id']
          },
        ]
      }
      source_anchors: {
        Row: {
          created_at: string
          end_page: number | null
          end_timestamp_sec: number | null
          id: string
          source_id: string
          speaker: string | null
          start_page: number | null
          start_timestamp_sec: number | null
          transcript_excerpt: string | null
        }
        Insert: {
          created_at?: string
          end_page?: number | null
          end_timestamp_sec?: number | null
          id?: string
          source_id: string
          speaker?: string | null
          start_page?: number | null
          start_timestamp_sec?: number | null
          transcript_excerpt?: string | null
        }
        Update: {
          created_at?: string
          end_page?: number | null
          end_timestamp_sec?: number | null
          id?: string
          source_id?: string
          speaker?: string | null
          start_page?: number | null
          start_timestamp_sec?: number | null
          transcript_excerpt?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'source_anchors_source_id_fkey'
            columns: ['source_id']
            isOneToOne: false
            referencedRelation: 'sources'
            referencedColumns: ['id']
          },
        ]
      }
      sources: {
        Row: {
          authors: string[]
          created_at: string
          description: string | null
          duration_seconds: number | null
          file_path: string | null
          format: Database['public']['Enums']['source_format']
          id: string
          page_count: number | null
          pipeline_error: string | null
          pipeline_stage: Database['public']['Enums']['pipeline_stage']
          pipeline_stage_entered_at: string
          publication_date: string | null
          status: Database['public']['Enums']['content_status']
          tier: Database['public']['Enums']['source_tier']
          title: string
          transcript_id: string | null
          updated_at: string
          url: string | null
        }
        Insert: {
          authors?: string[]
          created_at?: string
          description?: string | null
          duration_seconds?: number | null
          file_path?: string | null
          format: Database['public']['Enums']['source_format']
          id?: string
          page_count?: number | null
          pipeline_error?: string | null
          pipeline_stage?: Database['public']['Enums']['pipeline_stage']
          pipeline_stage_entered_at?: string
          publication_date?: string | null
          status?: Database['public']['Enums']['content_status']
          tier: Database['public']['Enums']['source_tier']
          title: string
          transcript_id?: string | null
          updated_at?: string
          url?: string | null
        }
        Update: {
          authors?: string[]
          created_at?: string
          description?: string | null
          duration_seconds?: number | null
          file_path?: string | null
          format?: Database['public']['Enums']['source_format']
          id?: string
          page_count?: number | null
          pipeline_error?: string | null
          pipeline_stage?: Database['public']['Enums']['pipeline_stage']
          pipeline_stage_entered_at?: string
          publication_date?: string | null
          status?: Database['public']['Enums']['content_status']
          tier?: Database['public']['Enums']['source_tier']
          title?: string
          transcript_id?: string | null
          updated_at?: string
          url?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_admin_claims_page: {
        Args: {
          page_limit?: number
          page_offset?: number
          search_query?: string | null
          status_filter?: Database['public']['Enums']['content_status'] | null
        }
        Returns: {
          author_id: string | null
          confidence_override: number | null
          confidence_score: number
          created_at: string
          detailed_argument: string | null
          entity_names: string[]
          evidence_count: number
          id: string
          statement: string
          status: Database['public']['Enums']['content_status']
          total_count: number
          updated_at: string
        }[]
      }
      get_admin_content_stats: { Args: never; Returns: Json }
      get_admin_entities_page: {
        Args: {
          page_limit?: number
          page_offset?: number
          search_query?: string | null
          status_filter?: Database['public']['Enums']['content_status'] | null
        }
        Returns: {
          aliases: string[]
          confidence_override: number | null
          confidence_score: number
          created_at: string
          description: string | null
          id: string
          name: string
          position_x: number | null
          position_y: number | null
          slug: string
          status: Database['public']['Enums']['content_status']
          total_count: number
          type: Database['public']['Enums']['entity_type']
          updated_at: string
        }[]
      }
      get_admin_source_list_rows: {
        Args: { page_limit?: number; page_offset?: number }
        Returns: {
          authors: string[]
          created_at: string
          description: string | null
          duration_seconds: number | null
          extraction_count: number
          file_path: string | null
          format: Database['public']['Enums']['source_format']
          id: string
          page_count: number | null
          pending_review_count: number
          pipeline_error: string | null
          pipeline_stage: Database['public']['Enums']['pipeline_stage']
          pipeline_stage_entered_at: string
          publication_date: string | null
          status: Database['public']['Enums']['content_status']
          tier: Database['public']['Enums']['source_tier']
          title: string
          transcript_id: string | null
          updated_at: string
          url: string | null
        }[]
      }
      get_pending_review_source_summaries: {
        Args: { page_limit?: number; page_offset?: number }
        Returns: {
          oldest_extraction_at: string
          pending_extraction_count: number
          pending_item_count: number
          source_format: Database['public']['Enums']['source_format']
          source_id: string
          source_status: Database['public']['Enums']['content_status']
          source_tier: Database['public']['Enums']['source_tier']
          source_title: string
          validation_failed_count: number
        }[]
      }
      has_internal_access: { Args: never; Returns: boolean }
      is_admin: { Args: never; Returns: boolean }
      publish_claims: { Args: { claim_ids: string[] }; Returns: string[] }
      publish_sources: { Args: { source_ids: string[] }; Returns: string[] }
      refresh_search_indexes: {
        Args: never
        Returns: {
          missingChunkFts: number
          missingEntityFts: number
          ok: boolean
        }
      }
      reject_failed_extraction: { Args: { extraction_id: string }; Returns: Json }
      review_extraction_item: {
        Args: {
          action: string
          claim_input?: Json | null
          entity_input?: Json | null
          extraction_id: string
          item_id: string
          item_kind: string
          split_input?: Json | null
          target_entity_id?: string | null
        }
        Returns: Json
      }
      search_entities: {
        Args: { search_query: string }
        Returns: {
          confidence_score: number
          id: string
          matched_excerpt: string
          name: string
          rank: number
          similarity: number
          slug: string
          type: Database['public']['Enums']['entity_type']
        }[]
      }
      search_global: { Args: { search_query: string }; Returns: Json }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { '': string }; Returns: string[] }
      update_claim_status: {
        Args: {
          claim_id: string
          next_status: Database['public']['Enums']['content_status']
        }
        Returns: string[]
      }
      update_source_status: {
        Args: {
          next_status: Database['public']['Enums']['content_status']
          source_id: string
        }
        Returns: string[]
      }
    }
    Enums: {
      admin_role: 'super_admin' | 'editor' | 'viewer'
      content_status: 'draft' | 'published' | 'archived' | 'disputed'
      entity_type: 'symbol' | 'figure' | 'narrative' | 'culture' | 'trope'
      extraction_status: 'pending' | 'confirmed' | 'edited' | 'rejected' | 'merged'
      pipeline_stage:
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
      relationship_type:
        | 'symbolizes'
        | 'appears_in'
        | 'belongs_to'
        | 'parallels'
        | 'instantiates'
        | 'supports'
      source_format: 'audio' | 'video' | 'text' | 'book' | 'url'
      source_tier: 'primary' | 'secondary'
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, 'public'>]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] & DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema['Tables']
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema['Tables']
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema['Enums']
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema['CompositeTypes']
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      admin_role: ['super_admin', 'editor', 'viewer'],
      content_status: ['draft', 'published', 'archived', 'disputed'],
      entity_type: ['symbol', 'figure', 'narrative', 'culture', 'trope'],
      extraction_status: ['pending', 'confirmed', 'edited', 'rejected', 'merged'],
      pipeline_stage: [
        'uploaded',
        'transcribing',
        'transcribing_failed',
        'chunking',
        'chunking_failed',
        'extracting',
        'extracting_failed',
        'review',
        'curated',
        'published',
      ],
      relationship_type: [
        'symbolizes',
        'appears_in',
        'belongs_to',
        'parallels',
        'instantiates',
        'supports',
      ],
      source_format: ['audio', 'video', 'text', 'book', 'url'],
      source_tier: ['primary', 'secondary'],
    },
  },
} as const
