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
      audit_log: {
        Row: {
          action: string
          changed_at: string
          changed_by: string | null
          id: string
          new_value: Json | null
          old_value: Json | null
          record_id: string | null
          table_name: string
        }
        Insert: {
          action: string
          changed_at?: string
          changed_by?: string | null
          id?: string
          new_value?: Json | null
          old_value?: Json | null
          record_id?: string | null
          table_name: string
        }
        Update: {
          action?: string
          changed_at?: string
          changed_by?: string | null
          id?: string
          new_value?: Json | null
          old_value?: Json | null
          record_id?: string | null
          table_name?: string
        }
        Relationships: []
      }
      business_settings: {
        Row: {
          business_name: string
          categories: string[]
          currency_code: string
          currency_symbol: string
          expense_categories: string[]
          id: boolean
          logo_url: string | null
          shared_visibility: boolean
          updated_at: string
        }
        Insert: {
          business_name?: string
          categories?: string[]
          currency_code?: string
          currency_symbol?: string
          expense_categories?: string[]
          id?: boolean
          logo_url?: string | null
          shared_visibility?: boolean
          updated_at?: string
        }
        Update: {
          business_name?: string
          categories?: string[]
          currency_code?: string
          currency_symbol?: string
          expense_categories?: string[]
          id?: boolean
          logo_url?: string | null
          shared_visibility?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      expenses: {
        Row: {
          amount: number
          category: string
          created_at: string
          created_by: string | null
          date: string
          description: string | null
          id: string
          receipt_url: string | null
          updated_at: string
        }
        Insert: {
          amount: number
          category: string
          created_at?: string
          created_by?: string | null
          date?: string
          description?: string | null
          id?: string
          receipt_url?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          category?: string
          created_at?: string
          created_by?: string | null
          date?: string
          description?: string | null
          id?: string
          receipt_url?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      inventory_transactions: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          product_id: string
          quantity: number
          reason: string | null
          reference: string | null
          supplier: string | null
          type: Database["public"]["Enums"]["inv_txn_type"]
          unit_cost: number | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          product_id: string
          quantity: number
          reason?: string | null
          reference?: string | null
          supplier?: string | null
          type: Database["public"]["Enums"]["inv_txn_type"]
          unit_cost?: number | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          product_id?: string
          quantity?: number
          reason?: string | null
          reference?: string | null
          supplier?: string | null
          type?: Database["public"]["Enums"]["inv_txn_type"]
          unit_cost?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_transactions_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      ownership_shares: {
        Row: {
          created_at: string
          effective_from: string
          effective_to: string | null
          id: string
          share_percentage: number
          stakeholder_name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          effective_from?: string
          effective_to?: string | null
          id?: string
          share_percentage: number
          stakeholder_name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          effective_from?: string
          effective_to?: string | null
          id?: string
          share_percentage?: number
          stakeholder_name?: string
          updated_at?: string
        }
        Relationships: []
      }
      products: {
        Row: {
          category: string
          cost_price: number
          created_at: string
          id: string
          is_active: boolean
          name: string
          quantity_on_hand: number
          reorder_threshold: number
          selling_price: number
          sku: string | null
          unit_type: Database["public"]["Enums"]["unit_type"]
          updated_at: string
        }
        Insert: {
          category?: string
          cost_price?: number
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          quantity_on_hand?: number
          reorder_threshold?: number
          selling_price?: number
          sku?: string | null
          unit_type?: Database["public"]["Enums"]["unit_type"]
          updated_at?: string
        }
        Update: {
          category?: string
          cost_price?: number
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          quantity_on_hand?: number
          reorder_threshold?: number
          selling_price?: number
          sku?: string | null
          unit_type?: Database["public"]["Enums"]["unit_type"]
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          linked_stakeholder_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          linked_stakeholder_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          linked_stakeholder_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_linked_stakeholder_id_fkey"
            columns: ["linked_stakeholder_id"]
            isOneToOne: false
            referencedRelation: "ownership_shares"
            referencedColumns: ["id"]
          },
        ]
      }
      profit_distributions: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          date: string
          id: string
          notes: string | null
          payment_reference: string | null
          source_period: string | null
          stakeholder_id: string
          status: Database["public"]["Enums"]["distribution_status"]
          updated_at: string
        }
        Insert: {
          amount: number
          created_at?: string
          created_by?: string | null
          date?: string
          id?: string
          notes?: string | null
          payment_reference?: string | null
          source_period?: string | null
          stakeholder_id: string
          status?: Database["public"]["Enums"]["distribution_status"]
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          date?: string
          id?: string
          notes?: string | null
          payment_reference?: string | null
          source_period?: string | null
          stakeholder_id?: string
          status?: Database["public"]["Enums"]["distribution_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profit_distributions_stakeholder_id_fkey"
            columns: ["stakeholder_id"]
            isOneToOne: false
            referencedRelation: "ownership_shares"
            referencedColumns: ["id"]
          },
        ]
      }
      sale_items: {
        Row: {
          created_at: string
          id: string
          product_id: string
          quantity: number
          sale_id: string
          subtotal: number
          unit_cost: number
          unit_price: number
        }
        Insert: {
          created_at?: string
          id?: string
          product_id: string
          quantity: number
          sale_id: string
          subtotal?: number
          unit_cost?: number
          unit_price: number
        }
        Update: {
          created_at?: string
          id?: string
          product_id?: string
          quantity?: number
          sale_id?: string
          subtotal?: number
          unit_cost?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "sale_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_items_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
        ]
      }
      sales: {
        Row: {
          amount_paid: number
          created_at: string
          created_by: string | null
          customer_name: string | null
          id: string
          is_voided: boolean
          notes: string | null
          payment_method: Database["public"]["Enums"]["payment_method"]
          payment_status: Database["public"]["Enums"]["payment_status"]
          sale_date: string
          total_amount: number
          total_cost: number
          updated_at: string
          void_reason: string | null
        }
        Insert: {
          amount_paid?: number
          created_at?: string
          created_by?: string | null
          customer_name?: string | null
          id?: string
          is_voided?: boolean
          notes?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"]
          payment_status?: Database["public"]["Enums"]["payment_status"]
          sale_date?: string
          total_amount?: number
          total_cost?: number
          updated_at?: string
          void_reason?: string | null
        }
        Update: {
          amount_paid?: number
          created_at?: string
          created_by?: string | null
          customer_name?: string | null
          id?: string
          is_voided?: boolean
          notes?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"]
          payment_status?: Database["public"]["Enums"]["payment_status"]
          sale_date?: string
          total_amount?: number
          total_cost?: number
          updated_at?: string
          void_reason?: string | null
        }
        Relationships: []
      }
      rebates: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          id: string
          notes: string | null
          rebate_month: string
          rebate_type: Database["public"]["Enums"]["rebate_type"]
          reference: string | null
          status: Database["public"]["Enums"]["rebate_status"]
          updated_at: string
        }
        Insert: {
          amount: number
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          rebate_month: string
          rebate_type?: Database["public"]["Enums"]["rebate_type"]
          reference?: string | null
          status?: Database["public"]["Enums"]["rebate_status"]
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          rebate_month?: string
          rebate_type?: Database["public"]["Enums"]["rebate_type"]
          reference?: string | null
          status?: Database["public"]["Enums"]["rebate_status"]
          updated_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      record_sale: {
        Args: {
          p_amount_paid: number
          p_customer_name: string
          p_items: Json
          p_notes: string
          p_payment_method: Database["public"]["Enums"]["payment_method"]
          p_payment_status: Database["public"]["Enums"]["payment_status"]
          p_sale_date: string
        }
        Returns: string
      }
      void_sale: {
        Args: { p_reason: string; p_sale_id: string }
        Returns: undefined
      }
    }
    Enums: {
      app_role: "admin" | "family_viewer" | "staff"
      distribution_status: "pending" | "sent" | "confirmed"
      inv_txn_type:
        | "stock_in"
        | "stock_out"
        | "sale_deduction"
        | "sale_reversal"
        | "adjustment"
      payment_method: "cash" | "transfer" | "credit"
      payment_status: "paid" | "partial" | "owing"
      rebate_status: "pending" | "received"
      rebate_type: "cash" | "stock_credit" | "discount"
      unit_type: "crate" | "case" | "bottle" | "pack"
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
      app_role: ["admin", "family_viewer", "staff"],
      distribution_status: ["pending", "sent", "confirmed"],
      inv_txn_type: [
        "stock_in",
        "stock_out",
        "sale_deduction",
        "sale_reversal",
        "adjustment",
      ],
      payment_method: ["cash", "transfer", "credit"],
      payment_status: ["paid", "partial", "owing"],
      rebate_status: ["pending", "received"],
      rebate_type: ["cash", "stock_credit", "discount"],
      unit_type: ["crate", "case", "bottle", "pack"],
    },
  },
} as const
