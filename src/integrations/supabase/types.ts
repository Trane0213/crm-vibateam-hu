export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      activities: {
        Row: {
          action: string
          agent_id: string | null
          created_at: string | null
          details: Json | null
          id: string
          user_id: string | null
        }
        Insert: {
          action: string
          agent_id?: string | null
          created_at?: string | null
          details?: Json | null
          id?: string
          user_id?: string | null
        }
        Update: {
          action?: string
          agent_id?: string | null
          created_at?: string | null
          details?: Json | null
          id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "activities_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_activity: {
        Row: {
          action: string | null
          agent_id: string | null
          created_at: string | null
          entity_id: string | null
          entity_type: string | null
          id: string
          summary: string | null
        }
        Insert: {
          action?: string | null
          agent_id?: string | null
          created_at?: string | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          summary?: string | null
        }
        Update: {
          action?: string | null
          agent_id?: string | null
          created_at?: string | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          summary?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_activity_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_memories: {
        Row: {
          content: string
          created_at: string | null
          id: string
          importance: number | null
          scope: string | null
          source_agent: string | null
        }
        Insert: {
          content: string
          created_at?: string | null
          id?: string
          importance?: number | null
          scope?: string | null
          source_agent?: string | null
        }
        Update: {
          content?: string
          created_at?: string | null
          id?: string
          importance?: number | null
          scope?: string | null
          source_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_memories_source_agent_fkey"
            columns: ["source_agent"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_permissions: {
        Row: {
          agent_name: string
          created_at: string | null
          id: string
          permission_code: string
        }
        Insert: {
          agent_name: string
          created_at?: string | null
          id?: string
          permission_code: string
        }
        Update: {
          agent_name?: string
          created_at?: string | null
          id?: string
          permission_code?: string
        }
        Relationships: []
      }
      agent_role_access: {
        Row: {
          agent_id: string
          can_view: boolean
          created_at: string
          role_id: string
          updated_at: string
        }
        Insert: {
          agent_id: string
          can_view?: boolean
          created_at?: string
          role_id: string
          updated_at?: string
        }
        Update: {
          agent_id?: string
          can_view?: boolean
          created_at?: string
          role_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_role_access_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_run_steps: {
        Row: {
          agent_id: string | null
          created_at: string
          duration_ms: number | null
          error: string | null
          id: string
          input_json: Json | null
          kind: string
          output_json: Json | null
          run_id: string
          step_no: number
          tool_name: string | null
        }
        Insert: {
          agent_id?: string | null
          created_at?: string
          duration_ms?: number | null
          error?: string | null
          id?: string
          input_json?: Json | null
          kind: string
          output_json?: Json | null
          run_id: string
          step_no: number
          tool_name?: string | null
        }
        Update: {
          agent_id?: string | null
          created_at?: string
          duration_ms?: number | null
          error?: string | null
          id?: string
          input_json?: Json | null
          kind?: string
          output_json?: Json | null
          run_id?: string
          step_no?: number
          tool_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_run_steps_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "agent_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_runs: {
        Row: {
          agent_id: string
          completion_tokens: number | null
          error_message: string | null
          finished_at: string | null
          id: string
          model: string | null
          prompt_tokens: number | null
          provider: string | null
          started_at: string
          status: string
          thread_id: string | null
          total_steps: number | null
          user_id: string
        }
        Insert: {
          agent_id: string
          completion_tokens?: number | null
          error_message?: string | null
          finished_at?: string | null
          id?: string
          model?: string | null
          prompt_tokens?: number | null
          provider?: string | null
          started_at?: string
          status?: string
          thread_id?: string | null
          total_steps?: number | null
          user_id: string
        }
        Update: {
          agent_id?: string
          completion_tokens?: number | null
          error_message?: string | null
          finished_at?: string | null
          id?: string
          model?: string | null
          prompt_tokens?: number | null
          provider?: string | null
          started_at?: string
          status?: string
          thread_id?: string | null
          total_steps?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_runs_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "ai_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_tasks: {
        Row: {
          agent_id: string | null
          created_at: string | null
          id: string
          payload: Json | null
          result: Json | null
          status: string | null
          task_type: string | null
        }
        Insert: {
          agent_id?: string | null
          created_at?: string | null
          id?: string
          payload?: Json | null
          result?: Json | null
          status?: string | null
          task_type?: string | null
        }
        Update: {
          agent_id?: string | null
          created_at?: string | null
          id?: string
          payload?: Json | null
          result?: Json | null
          status?: string | null
          task_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_tasks_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
        ]
      }
      agents: {
        Row: {
          agent_type: string
          created_at: string | null
          id: string
          model: string | null
          name: string
          status: string | null
        }
        Insert: {
          agent_type: string
          created_at?: string | null
          id?: string
          model?: string | null
          name: string
          status?: string | null
        }
        Update: {
          agent_type?: string
          created_at?: string | null
          id?: string
          model?: string | null
          name?: string
          status?: string | null
        }
        Relationships: []
      }
      ai_action_log: {
        Row: {
          action_type: Database["public"]["Enums"]["ai_action_type"]
          agent_type: Database["public"]["Enums"]["ai_agent_type"]
          approved: boolean
          created_at: string
          error_message: string | null
          executed: boolean
          executed_at: string | null
          id: string
          payload: Json
          result: Json | null
          user_id: string
        }
        Insert: {
          action_type: Database["public"]["Enums"]["ai_action_type"]
          agent_type: Database["public"]["Enums"]["ai_agent_type"]
          approved?: boolean
          created_at?: string
          error_message?: string | null
          executed?: boolean
          executed_at?: string | null
          id?: string
          payload?: Json
          result?: Json | null
          user_id: string
        }
        Update: {
          action_type?: Database["public"]["Enums"]["ai_action_type"]
          agent_type?: Database["public"]["Enums"]["ai_agent_type"]
          approved?: boolean
          created_at?: string
          error_message?: string | null
          executed?: boolean
          executed_at?: string | null
          id?: string
          payload?: Json
          result?: Json | null
          user_id?: string
        }
        Relationships: []
      }
      ai_memory: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          key: string
          scope: string
          source: string | null
          subject_id: string
          subject_type: string
          updated_at: string
          value: Json
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          key: string
          scope?: string
          source?: string | null
          subject_id: string
          subject_type: string
          updated_at?: string
          value: Json
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          key?: string
          scope?: string
          source?: string | null
          subject_id?: string
          subject_type?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      ai_messages: {
        Row: {
          agent_id: string | null
          content: string | null
          created_at: string
          id: string
          role: string
          thread_id: string
          tool_call_id: string | null
          tool_calls: Json | null
        }
        Insert: {
          agent_id?: string | null
          content?: string | null
          created_at?: string
          id?: string
          role: string
          thread_id: string
          tool_call_id?: string | null
          tool_calls?: Json | null
        }
        Update: {
          agent_id?: string | null
          content?: string | null
          created_at?: string
          id?: string
          role?: string
          thread_id?: string
          tool_call_id?: string | null
          tool_calls?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_messages_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "ai_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_threads: {
        Row: {
          agent_id: string
          context_json: Json
          created_at: string
          id: string
          title: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          agent_id: string
          context_json?: Json
          created_at?: string
          id?: string
          title?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          agent_id?: string
          context_json?: Json
          created_at?: string
          id?: string
          title?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      attendance_entries: {
        Row: {
          created_at: string
          created_by: string
          daily_rate: number
          end_time: string | null
          id: string
          note: string | null
          project_id: string
          start_time: string | null
          updated_at: string
          work_date: string
          worker_id: string
        }
        Insert: {
          created_at?: string
          created_by: string
          daily_rate?: number
          end_time?: string | null
          id?: string
          note?: string | null
          project_id: string
          start_time?: string | null
          updated_at?: string
          work_date: string
          worker_id: string
        }
        Update: {
          created_at?: string
          created_by?: string
          daily_rate?: number
          end_time?: string | null
          id?: string
          note?: string | null
          project_id?: string
          start_time?: string | null
          updated_at?: string
          work_date?: string
          worker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_entries_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "attendance_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_entries_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "attendance_workers"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance_period_adjustments: {
        Row: {
          advance: number
          created_at: string
          created_by: string | null
          id: string
          note: string | null
          period_from: string
          period_to: string
          transport_fee: number
          updated_at: string
          worker_id: string
        }
        Insert: {
          advance?: number
          created_at?: string
          created_by?: string | null
          id?: string
          note?: string | null
          period_from: string
          period_to: string
          transport_fee?: number
          updated_at?: string
          worker_id: string
        }
        Update: {
          advance?: number
          created_at?: string
          created_by?: string | null
          id?: string
          note?: string | null
          period_from?: string
          period_to?: string
          transport_fee?: number
          updated_at?: string
          worker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_period_adjustments_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "attendance_workers"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance_projects: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      attendance_workers: {
        Row: {
          created_at: string
          created_by: string | null
          daily_rate: number
          default_transport_fee: number
          full_name: string
          id: string
          is_active: boolean
          note: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          daily_rate?: number
          default_transport_fee?: number
          full_name: string
          id?: string
          is_active?: boolean
          note?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          daily_rate?: number
          default_transport_fee?: number
          full_name?: string
          id?: string
          is_active?: boolean
          note?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      companies: {
        Row: {
          company_type: string | null
          created_at: string | null
          id: string
          name: string
          notes: string | null
          tax_number: string | null
          website: string | null
        }
        Insert: {
          company_type?: string | null
          created_at?: string | null
          id?: string
          name: string
          notes?: string | null
          tax_number?: string | null
          website?: string | null
        }
        Update: {
          company_type?: string | null
          created_at?: string | null
          id?: string
          name?: string
          notes?: string | null
          tax_number?: string | null
          website?: string | null
        }
        Relationships: []
      }
      company_documents: {
        Row: {
          company_id: string
          created_at: string
          document_type: string
          file_url: string
          id: string
          mime_type: string | null
          name: string
          notes: string | null
          size_bytes: number | null
          source: string
          updated_at: string
          uploaded_by: string | null
        }
        Insert: {
          company_id: string
          created_at?: string
          document_type?: string
          file_url: string
          id?: string
          mime_type?: string | null
          name: string
          notes?: string | null
          size_bytes?: number | null
          source?: string
          updated_at?: string
          uploaded_by?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          document_type?: string
          file_url?: string
          id?: string
          mime_type?: string | null
          name?: string
          notes?: string | null
          size_bytes?: number | null
          source?: string
          updated_at?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "company_documents_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_documents_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "customer_360_v"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "company_documents_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "customer_kpi_v"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "company_documents_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "dashboard_user_workload_v"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "company_documents_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "users_profile"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_documents_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "users_profile_lookup"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_messages: {
        Row: {
          created_at: string | null
          email: string | null
          id: string
          message: string | null
          name: string
          phone: string | null
        }
        Insert: {
          created_at?: string | null
          email?: string | null
          id?: string
          message?: string | null
          name: string
          phone?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string | null
          id?: string
          message?: string | null
          name?: string
          phone?: string | null
        }
        Relationships: []
      }
      contacts: {
        Row: {
          company_id: string | null
          created_at: string | null
          email: string | null
          email_invalid: boolean
          email_invalid_note: string | null
          id: string
          name: string
          phone: string | null
          position: string | null
        }
        Insert: {
          company_id?: string | null
          created_at?: string | null
          email?: string | null
          email_invalid?: boolean
          email_invalid_note?: string | null
          id?: string
          name: string
          phone?: string | null
          position?: string | null
        }
        Update: {
          company_id?: string | null
          created_at?: string | null
          email?: string | null
          email_invalid?: boolean
          email_invalid_note?: string | null
          id?: string
          name?: string
          phone?: string | null
          position?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contacts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contacts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "customer_360_v"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "contacts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "customer_kpi_v"
            referencedColumns: ["customer_id"]
          },
        ]
      }
      dashboard_status_config: {
        Row: {
          id: string
          kind: string
          status_value: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          id?: string
          kind: string
          status_value: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          id?: string
          kind?: string
          status_value?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      email_attachments: {
        Row: {
          content_id: string | null
          created_at: string
          email_id: string
          filename: string
          gmail_attachment_id: string | null
          id: string
          inline: boolean
          mime_type: string | null
          r2_key: string
          size_bytes: number | null
        }
        Insert: {
          content_id?: string | null
          created_at?: string
          email_id: string
          filename: string
          gmail_attachment_id?: string | null
          id?: string
          inline?: boolean
          mime_type?: string | null
          r2_key: string
          size_bytes?: number | null
        }
        Update: {
          content_id?: string | null
          created_at?: string
          email_id?: string
          filename?: string
          gmail_attachment_id?: string | null
          id?: string
          inline?: boolean
          mime_type?: string | null
          r2_key?: string
          size_bytes?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "email_attachments_email_id_fkey"
            columns: ["email_id"]
            isOneToOne: false
            referencedRelation: "emails"
            referencedColumns: ["id"]
          },
        ]
      }
      email_campaigns: {
        Row: {
          created_at: string | null
          id: string
          name: string
          status: string | null
          target_group: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          name: string
          status?: string | null
          target_group?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          name?: string
          status?: string | null
          target_group?: string | null
        }
        Relationships: []
      }
      email_drafts: {
        Row: {
          body: string | null
          created_at: string | null
          id: string
          status: string | null
          subject: string | null
          to_email: string | null
          user_id: string | null
        }
        Insert: {
          body?: string | null
          created_at?: string | null
          id?: string
          status?: string | null
          subject?: string | null
          to_email?: string | null
          user_id?: string | null
        }
        Update: {
          body?: string | null
          created_at?: string | null
          id?: string
          status?: string | null
          subject?: string | null
          to_email?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      email_messages: {
        Row: {
          body: string | null
          created_at: string | null
          direction: string | null
          from_email: string | null
          gmail_message_id: string | null
          id: string
          sent_at: string | null
          subject: string | null
          thread_id: string | null
          to_email: string | null
        }
        Insert: {
          body?: string | null
          created_at?: string | null
          direction?: string | null
          from_email?: string | null
          gmail_message_id?: string | null
          id?: string
          sent_at?: string | null
          subject?: string | null
          thread_id?: string | null
          to_email?: string | null
        }
        Update: {
          body?: string | null
          created_at?: string | null
          direction?: string | null
          from_email?: string | null
          gmail_message_id?: string | null
          id?: string
          sent_at?: string | null
          subject?: string | null
          thread_id?: string | null
          to_email?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "email_messages_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "email_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      email_thread_access: {
        Row: {
          created_at: string
          mailbox_email: string
          thread_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          mailbox_email: string
          thread_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          mailbox_email?: string
          thread_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_thread_access_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "email_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      email_threads: {
        Row: {
          company_id: string | null
          contact_id: string | null
          created_at: string | null
          gmail_label_ids: string[]
          gmail_thread_id: string | null
          id: string
          last_message_at: string | null
          lead_id: string | null
          owner_user_id: string | null
          participants: string[]
          project_id: string | null
          subject: string
        }
        Insert: {
          company_id?: string | null
          contact_id?: string | null
          created_at?: string | null
          gmail_label_ids?: string[]
          gmail_thread_id?: string | null
          id?: string
          last_message_at?: string | null
          lead_id?: string | null
          owner_user_id?: string | null
          participants?: string[]
          project_id?: string | null
          subject: string
        }
        Update: {
          company_id?: string | null
          contact_id?: string | null
          created_at?: string | null
          gmail_label_ids?: string[]
          gmail_thread_id?: string | null
          id?: string
          last_message_at?: string | null
          lead_id?: string | null
          owner_user_id?: string | null
          participants?: string[]
          project_id?: string | null
          subject?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_threads_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_threads_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "customer_360_v"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "email_threads_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "customer_kpi_v"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "email_threads_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_threads_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_threads_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "v_lead_activity"
            referencedColumns: ["lead_id"]
          },
          {
            foreignKeyName: "email_threads_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "v_lead_due_buckets"
            referencedColumns: ["lead_id"]
          },
          {
            foreignKeyName: "email_threads_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      emails: {
        Row: {
          bcc_emails: string[]
          body: string | null
          category: string | null
          cc_emails: string[]
          company_id: string | null
          contact_id: string | null
          created_at: string | null
          from_email: string | null
          gmail_label_ids: string[]
          gmail_message_id: string | null
          id: string
          internal_date: string | null
          is_outbound: boolean
          lead_id: string | null
          owner_user_id: string | null
          project_id: string | null
          snippet: string | null
          subject: string | null
          summary: string | null
          thread_id: string | null
          to_email: string | null
          to_emails: string[]
        }
        Insert: {
          bcc_emails?: string[]
          body?: string | null
          category?: string | null
          cc_emails?: string[]
          company_id?: string | null
          contact_id?: string | null
          created_at?: string | null
          from_email?: string | null
          gmail_label_ids?: string[]
          gmail_message_id?: string | null
          id?: string
          internal_date?: string | null
          is_outbound?: boolean
          lead_id?: string | null
          owner_user_id?: string | null
          project_id?: string | null
          snippet?: string | null
          subject?: string | null
          summary?: string | null
          thread_id?: string | null
          to_email?: string | null
          to_emails?: string[]
        }
        Update: {
          bcc_emails?: string[]
          body?: string | null
          category?: string | null
          cc_emails?: string[]
          company_id?: string | null
          contact_id?: string | null
          created_at?: string | null
          from_email?: string | null
          gmail_label_ids?: string[]
          gmail_message_id?: string | null
          id?: string
          internal_date?: string | null
          is_outbound?: boolean
          lead_id?: string | null
          owner_user_id?: string | null
          project_id?: string | null
          snippet?: string | null
          subject?: string | null
          summary?: string | null
          thread_id?: string | null
          to_email?: string | null
          to_emails?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "emails_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "emails_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "customer_360_v"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "emails_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "customer_kpi_v"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "emails_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "emails_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "emails_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "v_lead_activity"
            referencedColumns: ["lead_id"]
          },
          {
            foreignKeyName: "emails_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "v_lead_due_buckets"
            referencedColumns: ["lead_id"]
          },
          {
            foreignKeyName: "emails_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "emails_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "email_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      followup_events: {
        Row: {
          created_at: string | null
          event_data: Json | null
          event_type: string | null
          followup_id: string | null
          id: string
        }
        Insert: {
          created_at?: string | null
          event_data?: Json | null
          event_type?: string | null
          followup_id?: string | null
          id?: string
        }
        Update: {
          created_at?: string | null
          event_data?: Json | null
          event_type?: string | null
          followup_id?: string | null
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "followup_events_followup_id_fkey"
            columns: ["followup_id"]
            isOneToOne: false
            referencedRelation: "followups"
            referencedColumns: ["id"]
          },
        ]
      }
      followups: {
        Row: {
          assigned_agent_id: string | null
          assigned_to: string | null
          company_id: string | null
          completed: boolean | null
          created_at: string | null
          due_date: string | null
          followup_type: string | null
          id: string
          lead_id: string | null
          project_id: string | null
          quote_id: string | null
          result: string | null
        }
        Insert: {
          assigned_agent_id?: string | null
          assigned_to?: string | null
          company_id?: string | null
          completed?: boolean | null
          created_at?: string | null
          due_date?: string | null
          followup_type?: string | null
          id?: string
          lead_id?: string | null
          project_id?: string | null
          quote_id?: string | null
          result?: string | null
        }
        Update: {
          assigned_agent_id?: string | null
          assigned_to?: string | null
          company_id?: string | null
          completed?: boolean | null
          created_at?: string | null
          due_date?: string | null
          followup_type?: string | null
          id?: string
          lead_id?: string | null
          project_id?: string | null
          quote_id?: string | null
          result?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "followups_assigned_agent_id_fkey"
            columns: ["assigned_agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "followups_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "followups_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "customer_360_v"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "followups_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "customer_kpi_v"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "followups_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "followups_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "v_lead_activity"
            referencedColumns: ["lead_id"]
          },
          {
            foreignKeyName: "followups_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "v_lead_due_buckets"
            referencedColumns: ["lead_id"]
          },
          {
            foreignKeyName: "followups_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "followups_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      gmail_accounts: {
        Row: {
          access_token: string | null
          connected_at: string | null
          gmail_email: string
          id: string
          is_active: boolean | null
          last_sync_at: string | null
          refresh_token: string | null
          token_expires_at: string | null
          user_id: string
        }
        Insert: {
          access_token?: string | null
          connected_at?: string | null
          gmail_email: string
          id?: string
          is_active?: boolean | null
          last_sync_at?: string | null
          refresh_token?: string | null
          token_expires_at?: string | null
          user_id: string
        }
        Update: {
          access_token?: string | null
          connected_at?: string | null
          gmail_email?: string
          id?: string
          is_active?: boolean | null
          last_sync_at?: string | null
          refresh_token?: string | null
          token_expires_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      gmail_sync_runs: {
        Row: {
          errors: Json | null
          fetched: number | null
          finished_at: string | null
          history_id_after: string | null
          history_id_before: string | null
          id: string
          inserted: number | null
          mode: string | null
          skipped: number | null
          started_at: string
          trigger: string
          user_id: string
        }
        Insert: {
          errors?: Json | null
          fetched?: number | null
          finished_at?: string | null
          history_id_after?: string | null
          history_id_before?: string | null
          id?: string
          inserted?: number | null
          mode?: string | null
          skipped?: number | null
          started_at?: string
          trigger: string
          user_id: string
        }
        Update: {
          errors?: Json | null
          fetched?: number | null
          finished_at?: string | null
          history_id_after?: string | null
          history_id_before?: string | null
          id?: string
          inserted?: number | null
          mode?: string | null
          skipped?: number | null
          started_at?: string
          trigger?: string
          user_id?: string
        }
        Relationships: []
      }
      google_ads_change_log: {
        Row: {
          changed_at: string
          changed_by: string
          customer_id: string
          dry_run_ref: string | null
          entity: string
          entity_id: string | null
          field: string
          id: string
          new_value: string | null
          old_value: string | null
          reason: string | null
          user_id: string
        }
        Insert: {
          changed_at?: string
          changed_by?: string
          customer_id: string
          dry_run_ref?: string | null
          entity: string
          entity_id?: string | null
          field: string
          id?: string
          new_value?: string | null
          old_value?: string | null
          reason?: string | null
          user_id: string
        }
        Update: {
          changed_at?: string
          changed_by?: string
          customer_id?: string
          dry_run_ref?: string | null
          entity?: string
          entity_id?: string | null
          field?: string
          id?: string
          new_value?: string | null
          old_value?: string | null
          reason?: string | null
          user_id?: string
        }
        Relationships: []
      }
      google_ads_connections: {
        Row: {
          active_customer_id: string | null
          connected_at: string | null
          google_email: string | null
          id: string
          last_error: string | null
          login_customer_id: string | null
          manager_customer_id: string | null
          refresh_token_cipher: string | null
          refresh_token_iv: string | null
          scope: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          active_customer_id?: string | null
          connected_at?: string | null
          google_email?: string | null
          id?: string
          last_error?: string | null
          login_customer_id?: string | null
          manager_customer_id?: string | null
          refresh_token_cipher?: string | null
          refresh_token_iv?: string | null
          scope?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          active_customer_id?: string | null
          connected_at?: string | null
          google_email?: string | null
          id?: string
          last_error?: string | null
          login_customer_id?: string | null
          manager_customer_id?: string | null
          refresh_token_cipher?: string | null
          refresh_token_iv?: string | null
          scope?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      google_ads_constitution: {
        Row: {
          created_at: string
          enabled: boolean
          id: string
          rule_key: string
          rule_text: string
          severity: string
          sort_order: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          id?: string
          rule_key: string
          rule_text: string
          severity?: string
          sort_order?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          enabled?: boolean
          id?: string
          rule_key?: string
          rule_text?: string
          severity?: string
          sort_order?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      google_ads_keywords: {
        Row: {
          campaign: string | null
          created_at: string | null
          id: string
          keyword: string
          match_type: string | null
          status: string | null
        }
        Insert: {
          campaign?: string | null
          created_at?: string | null
          id?: string
          keyword: string
          match_type?: string | null
          status?: string | null
        }
        Update: {
          campaign?: string | null
          created_at?: string | null
          id?: string
          keyword?: string
          match_type?: string | null
          status?: string | null
        }
        Relationships: []
      }
      google_ads_recommendations: {
        Row: {
          agent_id: string | null
          created_at: string | null
          id: string
          recommendation: string
          status: string | null
        }
        Insert: {
          agent_id?: string | null
          created_at?: string | null
          id?: string
          recommendation: string
          status?: string | null
        }
        Update: {
          agent_id?: string | null
          created_at?: string | null
          id?: string
          recommendation?: string
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "google_ads_recommendations_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
        ]
      }
      google_ads_snapshots: {
        Row: {
          customer_id: string
          entity_id: string | null
          id: string
          metrics_json: Json
          schema_version: number
          scope: string
          snapshotted_at: string
          user_id: string
        }
        Insert: {
          customer_id: string
          entity_id?: string | null
          id?: string
          metrics_json: Json
          schema_version?: number
          scope: string
          snapshotted_at?: string
          user_id: string
        }
        Update: {
          customer_id?: string
          entity_id?: string | null
          id?: string
          metrics_json?: Json
          schema_version?: number
          scope?: string
          snapshotted_at?: string
          user_id?: string
        }
        Relationships: []
      }
      import_log: {
        Row: {
          action: string
          batch: string
          before: Json | null
          created_at: string
          entity: string
          entity_id: string
          id: string
          source_ref: string | null
        }
        Insert: {
          action: string
          batch: string
          before?: Json | null
          created_at?: string
          entity: string
          entity_id: string
          id?: string
          source_ref?: string | null
        }
        Update: {
          action?: string
          batch?: string
          before?: Json | null
          created_at?: string
          entity?: string
          entity_id?: string
          id?: string
          source_ref?: string | null
        }
        Relationships: []
      }
      import_review_items: {
        Row: {
          batch: string
          company_id: string | null
          created_at: string
          details: Json
          id: string
          kind: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          batch: string
          company_id?: string | null
          created_at?: string
          details?: Json
          id?: string
          kind: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          batch?: string
          company_id?: string | null
          created_at?: string
          details?: Json
          id?: string
          kind?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "import_review_items_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_review_items_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "customer_360_v"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "import_review_items_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "customer_kpi_v"
            referencedColumns: ["customer_id"]
          },
        ]
      }
      kg_edge_history: {
        Row: {
          change_type: string
          changed_at: string
          edge_id: string
          id: string
          previous_confidence: number | null
          previous_relation: string | null
          previous_weight: number | null
        }
        Insert: {
          change_type: string
          changed_at?: string
          edge_id: string
          id?: string
          previous_confidence?: number | null
          previous_relation?: string | null
          previous_weight?: number | null
        }
        Update: {
          change_type?: string
          changed_at?: string
          edge_id?: string
          id?: string
          previous_confidence?: number | null
          previous_relation?: string | null
          previous_weight?: number | null
        }
        Relationships: []
      }
      kg_edges: {
        Row: {
          confidence: number | null
          created_at: string
          created_by_user_id: string | null
          direction: string
          evidence: Json | null
          from_node_id: string
          id: string
          metadata: Json
          origin_ref_id: string | null
          origin_ref_table: string | null
          relation: string
          source: string
          to_node_id: string
          valid_from: string | null
          valid_to: string | null
          weight: number | null
        }
        Insert: {
          confidence?: number | null
          created_at?: string
          created_by_user_id?: string | null
          direction?: string
          evidence?: Json | null
          from_node_id: string
          id?: string
          metadata?: Json
          origin_ref_id?: string | null
          origin_ref_table?: string | null
          relation: string
          source: string
          to_node_id: string
          valid_from?: string | null
          valid_to?: string | null
          weight?: number | null
        }
        Update: {
          confidence?: number | null
          created_at?: string
          created_by_user_id?: string | null
          direction?: string
          evidence?: Json | null
          from_node_id?: string
          id?: string
          metadata?: Json
          origin_ref_id?: string | null
          origin_ref_table?: string | null
          relation?: string
          source?: string
          to_node_id?: string
          valid_from?: string | null
          valid_to?: string | null
          weight?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "kg_edges_from_node_id_fkey"
            columns: ["from_node_id"]
            isOneToOne: false
            referencedRelation: "kg_nodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kg_edges_relation_fkey"
            columns: ["relation"]
            isOneToOne: false
            referencedRelation: "kg_relations"
            referencedColumns: ["relation"]
          },
          {
            foreignKeyName: "kg_edges_to_node_id_fkey"
            columns: ["to_node_id"]
            isOneToOne: false
            referencedRelation: "kg_nodes"
            referencedColumns: ["id"]
          },
        ]
      }
      kg_node_kinds: {
        Row: {
          created_at: string
          description: string | null
          is_enabled: boolean
          kind: string
          label: string
          owner_module: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          is_enabled?: boolean
          kind: string
          label: string
          owner_module: string
        }
        Update: {
          created_at?: string
          description?: string | null
          is_enabled?: boolean
          kind?: string
          label?: string
          owner_module?: string
        }
        Relationships: []
      }
      kg_nodes: {
        Row: {
          created_at: string
          id: string
          kind: string
          label: string | null
          metadata: Json
          ref_id: string | null
          ref_table: string | null
          ref_uri: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          kind: string
          label?: string | null
          metadata?: Json
          ref_id?: string | null
          ref_table?: string | null
          ref_uri?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          label?: string | null
          metadata?: Json
          ref_id?: string | null
          ref_table?: string | null
          ref_uri?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "kg_nodes_kind_fkey"
            columns: ["kind"]
            isOneToOne: false
            referencedRelation: "kg_node_kinds"
            referencedColumns: ["kind"]
          },
        ]
      }
      kg_publishers: {
        Row: {
          edges_removed: number
          edges_upserted: number
          error_message: string | null
          id: string
          last_run_at: string
          module: string
          nodes_upserted: number
          source_kind: string
          status: string
        }
        Insert: {
          edges_removed?: number
          edges_upserted?: number
          error_message?: string | null
          id?: string
          last_run_at?: string
          module: string
          nodes_upserted?: number
          source_kind: string
          status?: string
        }
        Update: {
          edges_removed?: number
          edges_upserted?: number
          error_message?: string | null
          id?: string
          last_run_at?: string
          module?: string
          nodes_upserted?: number
          source_kind?: string
          status?: string
        }
        Relationships: []
      }
      kg_relations: {
        Row: {
          created_at: string
          default_direction: string
          description: string | null
          inverse_relation: string | null
          is_enabled: boolean
          is_semantic: boolean
          label: string
          owner_module: string | null
          relation: string
        }
        Insert: {
          created_at?: string
          default_direction?: string
          description?: string | null
          inverse_relation?: string | null
          is_enabled?: boolean
          is_semantic?: boolean
          label: string
          owner_module?: string | null
          relation: string
        }
        Update: {
          created_at?: string
          default_direction?: string
          description?: string | null
          inverse_relation?: string | null
          is_enabled?: boolean
          is_semantic?: boolean
          label?: string
          owner_module?: string | null
          relation?: string
        }
        Relationships: [
          {
            foreignKeyName: "kg_relations_inverse_relation_fkey"
            columns: ["inverse_relation"]
            isOneToOne: false
            referencedRelation: "kg_relations"
            referencedColumns: ["relation"]
          },
        ]
      }
      knowledge_chunks: {
        Row: {
          content: string
          created_at: string | null
          document_id: string | null
          embedding: Json | null
          id: string
        }
        Insert: {
          content: string
          created_at?: string | null
          document_id?: string | null
          embedding?: Json | null
          id?: string
        }
        Update: {
          content?: string
          created_at?: string | null
          document_id?: string | null
          embedding?: Json | null
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_chunks_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "knowledge_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_documents: {
        Row: {
          category: string | null
          created_at: string | null
          file_url: string
          id: string
          title: string
        }
        Insert: {
          category?: string | null
          created_at?: string | null
          file_url: string
          id?: string
          title: string
        }
        Update: {
          category?: string | null
          created_at?: string | null
          file_url?: string
          id?: string
          title?: string
        }
        Relationships: []
      }
      lead_status_history: {
        Row: {
          changed_at: string
          changed_by: string | null
          from_status: string | null
          id: string
          lead_id: string
          note: string | null
          to_status: string
        }
        Insert: {
          changed_at?: string
          changed_by?: string | null
          from_status?: string | null
          id?: string
          lead_id: string
          note?: string | null
          to_status: string
        }
        Update: {
          changed_at?: string
          changed_by?: string | null
          from_status?: string | null
          id?: string
          lead_id?: string
          note?: string | null
          to_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_status_history_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_status_history_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "v_lead_activity"
            referencedColumns: ["lead_id"]
          },
          {
            foreignKeyName: "lead_status_history_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "v_lead_due_buckets"
            referencedColumns: ["lead_id"]
          },
        ]
      }
      leads: {
        Row: {
          assigned_at: string | null
          assigned_to: string | null
          company_id: string | null
          contact_id: string | null
          created_at: string | null
          id: string
          lost_at: string | null
          lost_note: string | null
          lost_reason: string | null
          lost_stage: string | null
          next_step_due_at: string | null
          next_step_note: string | null
          next_step_type: string | null
          pipeline_entered_at: string | null
          project_type: string | null
          source: string | null
          status: string | null
          summary: string | null
          won_at: string | null
        }
        Insert: {
          assigned_at?: string | null
          assigned_to?: string | null
          company_id?: string | null
          contact_id?: string | null
          created_at?: string | null
          id?: string
          lost_at?: string | null
          lost_note?: string | null
          lost_reason?: string | null
          lost_stage?: string | null
          next_step_due_at?: string | null
          next_step_note?: string | null
          next_step_type?: string | null
          pipeline_entered_at?: string | null
          project_type?: string | null
          source?: string | null
          status?: string | null
          summary?: string | null
          won_at?: string | null
        }
        Update: {
          assigned_at?: string | null
          assigned_to?: string | null
          company_id?: string | null
          contact_id?: string | null
          created_at?: string | null
          id?: string
          lost_at?: string | null
          lost_note?: string | null
          lost_reason?: string | null
          lost_stage?: string | null
          next_step_due_at?: string | null
          next_step_note?: string | null
          next_step_type?: string | null
          pipeline_entered_at?: string | null
          project_type?: string | null
          source?: string | null
          status?: string | null
          summary?: string | null
          won_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "leads_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "customer_360_v"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "leads_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "customer_kpi_v"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "leads_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      meetings: {
        Row: {
          company_id: string | null
          created_at: string | null
          id: string
          location: string | null
          meeting_date: string | null
          project_id: string | null
          summary: string | null
          title: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string | null
          id?: string
          location?: string | null
          meeting_date?: string | null
          project_id?: string | null
          summary?: string | null
          title: string
        }
        Update: {
          company_id?: string | null
          created_at?: string | null
          id?: string
          location?: string | null
          meeting_date?: string | null
          project_id?: string | null
          summary?: string | null
          title?: string
        }
        Relationships: []
      }
      permissions: {
        Row: {
          code: string
          created_at: string | null
          description: string | null
          id: string
        }
        Insert: {
          code: string
          created_at?: string | null
          description?: string | null
          id?: string
        }
        Update: {
          code?: string
          created_at?: string | null
          description?: string | null
          id?: string
        }
        Relationships: []
      }
      phone_calls: {
        Row: {
          call_type: string | null
          callback_date: string | null
          company_id: string | null
          contact_id: string | null
          created_at: string | null
          direction: string | null
          id: string
          outcome: string | null
          project_id: string | null
          summary: string | null
        }
        Insert: {
          call_type?: string | null
          callback_date?: string | null
          company_id?: string | null
          contact_id?: string | null
          created_at?: string | null
          direction?: string | null
          id?: string
          outcome?: string | null
          project_id?: string | null
          summary?: string | null
        }
        Update: {
          call_type?: string | null
          callback_date?: string | null
          company_id?: string | null
          contact_id?: string | null
          created_at?: string | null
          direction?: string | null
          id?: string
          outcome?: string | null
          project_id?: string | null
          summary?: string | null
        }
        Relationships: []
      }
      project_candidates: {
        Row: {
          company_id: string
          created_at: string
          id: string
          project_id: string | null
          review_status: string
          source_note: string | null
          title: string
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          project_id?: string | null
          review_status?: string
          source_note?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          project_id?: string | null
          review_status?: string
          source_note?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_candidates_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_candidates_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "customer_360_v"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "project_candidates_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "customer_kpi_v"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "project_candidates_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_contacts: {
        Row: {
          contact_id: string
          created_at: string
          id: string
          project_id: string
          role: string | null
        }
        Insert: {
          contact_id: string
          created_at?: string
          id?: string
          project_id: string
          role?: string | null
        }
        Update: {
          contact_id?: string
          created_at?: string
          id?: string
          project_id?: string
          role?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_contacts_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_contacts_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_documents: {
        Row: {
          created_at: string | null
          document_type: string | null
          file_url: string
          id: string
          name: string
          project_id: string | null
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string | null
          document_type?: string | null
          file_url: string
          id?: string
          name: string
          project_id?: string | null
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string | null
          document_type?: string | null
          file_url?: string
          id?: string
          name?: string
          project_id?: string | null
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_documents_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_documents_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "dashboard_user_workload_v"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "project_documents_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "users_profile"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_documents_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "users_profile_lookup"
            referencedColumns: ["id"]
          },
        ]
      }
      project_notes: {
        Row: {
          author_id: string | null
          created_at: string | null
          id: string
          note: string
          project_id: string | null
        }
        Insert: {
          author_id?: string | null
          created_at?: string | null
          id?: string
          note: string
          project_id?: string | null
        }
        Update: {
          author_id?: string | null
          created_at?: string | null
          id?: string
          note?: string
          project_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_notes_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "dashboard_user_workload_v"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "project_notes_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "users_profile"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_notes_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "users_profile_lookup"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_notes_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_status_history: {
        Row: {
          changed_at: string | null
          id: string
          new_status: string | null
          old_status: string | null
          project_id: string | null
        }
        Insert: {
          changed_at?: string | null
          id?: string
          new_status?: string | null
          old_status?: string | null
          project_id?: string | null
        }
        Update: {
          changed_at?: string | null
          id?: string
          new_status?: string | null
          old_status?: string | null
          project_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_status_history_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          address: string | null
          company_id: string | null
          created_at: string | null
          deadline: string | null
          description: string | null
          handoff_at: string | null
          handoff_payload: Json | null
          id: string
          lead_id: string | null
          project_manager_user_id: string | null
          project_type: string | null
          start_date: string | null
          status: string | null
          title: string
        }
        Insert: {
          address?: string | null
          company_id?: string | null
          created_at?: string | null
          deadline?: string | null
          description?: string | null
          handoff_at?: string | null
          handoff_payload?: Json | null
          id?: string
          lead_id?: string | null
          project_manager_user_id?: string | null
          project_type?: string | null
          start_date?: string | null
          status?: string | null
          title: string
        }
        Update: {
          address?: string | null
          company_id?: string | null
          created_at?: string | null
          deadline?: string | null
          description?: string | null
          handoff_at?: string | null
          handoff_payload?: Json | null
          id?: string
          lead_id?: string | null
          project_manager_user_id?: string | null
          project_type?: string | null
          start_date?: string | null
          status?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "customer_360_v"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "projects_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "customer_kpi_v"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "projects_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "v_lead_activity"
            referencedColumns: ["lead_id"]
          },
          {
            foreignKeyName: "projects_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "v_lead_due_buckets"
            referencedColumns: ["lead_id"]
          },
        ]
      }
      quote_items: {
        Row: {
          created_at: string | null
          id: string
          name: string
          quantity: number | null
          quote_id: string | null
          total_price: number | null
          unit: string | null
          unit_price: number | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          name: string
          quantity?: number | null
          quote_id?: string | null
          total_price?: number | null
          unit?: string | null
          unit_price?: number | null
        }
        Update: {
          created_at?: string | null
          id?: string
          name?: string
          quantity?: number | null
          quote_id?: string | null
          total_price?: number | null
          unit?: string | null
          unit_price?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "quote_items_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      quote_requests: {
        Row: {
          apartment_count: string | null
          attachment_path: string | null
          attachment_url: string | null
          budget: string | null
          company_name: string | null
          consent: boolean | null
          created_at: string | null
          email: string | null
          entry_page: string | null
          form_type: string | null
          id: string
          message: string | null
          name: string
          origin_page: string | null
          payload: Json | null
          phone: string | null
          project_type: string | null
          property_type: string | null
          source_created_at: string | null
          source_lead_id: string | null
          source_page: string | null
          source_system: string | null
          source_type: string | null
          synced_at: string | null
          utm: Json | null
        }
        Insert: {
          apartment_count?: string | null
          attachment_path?: string | null
          attachment_url?: string | null
          budget?: string | null
          company_name?: string | null
          consent?: boolean | null
          created_at?: string | null
          email?: string | null
          entry_page?: string | null
          form_type?: string | null
          id?: string
          message?: string | null
          name: string
          origin_page?: string | null
          payload?: Json | null
          phone?: string | null
          project_type?: string | null
          property_type?: string | null
          source_created_at?: string | null
          source_lead_id?: string | null
          source_page?: string | null
          source_system?: string | null
          source_type?: string | null
          synced_at?: string | null
          utm?: Json | null
        }
        Update: {
          apartment_count?: string | null
          attachment_path?: string | null
          attachment_url?: string | null
          budget?: string | null
          company_name?: string | null
          consent?: boolean | null
          created_at?: string | null
          email?: string | null
          entry_page?: string | null
          form_type?: string | null
          id?: string
          message?: string | null
          name?: string
          origin_page?: string | null
          payload?: Json | null
          phone?: string | null
          project_type?: string | null
          property_type?: string | null
          source_created_at?: string | null
          source_lead_id?: string | null
          source_page?: string | null
          source_system?: string | null
          source_type?: string | null
          synced_at?: string | null
          utm?: Json | null
        }
        Relationships: []
      }
      quotes: {
        Row: {
          created_at: string | null
          created_by: string | null
          discount_percent: number | null
          id: string
          is_current: boolean
          lead_id: string | null
          notes: string | null
          project_id: string | null
          status: string | null
          tax_percent: number | null
          title: string | null
          total_amount: number | null
          valid_until: string | null
          version: number
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          discount_percent?: number | null
          id?: string
          is_current?: boolean
          lead_id?: string | null
          notes?: string | null
          project_id?: string | null
          status?: string | null
          tax_percent?: number | null
          title?: string | null
          total_amount?: number | null
          valid_until?: string | null
          version?: number
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          discount_percent?: number | null
          id?: string
          is_current?: boolean
          lead_id?: string | null
          notes?: string | null
          project_id?: string | null
          status?: string | null
          tax_percent?: number | null
          title?: string | null
          total_amount?: number | null
          valid_until?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "quotes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "dashboard_user_workload_v"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "quotes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users_profile"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users_profile_lookup"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "v_lead_activity"
            referencedColumns: ["lead_id"]
          },
          {
            foreignKeyName: "quotes_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "v_lead_due_buckets"
            referencedColumns: ["lead_id"]
          },
          {
            foreignKeyName: "quotes_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      references: {
        Row: {
          created_at: string | null
          description: string | null
          featured: boolean | null
          id: string
          image_url: string | null
          location: string | null
          title: string
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          featured?: boolean | null
          id?: string
          image_url?: string | null
          location?: string | null
          title: string
        }
        Update: {
          created_at?: string | null
          description?: string | null
          featured?: boolean | null
          id?: string
          image_url?: string | null
          location?: string | null
          title?: string
        }
        Relationships: []
      }
      reminders: {
        Row: {
          created_at: string | null
          id: string
          project_id: string | null
          reminder_date: string
          status: string | null
          task_id: string | null
          title: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          project_id?: string | null
          reminder_date: string
          status?: string | null
          task_id?: string | null
          title: string
        }
        Update: {
          created_at?: string | null
          id?: string
          project_id?: string | null
          reminder_date?: string
          status?: string | null
          task_id?: string | null
          title?: string
        }
        Relationships: []
      }
      role_permissions: {
        Row: {
          id: string
          permission_id: string | null
          role_id: string | null
        }
        Insert: {
          id?: string
          permission_id?: string | null
          role_id?: string | null
        }
        Update: {
          id?: string
          permission_id?: string | null
          role_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "role_permissions_permission_id_fkey"
            columns: ["permission_id"]
            isOneToOne: false
            referencedRelation: "permissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "role_permissions_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      roles: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          name: string
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          name: string
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      route_permissions: {
        Row: {
          allowed: boolean
          id: string
          role_name: string
          route_prefix: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          allowed?: boolean
          id?: string
          role_name: string
          route_prefix: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          allowed?: boolean
          id?: string
          role_name?: string
          route_prefix?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      sales_module_meta: {
        Row: {
          key: string
          value: string
        }
        Insert: {
          key: string
          value: string
        }
        Update: {
          key?: string
          value?: string
        }
        Relationships: []
      }
      settings: {
        Row: {
          created_at: string | null
          id: string
          key: string
          value: Json | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          key: string
          value?: Json | null
        }
        Update: {
          created_at?: string | null
          id?: string
          key?: string
          value?: Json | null
        }
        Relationships: []
      }
      tasks: {
        Row: {
          assigned_user: string | null
          created_at: string | null
          description: string | null
          due_date: string | null
          id: string
          priority: string | null
          project_id: string | null
          status: string | null
          title: string
        }
        Insert: {
          assigned_user?: string | null
          created_at?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          priority?: string | null
          project_id?: string | null
          status?: string | null
          title: string
        }
        Update: {
          assigned_user?: string | null
          created_at?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          priority?: string | null
          project_id?: string | null
          status?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_assigned_user_fkey"
            columns: ["assigned_user"]
            isOneToOne: false
            referencedRelation: "dashboard_user_workload_v"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "tasks_assigned_user_fkey"
            columns: ["assigned_user"]
            isOneToOne: false
            referencedRelation: "users_profile"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_assigned_user_fkey"
            columns: ["assigned_user"]
            isOneToOne: false
            referencedRelation: "users_profile_lookup"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      users_profile: {
        Row: {
          active: boolean | null
          auth_user_id: string | null
          created_at: string | null
          email: string | null
          full_name: string | null
          gmail_access_token: string | null
          gmail_auth_error: string | null
          gmail_auth_error_at: string | null
          gmail_email: string | null
          gmail_expires_at: string | null
          gmail_history_id: string | null
          gmail_last_sync_at: string | null
          gmail_next_retry_at: string | null
          gmail_refresh_token: string | null
          gmail_scope: string | null
          id: string
          phone: string | null
          role_id: string | null
        }
        Insert: {
          active?: boolean | null
          auth_user_id?: string | null
          created_at?: string | null
          email?: string | null
          full_name?: string | null
          gmail_access_token?: string | null
          gmail_auth_error?: string | null
          gmail_auth_error_at?: string | null
          gmail_email?: string | null
          gmail_expires_at?: string | null
          gmail_history_id?: string | null
          gmail_last_sync_at?: string | null
          gmail_next_retry_at?: string | null
          gmail_refresh_token?: string | null
          gmail_scope?: string | null
          id?: string
          phone?: string | null
          role_id?: string | null
        }
        Update: {
          active?: boolean | null
          auth_user_id?: string | null
          created_at?: string | null
          email?: string | null
          full_name?: string | null
          gmail_access_token?: string | null
          gmail_auth_error?: string | null
          gmail_auth_error_at?: string | null
          gmail_email?: string | null
          gmail_expires_at?: string | null
          gmail_history_id?: string | null
          gmail_last_sync_at?: string | null
          gmail_next_retry_at?: string | null
          gmail_refresh_token?: string | null
          gmail_scope?: string | null
          id?: string
          phone?: string | null
          role_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "users_profile_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      website_ai_jobs: {
        Row: {
          created_at: string
          error_message: string | null
          finished_at: string | null
          id: string
          input_cost_usd: number | null
          input_tokens: number | null
          job_kind: string
          latency_ms: number | null
          media_id: string | null
          model: string
          output_cost_usd: number | null
          output_tokens: number | null
          page_id: string | null
          page_version_id: string | null
          provider: string
          request_payload: Json | null
          response_payload: Json | null
          run_id: string | null
          status: string
          total_cost_usd: number | null
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          finished_at?: string | null
          id?: string
          input_cost_usd?: number | null
          input_tokens?: number | null
          job_kind: string
          latency_ms?: number | null
          media_id?: string | null
          model: string
          output_cost_usd?: number | null
          output_tokens?: number | null
          page_id?: string | null
          page_version_id?: string | null
          provider?: string
          request_payload?: Json | null
          response_payload?: Json | null
          run_id?: string | null
          status?: string
          total_cost_usd?: number | null
        }
        Update: {
          created_at?: string
          error_message?: string | null
          finished_at?: string | null
          id?: string
          input_cost_usd?: number | null
          input_tokens?: number | null
          job_kind?: string
          latency_ms?: number | null
          media_id?: string | null
          model?: string
          output_cost_usd?: number | null
          output_tokens?: number | null
          page_id?: string | null
          page_version_id?: string | null
          provider?: string
          request_payload?: Json | null
          response_payload?: Json | null
          run_id?: string | null
          status?: string
          total_cost_usd?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "website_ai_jobs_media_id_fkey"
            columns: ["media_id"]
            isOneToOne: false
            referencedRelation: "website_media"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "website_ai_jobs_page_id_fkey"
            columns: ["page_id"]
            isOneToOne: false
            referencedRelation: "website_pages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "website_ai_jobs_page_version_id_fkey"
            columns: ["page_version_id"]
            isOneToOne: false
            referencedRelation: "website_page_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "website_ai_jobs_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "website_crawl_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      website_crawl_runs: {
        Row: {
          ai_cost_usd: number
          ai_jobs_total: number
          created_at: string
          error_message: string | null
          finished_at: string | null
          id: string
          metadata: Json
          netlify_deploy_id: string | null
          netlify_site_id: string | null
          pages_crawled: number
          pages_failed: number
          pages_skipped: number
          pages_updated: number
          started_at: string
          status: string
          trigger: string
          triggered_by_user_id: string | null
          updated_at: string
        }
        Insert: {
          ai_cost_usd?: number
          ai_jobs_total?: number
          created_at?: string
          error_message?: string | null
          finished_at?: string | null
          id?: string
          metadata?: Json
          netlify_deploy_id?: string | null
          netlify_site_id?: string | null
          pages_crawled?: number
          pages_failed?: number
          pages_skipped?: number
          pages_updated?: number
          started_at?: string
          status?: string
          trigger?: string
          triggered_by_user_id?: string | null
          updated_at?: string
        }
        Update: {
          ai_cost_usd?: number
          ai_jobs_total?: number
          created_at?: string
          error_message?: string | null
          finished_at?: string | null
          id?: string
          metadata?: Json
          netlify_deploy_id?: string | null
          netlify_site_id?: string | null
          pages_crawled?: number
          pages_failed?: number
          pages_skipped?: number
          pages_updated?: number
          started_at?: string
          status?: string
          trigger?: string
          triggered_by_user_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      website_entities: {
        Row: {
          created_at: string
          description: string | null
          entity_kind: string
          id: string
          metadata: Json
          name: string
          normalized_name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          entity_kind: string
          id?: string
          metadata?: Json
          name: string
          normalized_name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          entity_kind?: string
          id?: string
          metadata?: Json
          name?: string
          normalized_name?: string
          updated_at?: string
        }
        Relationships: []
      }
      website_media: {
        Row: {
          ai_caption: string | null
          ai_description: string | null
          ai_labels: Json | null
          ai_ocr_text: string | null
          alt_text: string | null
          byte_size: number | null
          created_at: string
          height: number | null
          id: string
          media_kind: string
          metadata: Json
          mime_type: string | null
          page_id: string | null
          page_version_id: string | null
          updated_at: string
          url: string
          vision_job_id: string | null
          vision_status: string
          width: number | null
        }
        Insert: {
          ai_caption?: string | null
          ai_description?: string | null
          ai_labels?: Json | null
          ai_ocr_text?: string | null
          alt_text?: string | null
          byte_size?: number | null
          created_at?: string
          height?: number | null
          id?: string
          media_kind?: string
          metadata?: Json
          mime_type?: string | null
          page_id?: string | null
          page_version_id?: string | null
          updated_at?: string
          url: string
          vision_job_id?: string | null
          vision_status?: string
          width?: number | null
        }
        Update: {
          ai_caption?: string | null
          ai_description?: string | null
          ai_labels?: Json | null
          ai_ocr_text?: string | null
          alt_text?: string | null
          byte_size?: number | null
          created_at?: string
          height?: number | null
          id?: string
          media_kind?: string
          metadata?: Json
          mime_type?: string | null
          page_id?: string | null
          page_version_id?: string | null
          updated_at?: string
          url?: string
          vision_job_id?: string | null
          vision_status?: string
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "website_media_page_id_fkey"
            columns: ["page_id"]
            isOneToOne: false
            referencedRelation: "website_pages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "website_media_page_version_id_fkey"
            columns: ["page_version_id"]
            isOneToOne: false
            referencedRelation: "website_page_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      website_media_entities: {
        Row: {
          ai_job_id: string | null
          confidence: number | null
          created_at: string
          entity_id: string
          evidence: Json
          id: string
          media_id: string
          source: string
        }
        Insert: {
          ai_job_id?: string | null
          confidence?: number | null
          created_at?: string
          entity_id: string
          evidence?: Json
          id?: string
          media_id: string
          source?: string
        }
        Update: {
          ai_job_id?: string | null
          confidence?: number | null
          created_at?: string
          entity_id?: string
          evidence?: Json
          id?: string
          media_id?: string
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "website_media_entities_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "website_entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "website_media_entities_media_id_fkey"
            columns: ["media_id"]
            isOneToOne: false
            referencedRelation: "website_media"
            referencedColumns: ["id"]
          },
        ]
      }
      website_page_blocks_cta: {
        Row: {
          created_at: string
          cta_label: string | null
          cta_url: string | null
          description: string | null
          headline: string | null
          id: string
          page_version_id: string
          payload: Json
          position: number
        }
        Insert: {
          created_at?: string
          cta_label?: string | null
          cta_url?: string | null
          description?: string | null
          headline?: string | null
          id?: string
          page_version_id: string
          payload?: Json
          position?: number
        }
        Update: {
          created_at?: string
          cta_label?: string | null
          cta_url?: string | null
          description?: string | null
          headline?: string | null
          id?: string
          page_version_id?: string
          payload?: Json
          position?: number
        }
        Relationships: [
          {
            foreignKeyName: "website_page_blocks_cta_page_version_id_fkey"
            columns: ["page_version_id"]
            isOneToOne: false
            referencedRelation: "website_page_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      website_page_blocks_faq: {
        Row: {
          created_at: string
          heading: string | null
          id: string
          items: Json
          page_version_id: string
          payload: Json
          position: number
        }
        Insert: {
          created_at?: string
          heading?: string | null
          id?: string
          items?: Json
          page_version_id: string
          payload?: Json
          position?: number
        }
        Update: {
          created_at?: string
          heading?: string | null
          id?: string
          items?: Json
          page_version_id?: string
          payload?: Json
          position?: number
        }
        Relationships: [
          {
            foreignKeyName: "website_page_blocks_faq_page_version_id_fkey"
            columns: ["page_version_id"]
            isOneToOne: false
            referencedRelation: "website_page_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      website_page_blocks_features: {
        Row: {
          created_at: string
          heading: string | null
          id: string
          items: Json
          page_version_id: string
          payload: Json
          position: number
        }
        Insert: {
          created_at?: string
          heading?: string | null
          id?: string
          items?: Json
          page_version_id: string
          payload?: Json
          position?: number
        }
        Update: {
          created_at?: string
          heading?: string | null
          id?: string
          items?: Json
          page_version_id?: string
          payload?: Json
          position?: number
        }
        Relationships: [
          {
            foreignKeyName: "website_page_blocks_features_page_version_id_fkey"
            columns: ["page_version_id"]
            isOneToOne: false
            referencedRelation: "website_page_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      website_page_blocks_hero: {
        Row: {
          created_at: string
          cta_label: string | null
          cta_url: string | null
          headline: string | null
          id: string
          media_url: string | null
          page_version_id: string
          payload: Json
          position: number
          subheadline: string | null
        }
        Insert: {
          created_at?: string
          cta_label?: string | null
          cta_url?: string | null
          headline?: string | null
          id?: string
          media_url?: string | null
          page_version_id: string
          payload?: Json
          position?: number
          subheadline?: string | null
        }
        Update: {
          created_at?: string
          cta_label?: string | null
          cta_url?: string | null
          headline?: string | null
          id?: string
          media_url?: string | null
          page_version_id?: string
          payload?: Json
          position?: number
          subheadline?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "website_page_blocks_hero_page_version_id_fkey"
            columns: ["page_version_id"]
            isOneToOne: false
            referencedRelation: "website_page_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      website_page_blocks_text: {
        Row: {
          body_markdown: string | null
          body_text: string | null
          created_at: string
          heading: string | null
          id: string
          page_version_id: string
          payload: Json
          position: number
        }
        Insert: {
          body_markdown?: string | null
          body_text?: string | null
          created_at?: string
          heading?: string | null
          id?: string
          page_version_id: string
          payload?: Json
          position?: number
        }
        Update: {
          body_markdown?: string | null
          body_text?: string | null
          created_at?: string
          heading?: string | null
          id?: string
          page_version_id?: string
          payload?: Json
          position?: number
        }
        Relationships: [
          {
            foreignKeyName: "website_page_blocks_text_page_version_id_fkey"
            columns: ["page_version_id"]
            isOneToOne: false
            referencedRelation: "website_page_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      website_page_changes: {
        Row: {
          change_type: string
          created_at: string
          diff: Json
          diff_summary: string | null
          from_version_id: string | null
          id: string
          page_id: string
          run_id: string | null
          to_version_id: string | null
        }
        Insert: {
          change_type: string
          created_at?: string
          diff?: Json
          diff_summary?: string | null
          from_version_id?: string | null
          id?: string
          page_id: string
          run_id?: string | null
          to_version_id?: string | null
        }
        Update: {
          change_type?: string
          created_at?: string
          diff?: Json
          diff_summary?: string | null
          from_version_id?: string | null
          id?: string
          page_id?: string
          run_id?: string | null
          to_version_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "website_page_changes_from_version_id_fkey"
            columns: ["from_version_id"]
            isOneToOne: false
            referencedRelation: "website_page_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "website_page_changes_page_id_fkey"
            columns: ["page_id"]
            isOneToOne: false
            referencedRelation: "website_pages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "website_page_changes_to_version_id_fkey"
            columns: ["to_version_id"]
            isOneToOne: false
            referencedRelation: "website_page_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      website_page_entities: {
        Row: {
          ai_job_id: string | null
          confidence: number | null
          created_at: string
          entity_id: string
          evidence: Json
          id: string
          page_id: string
          page_version_id: string
          role: string | null
        }
        Insert: {
          ai_job_id?: string | null
          confidence?: number | null
          created_at?: string
          entity_id: string
          evidence?: Json
          id?: string
          page_id: string
          page_version_id: string
          role?: string | null
        }
        Update: {
          ai_job_id?: string | null
          confidence?: number | null
          created_at?: string
          entity_id?: string
          evidence?: Json
          id?: string
          page_id?: string
          page_version_id?: string
          role?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "website_page_entities_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "website_entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "website_page_entities_page_id_fkey"
            columns: ["page_id"]
            isOneToOne: false
            referencedRelation: "website_pages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "website_page_entities_page_version_id_fkey"
            columns: ["page_version_id"]
            isOneToOne: false
            referencedRelation: "website_page_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      website_page_summaries: {
        Row: {
          ai_job_id: string | null
          created_at: string
          id: string
          model: string | null
          page_id: string
          page_version_id: string
          summary: string | null
          summary_json: Json
        }
        Insert: {
          ai_job_id?: string | null
          created_at?: string
          id?: string
          model?: string | null
          page_id: string
          page_version_id: string
          summary?: string | null
          summary_json?: Json
        }
        Update: {
          ai_job_id?: string | null
          created_at?: string
          id?: string
          model?: string | null
          page_id?: string
          page_version_id?: string
          summary?: string | null
          summary_json?: Json
        }
        Relationships: [
          {
            foreignKeyName: "website_page_summaries_page_id_fkey"
            columns: ["page_id"]
            isOneToOne: false
            referencedRelation: "website_pages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "website_page_summaries_page_version_id_fkey"
            columns: ["page_version_id"]
            isOneToOne: true
            referencedRelation: "website_page_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      website_page_versions: {
        Row: {
          byte_size: number | null
          content_hash: string
          created_at: string
          fetched_at: string
          http_status: number | null
          id: string
          metadata: Json
          page_id: string
          raw_html: string | null
          rendered_text: string | null
          run_id: string | null
          version_number: number
        }
        Insert: {
          byte_size?: number | null
          content_hash: string
          created_at?: string
          fetched_at?: string
          http_status?: number | null
          id?: string
          metadata?: Json
          page_id: string
          raw_html?: string | null
          rendered_text?: string | null
          run_id?: string | null
          version_number: number
        }
        Update: {
          byte_size?: number | null
          content_hash?: string
          created_at?: string
          fetched_at?: string
          http_status?: number | null
          id?: string
          metadata?: Json
          page_id?: string
          raw_html?: string | null
          rendered_text?: string | null
          run_id?: string | null
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "website_page_versions_page_id_fkey"
            columns: ["page_id"]
            isOneToOne: false
            referencedRelation: "website_pages"
            referencedColumns: ["id"]
          },
        ]
      }
      website_pages: {
        Row: {
          asset_kind: string
          created_at: string
          current_version_id: string | null
          first_seen_at: string
          id: string
          is_active: boolean
          last_crawled_at: string | null
          last_seen_at: string
          metadata: Json
          path: string
          source_id: string | null
          title: string | null
          updated_at: string
          url: string
        }
        Insert: {
          asset_kind?: string
          created_at?: string
          current_version_id?: string | null
          first_seen_at?: string
          id?: string
          is_active?: boolean
          last_crawled_at?: string | null
          last_seen_at?: string
          metadata?: Json
          path: string
          source_id?: string | null
          title?: string | null
          updated_at?: string
          url: string
        }
        Update: {
          asset_kind?: string
          created_at?: string
          current_version_id?: string | null
          first_seen_at?: string
          id?: string
          is_active?: boolean
          last_crawled_at?: string | null
          last_seen_at?: string
          metadata?: Json
          path?: string
          source_id?: string | null
          title?: string | null
          updated_at?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "website_pages_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "website_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      website_sources: {
        Row: {
          base_url: string
          created_at: string
          id: string
          is_enabled: boolean
          kind: string
          label: string
          last_crawled_at: string | null
          metadata: Json
          updated_at: string
        }
        Insert: {
          base_url: string
          created_at?: string
          id?: string
          is_enabled?: boolean
          kind: string
          label: string
          last_crawled_at?: string | null
          metadata?: Json
          updated_at?: string
        }
        Update: {
          base_url?: string
          created_at?: string
          id?: string
          is_enabled?: boolean
          kind?: string
          label?: string
          last_crawled_at?: string | null
          metadata?: Json
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      activity_timeline_v: {
        Row: {
          customer_id: string | null
          event_date: string | null
          event_type: string | null
          reference_id: string | null
          reference_type: string | null
          title: string | null
          user_id: string | null
        }
        Relationships: []
      }
      customer_360_v: {
        Row: {
          active_projects: number | null
          company_type: string | null
          contact_email: string | null
          contact_name: string | null
          contact_phone: string | null
          created_at: string | null
          customer_id: string | null
          last_activity_at: string | null
          name: string | null
          notes: string | null
          open_quotes: number | null
          overdue_followups: number | null
          tax_number: string | null
          total_projects: number | null
          website: string | null
          won_revenue: number | null
        }
        Relationships: []
      }
      customer_activity_v: {
        Row: {
          created_by: string | null
          customer_id: string | null
          event_date: string | null
          event_type: string | null
          reference_id: string | null
          reference_type: string | null
          title: string | null
        }
        Relationships: []
      }
      customer_kpi_v: {
        Row: {
          active_projects: number | null
          customer_id: string | null
          last_activity_at: string | null
          open_quotes: number | null
          overdue_followups: number | null
          total_projects: number | null
        }
        Relationships: []
      }
      dashboard_followup_heatmap_v: {
        Row: {
          day: string | null
          done_count: number | null
          followup_type: string | null
          open_count: number | null
        }
        Relationships: []
      }
      dashboard_pipeline_v: {
        Row: {
          project_count: number | null
          status: string | null
          total_value: number | null
        }
        Relationships: []
      }
      dashboard_revenue_monthly_v: {
        Row: {
          month: string | null
          quote_count: number | null
          total_amount: number | null
        }
        Relationships: []
      }
      dashboard_user_workload_v: {
        Row: {
          auth_user_id: string | null
          done_tasks: number | null
          email: string | null
          open_tasks: number | null
          overdue_tasks: number | null
          user_id: string | null
          user_name: string | null
        }
        Relationships: []
      }
      users_profile_lookup: {
        Row: {
          active: boolean | null
          auth_user_id: string | null
          email: string | null
          full_name: string | null
          id: string | null
          role_id: string | null
        }
        Insert: {
          active?: boolean | null
          auth_user_id?: string | null
          email?: string | null
          full_name?: string | null
          id?: string | null
          role_id?: string | null
        }
        Update: {
          active?: boolean | null
          auth_user_id?: string | null
          email?: string | null
          full_name?: string | null
          id?: string | null
          role_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "users_profile_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      v_lead_activity: {
        Row: {
          last_activity_at: string | null
          last_call_at: string | null
          last_email_at: string | null
          last_followup_at: string | null
          last_status_change_at: string | null
          lead_id: string | null
        }
        Insert: {
          last_activity_at?: never
          last_call_at?: never
          last_email_at?: never
          last_followup_at?: never
          last_status_change_at?: never
          lead_id?: string | null
        }
        Update: {
          last_activity_at?: never
          last_call_at?: never
          last_email_at?: never
          last_followup_at?: never
          last_status_change_at?: never
          lead_id?: string | null
        }
        Relationships: []
      }
      v_lead_due_buckets: {
        Row: {
          assigned_to: string | null
          bucket: string | null
          lead_id: string | null
          next_step_due_at: string | null
        }
        Insert: {
          assigned_to?: string | null
          bucket?: never
          lead_id?: string | null
          next_step_due_at?: string | null
        }
        Update: {
          assigned_to?: string | null
          bucket?: never
          lead_id?: string | null
          next_step_due_at?: string | null
        }
        Relationships: []
      }
      v_sales_user_load: {
        Row: {
          active_lead_count: number | null
          email: string | null
          full_name: string | null
          user_id: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      can_access_email_thread: {
        Args: { _thread_id: string; _user_id: string }
        Returns: boolean
      }
      crm_lookup_normalize: { Args: { p_text: string }; Returns: string }
      crm_mailbox_page: {
        Args: {
          p_folder?: string
          p_mailbox?: string
          p_page?: number
          p_search?: string
        }
        Returns: Json
      }
      crm_mailboxes: { Args: never; Returns: Json }
      crm_record_search: {
        Args: {
          p_filters?: Json
          p_id?: string
          p_page?: number
          p_search?: string
          p_source: string
        }
        Returns: Json
      }
      crm_role_of: { Args: { _auth_user: string }; Returns: string }
      current_profile_id: { Args: never; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      has_route_access: {
        Args: { _auth_user: string; _path: string }
        Returns: boolean
      }
      is_email_admin: { Args: { _user_id: string }; Returns: boolean }
      is_owner_role: { Args: { _auth_user: string }; Returns: boolean }
      sales_mark_won_with_project: {
        Args: {
          p_lead_id: string
          p_notes?: string
          p_project_manager_user_id: string
          p_start_date: string
          p_title: string
        }
        Returns: string
      }
    }
    Enums: {
      ai_action_type:
        | "navigate"
        | "create_lead"
        | "create_followup"
        | "create_task"
        | "create_contact"
        | "update_lead"
        | "update_followup"
        | "suggest_call_list"
        | "suggest_followup"
        | "detect_lead_from_email"
        | "company_research"
        | "other"
      ai_agent_type: "marvin" | "sales" | "pm"
      app_role:
        | "owner"
        | "admin"
        | "project_manager"
        | "sales"
        | "marketing"
        | "user"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      ai_action_type: [
        "navigate",
        "create_lead",
        "create_followup",
        "create_task",
        "create_contact",
        "update_lead",
        "update_followup",
        "suggest_call_list",
        "suggest_followup",
        "detect_lead_from_email",
        "company_research",
        "other",
      ],
      ai_agent_type: ["marvin", "sales", "pm"],
      app_role: [
        "owner",
        "admin",
        "project_manager",
        "sales",
        "marketing",
        "user",
      ],
    },
  },
} as const
