import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useLanguage } from '../i18n/LanguageContext'
import type { LanguageCode } from '../i18n/translations'
import { getTapOrigin } from './ui/Sheet'
import { triggerHaptic } from '../lib/haptics'
import '../styles/shell.css'

export interface AgeGateModalProps {
  open: boolean
  isAgeConfirmed: boolean
  isConductAccepted: boolean
  onConfirmAge: () => void
  onAcceptConduct: () => void
  onComplete: () => void
  onClose?: () => void
  languageOverride?: LanguageCode
  onLanguageChange?: (lang: LanguageCode) => void
}

/** Kring conduct (round-2 A1 "two quick promises" + the not-allowed rules). Keep "public venues only" and
 *  "PromptPay or bank" — they are the two promises people ask about most. No dating / nightlife / alcohol framing. */
const CONDUCT_POINTS_BY_LANG: Record<'en' | 'th' | 'zh', string[]> = {
  en: [
    'Public venues only — cafés, markets, temples, malls, parks and licensed spas. Never a home, hotel room or condo.',
    '20+ only, always. Every local is ID-checked before their first booking.',
    'Respect every traveller and local. Harassment, pressure or discrimination ends the account.',
    'No adult services and no alcohol-led plans. Massage only at licensed spas.',
    'Pay only inside Kring: the booking is held until you meet, and locals are paid to their own PromptPay or bank. Contacts stay masked until you book.',
  ],
  th: [
    'เจอกันที่สาธารณะเท่านั้น — คาเฟ่ ตลาด วัด ห้าง สวน และสปาที่มีใบอนุญาต ไม่นัดที่บ้าน ห้องพักโรงแรม หรือคอนโด',
    'อายุ 20 ปีขึ้นไปเท่านั้น โลคอลทุกคนยืนยันตัวตนก่อนรับการจองครั้งแรก',
    'ให้เกียรติผู้จองและโลคอลทุกคน การคุกคาม กดดัน หรือเลือกปฏิบัติ จะถูกปิดบัญชี',
    'ไม่มีบริการผู้ใหญ่ ไม่มีแผนที่เน้นแอลกอฮอล์ นวดได้เฉพาะสปาที่มีใบอนุญาต',
    'จ่ายผ่านกริ๊งเท่านั้น ยอดจองพักไว้จนเจอกัน โลคอลรับเงินเข้าพร้อมเพย์หรือบัญชีธนาคารของตัวเอง ข้อมูลติดต่อถูกซ่อนจนกว่าจะจอง',
  ],
  zh: [
    '仅限公共场所 — 咖啡馆、市场、寺庙、商场、公园和持证水疗馆。绝不在住宅、酒店房间或公寓见面。',
    '仅限 20 岁以上。每位本地人在首次接单前均已实名认证。',
    '尊重每位旅行者与本地人。任何骚扰、施压或歧视将导致封号。',
    '不提供成人服务，不安排以饮酒为主的行程。按摩仅限持证水疗馆。',
    '只在 Kring 内付款：预订款暂存至见面，本地人收款至本人 PromptPay 或银行账户。预订前联系方式保密。',
  ],
}

const LOCK_KEY = 'chon_under20_lock_v1'
const LOCK_MS = 24 * 60 * 60 * 1000
function isLocked(): boolean {
  try {
    const at = Number(window.localStorage.getItem(LOCK_KEY) ?? '0')
    return Number.isFinite(at) && at > 0 && Date.now() - at < LOCK_MS
  } catch {
    return false
  }
}

/**
 * Atlas A3 (two quick yeses) + A4 (under-20 stop). One centred modal that grows out of the tapped button: language pills
 * on top, two ticks, one gold Continue, the full code behind "Read", and a kind "I'm not 20 yet" exit. Saying "not 20"
 * shows a calm violet-moon screen (nothing was saved); "I picked the wrong answer" goes back once, then locks for 24 h.
 */
export default function AgeGateModal({
  open,
  isAgeConfirmed,
  isConductAccepted,
  onConfirmAge,
  onAcceptConduct,
  onComplete,
  onClose,
  languageOverride,
  onLanguageChange,
}: AgeGateModalProps) {
  const { language: ctxLanguage, setLanguage: ctxSetLanguage } = useLanguage()
  const [localLang, setLocalLang] = useState<LanguageCode>(languageOverride ?? ctxLanguage)
  const [underAge, setUnderAge] = useState(false)
  const [codeOpen, setCodeOpen] = useState(false)
  const [locked, setLocked] = useState(false)
  const boxRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    setLocalLang(languageOverride ?? ctxLanguage)
  }, [languageOverride, ctxLanguage])

  useEffect(() => {
    if (!open) {
      setUnderAge(false)
      setCodeOpen(false)
    } else if (isLocked()) {
      setLocked(true)
      setUnderAge(true)
    }
  }, [open])

  // grow out of the tapped button (falls back to the centre)
  useLayoutEffect(() => {
    if (!open || !boxRef.current) return
    const o = getTapOrigin()
    if (!o) return
    const r = boxRef.current.getBoundingClientRect()
    boxRef.current.style.setProperty('--sh-ox', `${Math.round(o.x - r.left)}px`)
    boxRef.current.style.setProperty('--sh-oy', `${Math.round(o.y - r.top)}px`)
  }, [open])

  if (!open) return null

  const activeLang: 'en' | 'th' | 'zh' =
    localLang === 'zh' ? 'zh' : localLang === 'th' ? 'th' : 'en'
  const L = (en: string, th: string, zh: string) => (activeLang === 'th' ? th : activeLang === 'zh' ? zh : en)

  const handleSelectLang = (next: LanguageCode) => {
    triggerHaptic('select')
    setLocalLang(next)
    ctxSetLanguage(next)
    onLanguageChange?.(next)
  }

  const canContinue = isAgeConfirmed && isConductAccepted && !underAge
  const localizedPoints = CONDUCT_POINTS_BY_LANG[activeLang]
  const tick = <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>

  const codeList = (
    <div className={codeOpen ? 'sh-code' : 'sr-only'}>
      <h3 className="sh-code-h">
        {activeLang === 'en' ? (
          'Kring Public Experiences Code of Conduct'
        ) : (
          <>
            <span aria-hidden="true">{L('', 'ข้อตกลงการเจอกันในที่สาธารณะของกริ๊ง', 'Kring 公共场所行为准则')}</span>
            <span className="sr-only">Kring Public Experiences Code of Conduct</span>
          </>
        )}
      </h3>
      <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
        {CONDUCT_POINTS_BY_LANG.en.map((enPoint, idx) => (
          <li key={enPoint}>
            {activeLang === 'en' ? (
              <span>{enPoint}</span>
            ) : (
              <span>
                <span aria-hidden="true">{localizedPoints[idx]}</span>
                <span className="sr-only">{enPoint}</span>
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  )

  const continueBtn = (
    <button
      type="button"
      disabled={!canContinue}
      onClick={() => {
        triggerHaptic('success')
        onComplete()
      }}
      className={underAge ? 'sr-only' : 'sh-btn sh-btn-gold'}
    >
      {activeLang === 'en' ? (
        'Continue'
      ) : (
        <>
          <span aria-hidden="true">{L('', 'ไปต่อ', '继续')}</span>
          <span className="sr-only">Continue</span>
        </>
      )}
    </button>
  )

  return (
    <div data-scrollable-overlay="true" className="sh-gate-scrim">
      <div ref={boxRef} role="dialog" aria-modal="true" aria-labelledby="age-gate-title" className="sh-gate">
        <div className="sh-gate-top">
          <div data-testid="age-gate-language-pills" className="sh-seg" style={{ flexWrap: 'wrap', gap: 3, padding: 4, borderRadius: 14 }}>
            {(
              [
                { code: 'en', label: 'EN' },
                { code: 'th', label: 'ไทย' },
                { code: 'zh', label: '中文' },
                { code: 'hi', label: 'हिन्दी' },
                { code: 'ko', label: '한국어' },
                { code: 'ru', label: 'Русский' },
                { code: 'ja', label: '日本語' },
              ] as const
            ).map((opt) => (
              <button
                key={opt.code}
                type="button"
                lang={opt.code}
                data-testid={`age-gate-lang-${opt.code}`}
                onClick={() => handleSelectLang(opt.code)}
                aria-pressed={localLang === opt.code}
                style={{ padding: '0 8px', minHeight: 28, fontSize: 11.5 }}
              >
                {opt.label}
              </button>
            ))}
          </div>
          {onClose && (
            <button type="button" onClick={onClose} aria-label="Close age gate" className="sh-gate-x">
              ✕
            </button>
          )}
        </div>

        {underAge ? (
          <div className="sh-under20">
            <span className="sh-moon" aria-hidden="true" />
            <h2 id="age-gate-title" className="sh-gate-title">{L('See you at 20.', 'เจอกันตอนอายุ 20 นะ', '20 岁见。')}</h2>
            <p role="alert" className="sh-gate-line">
              <span aria-hidden="true">
                {L('Kring is 20+ only, so everyone meets safely. We’ll be here when you are.', 'กริ๊งสำหรับอายุ 20+ เท่านั้น เพื่อให้ทุกคนเจอกันอย่างปลอดภัย เรารอคุณนะ', 'Kring 仅限 20 岁以上，让每个人都安全见面。我们等你。')}
              </span>
              <span className="sr-only"> Kring is 20+ only. See you when you&apos;re 20 — no exceptions.</span>
            </p>
            <ul>
              <li><span aria-hidden="true">✓</span>{L('No account was created', 'ไม่มีการสร้างบัญชี', '未创建任何账户')}</li>
              <li><span aria-hidden="true">✓</span>{L('Nothing about you was saved', 'ไม่มีข้อมูลของคุณถูกบันทึก', '未保存你的任何信息')}</li>
              <li><span aria-hidden="true">✓</span>{L('Safety line 1155 is free, 24/7', 'สายด่วน 1155 ฟรี 24 ชม.', '安全热线 1155 免费 24/7')}</li>
            </ul>
            <div className="sh-gate-actions">
              {onClose && (
                <button type="button" className="sh-btn sh-btn-ghost sh-btn-block" onClick={onClose}>
                  {L('Close', 'ปิด', '关闭')}
                </button>
              )}
              {!locked && (
                <button
                  type="button"
                  className="sh-link"
                  onClick={() => {
                    try {
                      window.localStorage.setItem(LOCK_KEY, String(Date.now()))
                    } catch {
                      // ignore
                    }
                    setLocked(true)
                    setUnderAge(false)
                  }}
                >
                  {L('I picked the wrong answer', 'ฉันกดผิด', '我选错了')}
                </button>
              )}
              {continueBtn}
            </div>
          </div>
        ) : (
          <>
            <h2 id="age-gate-title" className="sh-gate-title">
              {L('Two quick promises', 'สัญญาสั้นๆ สองข้อ', '两个小承诺')}
              <span className="sr-only"> · 20+ only — always</span>
            </h2>
            <p className="sh-gate-line">
              {L(
                'So everyone feels safe meeting someone new.',
                'เพื่อให้ทุกคนสบายใจเวลาเจอคนใหม่',
                '让每个人都能安心认识新朋友。',
              )}
            </p>

            <div className="sh-checks">
              <label className="sh-check">
                <span className={`sh-tick${isAgeConfirmed ? ' is-on' : ''}`}>
                  <input type="checkbox" checked={isAgeConfirmed} onChange={() => { triggerHaptic('select'); onConfirmAge() }} />
                  {tick}
                </span>
                <span className="sh-check-text">
                  <b>
                    {activeLang === 'en' ? (
                      'I am 20 or older'
                    ) : (
                      <>
                        <span aria-hidden="true">{L('', 'ฉันอายุ 20 ปีขึ้นไป', '我已年满 20 周岁')}</span>
                        <span className="sr-only">I am 20 or older</span>
                      </>
                    )}
                  </b>
                  <small aria-hidden="true">{L('We check ID before your first booking', 'เราตรวจบัตรก่อนการจองครั้งแรก', '首次预订前核验身份')}</small>
                </span>
              </label>
              <div className="sh-check">
                <label style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 0, cursor: 'pointer' }}>
                  <span className={`sh-tick${isConductAccepted ? ' is-on' : ''}`}>
                    <input type="checkbox" checked={isConductAccepted} onChange={() => { triggerHaptic('select'); onAcceptConduct() }} />
                    {tick}
                  </span>
                  <span className="sh-check-text">
                    <b>
                      {activeLang === 'en' ? (
                        'I’ll keep it public and kind · Code of Conduct'
                      ) : (
                        <>
                          <span aria-hidden="true">{L('', 'ฉันจะเจอกันในที่สาธารณะและให้เกียรติกัน', '我会在公共场所见面并友善待人')}</span>
                          <span className="sr-only">I accept the Kring Public Experiences Code of Conduct</span>
                        </>
                      )}
                    </b>
                    <small aria-hidden="true">{L('Public places · no adult services · pay only inside Kring', 'ที่สาธารณะ · ไม่มีบริการผู้ใหญ่ · จ่ายผ่านกริ๊งเท่านั้น', '公共场所 · 无成人服务 · 只在 Kring 内付款')}</small>
                  </span>
                </label>
                <button type="button" className="sh-read-btn" aria-expanded={codeOpen} onClick={() => setCodeOpen((v) => !v)}>
                  {codeOpen ? L('Hide', 'ซ่อน', '收起') : L('Read', 'อ่าน', '阅读')}
                </button>
              </div>
            </div>
            {codeList}

            <div className="sh-gate-actions">
              {continueBtn}
              <button type="button" onClick={() => { triggerHaptic('tap'); setUnderAge(true) }} className="sh-link">
                <span aria-hidden="true">{L("I'm not 20 yet", 'ฉันยังไม่ถึง 20', '我未满 20 岁')}</span>
                <span className="sr-only">I&apos;m under 20</span>
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
