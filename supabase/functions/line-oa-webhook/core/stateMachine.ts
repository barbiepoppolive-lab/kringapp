// Deterministic stage machine. Pure: (lead, inbound, ctx) -> Decision. No network, no clock.
import type { Lang, Lead, LeadPatch, OaConfig, OutMessage } from './types.ts'
import * as T from './templates.ts'
import { faqAnswer, matchIntent } from './faq.ts'
import {
  extractPromptPayPhone,
  extractReferralCode,
  containsDigitRun,
  isAffirmative,
  isDetailsRequest,
  isDoneSignup,
  isHostChoice,
  isHumanRequest,
  isLinkRequest,
  isNightlifeOrPrivate,
  isNoAnswer,
  isQuestionOrObjection,
  isRestart,
  isScoutStrongKeyword,
  isScoutWeakKeyword,
  isStop,
  isSupChoice,
  isGuestStrongIntent,
  isGuestWeakIntent,
  isCompanionshipRequest,
  isNoPromo,
  parsePartySize,
} from './text.ts'

export const STAGES = {
  host: ['new', 'qualify', 'pitch', 'close', 'onboarding', 'won', 'lost'],
  sup: ['new', 'pitch', 'close', 'onboarding', 'won', 'lost'],
  scout: ['apply', 'applied'],
  guest: ['intake', 'waitlist'],
  general: ['new'],
  venue: ['new', 'handoff'],
} as const

export type Inbound =
  | { kind: 'follow' }
  | { kind: 'unfollow' }
  | { kind: 'text'; text: string }
  | { kind: 'location'; text: string; address: string }
  | { kind: 'other'; text: string }
  | { kind: 'media'; mediaType: 'video' | 'image'; messageId: string; external: boolean; text: string }

export interface DecideCtx {
  oa: OaConfig
  /** True when the lead row was created by this event. */
  isNewLead: boolean
  /** Generates a fresh code like S-AB12 / C-AB12. */
  newCode: (prefix: 'S' | 'C') => string
}

export interface Decision {
  messages: OutMessage[]
  patch: LeadPatch
  notes: Record<string, unknown>
  /** When set, the reply must be produced by the LLM (handler does the call). */
  llm?: { pending: string | null }
  createScout?: { scout_code: string; zone: string | null; nickname: string | null }
  scoutResult?: { kind: 'host' }
  /** Sent even in shadow mode (opt-out confirmations). */
  exemptFromShadow?: boolean
  /** Stay silent (opted-out, paused, unfollow…). */
  silent?: boolean
  /** FAQ intent answered by this decision (logged on the turn and in notes.last_intent). */
  intent?: string
  reason: string
}

const d = (reason: string, partial: Partial<Decision> = {}): Decision => ({
  messages: [],
  patch: {},
  notes: {},
  reason,
  ...partial,
})

export function applyDecision(lead: Lead, dec: Decision): Lead {
  return { ...lead, ...dec.patch, notes: { ...lead.notes, ...dec.notes } }
}

function textOf(inb: Inbound): string {
  return inb.kind === 'text' || inb.kind === 'location' || inb.kind === 'other' ? inb.text : ''
}

// ------------------------------------------------------------------ host helpers
export function nextHostStep(lead: Lead): T.HostStep | null {
  if (!lead.zone) return 'zone'
  if (!lead.activity_idea) return 'activity'
  if (!lead.availability) return 'availability'
  if (!lead.scout_code && !lead.notes.scout_q_done) return 'scout'
  return null
}

export function nextScoutStep(lead: Lead): T.ScoutStep | null {
  if (!lead.zone) return 'zone'
  if (!lead.availability) return 'availability'
  if (!lead.notes.experience) return 'experience'
  if (!lead.notes.hobbies) return 'hobbies'
  return null
}

function pendingText(lead: Lead): string | null {
  const lang = lead.lang
  if (lead.role === 'host' && lead.stage === 'qualify') {
    const s = nextHostStep(lead)
    return s ? T.hostQuestion(s, lang).text : null
  }
  if (lead.role === 'scout' && lead.stage === 'apply') {
    const s = nextScoutStep(lead)
    return s ? T.scoutQuestion(s, lang).text : null
  }
  if (lead.role === 'sup' && lead.stage === 'close' && !lead.notes.promptpay_phone) return T.supAskPromptPay(lang).text
  if (lead.stage === 'pitch') return lead.lang === 'en' ? 'Ready to sign up?' : 'พร้อมสมัครเลยไหมคะ?'
  return null
}

function llm(lead: Lead, reason: string, extra: Partial<Decision> = {}): Decision {
  return d(reason, { llm: { pending: pendingText({ ...lead, ...(extra.patch || {}), notes: { ...lead.notes, ...(extra.notes || {}) } } as Lead) }, ...extra })
}

/** After entering/continuing the qualify stage, ask the next missing thing or pitch. */
function hostAdvance(lead: Lead, prefix: OutMessage[], reason: string, patch: LeadPatch, notes: Record<string, unknown>): Decision {
  const next: Lead = { ...lead, ...patch, notes: { ...lead.notes, ...notes } }
  const step = nextHostStep(next)
  if (step) {
    return d(reason, { messages: [...prefix, T.hostQuestion(step, lead.lang)], patch: { ...patch, stage: 'qualify' }, notes })
  }
  return d(reason, { messages: [...prefix, ...T.hostPitch(lead.lang, next.zone, next.activity_idea)], patch: { ...patch, stage: 'pitch' }, notes })
}

function hostCloseDecision(lead: Lead, reason: string, patch: LeadPatch = {}): Decision {
  const ref = patch.scout_code ?? lead.scout_code
  const video = videoRequestOnce(lead)
  return d(reason, {
    messages: [...T.hostClose(lead.lang, ref), ...video.messages],
    patch: { ...patch, stage: 'close' },
    notes: video.notes,
    scoutResult: ref ? { kind: 'host' } : undefined,
  })
}

/** The host video request is sent once (close or onboarding). */
export function videoRequestOnce(lead: Lead): { messages: OutMessage[]; notes: Record<string, unknown> } {
  if (lead.notes.video_requested) return { messages: [], notes: {} }
  return { messages: [T.hostVideoRequest(lead.lang)], notes: { video_requested: true } }
}

// ------------------------------------------------------------------ flows
function decideHost(lead: Lead, inb: Inbound): Decision {
  const lang = lead.lang
  const text = textOf(inb)
  const code = extractReferralCode(text)
  const codePatch: LeadPatch = code && !lead.scout_code ? { scout_code: code } : {}

  switch (lead.stage) {
    case 'new':
    case 'lost': {
      if (isDetailsRequest(text)) return hostAdvance(lead, [T.hostSummary(lang)], 'host_details', codePatch, {})
      if (isAffirmative(text) || isHostChoice(text) || isRestart(text) || code)
        return hostAdvance(lead, [{ text: T.hostAck(lang) }], 'host_interest', codePatch, {})
      if (isQuestionOrObjection(text) || lead.last_outbound_at) return llm(lead, 'host_new_freetext', { patch: codePatch })
      return d('host_greeting', { messages: T.greeting('host', lang), patch: codePatch })
    }
    case 'qualify': {
      const step = nextHostStep(lead)
      if (!step) return hostAdvance(lead, [], 'host_qualify_complete', codePatch, {})
      if (isDetailsRequest(text)) return d('host_qualify_details', { messages: [T.hostSummary(lang), T.hostQuestion(step, lang)], patch: codePatch })
      if (step === 'scout') {
        if (code) return hostAdvance(lead, [], 'host_scout_code', { scout_code: code }, { scout_q_done: true })
        if (isNoAnswer(text) || isAffirmative(text)) return hostAdvance(lead, [], 'host_scout_none', {}, { scout_q_done: true })
        if (isQuestionOrObjection(text)) return llm(lead, 'host_qualify_question')
        return hostAdvance(lead, [], 'host_scout_other', {}, { scout_q_done: true })
      }
      if (isQuestionOrObjection(text)) return llm(lead, 'host_qualify_question', { patch: codePatch })
      if (isAffirmative(text) || (inb.kind === 'other' && !text)) {
        return d('host_qualify_reask', { messages: [T.hostQuestion(step, lang)], patch: codePatch })
      }
      if (code && text.replace(/\b[SC]-[A-Z0-9]{4}\b/i, '').trim().length < 2) {
        // they only sent a code
        return d('host_qualify_code_only', { messages: [T.hostQuestion(step, lang)], patch: codePatch })
      }
      const answer = inb.kind === 'location' ? inb.address || inb.text : text
      if (!answer.trim() || inb.kind === 'other') return d('host_qualify_reask', { messages: [T.hostQuestion(step, lang)] })
      if (step === 'zone') return hostAdvance(lead, [], 'host_zone', { ...codePatch, zone: answer.slice(0, 200) }, {})
      if (step === 'activity') {
        if (isNightlifeOrPrivate(answer)) return d('host_activity_rejected', { messages: [T.hostNightlifeNote(lang)], patch: codePatch, notes: { flagged_activity: answer.slice(0, 200) } })
        return hostAdvance(lead, [], 'host_activity', { ...codePatch, activity_idea: answer.slice(0, 200) }, {})
      }
      return hostAdvance(lead, [], 'host_availability', { ...codePatch, availability: answer.slice(0, 200) }, {})
    }
    case 'pitch': {
      if (/^(มีคำถาม|i have a question)/i.test(text.trim())) return d('host_ask_away', { messages: [T.askAway(lang)] })
      if (isAffirmative(text) || isDoneSignup(text) || isLinkRequest(text)) return hostCloseDecision(lead, 'host_close', codePatch)
      if (isDetailsRequest(text)) return d('host_pitch_details', { messages: [T.hostSummary(lang), { text: pendingText(lead) || '', quickReplies: T.QR.pitchClose(lang) }] })
      return llm(lead, 'host_pitch_freetext', { patch: codePatch })
    }
    case 'close': {
      if (isDoneSignup(text)) {
        const video = videoRequestOnce(lead)
        return d('host_onboarding', { messages: [T.hostOnboarded(lang), ...video.messages], patch: { stage: 'onboarding' }, notes: video.notes })
      }
      if (!isQuestionOrObjection(text) && (isLinkRequest(text) || isAffirmative(text))) return d('host_link_again', { messages: [T.hostLinkAgain(lang, lead.scout_code)] })
      return llm(lead, 'host_close_freetext', { patch: codePatch })
    }
    default:
      return llm(lead, `host_${lead.stage}_freetext`)
  }
}

function decideSup(lead: Lead, inb: Inbound, ctx: DecideCtx): Decision {
  const lang = lead.lang
  const text = textOf(inb)
  switch (lead.stage) {
    case 'new':
    case 'lost': {
      if (isAffirmative(text) || isDetailsRequest(text) || isSupChoice(text) || isRestart(text))
        return d('sup_pitch', { messages: T.supPitch(lang), patch: { stage: 'pitch' } })
      if (isQuestionOrObjection(text) || lead.last_outbound_at) return llm(lead, 'sup_new_freetext')
      return d('sup_greeting', { messages: T.greeting('sup', lang) })
    }
    case 'pitch': {
      if (/^(มีคำถาม|i have a question)/i.test(text.trim())) return d('sup_ask_away', { messages: [T.askAway(lang)] })
      if ((isAffirmative(text) || isLinkRequest(text)) && !isQuestionOrObjection(text)) {
        const code = lead.ref_code || ctx.newCode('C')
        return d('sup_code', { messages: T.supCode(lang, code), patch: { stage: 'close', ref_code: code } })
      }
      if (isDetailsRequest(text)) return d('sup_pitch_again', { messages: T.supPitch(lang) })
      return llm(lead, 'sup_pitch_freetext')
    }
    case 'close': {
      if (!lead.notes.promptpay_phone) {
        const phone = extractPromptPayPhone(text)
        if (phone)
          return d('sup_promptpay', { messages: [T.supReady(lang, lead.ref_code || '')], patch: { stage: 'onboarding' }, notes: { promptpay_phone: phone } })
        if (containsDigitRun(text, 6)) return d('sup_invalid_phone', { messages: [T.invalidPhone(lang)], notes: { rejected_number_input: true } })
      }
      if (lead.ref_code && isLinkRequest(text) && !isQuestionOrObjection(text)) return d('sup_code_again', { messages: [T.supCodeAgain(lang, lead.ref_code)] })
      return llm(lead, 'sup_close_freetext')
    }
    default: {
      if (lead.ref_code && isLinkRequest(text) && !isQuestionOrObjection(text)) return d('sup_code_again', { messages: [T.supCodeAgain(lang, lead.ref_code)] })
      return llm(lead, `sup_${lead.stage}_freetext`)
    }
  }
}

function startScout(lead: Lead): Decision {
  const next: Lead = { ...lead, role: 'scout', stage: 'apply' }
  const step = nextScoutStep(next) || 'zone'
  return d('scout_start', {
    messages: [T.scoutIntro(lead.lang), T.scoutQuestion(step, lead.lang)],
    patch: { role: 'scout', stage: 'apply' },
  })
}

function decideScout(lead: Lead, inb: Inbound, ctx: DecideCtx): Decision {
  const lang = lead.lang
  const text = textOf(inb)
  if (lead.stage !== 'apply') {
    // already applied → acknowledge once, then leave it to the founder
    if (lead.notes.handoff_sent) return d('scout_applied_silent', { silent: true, notes: { needs_human: true } })
    return d('scout_applied_ack', { messages: [T.handoffAck(lang)], notes: { needs_human: true, handoff_sent: true } })
  }
  const step = nextScoutStep(lead)
  if (!step) return finishScout(lead, ctx, {}, {})
  if (isScoutStrongKeyword(text) && text.trim().length <= 20) return d('scout_reask', { messages: [T.scoutQuestion(step, lang)] })
  if (isQuestionOrObjection(text)) return llm(lead, 'scout_question')
  const answer = (inb.kind === 'location' ? inb.address || inb.text : text).slice(0, 300)
  if (!answer.trim() || inb.kind === 'other') return d('scout_reask', { messages: [T.scoutQuestion(step, lang)] })

  let patch: LeadPatch = {}
  let notes: Record<string, unknown> = {}
  if (step === 'zone') patch = { zone: answer }
  else if (step === 'availability') patch = { availability: answer }
  else if (step === 'experience') notes = { experience: answer }
  else notes = { hobbies: answer }
  const next: Lead = { ...lead, ...patch, notes: { ...lead.notes, ...notes } }
  const nextStep = nextScoutStep(next)
  if (nextStep) return d(`scout_${step}`, { messages: [T.scoutQuestion(nextStep, lang)], patch, notes })
  return finishScout(lead, ctx, patch, notes)
}

function finishScout(lead: Lead, ctx: DecideCtx, patch: LeadPatch, notes: Record<string, unknown>): Decision {
  const code = lead.ref_code && lead.ref_code.startsWith('S-') ? lead.ref_code : ctx.newCode('S')
  const zone = patch.zone ?? lead.zone
  return d('scout_submitted', {
    messages: [T.scoutSubmitted(lead.lang, code)],
    patch: { ...patch, stage: 'applied', ref_code: code },
    notes: { ...notes, needs_human: true, scout_applied: true },
    createScout: { scout_code: code, zone, nickname: lead.display_name },
  })
}

// ------------------------------------------------------------------ guest waitlist
export function nextGuestStep(lead: Lead): T.GuestStep | null {
  const n = lead.notes
  if (!n.guest_activity) return 'activity'
  if (!n.guest_area) return 'area'
  if (!n.guest_when) return 'when'
  if (!n.guest_size) return 'size'
  return null
}

export function startGuest(lead: Lead): Decision {
  const next: Lead = { ...lead, role: 'guest', stage: 'intake' }
  const step = nextGuestStep(next) || 'activity'
  return d('guest_start', { messages: [T.guestIntro(lead.lang), T.guestQuestion(step, lead.lang)], patch: { role: 'guest', stage: 'intake' } })
}

function decideGuest(lead: Lead, inb: Inbound): Decision {
  const lang = lead.lang
  const text = textOf(inb)
  if (lead.stage !== 'intake') {
    if (isGuestStrongIntent(text) && !isQuestionOrObjectionStrict(text)) return d('guest_already_waitlisted', { messages: [T.guestAlreadyWaitlisted(lang)] })
    return llm(lead, 'guest_waitlist_freetext')
  }
  const step = nextGuestStep(lead)
  if (!step) return d('guest_waitlisted', { messages: [T.guestWaitlisted(lang)], patch: { stage: 'waitlist' } })
  if (isCompanionshipRequest(text)) return d('guest_redirect', { messages: [T.guestActivityRedirect(lang)], notes: { flagged_request: text.slice(0, 200) } })
  if (isQuestionOrObjection(text) && !/ยังไม่แน่ใจ|not sure/i.test(text)) return llm(lead, 'guest_question')
  if (inb.kind === 'other' || !text.trim()) return d('guest_reask', { messages: [T.guestQuestion(step, lang)] })
  const answer = (inb.kind === 'location' ? inb.address || inb.text : text).slice(0, 200)

  let notes: Record<string, unknown> = {}
  if (step === 'activity') {
    if (/^(อื่นๆ|อื่น ๆ|other)$/i.test(answer.trim())) return d('guest_activity_other', { messages: [T.guestOtherPrompt(lang)] })
    if (isNightlifeOrPrivate(answer)) return d('guest_redirect', { messages: [T.guestActivityRedirect(lang)] })
    notes = { guest_activity: answer }
  } else if (step === 'area') notes = { guest_area: answer }
  else if (step === 'when') notes = { guest_when: answer }
  else {
    const n = parsePartySize(answer)
    if (n === null) return d('guest_reask', { messages: [T.guestQuestion('size', lang)] })
    if (n > 2 || n < 1) return d('guest_size_limit', { messages: [T.guestSizeLimit(lang)], notes: { guest_size_requested: n } })
    notes = { guest_size: n }
  }
  const next: Lead = { ...lead, notes: { ...lead.notes, ...notes } }
  const nextStep = nextGuestStep(next)
  if (nextStep) return d(`guest_${step}`, { messages: [T.guestQuestion(nextStep, lang)], notes })
  return d('guest_waitlisted', { messages: [T.guestWaitlisted(lang)], patch: { stage: 'waitlist' }, notes: { ...notes, waitlisted: true } })
}

/** Like isQuestionOrObjection but ignores booking words (so "อยากจอง" alone isn't a question). */
function isQuestionOrObjectionStrict(text: string): boolean {
  return /[?？]|ไหม|มั้ย|เท่าไ|ยังไง|อย่างไร|\b(what|how|why|when|where)\b/i.test(text) && !/^(อยากจอง|อยากจองกิจกรรม)\s*(ค่ะ|ครับ|คะ)?$/.test(text.trim())
}

function decideGeneral(lead: Lead, inb: Inbound, ctx: DecideCtx): Decision {
  const lang = lead.lang
  const text = textOf(inb)
  const scoutOk = !!ctx.oa.scoutApplications
  if (scoutOk && (isScoutStrongKeyword(text) || isScoutWeakKeyword(text))) return startScout(lead)
  if (isHostChoice(text)) {
    const asHost: Lead = { ...lead, role: 'host', stage: 'new' }
    const dec = decideHost(asHost, { kind: 'text', text: 'สนใจเป็นโฮสต์' })
    return { ...dec, patch: { role: 'host', ...dec.patch }, reason: 'general_to_host' }
  }
  if (isSupChoice(text)) {
    return d('general_to_sup', { messages: T.supPitch(lang), patch: { role: 'sup', stage: 'pitch' } })
  }
  if (isQuestionOrObjection(text) || lead.last_outbound_at) return llm(lead, 'general_freetext')
  return d('general_greeting', { messages: T.greeting('general', lang, scoutOk) })
}

function decideVenue(lead: Lead): Decision {
  // No locked venue facts in the playbook → always hand to the founder, acknowledge once.
  if (lead.notes.handoff_sent) return d('venue_silent', { silent: true, notes: { needs_human: true } })
  return d('venue_handoff', { messages: [T.handoffAck(lead.lang)], patch: { stage: 'handoff' }, notes: { needs_human: true, handoff_sent: true } })
}

// ------------------------------------------------------------------ entry
export function decide(lead: Lead, inbIn: Inbound, ctx: DecideCtx): Decision {
  // Media from non-hosts (host media is stored by the handler) behaves like any non-text message.
  const inb: Inbound = inbIn.kind === 'media' ? { kind: 'other', text: '' } : inbIn
  const lang: Lang = lead.lang
  const text = textOf(inb)

  if (inb.kind === 'unfollow') return d('unfollow', { silent: true, patch: { opted_out: true }, notes: { opt_out_reason: 'unfollow' } })

  if (inb.kind === 'follow') {
    // Adding the OA again is fresh consent.
    const patch: LeadPatch = { opted_out: false }
    const notes: Record<string, unknown> = { paused: false }
    if (lead.role === 'scout' && lead.stage === 'apply') {
      const step = nextScoutStep(lead) || 'zone'
      return d('refollow_scout', { messages: [T.scoutQuestion(step, lang)], patch, notes })
    }
    if (lead.role === 'guest') {
      const step = lead.stage === 'intake' ? nextGuestStep(lead) : null
      return d('refollow_guest', { messages: [step ? T.guestQuestion(step, lang) : T.guestAlreadyWaitlisted(lang)], patch, notes })
    }
    const role = lead.role === 'scout' ? 'general' : lead.role
    return d('follow_greeting', { messages: T.greeting(role, lang, !!ctx.oa.scoutApplications), patch, notes })
  }

  if (lead.opted_out) {
    if (isRestart(text)) {
      const fresh: Lead = { ...lead, opted_out: false, stage: lead.role === 'scout' ? lead.stage : 'new' }
      const dec = decide(fresh, inb, ctx)
      return { ...dec, patch: { opted_out: false, ...(fresh.stage !== lead.stage ? { stage: fresh.stage } : {}), ...dec.patch }, reason: `restart:${dec.reason}` }
    }
    return d('opted_out_silent', { silent: true })
  }

  if (isStop(text)) {
    const lostStage = lead.role === 'host' || lead.role === 'sup' ? { stage: 'lost' } : {}
    return d('stop', {
      messages: [T.stopConfirm(lang)],
      patch: { opted_out: true, ...lostStage },
      notes: { opt_out_reason: 'stop_keyword' },
      exemptFromShadow: true,
    })
  }

  if (lead.notes.paused) return d('paused_silent', { silent: true })

  if (isHumanRequest(text)) {
    return d('human_takeover', { messages: [T.humanHandoff(lang)], notes: { paused: true, needs_human: true, paused_reason: 'lead_requested_human' } })
  }

  // Strong scout keywords switch roles on a scout-enabled OA (unless already a scout).
  if (ctx.oa.scoutApplications && lead.role !== 'scout' && lead.role !== 'guest' && isScoutStrongKeyword(text)) return startScout(lead)

  // Guest intent switches to the guest waitlist on any OA. Weak words only when no role/flow is under way.
  if (lead.role !== 'guest') {
    const undecided = lead.role === 'general' || lead.role === 'venue' || lead.stage === 'new' || lead.stage === 'lost'
    if (isGuestStrongIntent(text) || (undecided && isGuestWeakIntent(text) && !isHostChoice(text))) return startGuest(lead)
  }

  // Host opts out of social promotion of their video
  if (lead.role === 'host' && isNoPromo(text)) {
    const videos = Array.isArray(lead.notes.videos) ? (lead.notes.videos as Array<Record<string, unknown>>).map((v) => ({ ...v, promo_consent: false })) : undefined
    return d('host_no_promo', { messages: [T.noPromoAck(lang)], notes: { promo_consent: false, ...(videos ? { videos } : {}) } })
  }

  const routed = routeByRole(lead, inb, ctx)
  // Free text the stage machine couldn't place → FAQ intent layer before LLM / agent.
  if (routed.llm) {
    const faq = faqDecision(lead, routed, text, ctx)
    if (faq) return faq
  }
  return routed
}

function routeByRole(lead: Lead, inb: Inbound, ctx: DecideCtx): Decision {
  switch (lead.role) {
    case 'host':
      return decideHost(lead, inb)
    case 'sup':
      return decideSup(lead, inb, ctx)
    case 'scout':
      return decideScout(lead, inb, ctx)
    case 'venue':
      return decideVenue(lead)
    case 'guest':
      return decideGuest(lead, inb)
    default:
      return decideGeneral(lead, inb, ctx)
  }
}

// ------------------------------------------------------------------ FAQ layer
interface NextQ {
  msg: OutMessage
  patch: LeadPatch
}

/** The question that ends every FAQ answer: moves the lead forward or repeats the current stage's question. */
export function faqNextQuestion(lead: Lead, scoutOa: boolean): NextQ {
  const lang = lead.lang
  const en = lang === 'en'
  if (lead.role === 'host') {
    if (lead.stage === 'new' || lead.stage === 'lost') {
      const step = nextHostStep(lead) || 'zone'
      return { msg: T.hostQuestion(step, lang), patch: { stage: 'qualify' } }
    }
    if (lead.stage === 'qualify') {
      const step = nextHostStep(lead)
      return step
        ? { msg: T.hostQuestion(step, lang), patch: {} }
        : { msg: { text: en ? 'Ready to sign up?' : 'พร้อมสมัครเลยไหมคะ?', quickReplies: T.QR.pitchClose(lang) }, patch: { stage: 'pitch' } }
    }
    if (lead.stage === 'pitch') return { msg: { text: en ? 'Ready to sign up?' : 'พร้อมสมัครเลยไหมคะ?', quickReplies: T.QR.pitchClose(lang) }, patch: {} }
    if (lead.stage === 'close') return { msg: { text: en ? 'Which sign-up step are you on?' : 'ตอนนี้สมัครถึงขั้นตอนไหนแล้วคะ?' }, patch: {} }
    return { msg: { text: en ? 'Anything else I can help with?' : 'มีคำถามอื่นอีกไหมคะ?' }, patch: {} }
  }
  if (lead.role === 'sup') {
    if (lead.stage === 'new' || lead.stage === 'lost' || lead.stage === 'pitch')
      return { msg: { text: en ? 'Shall I give you your personal referral code?' : 'รับรหัสแนะนำส่วนตัวเลยไหมคะ?', quickReplies: T.QR.supCode(lang) }, patch: { stage: 'pitch' } }
    if (lead.stage === 'close' && !lead.notes.promptpay_phone) return { msg: T.supAskPromptPay(lang), patch: {} }
    return { msg: { text: en ? 'Anything else I can help with?' : 'มีคำถามอื่นอีกไหมคะ?' }, patch: {} }
  }
  if (lead.role === 'scout' && lead.stage === 'apply') {
    const step = nextScoutStep(lead) || 'zone'
    return { msg: T.scoutQuestion(step, lang), patch: {} }
  }
  if (lead.role === 'guest') {
    const step = lead.stage === 'intake' ? nextGuestStep(lead) : null
    if (step) return { msg: T.guestQuestion(step, lang), patch: {} }
    return { msg: { text: en ? 'Anything else you would like to ask?' : 'มีอะไรอยากถามเพิ่มไหมคะ?' }, patch: {} }
  }
  // general (and anything else)
  return {
    msg: { text: en ? 'Would you like to book an activity, host, or be a connector?' : 'สนใจจองกิจกรรม เป็นโฮสต์ หรือเป็นคอนเนคเตอร์คะ?', quickReplies: T.QR.general(lang, scoutOa) },
    patch: {},
  }
}

export function faqDecision(original: Lead, routed: Decision, text: string, ctx: DecideCtx): Decision | null {
  const m = matchIntent(text)
  if (!m) return null
  const lead = applyDecision(original, routed)
  const lang = lead.lang
  const tag = { intent: m.intent, notes: { ...routed.notes, last_intent: m.intent } }

  if (m.intent === 'signup') {
    if (lead.role === 'host' || lead.role === 'general') {
      if (['close', 'onboarding', 'won'].includes(lead.stage)) {
        return { ...d(`faq:signup`, { messages: [T.hostLinkAgain(lang, lead.scout_code)], patch: routed.patch }), ...tag }
      }
      const dec = hostCloseDecision(lead, 'faq:signup', { ...routed.patch, ...(lead.role === 'general' ? { role: 'host' } : {}) })
      return { ...dec, ...tag }
    }
    if (lead.role === 'sup') {
      if (lead.ref_code) return { ...d('faq:signup', { messages: [T.supCodeAgain(lang, lead.ref_code)], patch: routed.patch }), ...tag }
      const code = ctx.newCode('C')
      return { ...d('faq:signup', { messages: T.supCode(lang, code), patch: { ...routed.patch, stage: 'close', ref_code: code } }), ...tag }
    }
    if (lead.role === 'guest') {
      if (lead.stage === 'waitlist') return { ...d('faq:signup', { messages: [T.guestAlreadyWaitlisted(lang)], patch: routed.patch }), ...tag }
      const q = faqNextQuestion(lead, !!ctx.oa.scoutApplications)
      const first = lang === 'en' ? 'You can join the waitlist right here, one question at a time.' : 'ลงชื่อรอในแชทนี้ได้เลยค่ะ ตอบทีละข้อนะคะ'
      return { ...d('faq:signup', { messages: [{ text: `${first}\n${q.msg.text}`, quickReplies: q.msg.quickReplies }], patch: routed.patch }), ...tag }
    }
    if (lead.role === 'scout' && lead.stage === 'apply') {
      const q = faqNextQuestion(lead, !!ctx.oa.scoutApplications)
      const first = lang === 'en' ? 'You can apply right here in this chat, one question at a time.' : 'สมัครในแชทนี้ได้เลยค่ะ ตอบทีละข้อนะคะ'
      return { ...d('faq:signup', { messages: [{ text: `${first}\n${q.msg.text}`, quickReplies: q.msg.quickReplies }], patch: routed.patch }), ...tag }
    }
    return null
  }

  const lines = faqAnswer(m.intent, lead.role, lang)
  if (!lines || !lines.length) return null
  const q = faqNextQuestion(lead, !!ctx.oa.scoutApplications)
  const body = [...lines.slice(0, 3), q.msg.text].join('\n')
  return {
    ...d(`faq:${m.intent}`, {
      messages: [{ text: body, quickReplies: q.msg.quickReplies }],
      patch: { ...routed.patch, ...q.patch },
    }),
    ...tag,
  }
}

/** Stage updates the LLM may request: forward-only, no skipping to 'close' (link must come from the template). */
export function allowedLlmStageUpdate(lead: Lead, to: string | undefined | null): string | null {
  if (!to || to === lead.stage) return null
  const role = lead.role
  const from = lead.stage
  const rules: Record<string, Record<string, string[]>> = {
    host: { new: ['qualify', 'pitch', 'lost'], qualify: ['pitch', 'lost'], pitch: ['lost'], close: ['onboarding', 'lost'], onboarding: ['won', 'lost'] },
    sup: { new: ['pitch', 'lost'], pitch: ['lost'], close: ['lost'], onboarding: ['won', 'lost'] },
  }
  return rules[role]?.[from]?.includes(to) ? to : null
}

/** Field updates the LLM may suggest (strings only, trimmed). */
export function sanitizeLlmFields(fields: unknown): LeadPatch {
  const out: LeadPatch = {}
  if (!fields || typeof fields !== 'object') return out
  const f = fields as Record<string, unknown>
  for (const k of ['zone', 'activity_idea', 'availability'] as const) {
    const v = f[k]
    if (typeof v === 'string' && v.trim() && v.length <= 200) {
      if (k === 'activity_idea' && isNightlifeOrPrivate(v)) continue
      out[k] = v.trim()
    }
  }
  if (typeof f.scout_code === 'string') {
    const c = extractReferralCode(f.scout_code)
    if (c) out.scout_code = c
  }
  return out
}
