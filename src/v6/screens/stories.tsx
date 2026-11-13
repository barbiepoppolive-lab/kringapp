/* R7 Instagram-style Host Stories: StoryView (#story) and StoryCreate (#story-create).
   Matches memory/design_r7/StoryView.dc.html and StoryCreate.dc.html pixel-for-pixel. */
import { useEffect, useMemo, useRef, useState } from 'react'
import { S, update, useS } from '../core/store'
import { t, ACTS, aTitle, ph, ini, RM, SL as SLOTS } from '../core/data'
import { register, go, toast } from '../core/router'
import { tick, chime, buzz } from '../core/sound'
import { I, Ic, Sheet } from '../ui/kit'
import {
  getStoryGroups,
  getAllActiveStories,
  markStorySeen,
  storyAgoLabel,
  getActivityStickerInfo,
  getPollStats,
  voteStoryPoll,
  toggleStoryLike,
  reportStory,
  hideStory,
  muteHostStories,
  areStoryRepliesOff,
  setStoryRepliesOff,
  deleteMyStory,
  sendStoryReplyToChat,
  createHostStory,
  type StorySticker,
  groupKey,
  MINE,
} from '../core/stories'

/** Where closing a story goes: back to Locals unless it was opened from a host profile or the story camera. */
const storyBack = (from?: string): string => (!from || from === 'experiences' || from === 'story' ? 'locals' : from)

function StoryView() {
  const s = useS()
  const th = s.lang === 'th'
  // the ring order is frozen while the viewer is open: marking a host as seen must not re-sort the rings under the person
  const order = useRef<string[] | null>(null)
  const groups = useMemo(() => {
    const live = getStoryGroups()
    if (!order.current) order.current = live.map(groupKey)
    const pos = (k: string) => { const i = order.current!.indexOf(k); return i < 0 ? 999 : i }
    const g = [...live].sort((x, y) => pos(groupKey(x)) - pos(groupKey(y)))
    return g.length ? g : [{
      actId: 'eat',
      act: ACTS[0],
      host: 'Nicha',
      hostTh: 'ณิชา',
      isWoman: true,
      area: 'Yaowarat',
      areaTh: 'เยาวราช',
      stories: getAllActiveStories(),
      unseen: true,
      coverUrl: ph('yaowarat-food'),
    }]
  }, [s.seenStories, s.hiddenStories, s.mutedStories, s.storyReports, s.myStories, s.blocked])

  const hostGroupIdx = Math.max(0, groups.findIndex((g) => groupKey(g) === s.storyHost))
  const curGroup = groups[hostGroupIdx] || groups[0]
  const stories = curGroup.stories
  const idx = Math.min(Math.max(0, s.storyIdx || 0), Math.max(0, stories.length - 1))
  const story = stories[idx] || stories[0]

  const [paused, setPaused] = useState(false)
  const [holding, setHolding] = useState(false)
  const [prog, setProg] = useState(0) // 0..100
  const [replyText, setReplyText] = useState('')
  const [askOpen, setAskOpen] = useState(false)
  const [askText, setAskText] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)
  const [viewersOpen, setViewersOpen] = useState(false)
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const touchStart = useRef<{ x: number; y: number; t: number } | null>(null)

  useEffect(() => {
    if (story?.id) markStorySeen(story.id)
    setProg(0)
  }, [story?.id])

  const nextStory = () => {
    if (idx + 1 < stories.length) {
      update((st) => { st.storyIdx = idx + 1 })
      tick(0.6, 0.04)
    } else if (hostGroupIdx + 1 < groups.length) {
      const nxt = groups[hostGroupIdx + 1]
      update((st) => { st.storyHost = groupKey(nxt); st.storyIdx = 0 })
      tick(0.55, 0.05)
    } else {
      go(storyBack(s.from.story), 'f')
    }
  }

  const prevStory = () => {
    if (idx > 0) {
      update((st) => { st.storyIdx = idx - 1 })
      tick(0.5, 0.04)
    } else if (hostGroupIdx > 0) {
      const prv = groups[hostGroupIdx - 1]
      update((st) => { st.storyHost = groupKey(prv); st.storyIdx = Math.max(0, prv.stories.length - 1) })
      tick(0.5, 0.05)
    } else {
      setProg(0)
    }
  }

  // Auto-advance timer (6s for photos, up to 15s for videos; respects reduced motion & pause)
  useEffect(() => {
    if (!story || RM || paused || holding || menuOpen || askOpen || viewersOpen) return
    const durMs = Math.min(15000, Math.max(3000, (story.durationSec || 6) * 1000))
    const stepMs = 60
    const inc = (stepMs / durMs) * 100
    const iv = setInterval(() => {
      setProg((p) => {
        if (p + inc >= 100) {
          clearInterval(iv)
          queueMicrotask(nextStory)
          return 100
        }
        return p + inc
      })
    }, stepMs)
    return () => clearInterval(iv)
  }, [story?.id, paused, holding, menuOpen, askOpen, viewersOpen, idx, hostGroupIdx]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!story) {
    return (
      <div className="st-view" style={{ alignItems: 'center', justifyContent: 'center' }}>
        <button type="button" className="btn ghost" style={{ width: 200 }} onClick={() => go('locals', 'f')}>{t('closeW')}</button>
      </div>
    )
  }

  const hName = th ? story.hostNameTh : story.hostName
  const areaName = th ? story.areaTh : story.area
  const caption = th ? (story.captionTh || story.caption) : story.caption
  const liked = !!(s.likedStories || {})[story.id]
  const repliesOff = areStoryRepliesOff(story.mine ? MINE : story.actId)

  const placeSticker = story.stickers.find((x) => x.kind === 'place')
  const spotsSticker = story.stickers.find((x) => x.kind === 'spots')
  const pollSticker = story.stickers.find((x) => x.kind === 'poll')
  const askSticker = story.stickers.find((x) => x.kind === 'ask')
  const nextSticker = story.stickers.find((x) => x.kind === 'nextDate')
  const actSticker = story.stickers.find((x) => x.kind === 'activity') || { id: 'stk-act', kind: 'activity' as const, actId: story.actId }
  const actInfo = getActivityStickerInfo(actSticker.actId || story.actId, story)
  const pollStats = pollSticker ? getPollStats(story.id, pollSticker.votesA ?? 18, pollSticker.votesB ?? 9) : null

  const onPointerDownZone = (e: React.PointerEvent) => {
    touchStart.current = { x: e.clientX, y: e.clientY, t: Date.now() }
    if (holdTimer.current) clearTimeout(holdTimer.current)
    holdTimer.current = setTimeout(() => setHolding(true), 220)
  }

  const onPointerUpZone = (side: 'left' | 'right', e: React.PointerEvent) => {
    if (holdTimer.current) { clearTimeout(holdTimer.current); holdTimer.current = null }
    if (holding) {
      setHolding(false)
      return
    }
    const start = touchStart.current
    touchStart.current = null
    if (start) {
      const dx = e.clientX - start.x
      const dy = e.clientY - start.y
      if (dy > 70 && Math.abs(dy) > Math.abs(dx)) {
        go(storyBack(s.from.story), 'f')
        return
      }
      if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy)) {
        if (dx < 0) {
          if (hostGroupIdx + 1 < groups.length) update((st) => { st.storyHost = groupKey(groups[hostGroupIdx + 1]); st.storyIdx = 0 })
          else go(storyBack(s.from.story), 'f')
        } else if (hostGroupIdx > 0) {
          update((st) => { st.storyHost = groupKey(groups[hostGroupIdx - 1]); st.storyIdx = 0 })
        }
        return
      }
    }
    if (side === 'left') prevStory()
    else nextStory()
  }

  const openBookActivity = () => {
    if (story.mine) { go('htoday', 'r'); return } // the host's own activity: open their host home, not a demo activity
    const targetAct = actSticker.actId || story.actId
    update((st) => { st.act = targetAct; st.from.detail = 'locals' })
    tick(0.65, 0.06)
    go('detail', 'r')
  }

  const openHostProfile = () => {
    if (story.mine) return
    update((st) => { st.act = story.actId; st.from.detail = 'locals' })
    go('detail', 'r')
  }

  const submitReply = (textToSend: string) => {
    const res = sendStoryReplyToChat(story.actId, textToSend, true)
    if (!res.ok) {
      if (res.blockedReason === 'replies_off') toast(t('stRepliesOffNote'))
      else if (res.blockedReason !== 'empty') toast(t('keepIn'))
      return
    }
    setReplyText('')
    setAskText('')
    setAskOpen(false)
    chime()
  }

  const shareStory = () => {
    const url = `https://kringapp.com/app/#detail?act=${story.actId}`
    try {
      if (typeof navigator !== 'undefined' && navigator.share) {
        void navigator.share({ title: actInfo.title, url }).catch(() => {})
        return
      }
      void navigator.clipboard?.writeText(url).catch(() => {})
    } catch { /* ignore */ }
    toast(t('copied'))
    tick(0.6, 0.05)
  }

  return (
    <div className={`st-view ${holding ? 'holding' : ''}`} id="story-viewer">
      <img className="st-media" src={story.mediaUrl} alt="" />
      <div className="st-scrim-t" />
      <div className="st-scrim-b" />

      {/* Left / Right tap & hold gesture zones */}
      <div
        aria-hidden="true"
        style={{ position: 'absolute', top: 100, bottom: 250, left: 0, width: '35%', zIndex: 2 }}
        onPointerDown={onPointerDownZone}
        onPointerUp={(e) => onPointerUpZone('left', e)}
      />
      <div
        aria-hidden="true"
        style={{ position: 'absolute', top: 100, bottom: 250, right: 0, width: '65%', zIndex: 2 }}
        onPointerDown={onPointerDownZone}
        onPointerUp={(e) => onPointerUpZone('right', e)}
      />

      {/* Top progress bars + host header */}
      <div className="st-top">
        <div className="st-bars" role="progressbar" aria-valuenow={Math.round(prog)} aria-valuemin={0} aria-valuemax={100}>
          {stories.map((st, i) => (
            <div key={st.id} className="st-bar">
              <i style={{ width: i < idx ? '100%' : i === idx ? `${prog}%` : '0%' }} />
            </div>
          ))}
        </div>

        <div className="st-head">
          <button
            type="button"
            id="st-host-btn"
            onClick={openHostProfile}
            style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0, textAlign: 'left' }}
          >
            <div style={{ width: 38, height: 38, borderRadius: '50%', background: '#1B1F36', border: '1.5px solid rgba(255,255,255,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600, fontSize: 14, color: '#EEF0FA', flex: 'none', overflow: 'hidden' }}>
              {s.prof.hostPhoto && story.mine ? <img src={s.prof.hostPhoto} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : ini(hName)}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ fontSize: 15, fontWeight: 600, color: '#EEF0FA' }}>{hName}</span>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="#7381FF" aria-hidden="true"><circle cx="12" cy="12" r="10" /><path d="M8 12.5l2.6 2.6 5.4-5.6" fill="none" stroke="#05060D" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
                <span style={{ fontSize: 13, color: 'rgba(238,240,250,0.7)', marginLeft: 2 }}>{storyAgoLabel(story.createdAt)}</span>
              </div>
              <div style={{ fontSize: 12, color: 'rgba(238,240,250,0.8)' }}>
                {story.isWoman ? t('womanHost') : t('localHost')} · {areaName}
              </div>
            </div>
          </button>

          {story.mine && (
            <button
              type="button"
              id="st-viewers-btn"
              aria-label={t('stViewers')}
              onClick={() => setViewersOpen(true)}
              style={{ height: 34, padding: '0 10px', borderRadius: 999, background: 'rgba(5,6,13,0.45)', color: '#EEF0FA', fontSize: 12, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 5 }}
            >
              <Ic p={I.users} s={14} />{story.viewers.length}
            </button>
          )}

          <button
            type="button"
            id="st-pause-btn"
            aria-label={paused ? t('stResume') : t('stPause')}
            aria-pressed={paused}
            onClick={() => setPaused((p) => !p)}
            style={{ width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#EEF0FA' }}
          >
            {paused ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>
            )}
          </button>

          <button
            type="button"
            id="st-more-btn"
            aria-label={t('moreW')}
            onClick={() => setMenuOpen(true)}
            style={{ width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#EEF0FA' }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="19" cy="12" r="1.8" /></svg>
          </button>

          <button
            type="button"
            id="st-close-btn"
            aria-label={t('closeW')}
            onClick={() => go(storyBack(s.from.story), 'f')}
            style={{ width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#EEF0FA' }}
          >
            <Ic p={I.close} s={22} />
          </button>
        </div>
      </div>

      {/* Bottom area: stickers, caption, Activity Book card, reply bar */}
      <div className="st-bot">
        {/* Place + Spots / Next-date pills */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {placeSticker && (
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 34, padding: '0 12px', borderRadius: 999, background: 'rgba(5,6,13,0.68)', backdropFilter: 'blur(12px)', fontSize: 13, fontWeight: 500, color: '#EEF0FA' }}>
              <span style={{ color: '#FFD067', display: 'inline-flex' }}><Ic p={I.pin} s={14} /></span>
              {th ? (placeSticker.placeNameTh || placeSticker.placeName) : placeSticker.placeName}
            </div>
          )}
          {spotsSticker && (
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 34, padding: '0 12px', borderRadius: 999, background: 'rgba(5,6,13,0.68)', backdropFilter: 'blur(12px)', fontSize: 13, fontWeight: 600, color: '#FFD067' }}>
              {t('stSpotsTonight', { n: spotsSticker.spotsLeft ?? actInfo.spotsLeft })}
            </div>
          )}
          {nextSticker && (
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 34, padding: '0 12px', borderRadius: 999, background: 'rgba(5,6,13,0.68)', backdropFilter: 'blur(12px)', fontSize: 13, fontWeight: 600, color: '#FFD067' }}>
              {th ? (nextSticker.nextDateLabelTh || nextSticker.nextDateLabel) : nextSticker.nextDateLabel}
            </div>
          )}
        </div>

        {/* Interactive Poll sticker */}
        {pollSticker && pollStats && (
          <div id="st-poll-box" style={{ padding: '10px 12px', borderRadius: 14, background: 'rgba(15,18,38,0.88)', backdropFilter: 'blur(12px)', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#EEF0FA' }}>
              {th ? (pollSticker.questionTh || pollSticker.question) : pollSticker.question}
            </span>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(120px, 100%), 1fr))', gap: 8 }}>
              <button
                type="button"
                id="st-poll-a"
                aria-pressed={pollStats.voted === 0}
                onClick={() => { voteStoryPoll(story.id, 0); tick(0.65, 0.05) }}
                style={{ height: 36, borderRadius: 10, padding: '0 10px', background: pollStats.voted === 0 ? '#EEF0FA' : '#1B1F36', color: pollStats.voted === 0 ? '#05060D' : '#EEF0FA', fontSize: 13, fontWeight: 600, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
              >
                <span>{th ? (pollSticker.optATh || pollSticker.optA) : pollSticker.optA}</span>
                {pollStats.voted !== undefined && <span className="num">{pollStats.pctA}%</span>}
              </button>
              <button
                type="button"
                id="st-poll-b"
                aria-pressed={pollStats.voted === 1}
                onClick={() => { voteStoryPoll(story.id, 1); tick(0.65, 0.05) }}
                style={{ height: 36, borderRadius: 10, padding: '0 10px', background: pollStats.voted === 1 ? '#EEF0FA' : '#1B1F36', color: pollStats.voted === 1 ? '#05060D' : '#EEF0FA', fontSize: 13, fontWeight: 600, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
              >
                <span>{th ? (pollSticker.optBTh || pollSticker.optB) : pollSticker.optB}</span>
                {pollStats.voted !== undefined && <span className="num">{pollStats.pctB}%</span>}
              </button>
            </div>
          </div>
        )}

        {/* Ask me sticker */}
        {askSticker && !repliesOff && (
          <button
            type="button"
            id="st-ask-sticker"
            onClick={() => setAskOpen(true)}
            style={{ padding: '10px 14px', borderRadius: 14, background: 'rgba(15,18,38,0.88)', backdropFilter: 'blur(12px)', textAlign: 'left', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}
          >
            <span style={{ fontSize: 13, color: '#EEF0FA', fontWeight: 500 }}>
              {th ? (askSticker.promptTh || askSticker.prompt) : askSticker.prompt}
            </span>
            <span style={{ fontSize: 12, fontWeight: 600, color: '#FFD067', whiteSpace: 'nowrap' }}>{t('stReplyBtn')}</span>
          </button>
        )}

        {/* Caption */}
        {caption && (
          <div style={{ fontSize: 16, lineHeight: 1.4, color: '#EEF0FA', textShadow: '0 1px 8px rgba(0,0,0,0.6)' }}>
            {caption}
          </div>
        )}

        {/* Linked Activity sticker ("Book" -> opens activity page) */}
        <div className="st-act-card" id="st-activity-sticker">
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#EEF0FA', lineHeight: 1.3, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
              {actInfo.title} · {actInfo.timeLabel}
            </div>
            <div style={{ fontSize: 13, color: '#C9CDE6', marginTop: 2 }}>
              <span style={{ color: '#FFD067', fontWeight: 600 }}>{actInfo.priceLabel}</span> · {t('stSpotsLeft', { n: actInfo.spotsLeft })}{!actInfo.free && <> · {t('paidAtPlaceShort')}</>}
            </div>
          </div>
          <button
            type="button"
            id="st-book-btn"
            onClick={openBookActivity}
            style={{ height: 38, padding: '0 14px', borderRadius: 10, background: '#FFB21E', color: '#05060D', fontSize: 13, fontWeight: 700, flex: 'none' }}
          >
            {t('stBook')}
          </button>
        </div>

        {/* Reply bar + Heart + Share (own story: no reply to yourself, just share) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: story.mine ? 'flex-end' : undefined }}>
          {story.mine ? null : !repliesOff ? (
            <form
              style={{ flex: '1 1 0', minWidth: 0, minHeight: 44, borderRadius: 999, background: 'rgba(255,255,255,0.12)', padding: '0 16px', display: 'flex', alignItems: 'center' }}
              onSubmit={(e) => { e.preventDefault(); submitReply(replyText) }}
            >
              <input
                id="st-reply-input"
                type="text"
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                placeholder={t('stAskHostPh', { host: hName })}
                aria-label={t('stAskHostPh', { host: hName })}
                style={{ flex: 1, minWidth: 0, width: '100%', background: 'none', border: 0, color: '#EEF0FA', fontSize: 14, outline: 'none' }}
              />
              {replyText.trim() && (
                <button type="submit" id="st-reply-send" style={{ color: '#FFD067', fontWeight: 600, fontSize: 13, marginLeft: 8 }}>
                  {t('sendW')}
                </button>
              )}
            </form>
          ) : (
            <div id="st-replies-off-banner" style={{ flex: '1 1 0', minWidth: 0, minHeight: 44, borderRadius: 999, background: 'rgba(255,255,255,0.08)', padding: '0 16px', display: 'flex', alignItems: 'center', fontSize: 13, color: '#9AA0BF' }}>
              {t('stRepliesOffNote')}
            </div>
          )}

          <button
            type="button"
            id="st-like-btn"
            aria-label={t('stLike')}
            aria-pressed={liked}
            onClick={() => { toggleStoryLike(story.id); tick(0.7, 0.05) }}
            style={{ width: 44, height: 44, borderRadius: '50%', background: 'rgba(255,255,255,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: liked ? '#FFD067' : '#EEF0FA', flex: 'none' }}
          >
            <Ic p={I.heart} s={20} />
          </button>

          <button
            type="button"
            id="st-share-btn"
            aria-label={t('stShare')}
            onClick={shareStory}
            style={{ width: 44, height: 44, borderRadius: '50%', background: 'rgba(255,255,255,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#EEF0FA', flex: 'none' }}
          >
            <Ic p={I.send} s={19} />
          </button>
        </div>
      </div>

      {/* Ask me modal sheet */}
      <Sheet open={askOpen} onClose={() => setAskOpen(false)} label={t('stAskMe')}>
        <b style={{ fontSize: 17 }}>{askSticker ? (th ? (askSticker.promptTh || askSticker.prompt) : askSticker.prompt) : t('stAskHostPh', { host: hName })}</b>
        <input
          className="tin"
          id="st-ask-modal-input"
          value={askText}
          onChange={(e) => setAskText(e.target.value)}
          placeholder={t('stAskHostPh', { host: hName })}
        />
        <button type="button" className="btn gold" id="st-ask-modal-send" onClick={() => submitReply(askText)}>{t('sendW')}</button>
      </Sheet>

      {/* More (⋯) menu: Mute, Hide, Report */}
      <Sheet open={menuOpen} onClose={() => setMenuOpen(false)} label={t('moreW')}>
        {story.mine ? (
          <button
            type="button"
            className="place"
            id="st-delete-own"
            onClick={() => {
              deleteMyStory(story.id)
              setMenuOpen(false)
              toast(t('stDeletedToast'))
              go(storyBack(s.from.story), 'f')
            }}
          >
            <span className="grow"><b style={{ color: '#FF7A6B' }}>{t('stDeleteStory')}</b></span>
          </button>
        ) : (<>
        <button
          type="button"
          className="place"
          id="st-mute-host"
          onClick={() => {
            muteHostStories(story.actId)
            setMenuOpen(false)
            toast(t('stMutedToast', { host: hName }))
            go('locals', 'f')
          }}
        >
          <span className="grow"><b>{t('stMuteHost', { host: hName })}</b></span>
        </button>
        <button
          type="button"
          className="place"
          id="st-hide-story"
          onClick={() => {
            hideStory(story.id)
            setMenuOpen(false)
            toast(t('stHiddenToast'))
            nextStory()
          }}
        >
          <span className="grow"><b>{t('stHideStory')}</b></span>
        </button>
        <button
          type="button"
          className="place"
          id="st-report-story"
          onClick={() => {
            reportStory(story.id)
            setMenuOpen(false)
            toast(t('stReportedToast'))
            go('locals', 'f')
          }}
        >
          <span className="grow"><b style={{ color: '#FF7A6B' }}>{t('stReportStory')}</b></span>
        </button>
        </>)}
      </Sheet>

      {/* Host Viewers + Poll results sheet */}
      <Sheet open={viewersOpen} onClose={() => setViewersOpen(false)} label={t('stViewers')}>
        <b style={{ fontSize: 17 }}>{t('stViewers')} ({story.viewers.length})</b>
        <span className="small">{t('stLikesCount', { n: story.likesCount + (liked ? 1 : 0) })}</span>
        <div className="col" style={{ gap: 6 }}>
          {story.viewers.map((vName, i) => (
            <div key={i} className="row" style={{ padding: '6px 0' }}>
              <span className="av" style={{ ['--s' as string]: '32px' }}>{ini(vName)}</span>
              <span>{vName}</span>
            </div>
          ))}
        </div>
      </Sheet>
    </div>
  )
}

type OwnAct = { cat?: string; cover?: string; place?: { th?: string; en?: string }; times?: string[]; price?: number; free?: boolean }
/** The host's own (latest) published activity on this phone, if any. */
const ownAct = (): { title: string; set: OwnAct } | null => {
  const titles = (S.myActs || []).filter((x) => x && x.trim())
  const title = titles[titles.length - 1]
  if (!title) return null
  const m = (S.hostActs || {})[title]
  return { title, set: m && typeof m === 'object' ? (m as OwnAct) : {} }
}

function StoryCreate() {
  const s = useS()
  const own = ownAct()
  // the story links to the host's OWN activity; a demo activity of the same kind only supplies a fallback photo
  const a = (own && ACTS.find((x) => x.cat === own.set.cat)) || ACTS.find((x) => x.id === s.act) || ACTS[0]
  const ownPlace = own ? ((s.lang === 'th' ? own.set.place?.th : own.set.place?.en) || own.set.place?.en || '') : ''
  const ownTime = own && Array.isArray(own.set.times) && own.set.times.length ? [...own.set.times].sort()[0] : undefined
  const [mediaUrl, setMediaUrl] = useState(() => (own?.set.cover && /^(data:|https?:|\/)/.test(own.set.cover) ? own.set.cover : ph(a.img)))
  const [caption, setCaption] = useState(() => t('stDefaultCaption'))
  const [editText, setEditText] = useState(false)
  const [stickerSheet, setStickerSheet] = useState(true)
  const [saveHighlight, setSaveHighlight] = useState(true)
  const [placeChip, setPlaceChip] = useState(() => ownPlace || `${a.liveArea || 'Yaowarat'} · ${a.place.split('|')[0]}`)
  const [spotsChip, setSpotsChip] = useState<number | null>(2)
  const [pollAdded, setPollAdded] = useState(false)
  const [askAdded, setAskAdded] = useState(false)
  const [nextAdded, setNextAdded] = useState(false)
  const [drawMode, setDrawMode] = useState(false)
  const nextT = ownTime || SLOTS(a)[0]
  const nextLabel = `${(parseInt(nextT, 10) >= 17 ? t('whenTonight') : t('stToday'))} · ${nextT}`
  const fileRef = useRef<HTMLInputElement>(null)

  const onPickMedia = (f?: File) => {
    if (!f) return
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') setMediaUrl(reader.result)
    }
    reader.readAsDataURL(f)
  }

  const shareNow = () => {
    const stickers: StorySticker[] = [
      { id: 'stk-act', kind: 'activity', actId: a.id },
    ]
    if (placeChip) stickers.push({ id: 'stk-place', kind: 'place', placeName: placeChip })
    if (spotsChip !== null) stickers.push({ id: 'stk-spots', kind: 'spots', spotsLeft: spotsChip })
    if (pollAdded) stickers.push({ id: 'stk-poll', kind: 'poll', question: t('stPollQ'), optA: t('stPollA'), optB: t('stPollB'), votesA: 1, votesB: 0 })
    if (askAdded) stickers.push({ id: 'stk-ask', kind: 'ask', prompt: t('stAskPrompt') })
    if (nextAdded) stickers.push({ id: 'stk-next', kind: 'nextDate', nextDateLabel: nextLabel })

    // In preview demo mode, allow posting if the host opened #story-create directly
    if (!S.prof.idVerified && !S.prof.idSubmittedAt) {
      update((st) => { st.prof.idSubmittedAt = new Date().toISOString() })
    }
    if (!S.myActs.length) {
      update((st) => { st.myActs = [aTitle(a)] })
    }

    const res = createHostStory({
      actId: a.id,
      actTitle: own?.title,
      actPlace: ownPlace || undefined,
      actTime: ownTime,
      actPrice: own ? (own.set.free ? 0 : own.set.price) : undefined,
      mediaUrl,
      mediaType: 'photo',
      durationSec: 6,
      caption,
      stickers,
      highlight: saveHighlight,
      highlightTitle: own?.title || aTitle(a),
    })

    if (!res.ok) {
      toast(t('keepIn'))
      return
    }
    chime()
    buzz(20)
    toast(t('stPostedToast'))
    update((st) => { st.storyHost = MINE; st.storyIdx = 0; st.from.story = 'htoday' })
    go('story', 'f')
  }

  return (
    <div className="st-view" id="story-create-screen">
      {/* Camera / photo preview */}
      <div style={{ position: 'relative', flex: 1, overflow: 'hidden' }}>
        <img src={mediaUrl} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 120, background: 'linear-gradient(180deg,rgba(5,6,13,0.7),transparent)' }} />

        <input ref={fileRef} type="file" accept="image/*,video/*" hidden onChange={(e) => onPickMedia(e.target.files?.[0])} />

        {/* Top tools: X, Aa, Stickers, Draw */}
        <div style={{ position: 'relative', zIndex: 2, padding: 'calc(12px + env(safe-area-inset-top,0px)) 14px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <button
            type="button"
            id="sc-close-btn"
            aria-label={t('closeW')}
            onClick={() => go(s.from['story-create'] || 'htoday', 'l')}
            style={{ width: 42, height: 42, borderRadius: '50%', background: 'rgba(5,6,13,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#EEF0FA' }}
          >
            <Ic p={I.close} s={20} />
          </button>

          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              id="sc-media-btn"
              aria-label={t('aPhoto')}
              onClick={() => fileRef.current?.click()}
              style={{ height: 40, padding: '0 12px', borderRadius: 999, background: 'rgba(5,6,13,0.55)', color: '#EEF0FA', fontSize: 13, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              <Ic p={I.camera} s={15} />
            </button>
            <button
              type="button"
              id="sc-text-btn"
              onClick={() => setEditText((v) => !v)}
              style={{ height: 40, padding: '0 14px', borderRadius: 999, background: editText ? '#EEF0FA' : 'rgba(5,6,13,0.55)', color: editText ? '#05060D' : '#EEF0FA', fontSize: 14, fontWeight: 600 }}
            >
              Aa
            </button>
            <button
              type="button"
              id="sc-stickers-btn"
              onClick={() => setStickerSheet((v) => !v)}
              style={{ height: 40, padding: '0 14px', borderRadius: 999, background: stickerSheet ? '#EEF0FA' : 'rgba(5,6,13,0.55)', color: stickerSheet ? '#05060D' : '#EEF0FA', fontSize: 13, fontWeight: 600 }}
            >
              {t('stStickers')}
            </button>
            <button
              type="button"
              id="sc-draw-btn"
              onClick={() => { setDrawMode((v) => !v); tick(0.6, 0.04) }}
              style={{ height: 40, padding: '0 14px', borderRadius: 999, background: drawMode ? '#EEF0FA' : 'rgba(5,6,13,0.55)', color: drawMode ? '#05060D' : '#EEF0FA', fontSize: 13, fontWeight: 600 }}
            >
              {t('stDraw')}
            </button>
          </div>
        </div>

        {/* Placed stickers on the photo */}
        <div style={{ position: 'absolute', left: 16, right: 16, top: 150, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 10, zIndex: 2 }}>
          {placeChip && (
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 36, padding: '0 13px', borderRadius: 999, background: 'rgba(5,6,13,0.72)', backdropFilter: 'blur(12px)', fontSize: 13, fontWeight: 600, color: '#EEF0FA' }}>
              <span style={{ color: '#FFD067', display: 'inline-flex' }}><Ic p={I.pin} s={14} /></span>
              {placeChip}
            </div>
          )}
          {spotsChip !== null && (
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 34, padding: '0 12px', borderRadius: 999, background: '#FFB21E', color: '#05060D', fontSize: 13, fontWeight: 700 }}>
              {t('stSpotsTonight', { n: spotsChip })}
            </div>
          )}
          {editText ? (
            <input
              id="sc-caption-input"
              className="tin"
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              onBlur={() => setEditText(false)}
              style={{ background: 'rgba(5,6,13,0.78)', color: '#EEF0FA', fontSize: 16 }}
            />
          ) : (
            <button
              type="button"
              onClick={() => setEditText(true)}
              style={{ fontSize: 18, fontWeight: 600, color: '#EEF0FA', textShadow: '0 2px 10px rgba(0,0,0,0.7)', maxWidth: 300, lineHeight: 1.35, textAlign: 'left' }}
            >
              {caption}
            </button>
          )}
        </div>
      </div>

      {/* Sticker tray sheet (matches StoryCreate.dc.html: #11142A, 362px tall, radius 24px 24px 0 0) */}
      <div className="st-sheet" id="sc-sticker-sheet">
        <div style={{ width: 36, height: 4, borderRadius: 99, background: 'rgba(255,255,255,0.22)', alignSelf: 'center' }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 16, fontWeight: 600, color: '#EEF0FA' }}>{t('stAddSticker')}</span>
          <span style={{ fontSize: 12, color: '#9AA0BF' }}>{t('stTapPlace')}</span>
        </div>

        <div className="st-grid">
          <button
            type="button"
            id="sc-stk-activity"
            onClick={() => { toast(t('stStkActivitySub')); tick(0.6, 0.05) }}
            style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 12, borderRadius: 14, background: '#EEF0FA', color: '#05060D', textAlign: 'left' }}
          >
            <div style={{ width: 32, height: 32, borderRadius: 10, background: '#FFB21E', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, flex: 'none' }}>↗</div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700 }}>{t('stStkActivity')}</div>
              <div style={{ fontSize: 11, opacity: 0.75 }}>{t('stStkActivitySub')}</div>
            </div>
          </button>

          <button
            type="button"
            id="sc-stk-place"
            onClick={() => { setPlaceChip(placeChip ? '' : `${a.liveArea || 'Yaowarat'} · MRT Wat Mangkon`); tick(0.6, 0.05) }}
            style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 12, borderRadius: 14, background: '#1B1F36', color: '#EEF0FA', textAlign: 'left' }}
          >
            <div style={{ width: 32, height: 32, borderRadius: 10, background: '#0F1226', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#FFD067', flex: 'none' }}>📍</div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{t('stStkPlace')}</div>
              <div style={{ fontSize: 11, color: '#9AA0BF' }}>{t('stStkPlaceSub')}</div>
            </div>
          </button>

          <button
            type="button"
            id="sc-stk-spots"
            onClick={() => { setSpotsChip((n) => (n === null ? 2 : n === 2 ? 1 : null)); tick(0.6, 0.05) }}
            style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 12, borderRadius: 14, background: '#1B1F36', color: '#EEF0FA', textAlign: 'left' }}
          >
            <div style={{ width: 32, height: 32, borderRadius: 10, background: '#0F1226', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#FFD067', fontWeight: 700, fontSize: 13, flex: 'none' }}>2</div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{t('stStkSpots')}</div>
              <div style={{ fontSize: 11, color: '#9AA0BF' }}>{t('stStkSpotsSub')}</div>
            </div>
          </button>

          <button
            type="button"
            id="sc-stk-poll"
            onClick={() => { setPollAdded((v) => !v); tick(0.6, 0.05) }}
            style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 12, borderRadius: 14, background: pollAdded ? '#EEF0FA' : '#1B1F36', color: pollAdded ? '#05060D' : '#EEF0FA', textAlign: 'left' }}
          >
            <div style={{ width: 32, height: 32, borderRadius: 10, background: '#0F1226', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#FFD067', fontWeight: 700, fontSize: 13, flex: 'none' }}>%</div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{t('stStkPoll')}</div>
              <div style={{ fontSize: 11, color: pollAdded ? '#05060D' : '#9AA0BF' }}>{t('stStkPollSub')}</div>
            </div>
          </button>

          <button
            type="button"
            id="sc-stk-ask"
            onClick={() => { setAskAdded((v) => !v); tick(0.6, 0.05) }}
            style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 12, borderRadius: 14, background: askAdded ? '#EEF0FA' : '#1B1F36', color: askAdded ? '#05060D' : '#EEF0FA', textAlign: 'left' }}
          >
            <div style={{ width: 32, height: 32, borderRadius: 10, background: '#0F1226', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#FFD067', fontWeight: 700, fontSize: 13, flex: 'none' }}>?</div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{t('stStkAsk')}</div>
              <div style={{ fontSize: 11, color: askAdded ? '#05060D' : '#9AA0BF' }}>{t('stStkAskSub')}</div>
            </div>
          </button>

          <button
            type="button"
            id="sc-stk-next"
            onClick={() => { setNextAdded((v) => !v); tick(0.6, 0.05) }}
            style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 12, borderRadius: 14, background: nextAdded ? '#EEF0FA' : '#1B1F36', color: nextAdded ? '#05060D' : '#EEF0FA', textAlign: 'left' }}
          >
            <div style={{ width: 32, height: 32, borderRadius: 10, background: '#0F1226', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#FFD067', fontWeight: 700, fontSize: 13, flex: 'none' }}>⏰</div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{t('stStkNext')}</div>
              <div style={{ fontSize: 11, color: nextAdded ? '#05060D' : '#9AA0BF' }}>{t('stStkNextSub')}</div>
            </div>
          </button>
        </div>

        <div style={{ fontSize: 12, color: '#9AA0BF', lineHeight: 1.4 }}>{t('stConsentNote')}</div>

        {s.gender === 'f' && (
          <label className="row" id="sc-replies-off" style={{ justifyContent: 'space-between', gap: 12, cursor: 'pointer' }}>
            <span style={{ fontSize: 13, color: '#EEF0FA' }}>{t('stRepliesToggle')}</span>
            <span className="sw">
              <input type="checkbox" checked={areStoryRepliesOff(MINE)} onChange={(e) => setStoryRepliesOff(MINE, e.target.checked)} />
              <i />
            </span>
          </label>
        )}

        <div style={{ display: 'flex', gap: 10, marginTop: 'auto' }}>
          <button
            type="button"
            id="sc-save-highlights"
            aria-pressed={saveHighlight}
            onClick={() => { setSaveHighlight((v) => !v); tick(0.6, 0.05) }}
            style={{ flex: 1, height: 48, borderRadius: 14, background: saveHighlight ? '#EEF0FA' : '#1B1F36', color: saveHighlight ? '#05060D' : '#EEF0FA', fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            {t('stSaveHighlights')}
          </button>
          <button
            type="button"
            id="sc-share-story"
            onClick={shareNow}
            style={{ flex: 1.3, height: 48, borderRadius: 14, background: '#FFB21E', color: '#05060D', fontSize: 15, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            {t('stShareStory')}
          </button>
        </div>
      </div>
    </div>
  )
}

register(
  { id: 'story', flow: 't', title: 'Story', C: StoryView },
  { id: 'story-create', flow: 'h', title: 'Post a story', C: StoryCreate },
)
