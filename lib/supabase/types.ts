/**
 * Database types.
 *
 * Hand-maintained against `supabase/migrations/`. Regenerate with:
 *   npx supabase gen types typescript --linked > lib/supabase/types.ts
 *
 * Kept in the repo rather than generated at build time so a type error shows up
 * in review rather than in CI, and so the build does not depend on network
 * access to the project.
 */

export type MeetingStatus = "scheduled" | "live" | "ended";

export type MeetingSettings = {
  guests_allowed: boolean;
  mute_on_entry: boolean;
};

export type Database = {
  public: {
    Tables: {
      meetings: {
        Row: {
          id: string;
          code: string;
          title: string;
          description: string | null;
          host_id: string;
          status: MeetingStatus;
          scheduled_start: string | null;
          scheduled_end: string | null;
          timezone: string;
          sequence: number;
          settings: MeetingSettings;
          created_at: string;
          started_at: string | null;
          ended_at: string | null;
        };
        Insert: {
          id?: string;
          code: string;
          title?: string;
          description?: string | null;
          host_id: string;
          status?: MeetingStatus;
          scheduled_start?: string | null;
          scheduled_end?: string | null;
          timezone?: string;
          sequence?: number;
          settings?: MeetingSettings;
          created_at?: string;
          started_at?: string | null;
          ended_at?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["meetings"]["Insert"]>;
        Relationships: [];
      };
      meeting_participants: {
        Row: {
          id: string;
          meeting_id: string;
          user_id: string | null;
          display_name: string;
          identity: string;
          role: string;
          joined_at: string;
          left_at: string | null;
        };
        Insert: {
          id?: string;
          meeting_id: string;
          user_id?: string | null;
          display_name: string;
          identity: string;
          role?: string;
          joined_at?: string;
          left_at?: string | null;
        };
        Update: Partial<
          Database["public"]["Tables"]["meeting_participants"]["Insert"]
        >;
        Relationships: [];
      };
    };
    Views: Record<never, never>;
    Functions: {
      /** The only anonymous read path into `meetings`. Six columns, one code. */
      get_meeting_by_code: {
        Args: { p_code: string };
        Returns: {
          code: string;
          title: string;
          status: MeetingStatus;
          scheduled_start: string | null;
          timezone: string;
          guests_allowed: boolean;
        }[];
      };
    };
    Enums: {
      meeting_status: MeetingStatus;
    };
    CompositeTypes: Record<never, never>;
  };
};

/** What `/j/[code]` is allowed to know about a meeting before anyone joins. */
export type PublicMeeting =
  Database["public"]["Functions"]["get_meeting_by_code"]["Returns"][number];
