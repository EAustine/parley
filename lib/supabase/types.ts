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

/**
 * §3.2 and §6. `cancelled` is a fourth value rather than a flavour of `ended`,
 * because the two are different events and collapsing them makes the join page
 * tell someone they missed a meeting that never happened.
 */
export type MeetingStatus = "scheduled" | "live" | "ended" | "cancelled";

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
          /** v1.5 A1. On for scheduled meetings, off for instant — set by the create route. */
          waiting_room: boolean;
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
          waiting_room?: boolean;
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
      rate_limits: {
        Row: { key: string; window_start: string; count: number };
        Insert: { key: string; window_start?: string; count?: number };
        Update: Partial<{ key: string; window_start: string; count: number }>;
        Relationships: [];
      };
      /** v1.5 A1: the queue. A waiting person holds no token and is not in the room. */
      meeting_waiting: {
        Row: {
          id: string;
          meeting_id: string;
          subject: string;
          subject_type: "user" | "device";
          user_id: string | null;
          display_name: string;
          status: "waiting" | "admitted" | "denied";
          requested_at: string;
          decided_at: string | null;
        };
        Insert: {
          id?: string;
          meeting_id: string;
          subject: string;
          subject_type: "user" | "device";
          user_id?: string | null;
          display_name: string;
          status?: "waiting" | "admitted" | "denied";
          requested_at?: string;
          decided_at?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["meeting_waiting"]["Insert"]>;
        Relationships: [];
      };
      /** v1.5 B1: the ten-minute block. Never by IP — see §7's NAT reasoning. */
      meeting_blocks: {
        Row: {
          id: string;
          meeting_id: string;
          subject: string;
          subject_type: "user" | "device";
          reason: "denied" | "removed";
          created_at: string;
          expires_at: string;
          /** v1.5 B2. Who it is, so "let them back in" has a them. */
          display_name: string | null;
          /** Bumped by the door each time they are refused. */
          attempted_at: string | null;
          /** When the host was told. `attempted_at > notified_at` is the whole rule. */
          notified_at: string | null;
        };
        Insert: {
          id?: string;
          meeting_id: string;
          subject: string;
          subject_type: "user" | "device";
          reason: "denied" | "removed";
          created_at?: string;
          expires_at: string;
          display_name?: string | null;
          attempted_at?: string | null;
          notified_at?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["meeting_blocks"]["Insert"]>;
        Relationships: [];
      };
      /**
       * v1.5 B1: the identity a token was minted for, and the durable subject
       * behind it. Server-only — RLS is on with no policies, deliberately.
       */
      meeting_identities: {
        Row: {
          meeting_id: string;
          identity: string;
          subject: string;
          subject_type: "user" | "device";
          created_at: string;
        };
        Insert: {
          meeting_id: string;
          identity: string;
          subject: string;
          subject_type: "user" | "device";
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["meeting_identities"]["Insert"]>;
        Relationships: [];
      };
      meeting_participants: {
        Row: {
          id: string;
          meeting_id: string;
          /**
           * Missing from this Row until v1.5 C1, though the column has existed
           * since the first migration and `Insert` always listed it.
           *
           * Found by the compiler the moment something read it: C1's record has
           * to say whether a name was attested or typed, and that is exactly
           * this column. A hand-maintained type that is missing a column is
           * invisible until somebody needs it.
           */
          user_id: string | null;
          /**
           * Nullable on read, required on write — deliberately asymmetric.
           *
           * `20260905180000_clear_email_display_names.sql` nulled the rows that
           * held a host's email address, and dropped the column's `not null` to
           * do it. No *new* row can be null: the token endpoint refuses to mint
           * without a name, so `Insert` below keeps this required and the
           * client contract stays stricter than the table.
           */
          display_name: string | null;
          identity: string;
          role: string;
          joined_at: string;
          left_at: string | null;
          /** v1.5 C1. Null means they left on their own; a time means the host removed them. */
          removed_at: string | null;
        };
        Insert: {
          id?: string;
          meeting_id: string;
          user_id?: string | null;
          display_name: string;
          removed_at?: string | null;
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
      /**
       * Fixed-window rate limiter. Returns true when the request may proceed.
       * Server-side only — EXECUTE is revoked from anon and authenticated.
       */
      consume_rate_limit: {
        Args: { p_key: string; p_limit: number; p_window_seconds: number };
        Returns: boolean;
      };
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
