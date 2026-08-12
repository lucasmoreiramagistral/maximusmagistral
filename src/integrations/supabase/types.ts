export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5";
  };
  public: {
    Tables: {
      anomalia_atualizacoes: {
        Row: {
          anomalia_id: string;
          atualizado_em: string;
          atualizado_por_login: string;
          atualizado_por_perfil: string;
          atualizado_por_user_id: string | null;
          id: number;
          o_que_foi_feito: string;
          origem_horario: string;
          resolvido_em_informado: string | null;
          responsavel_manutencao: string;
          status_anterior: string;
          status_novo: string;
        };
        Insert: {
          anomalia_id: string;
          atualizado_em?: string;
          atualizado_por_login: string;
          atualizado_por_perfil: string;
          atualizado_por_user_id?: string | null;
          id?: number;
          o_que_foi_feito: string;
          origem_horario: string;
          resolvido_em_informado?: string | null;
          responsavel_manutencao: string;
          status_anterior: string;
          status_novo: string;
        };
        Update: {
          anomalia_id?: string;
          atualizado_em?: string;
          atualizado_por_login?: string;
          atualizado_por_perfil?: string;
          atualizado_por_user_id?: string | null;
          id?: number;
          o_que_foi_feito?: string;
          origem_horario?: string;
          resolvido_em_informado?: string | null;
          responsavel_manutencao?: string;
          status_anterior?: string;
          status_novo?: string;
        };
        Relationships: [
          {
            foreignKeyName: "anomalia_atualizacoes_anomalia_id_fkey";
            columns: ["anomalia_id"];
            isOneToOne: false;
            referencedRelation: "anomalias";
            referencedColumns: ["id"];
          },
        ];
      };
      anomalias: {
        Row: {
          aberto_por_login: string | null;
          aberto_por_perfil: string | null;
          area: string;
          categoria: string;
          checklist_id: string | null;
          criado_em: string;
          criticidade: string;
          data_operacao: string;
          descricao: string;
          em_andamento_em: string | null;
          equipamento: string;
          equipamento_afetado: string | null;
          equipe: string;
          folha_key: string | null;
          id: string;
          item_origem: Json | null;
          linha: string;
          maquina: string;
          momento: string | null;
          o_que_foi_feito: string | null;
          operador_login: string;
          operador_responsavel: string;
          origem_anomalia: string | null;
          origem_horario_resolucao: string | null;
          resolvido_em: string | null;
          responsavel_manutencao: string | null;
          status: string;
          tecnico_responsavel: string | null;
          turno: string;
          ultima_atualizacao_em: string | null;
          ultima_atualizacao_por_login: string | null;
          ultima_atualizacao_por_perfil: string | null;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          aberto_por_login?: string | null;
          aberto_por_perfil?: string | null;
          area: string;
          categoria: string;
          checklist_id?: string | null;
          criado_em: string;
          criticidade: string;
          data_operacao: string;
          descricao: string;
          em_andamento_em?: string | null;
          equipamento: string;
          equipamento_afetado?: string | null;
          equipe: string;
          folha_key?: string | null;
          id: string;
          item_origem?: Json | null;
          linha: string;
          maquina: string;
          momento?: string | null;
          o_que_foi_feito?: string | null;
          operador_login: string;
          operador_responsavel: string;
          origem_anomalia?: string | null;
          origem_horario_resolucao?: string | null;
          resolvido_em?: string | null;
          responsavel_manutencao?: string | null;
          status: string;
          tecnico_responsavel?: string | null;
          turno: string;
          ultima_atualizacao_em?: string | null;
          ultima_atualizacao_por_login?: string | null;
          ultima_atualizacao_por_perfil?: string | null;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          aberto_por_login?: string | null;
          aberto_por_perfil?: string | null;
          area?: string;
          categoria?: string;
          checklist_id?: string | null;
          criado_em?: string;
          criticidade?: string;
          data_operacao?: string;
          descricao?: string;
          em_andamento_em?: string | null;
          equipamento?: string;
          equipamento_afetado?: string | null;
          equipe?: string;
          folha_key?: string | null;
          id?: string;
          item_origem?: Json | null;
          linha?: string;
          maquina?: string;
          momento?: string | null;
          o_que_foi_feito?: string | null;
          operador_login?: string;
          operador_responsavel?: string;
          origem_anomalia?: string | null;
          origem_horario_resolucao?: string | null;
          resolvido_em?: string | null;
          responsavel_manutencao?: string | null;
          status?: string;
          tecnico_responsavel?: string | null;
          turno?: string;
          ultima_atualizacao_em?: string | null;
          ultima_atualizacao_por_login?: string | null;
          ultima_atualizacao_por_perfil?: string | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "anomalias_checklist_id_fkey";
            columns: ["checklist_id"];
            isOneToOne: false;
            referencedRelation: "checklists";
            referencedColumns: ["id"];
          },
        ];
      };
      checklist_edicoes: {
        Row: {
          checklist_antes: Json;
          checklist_depois: Json;
          checklist_id: string;
          editado_em: string;
          editado_por_user_id: string | null;
          id: number;
          operador_login: string;
          operador_responsavel: string;
          versao: number;
        };
        Insert: {
          checklist_antes: Json;
          checklist_depois: Json;
          checklist_id: string;
          editado_em?: string;
          editado_por_user_id?: string | null;
          id?: number;
          operador_login: string;
          operador_responsavel: string;
          versao: number;
        };
        Update: {
          checklist_antes?: Json;
          checklist_depois?: Json;
          checklist_id?: string;
          editado_em?: string;
          editado_por_user_id?: string | null;
          id?: number;
          operador_login?: string;
          operador_responsavel?: string;
          versao?: number;
        };
        Relationships: [
          {
            foreignKeyName: "checklist_edicoes_checklist_id_fkey";
            columns: ["checklist_id"];
            isOneToOne: false;
            referencedRelation: "checklists";
            referencedColumns: ["id"];
          },
        ];
      };
      checklists: {
        Row: {
          area: string;
          concluido_em: string | null;
          contexto: Json;
          criado_em: string;
          data_operacao: string;
          equipamento: string;
          equipe: string;
          folha_key: string;
          id: string;
          linha: string;
          maquina: string;
          momento: string;
          operador_login: string;
          operador_responsavel: string;
          respostas: Json;
          status: string;
          total_anomalias: number;
          total_conformes: number;
          total_na: number;
          total_nao_conformes: number;
          turno: string;
          updated_at: string;
          user_id: string;
          verificacao_numero: number;
        };
        Insert: {
          area: string;
          concluido_em?: string | null;
          contexto: Json;
          criado_em: string;
          data_operacao: string;
          equipamento: string;
          equipe: string;
          folha_key: string;
          id: string;
          linha: string;
          maquina: string;
          momento: string;
          operador_login: string;
          operador_responsavel: string;
          respostas: Json;
          status: string;
          total_anomalias?: number;
          total_conformes?: number;
          total_na?: number;
          total_nao_conformes?: number;
          turno: string;
          updated_at?: string;
          user_id: string;
          verificacao_numero: number;
        };
        Update: {
          area?: string;
          concluido_em?: string | null;
          contexto?: Json;
          criado_em?: string;
          data_operacao?: string;
          equipamento?: string;
          equipe?: string;
          folha_key?: string;
          id?: string;
          linha?: string;
          maquina?: string;
          momento?: string;
          operador_login?: string;
          operador_responsavel?: string;
          respostas?: Json;
          status?: string;
          total_anomalias?: number;
          total_conformes?: number;
          total_na?: number;
          total_nao_conformes?: number;
          turno?: string;
          updated_at?: string;
          user_id?: string;
          verificacao_numero?: number;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          active: boolean;
          created_at: string;
          email_interno: string;
          equipe_padrao: string | null;
          id: string;
          nome: string;
          perfil: string;
          turno_padrao: string | null;
          usuario: string;
        };
        Insert: {
          active?: boolean;
          created_at?: string;
          email_interno: string;
          equipe_padrao?: string | null;
          id: string;
          nome: string;
          perfil: string;
          turno_padrao?: string | null;
          usuario: string;
        };
        Update: {
          active?: boolean;
          created_at?: string;
          email_interno?: string;
          equipe_padrao?: string | null;
          id?: string;
          nome?: string;
          perfil?: string;
          turno_padrao?: string | null;
          usuario?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      checklist_snapshot: {
        Args: { c: Database["public"]["Tables"]["checklists"]["Row"] };
        Returns: Json;
      };
      is_active: { Args: { _user_id: string }; Returns: boolean };
      is_gestao: { Args: { _user_id: string }; Returns: boolean };
      is_manutencao: { Args: { _user_id: string }; Returns: boolean };
      rpc_abrir_plano: {
        Args: {
          p_como?: string | null;
          p_item_numero: number;
          p_o_que: string;
          p_origem_id: string;
          p_origem_tipo: string;
          p_quando: string;
          p_quem: string;
          p_substitui_plano_id?: string | null;
        };
        Returns: string;
      };
      rpc_checar_plano: {
        Args: {
          p_cumprido: boolean;
          p_evidencia: string;
          p_plano_id: string;
          p_saiu_nc: boolean;
        };
        Returns: string;
      };
      rpc_finalizar_validacao_contingencia: {
        Args: {
          p_assinatura_checklist?: string | null;
          p_assinatura_limpeza?: string | null;
          p_autorizou?: string | null;
          p_checklist_id?: string | null;
          p_fechamento_id: string;
          p_limpeza_id?: string | null;
          p_motivo?: string | null;
          p_observacao?: string | null;
        };
        Returns: Json;
      };
      rpc_finalizar_validacao_lider: {
        Args: {
          p_assinatura_checklist?: string | null;
          p_assinatura_limpeza?: string | null;
          p_checklist_id?: string | null;
          p_fechamento_id: string;
          p_limpeza_id?: string | null;
          p_observacao?: string | null;
        };
        Returns: Json;
      };
      rpc_liberar_recurso_plano: {
        Args: { p_observacao: string; p_plano_id: string };
        Returns: string;
      };
      rpc_padronizar_plano: {
        Args: {
          p_analise: string;
          p_decisao: string;
          p_padrao_ref?: string | null;
          p_plano_id: string;
        };
        Returns: string;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {},
  },
} as const;
