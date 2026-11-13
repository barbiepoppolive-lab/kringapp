// Env-driven configuration. Pure: callers pass an env getter.
import type { BotMode, OaConfig, OaRole } from './types.ts'

export type EnvGetter = (key: string) => string | undefined

export const LEGACY_OA_BASIC_ID = '@266jjwqh'
export const SCOUT_DEFAULT_OAS = ['@266jjwqh']
const ROLES: OaRole[] = ['host', 'sup', 'venue', 'general']

/** Our OAs (no secrets) — used for docs/tests and the default role map. */
export const KNOWN_OAS: Array<{ basicId: string; role: OaRole; scoutApplications?: boolean }> = [
  { basicId: '@304ikyuf', role: 'host' },
  { basicId: '@806oxwvj', role: 'sup' },
  { basicId: '@194hsqbc', role: 'venue' },
  { basicId: '@266jjwqh', role: 'general', scoutApplications: true },
  { basicId: '@825eyKYW', role: 'general' },
]

export function getEnv(key: string): string | undefined {
  const g = globalThis as any
  try {
    if (g.Deno?.env?.get) return g.Deno.env.get(key)
  } catch {
    /* permission denied etc. */
  }
  return g.process?.env?.[key]
}

export function parseOaConfigs(env: EnvGetter): OaConfig[] {
  const raw = env('LINE_OAS_JSON')
  const out: OaConfig[] = []
  if (raw && raw.trim()) {
    try {
      const arr = JSON.parse(raw)
      if (Array.isArray(arr)) {
        for (const item of arr) {
          if (!item || typeof item !== 'object') continue
          const basicId = String(item.basicId || '').trim()
          const role = String(item.role || '').trim() as OaRole
          const channelSecret = String(item.channelSecret || '')
          const accessToken = String(item.accessToken || '')
          if (!basicId || !channelSecret || !ROLES.includes(role)) continue
          out.push({
            basicId,
            role,
            channelSecret,
            accessToken,
            botUserId: item.botUserId ? String(item.botUserId) : undefined,
            scoutApplications:
              typeof item.scoutApplications === 'boolean' ? item.scoutApplications : SCOUT_DEFAULT_OAS.includes(basicId),
          })
        }
      }
    } catch {
      // fall through to legacy
    }
  }
  if (out.length > 0) return out

  const secret = env('LINE_CHANNEL_SECRET') || ''
  if (!secret) return []
  const basicId = env('LINE_OA_BASIC_ID') || LEGACY_OA_BASIC_ID
  return [
    {
      basicId,
      role: 'general',
      channelSecret: secret,
      accessToken: env('LINE_CHANNEL_ACCESS_TOKEN') || '',
      botUserId: env('LINE_BOT_USER_ID') || undefined,
      scoutApplications: SCOUT_DEFAULT_OAS.includes(basicId),
    },
  ]
}

export function parseBotMode(env: EnvGetter): BotMode {
  return (env('BOT_MODE') || '').trim().toLowerCase() === 'shadow' ? 'shadow' : 'auto'
}

function intEnv(env: EnvGetter, key: string, def: number, min = 0): number {
  const n = parseInt(env(key) || '', 10)
  return Number.isFinite(n) && n >= min ? n : def
}

export interface BotSettings {
  mode: BotMode
  anthropicApiKey: string
  claudeModel: string
  llmTimeoutMs: number
  followupDailyCap: number
  followupMonthlyCapPerOa: number
  cronSecret: string
  agentSecret: string
  geminiApiKey: string
  geminiModel: string
}

export function parseSettings(env: EnvGetter): BotSettings {
  return {
    mode: parseBotMode(env),
    anthropicApiKey: (env('ANTHROPIC_API_KEY') || '').trim(),
    claudeModel: (env('CLAUDE_MODEL') || '').trim() || 'claude-sonnet-4-5',
    llmTimeoutMs: intEnv(env, 'LLM_TIMEOUT_MS', 8000, 100),
    followupDailyCap: intEnv(env, 'FOLLOWUP_DAILY_CAP', 50),
    followupMonthlyCapPerOa: intEnv(env, 'FOLLOWUP_MONTHLY_CAP_PER_OA', 250),
    cronSecret: env('FOLLOWUP_CRON_SECRET') || '',
    agentSecret: env('AGENT_SECRET') || '',
    geminiApiKey: (env('GEMINI_API_KEY') || '').trim(),
    geminiModel: (env('GEMINI_MODEL') || '').trim() || 'gemini-2.5-flash',
  }
}

/** Which LLM (if any) answers free text: Anthropic first, then Gemini, else none (instant ack + agent queue). */
export function llmProvider(s: Pick<BotSettings, 'anthropicApiKey' | 'geminiApiKey'>): 'anthropic' | 'gemini' | null {
  if (s.anthropicApiKey) return 'anthropic'
  if (s.geminiApiKey) return 'gemini'
  return null
}
