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
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "openseo_active_job":
{ Args: { "p_project_id": string }; Returns: Json
                           },
"openseo_connection":
{ Args: { "p_command": string,"p_payload"?: Json,"p_project_id": string }; Returns: Json
                           },
"openseo_job":
{ Args: { "p_command": string,"p_job_id"?: string,"p_payload"?: Json,"p_project_id": string }; Returns: Json
                           },
"openseo_release_starting_job":
{ Args: { "p_job_id": string,"p_project_id": string }; Returns: Json
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

