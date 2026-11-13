// Shared types for the Kring LINE closer bot. Pure TypeScript, no runtime deps.

export type OaRole = 'host' | 'sup' | 'venue' | 'general'
/** A lead's role can become 'scout' when they apply on a scout-enabled OA. */
export type LeadRole = OaRole | 'scout' | 'guest'
export type Lang = 'th' | 'en'
export type BotMode = 'auto' | 'shadow'
export type TurnSource = 'template' | 'llm' | 'human' | 'agent'
export type TurnDirection = 'in' | 'out' | 'draft'
export type TurnKind = 'reply' | 'followup' | 'inbound' | 'agent'
/** Turn kinds that are sent with the Push API and count toward the per-OA monthly quota. */
export const PUSH_KINDS: TurnKind[] = ['followup', 'agent']

export interface OaConfig {
  basicId: string
  role: OaRole
  channelSecret: string
  accessToken: string
  botUserId?: string
  /** Accepts scout applications (default true only for @266jjwqh). */
  scoutApplications?: boolean
}

export interface Lead {
  id: string
  oa_basic_id: string
  line_user_id: string
  role: LeadRole
  stage: string
  display_name: string | null
  lang: Lang
  zone: string | null
  activity_idea: string | null
  availability: string | null
  scout_code: string | null
  ref_code: string | null
  consent_at: string | null
  opted_out: boolean
  last_inbound_at: string | null
  last_outbound_at: string | null
  followups_sent: number
  notes: Record<string, unknown>
  created_at: string
  updated_at: string
}

export type LeadPatch = Partial<Omit<Lead, 'id' | 'oa_basic_id' | 'line_user_id' | 'created_at' | 'notes'>>

export interface Turn {
  id?: string
  lead_id: string
  direction: TurnDirection
  text: string
  source: TurnSource
  kind?: TurnKind
  line_event_id?: string | null
  /** FAQ intent answered by this outbound turn, if any. */
  intent?: string | null
  created_at?: string
}

export interface QuickReply {
  label: string
  text: string
}

export interface OutMessage {
  text: string
  quickReplies?: QuickReply[]
}

export interface ScoutRow {
  scout_code: string
  line_user_id: string
  nickname: string | null
  zone: string | null
  status: 'applicant' | 'trial' | 'active' | 'paused'
  created_at?: string
}

export interface ScoutResultRow {
  scout_code: string
  kind: 'host' | 'venue'
  lead_id: string
  verified?: boolean
  verified_at?: string | null
  paid?: boolean
}

export interface LineWebhookEvent {
  type: 'message' | 'follow' | 'unfollow' | 'postback' | string
  timestamp: number
  replyToken?: string
  webhookEventId?: string
  deliveryContext?: { isRedelivery?: boolean }
  mode?: string
  source?: {
    type: 'user' | 'group' | 'room'
    userId?: string
    groupId?: string
    roomId?: string
  }
  message?: {
    id: string
    type: 'text' | 'image' | 'sticker' | 'location' | string
    text?: string
    address?: string
    title?: string
    contentProvider?: { type?: 'line' | 'external' | string; originalContentUrl?: string }
  }
  postback?: {
    data?: string
  }
}
