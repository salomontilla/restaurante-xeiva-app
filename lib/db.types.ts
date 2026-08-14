export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      dining_rooms: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number
        }
        Relationships: []
      }
      menu_categories: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number
        }
        Relationships: []
      }
      menu_item_variants: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          menu_item_id: string
          name: string
          price: number
          sort_order: number
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          menu_item_id: string
          name: string
          price: number
          sort_order?: number
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          menu_item_id?: string
          name?: string
          price?: number
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "menu_item_variants_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_items: {
        Row: {
          base_price: number
          category_id: string | null
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          base_price: number
          category_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          base_price?: number
          category_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "menu_items_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "menu_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      order_checks: {
        Row: {
          created_at: string
          id: string
          order_id: string
          paid_at: string | null
          paid_by: string | null
          seq: number
          total: number
        }
        Insert: {
          created_at?: string
          id?: string
          order_id: string
          paid_at?: string | null
          paid_by?: string | null
          seq: number
          total?: number
        }
        Update: {
          created_at?: string
          id?: string
          order_id?: string
          paid_at?: string | null
          paid_by?: string | null
          seq?: number
          total?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_checks_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_checks_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "v_table_map"
            referencedColumns: ["open_order_id"]
          },
          {
            foreignKeyName: "order_checks_paid_by_fkey"
            columns: ["paid_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          check_id: string
          client_created_at: string
          created_at: string
          created_by: string
          id: string
          item_name: string
          line_total: number | null
          menu_item_id: string
          note: string | null
          order_id: string
          printed_at: string | null
          qty: number
          unit_price: number
          variant_id: string | null
          variant_name: string | null
          void_reason: string | null
          voided_at: string | null
          voided_by: string | null
        }
        Insert: {
          check_id: string
          client_created_at: string
          created_at?: string
          created_by: string
          id: string
          item_name: string
          line_total?: number | null
          menu_item_id: string
          note?: string | null
          order_id: string
          printed_at?: string | null
          qty: number
          unit_price: number
          variant_id?: string | null
          variant_name?: string | null
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Update: {
          check_id?: string
          client_created_at?: string
          created_at?: string
          created_by?: string
          id?: string
          item_name?: string
          line_total?: number | null
          menu_item_id?: string
          note?: string | null
          order_id?: string
          printed_at?: string | null
          qty?: number
          unit_price?: number
          variant_id?: string | null
          variant_name?: string | null
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "order_items_check_belongs_to_order"
            columns: ["order_id", "check_id"]
            isOneToOne: false
            referencedRelation: "order_checks"
            referencedColumns: ["order_id", "id"]
          },
          {
            foreignKeyName: "order_items_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "v_table_map"
            referencedColumns: ["open_order_id"]
          },
          {
            foreignKeyName: "order_items_variant_belongs_to_item"
            columns: ["variant_id", "menu_item_id"]
            isOneToOne: false
            referencedRelation: "menu_item_variants"
            referencedColumns: ["id", "menu_item_id"]
          },
          {
            foreignKeyName: "order_items_voided_by_fkey"
            columns: ["voided_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          business_date: string | null
          client_created_at: string
          closed_at: string | null
          closed_by: string | null
          created_by: string
          dining_room_id: string
          id: string
          note: string | null
          opened_at: string
          printed_at: string | null
          status: Database["public"]["Enums"]["order_status"]
          table_id: string
          table_label: string
          total: number
          waiter_id: string | null
        }
        Insert: {
          business_date?: string | null
          client_created_at: string
          closed_at?: string | null
          closed_by?: string | null
          created_by: string
          dining_room_id: string
          id: string
          note?: string | null
          opened_at?: string
          printed_at?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          table_id: string
          table_label: string
          total?: number
          waiter_id?: string | null
        }
        Update: {
          business_date?: string | null
          client_created_at?: string
          closed_at?: string | null
          closed_by?: string | null
          created_by?: string
          dining_room_id?: string
          id?: string
          note?: string | null
          opened_at?: string
          printed_at?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          table_id?: string
          table_label?: string
          total?: number
          waiter_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_closed_by_fkey"
            columns: ["closed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_dining_room_id_fkey"
            columns: ["dining_room_id"]
            isOneToOne: false
            referencedRelation: "dining_rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_table_id_fkey"
            columns: ["table_id"]
            isOneToOne: false
            referencedRelation: "tables"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_table_id_fkey"
            columns: ["table_id"]
            isOneToOne: false
            referencedRelation: "v_table_map"
            referencedColumns: ["table_id"]
          },
          {
            foreignKeyName: "orders_waiter_id_fkey"
            columns: ["waiter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          check_id: string
          created_at: string
          created_by: string
          id: string
          method: Database["public"]["Enums"]["payment_method"]
          order_id: string
          reference: string | null
          tendered: number | null
        }
        Insert: {
          amount: number
          check_id: string
          created_at?: string
          created_by: string
          id?: string
          method: Database["public"]["Enums"]["payment_method"]
          order_id: string
          reference?: string | null
          tendered?: number | null
        }
        Update: {
          amount?: number
          check_id?: string
          created_at?: string
          created_by?: string
          id?: string
          method?: Database["public"]["Enums"]["payment_method"]
          order_id?: string
          reference?: string | null
          tendered?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_check_belongs_to_order"
            columns: ["order_id", "check_id"]
            isOneToOne: false
            referencedRelation: "order_checks"
            referencedColumns: ["order_id", "id"]
          },
          {
            foreignKeyName: "payments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          full_name: string
          id: string
          is_active: boolean
          role: Database["public"]["Enums"]["user_role"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          full_name: string
          id: string
          is_active?: boolean
          role: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          full_name?: string
          id?: string
          is_active?: boolean
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Relationships: []
      }
      restaurant_settings: {
        Row: {
          address: string | null
          id: boolean
          menu_version: string
          name: string
          phone: string | null
          receipt_footer: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          id?: boolean
          menu_version?: string
          name?: string
          phone?: string | null
          receipt_footer?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          id?: boolean
          menu_version?: string
          name?: string
          phone?: string | null
          receipt_footer?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      tables: {
        Row: {
          assigned_waiter_id: string | null
          created_at: string
          dining_room_id: string
          id: string
          is_active: boolean
          label: string
          seats: number | null
          sort_order: number
        }
        Insert: {
          assigned_waiter_id?: string | null
          created_at?: string
          dining_room_id: string
          id?: string
          is_active?: boolean
          label: string
          seats?: number | null
          sort_order?: number
        }
        Update: {
          assigned_waiter_id?: string | null
          created_at?: string
          dining_room_id?: string
          id?: string
          is_active?: boolean
          label?: string
          seats?: number | null
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "tables_assigned_waiter_id_fkey"
            columns: ["assigned_waiter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tables_dining_room_id_fkey"
            columns: ["dining_room_id"]
            isOneToOne: false
            referencedRelation: "dining_rooms"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      v_sales_by_dining_room: {
        Row: {
          business_date: string | null
          dining_room_id: string | null
          dining_room_name: string | null
          orders_count: number | null
          total: number | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_dining_room_id_fkey"
            columns: ["dining_room_id"]
            isOneToOne: false
            referencedRelation: "dining_rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      v_sales_by_item: {
        Row: {
          business_date: string | null
          item_name: string | null
          menu_item_id: string | null
          qty_sold: number | null
          total: number | null
          variant_name: string | null
        }
        Relationships: [
          {
            foreignKeyName: "order_items_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
        ]
      }
      v_sales_by_waiter: {
        Row: {
          business_date: string | null
          full_name: string | null
          orders_count: number | null
          total: number | null
          waiter_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_waiter_id_fkey"
            columns: ["waiter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      v_sales_daily: {
        Row: {
          avg_ticket: number | null
          business_date: string | null
          cash_total: number | null
          gross_total: number | null
          orders_count: number | null
          transfer_total: number | null
        }
        Relationships: []
      }
      v_table_map: {
        Row: {
          assigned_waiter_id: string | null
          assigned_waiter_name: string | null
          checks_count: number | null
          dining_room_id: string | null
          dining_room_name: string | null
          dining_room_sort_order: number | null
          has_unprinted_items: boolean | null
          is_occupied: boolean | null
          items_count: number | null
          open_order_id: string | null
          open_order_opened_at: string | null
          open_order_printed_at: string | null
          open_order_status: Database["public"]["Enums"]["order_status"] | null
          open_order_total: number | null
          seats: number | null
          sort_order: number | null
          table_id: string | null
          table_label: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tables_assigned_waiter_id_fkey"
            columns: ["assigned_waiter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tables_dining_room_id_fkey"
            columns: ["dining_room_id"]
            isOneToOne: false
            referencedRelation: "dining_rooms"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      app_role: {
        Args: never
        Returns: Database["public"]["Enums"]["user_role"]
      }
      can_edit_order: { Args: { p_order_id: string }; Returns: boolean }
      can_view_order: { Args: { p_order_id: string }; Returns: boolean }
      claim_table: { Args: { p_table_id: string }; Returns: Json }
      close_check: {
        Args: { p_check_id: string; p_payments: Json }
        Returns: Json
      }
      get_menu_snapshot: { Args: never; Returns: Json }
      get_order_ticket: {
        Args: { p_only_unprinted?: boolean; p_order_id: string }
        Returns: Json
      }
      get_receipt: { Args: { p_check_id: string }; Returns: Json }
      is_admin: { Args: never; Returns: boolean }
      is_caja_or_admin: { Args: never; Returns: boolean }
      is_staff: { Args: never; Returns: boolean }
      mark_order_printed: { Args: { p_order_id: string }; Returns: Json }
      owns_table: { Args: { p_table_id: string }; Returns: boolean }
      sales_summary: { Args: { p_from: string; p_to: string }; Returns: Json }
      split_order: {
        Args: { p_assignments: Json; p_order_id: string }
        Returns: Json
      }
      split_order_line: {
        Args: { p_item_id: string; p_new_item_id?: string; p_qty: number }
        Returns: Json
      }
      submit_order: { Args: { p_order: Json }; Returns: Json }
      to_business_date: { Args: { ts: string }; Returns: string }
      void_order_item: {
        Args: { p_item_id: string; p_reason?: string }
        Returns: Json
      }
    }
    Enums: {
      order_status: "pendiente" | "impreso" | "en_mesa" | "cerrado" | "anulado"
      payment_method: "efectivo" | "transferencia"
      user_role: "mesero" | "caja" | "admin"
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
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
      order_status: ["pendiente", "impreso", "en_mesa", "cerrado", "anulado"],
      payment_method: ["efectivo", "transferencia"],
      user_role: ["mesero", "caja", "admin"],
    },
  },
} as const

