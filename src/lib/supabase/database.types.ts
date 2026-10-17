// Generated from the LOCAL schema (supabase/migrations) with:
//   npx supabase@2.118.0 gen types typescript --local --schema public > src/lib/supabase/database.types.ts
// Do not edit by hand; regenerate after changing a migration.

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "public": {
          Tables: {
            "audit_events": {
                  Row: {
                    "action": string,"actor_id": string,"actor_role": string,"at": string,"created_at": string,"details": NonNullable<Json>,"hash": string,"key_id": string,"organization_id": string,"outcome": string,"prev_hash": string | null,"project_id": string,"seq": number,"signature": string,"target": string | null
                  }
                  Insert: {
                    "action": string,"actor_id"?: string,"actor_role": string,"at": string,"created_at"?: string,"details"?: NonNullable<Json>,"hash": string,"key_id": string,"organization_id": string,"outcome": string,"prev_hash"?: string | null,"project_id": string,"seq": number,"signature": string,"target"?: string | null
                  }
                  Update: {
                    "action"?: string,"actor_id"?: string,"actor_role"?: string,"at"?: string,"created_at"?: string,"details"?: NonNullable<Json>,"hash"?: string,"key_id"?: string,"organization_id"?: string,"outcome"?: string,"prev_hash"?: string | null,"project_id"?: string,"seq"?: number,"signature"?: string,"target"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "audit_events_project_id_organization_id_fkey"
      columns: ["project_id","organization_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["id","organization_id"]
    }
                  ]
                },"competitor_observations": {
                  Row: {
                    "availability": string,"competitor_id": string | null,"created_at": string,"created_by": string | null,"device": string | null,"id": string,"market_country": string | null,"market_language": string | null,"method": string,"metric": string,"notes": string | null,"observed_on": string,"organization_id": string,"project_id": string,"source_name": string,"source_reference": string | null,"value": number | null,"verification": string,"verified_at": string | null,"verified_by": string | null
                  }
                  Insert: {
                    "availability": string,"competitor_id"?: string | null,"created_at"?: string,"created_by"?: string | null,"device"?: string | null,"id"?: string,"market_country"?: string | null,"market_language"?: string | null,"method": string,"metric": string,"notes"?: string | null,"observed_on": string,"organization_id": string,"project_id": string,"source_name": string,"source_reference"?: string | null,"value"?: number | null,"verification"?: string,"verified_at"?: string | null,"verified_by"?: string | null
                  }
                  Update: {
                    "availability"?: string,"competitor_id"?: string | null,"created_at"?: string,"created_by"?: string | null,"device"?: string | null,"id"?: string,"market_country"?: string | null,"market_language"?: string | null,"method"?: string,"metric"?: string,"notes"?: string | null,"observed_on"?: string,"organization_id"?: string,"project_id"?: string,"source_name"?: string,"source_reference"?: string | null,"value"?: number | null,"verification"?: string,"verified_at"?: string | null,"verified_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "competitor_observations_competitor_id_project_id_fkey"
      columns: ["competitor_id","project_id"]
isOneToOne: false
      referencedRelation: "competitors"
      referencedColumns: ["id","project_id"]
    },{
      foreignKeyName: "competitor_observations_project_id_organization_id_fkey"
      columns: ["project_id","organization_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["id","organization_id"]
    }
                  ]
                },"competitors": {
                  Row: {
                    "archived_at": string | null,"created_at": string,"created_by": string | null,"domain": string,"id": string,"name": string | null,"notes": string | null,"organization_id": string,"project_id": string,"relation": string,"status": string,"updated_at": string
                  }
                  Insert: {
                    "archived_at"?: string | null,"created_at"?: string,"created_by"?: string | null,"domain": string,"id"?: string,"name"?: string | null,"notes"?: string | null,"organization_id": string,"project_id": string,"relation"?: string,"status"?: string,"updated_at"?: string
                  }
                  Update: {
                    "archived_at"?: string | null,"created_at"?: string,"created_by"?: string | null,"domain"?: string,"id"?: string,"name"?: string | null,"notes"?: string | null,"organization_id"?: string,"project_id"?: string,"relation"?: string,"status"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "competitors_project_id_organization_id_fkey"
      columns: ["project_id","organization_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["id","organization_id"]
    }
                  ]
                },"content_briefs": {
                  Row: {
                    "approved_at": string | null,"approved_by": string | null,"archived_at": string | null,"assignee": string | null,"audience": string | null,"created_at": string,"created_by": string,"cta": string | null,"id": string,"internal_links": NonNullable<Json>,"main_topic": string,"market_country": string | null,"market_language": string,"objective": string | null,"opportunity_id": string,"organization_id": string,"original_data": string | null,"outline": NonNullable<Json>,"project_id": string,"questions": NonNullable<Json>,"review_note": string | null,"reviewed_at": string | null,"reviewed_by": string | null,"risks": string | null,"search_intent": string,"sources_consulted": string | null,"status": string,"submitted_at": string | null,"submitted_by": string | null,"target_url": string | null,"updated_at": string,"version": number
                  }
                  Insert: {
                    "approved_at"?: string | null,"approved_by"?: string | null,"archived_at"?: string | null,"assignee"?: string | null,"audience"?: string | null,"created_at"?: string,"created_by"?: string,"cta"?: string | null,"id"?: string,"internal_links"?: NonNullable<Json>,"main_topic": string,"market_country"?: string | null,"market_language": string,"objective"?: string | null,"opportunity_id": string,"organization_id": string,"original_data"?: string | null,"outline"?: NonNullable<Json>,"project_id": string,"questions"?: NonNullable<Json>,"review_note"?: string | null,"reviewed_at"?: string | null,"reviewed_by"?: string | null,"risks"?: string | null,"search_intent": string,"sources_consulted"?: string | null,"status"?: string,"submitted_at"?: string | null,"submitted_by"?: string | null,"target_url"?: string | null,"updated_at"?: string,"version"?: number
                  }
                  Update: {
                    "approved_at"?: string | null,"approved_by"?: string | null,"archived_at"?: string | null,"assignee"?: string | null,"audience"?: string | null,"created_at"?: string,"created_by"?: string,"cta"?: string | null,"id"?: string,"internal_links"?: NonNullable<Json>,"main_topic"?: string,"market_country"?: string | null,"market_language"?: string,"objective"?: string | null,"opportunity_id"?: string,"organization_id"?: string,"original_data"?: string | null,"outline"?: NonNullable<Json>,"project_id"?: string,"questions"?: NonNullable<Json>,"review_note"?: string | null,"reviewed_at"?: string | null,"reviewed_by"?: string | null,"risks"?: string | null,"search_intent"?: string,"sources_consulted"?: string | null,"status"?: string,"submitted_at"?: string | null,"submitted_by"?: string | null,"target_url"?: string | null,"updated_at"?: string,"version"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "content_briefs_opportunity_id_project_id_fkey"
      columns: ["opportunity_id","project_id"]
isOneToOne: false
      referencedRelation: "content_opportunities"
      referencedColumns: ["id","project_id"]
    },{
      foreignKeyName: "content_briefs_project_id_organization_id_fkey"
      columns: ["project_id","organization_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["id","organization_id"]
    }
                  ]
                },"content_clusters": {
                  Row: {
                    "created_at": string,"created_by": string,"description": string | null,"id": string,"main_topic": string,"name": string,"organization_id": string,"project_id": string,"updated_at": string
                  }
                  Insert: {
                    "created_at"?: string,"created_by"?: string,"description"?: string | null,"id"?: string,"main_topic": string,"name": string,"organization_id": string,"project_id": string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string,"description"?: string | null,"id"?: string,"main_topic"?: string,"name"?: string,"organization_id"?: string,"project_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "content_clusters_project_id_organization_id_fkey"
      columns: ["project_id","organization_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["id","organization_id"]
    }
                  ]
                },"content_evidence": {
                  Row: {
                    "created_at": string,"created_by": string,"detail": string | null,"id": string,"import_id": string | null,"kind": string,"opportunity_id": string,"organization_id": string,"project_id": string,"provider_result_id": string | null,"source_date": string | null,"source_url": string | null,"title": string
                  }
                  Insert: {
                    "created_at"?: string,"created_by"?: string,"detail"?: string | null,"id"?: string,"import_id"?: string | null,"kind": string,"opportunity_id": string,"organization_id": string,"project_id": string,"provider_result_id"?: string | null,"source_date"?: string | null,"source_url"?: string | null,"title": string
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string,"detail"?: string | null,"id"?: string,"import_id"?: string | null,"kind"?: string,"opportunity_id"?: string,"organization_id"?: string,"project_id"?: string,"provider_result_id"?: string | null,"source_date"?: string | null,"source_url"?: string | null,"title"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "content_evidence_import_id_fkey"
      columns: ["import_id"]
isOneToOne: false
      referencedRelation: "imports"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "content_evidence_opportunity_id_project_id_fkey"
      columns: ["opportunity_id","project_id"]
isOneToOne: false
      referencedRelation: "content_opportunities"
      referencedColumns: ["id","project_id"]
    },{
      foreignKeyName: "content_evidence_project_id_organization_id_fkey"
      columns: ["project_id","organization_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["id","organization_id"]
    },{
      foreignKeyName: "content_evidence_provider_result_id_fkey"
      columns: ["provider_result_id"]
isOneToOne: false
      referencedRelation: "provider_results"
      referencedColumns: ["id"]
    }
                  ]
                },"content_opportunities": {
                  Row: {
                    "cluster_id": string | null,"cluster_role": string | null,"created_at": string,"created_by": string,"id": string,"market_country": string | null,"market_language": string,"opportunity_type": string,"organization_id": string,"page_kind": string,"page_url": string | null,"priority": string,"priority_reason": string | null,"project_id": string,"rationale": string,"search_intent": string,"status": string,"topic": string,"updated_at": string
                  }
                  Insert: {
                    "cluster_id"?: string | null,"cluster_role"?: string | null,"created_at"?: string,"created_by"?: string,"id"?: string,"market_country"?: string | null,"market_language": string,"opportunity_type": string,"organization_id": string,"page_kind": string,"page_url"?: string | null,"priority"?: string,"priority_reason"?: string | null,"project_id": string,"rationale": string,"search_intent": string,"status"?: string,"topic": string,"updated_at"?: string
                  }
                  Update: {
                    "cluster_id"?: string | null,"cluster_role"?: string | null,"created_at"?: string,"created_by"?: string,"id"?: string,"market_country"?: string | null,"market_language"?: string,"opportunity_type"?: string,"organization_id"?: string,"page_kind"?: string,"page_url"?: string | null,"priority"?: string,"priority_reason"?: string | null,"project_id"?: string,"rationale"?: string,"search_intent"?: string,"status"?: string,"topic"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "content_opportunities_cluster_id_project_id_fkey"
      columns: ["cluster_id","project_id"]
isOneToOne: false
      referencedRelation: "content_clusters"
      referencedColumns: ["id","project_id"]
    },{
      foreignKeyName: "content_opportunities_project_id_organization_id_fkey"
      columns: ["project_id","organization_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["id","organization_id"]
    }
                  ]
                },"geo_observations": {
                  Row: {
                    "answer_excerpt": string | null,"cited_sources": NonNullable<Json>,"created_at": string,"created_by": string,"engine": string,"engine_detail": string | null,"entity_name": string,"evidence_reference": string | null,"id": string,"market_country": string | null,"market_language": string | null,"mentioned_entities": NonNullable<Json>,"method": string,"notes": string | null,"observed_on": string,"organization_id": string,"presence": string,"project_id": string,"query_text": string,"supersedes_id": string | null,"verification": string,"verified_at": string | null,"verified_by": string | null
                  }
                  Insert: {
                    "answer_excerpt"?: string | null,"cited_sources"?: NonNullable<Json>,"created_at"?: string,"created_by"?: string,"engine": string,"engine_detail"?: string | null,"entity_name": string,"evidence_reference"?: string | null,"id"?: string,"market_country"?: string | null,"market_language"?: string | null,"mentioned_entities"?: NonNullable<Json>,"method": string,"notes"?: string | null,"observed_on": string,"organization_id": string,"presence": string,"project_id": string,"query_text": string,"supersedes_id"?: string | null,"verification"?: string,"verified_at"?: string | null,"verified_by"?: string | null
                  }
                  Update: {
                    "answer_excerpt"?: string | null,"cited_sources"?: NonNullable<Json>,"created_at"?: string,"created_by"?: string,"engine"?: string,"engine_detail"?: string | null,"entity_name"?: string,"evidence_reference"?: string | null,"id"?: string,"market_country"?: string | null,"market_language"?: string | null,"mentioned_entities"?: NonNullable<Json>,"method"?: string,"notes"?: string | null,"observed_on"?: string,"organization_id"?: string,"presence"?: string,"project_id"?: string,"query_text"?: string,"supersedes_id"?: string | null,"verification"?: string,"verified_at"?: string | null,"verified_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "geo_observations_project_id_organization_id_fkey"
      columns: ["project_id","organization_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["id","organization_id"]
    },{
      foreignKeyName: "geo_observations_supersedes_id_project_id_fkey"
      columns: ["supersedes_id","project_id"]
isOneToOne: false
      referencedRelation: "geo_observations"
      referencedColumns: ["id","project_id"]
    }
                  ]
                },"geo_proposals": {
                  Row: {
                    "created_at": string,"created_by": string,"evidence_ids": (string)[],"hypothesis": string,"id": string,"limitations": string | null,"organization_id": string,"priority": string,"priority_reason": string,"problem": string,"project_id": string,"query_text": string,"review_note": string | null,"reviewed_at": string | null,"reviewed_by": string | null,"rule": string,"status": string,"suggested_action": string,"title": string,"updated_at": string
                  }
                  Insert: {
                    "created_at"?: string,"created_by"?: string,"evidence_ids"?: (string)[],"hypothesis": string,"id"?: string,"limitations"?: string | null,"organization_id": string,"priority": string,"priority_reason": string,"problem": string,"project_id": string,"query_text": string,"review_note"?: string | null,"reviewed_at"?: string | null,"reviewed_by"?: string | null,"rule": string,"status"?: string,"suggested_action": string,"title": string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string,"evidence_ids"?: (string)[],"hypothesis"?: string,"id"?: string,"limitations"?: string | null,"organization_id"?: string,"priority"?: string,"priority_reason"?: string,"problem"?: string,"project_id"?: string,"query_text"?: string,"review_note"?: string | null,"reviewed_at"?: string | null,"reviewed_by"?: string | null,"rule"?: string,"status"?: string,"suggested_action"?: string,"title"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "geo_proposals_project_id_organization_id_fkey"
      columns: ["project_id","organization_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["id","organization_id"]
    }
                  ]
                },"imports": {
                  Row: {
                    "captured_at": string,"created_at": string,"created_by": string,"error_count": number,"errors": NonNullable<Json>,"file_bytes": number,"file_sha256": string,"finding_count": number,"findings": NonNullable<Json>,"format": string,"id": string,"organization_id": string,"period_end": string | null,"period_start": string | null,"project_id": string,"source_kind": string,"source_label": string,"source_tool": string | null,"source_url": string | null,"status": string
                  }
                  Insert: {
                    "captured_at": string,"created_at"?: string,"created_by"?: string,"error_count": number,"errors": NonNullable<Json>,"file_bytes": number,"file_sha256": string,"finding_count": number,"findings": NonNullable<Json>,"format": string,"id"?: string,"organization_id": string,"period_end"?: string | null,"period_start"?: string | null,"project_id": string,"source_kind": string,"source_label": string,"source_tool"?: string | null,"source_url"?: string | null,"status": string
                  }
                  Update: {
                    "captured_at"?: string,"created_at"?: string,"created_by"?: string,"error_count"?: number,"errors"?: NonNullable<Json>,"file_bytes"?: number,"file_sha256"?: string,"finding_count"?: number,"findings"?: NonNullable<Json>,"format"?: string,"id"?: string,"organization_id"?: string,"period_end"?: string | null,"period_start"?: string | null,"project_id"?: string,"source_kind"?: string,"source_label"?: string,"source_tool"?: string | null,"source_url"?: string | null,"status"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "imports_project_id_organization_id_fkey"
      columns: ["project_id","organization_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["id","organization_id"]
    }
                  ]
                },"organization_members": {
                  Row: {
                    "created_at": string,"organization_id": string,"role": string,"user_id": string
                  }
                  Insert: {
                    "created_at"?: string,"organization_id": string,"role": string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"organization_id"?: string,"role"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "organization_members_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"organizations": {
                  Row: {
                    "created_at": string,"created_by": string | null,"id": string,"name": string,"slug": string
                  }
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"id"?: string,"name": string,"slug": string
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"id"?: string,"name"?: string,"slug"?: string
                  }
                  Relationships: [
                    
                  ]
                },"project_members": {
                  Row: {
                    "created_at": string,"organization_id": string,"project_id": string,"role": string,"user_id": string
                  }
                  Insert: {
                    "created_at"?: string,"organization_id": string,"project_id": string,"role": string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"organization_id"?: string,"project_id"?: string,"role"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "project_members_organization_id_user_id_fkey"
      columns: ["organization_id","user_id"]
isOneToOne: false
      referencedRelation: "organization_members"
      referencedColumns: ["organization_id","user_id"]
    },{
      foreignKeyName: "project_members_project_id_organization_id_fkey"
      columns: ["project_id","organization_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["id","organization_id"]
    }
                  ]
                },"projects": {
                  Row: {
                    "created_at": string,"domain": string | null,"id": string,"name": string,"organization_id": string,"slug": string,"vertical": string | null
                  }
                  Insert: {
                    "created_at"?: string,"domain"?: string | null,"id"?: string,"name": string,"organization_id": string,"slug": string,"vertical"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"domain"?: string | null,"id"?: string,"name"?: string,"organization_id"?: string,"slug"?: string,"vertical"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "projects_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"provider_results": {
                  Row: {
                    "captured_at": string | null,"created_at": string,"created_by": string,"data": Json | null,"data_hash": string,"data_hash_alg": string,"id": string,"key_id": string,"operation": string,"organization_id": string,"project_id": string,"provider": string,"signature": string,"signed_payload": NonNullable<Json>,"status": string
                  }
                  Insert: {
                    "captured_at"?: string | null,"created_at"?: string,"created_by"?: string,"data"?: Json | null,"data_hash": string,"data_hash_alg": string,"id"?: string,"key_id": string,"operation": string,"organization_id": string,"project_id": string,"provider": string,"signature": string,"signed_payload": NonNullable<Json>,"status": string
                  }
                  Update: {
                    "captured_at"?: string | null,"created_at"?: string,"created_by"?: string,"data"?: Json | null,"data_hash"?: string,"data_hash_alg"?: string,"id"?: string,"key_id"?: string,"operation"?: string,"organization_id"?: string,"project_id"?: string,"provider"?: string,"signature"?: string,"signed_payload"?: NonNullable<Json>,"status"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "provider_results_project_id_organization_id_fkey"
      columns: ["project_id","organization_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["id","organization_id"]
    }
                  ]
                },"seo_keywords": {
                  Row: {
                    "country_code": string,"created_at": string,"created_by": string,"id": string,"intent": string,"language_code": string,"organization_id": string,"phrase": string,"project_id": string,"target_url": string | null,"topic": string,"updated_at": string
                  }
                  Insert: {
                    "country_code": string,"created_at"?: string,"created_by"?: string,"id"?: string,"intent"?: string,"language_code": string,"organization_id": string,"phrase": string,"project_id": string,"target_url"?: string | null,"topic"?: string,"updated_at"?: string
                  }
                  Update: {
                    "country_code"?: string,"created_at"?: string,"created_by"?: string,"id"?: string,"intent"?: string,"language_code"?: string,"organization_id"?: string,"phrase"?: string,"project_id"?: string,"target_url"?: string | null,"topic"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "seo_keywords_project_id_organization_id_fkey"
      columns: ["project_id","organization_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["id","organization_id"]
    }
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "accept_project_invitation":
{ Args: { "p_token": string }; Returns: Json
                           },
"delete_import_with_receipt":
{ Args: { "p_import": string,"p_project": string }; Returns: Json
                           },
"google_capture":
{ Args: { "p_command": string,"p_payload"?: Json,"p_project_id": string }; Returns: Json
                           },
"google_recovery_state":
{ Args: { "p_project_id": string }; Returns: Json
                           },
"openseo_active_job":
{ Args: { "p_project_id": string }; Returns: Json
                           },
"openseo_connection":
{ Args: { "p_command": string,"p_payload"?: Json,"p_project_id": string }; Returns: Json
                           },
"openseo_google_property":
{ Args: { "p_command": string,"p_payload"?: Json,"p_project_id": string,"p_provider": string }; Returns: Json
                           },
"openseo_job":
{ Args: { "p_command": string,"p_job_id"?: string,"p_payload"?: Json,"p_project_id": string }; Returns: Json
                           },
"openseo_release_starting_job":
{ Args: { "p_job_id": string,"p_project_id": string }; Returns: Json
                           },
"project_data_inventory":
{ Args: { "p_project_id": string }; Returns: Json
                           },
"project_invitations":
{ Args: { "p_command": string,"p_payload"?: Json,"p_project_id": string }; Returns: Json
                           },
"project_people":
{ Args: { "p_command": string,"p_payload"?: Json,"p_project_id": string }; Returns: Json
                           },
"provider_budget":
{ Args: { "p_command": string,"p_payload"?: Json,"p_project_id": string,"p_provider": string }; Returns: Json
                           },
"webmaster_property":
{ Args: { "p_command": string,"p_payload"?: Json,"p_project_id": string,"p_provider": string }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R
    }
    ? R
    : never
  : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Insert: infer I
    }
    ? I
    : never
  : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Update: infer U
    }
    ? U
    : never
  : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "public": {
          Enums: {
            
          }
        }
} as const

