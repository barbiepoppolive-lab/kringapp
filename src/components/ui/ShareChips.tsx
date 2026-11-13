import { useState } from 'react'
import { shareTargets, type ShareOptions, type ShareTargetId } from '../../lib/share'
import '../../styles/shell.css'

/**
 * KRING FIX3 · plain share chips (founder: no brand logos or colours) — native share (when available), LINE, WeChat,
 * 小红书, Copy link. Each chip carries data-testid `${testIdPrefix}-${id}`; a copy chip shows "✓" for 2 s.
 */
export default function ShareChips({
  text,
  url,
  title,
  lang = 'en',
  testIdPrefix = 'share',
  only,
  className = '',
  onDone,
}: {
  text: string
  url: string
  title?: string
  lang?: string
  testIdPrefix?: string
  only?: ShareTargetId[]
  className?: string
  onDone?: ShareOptions['onDone']
}) {
  const [done, setDone] = useState<ShareTargetId | null>(null)
  const targets = shareTargets(text, url, {
    title,
    lang,
    only,
    onDone: (id, out) => {
      if (out === 'copied' || out === 'shared') {
        setDone(id)
        window.setTimeout(() => setDone((d) => (d === id ? null : d)), 2000)
      }
      onDone?.(id, out)
    },
  })
  return (
    <div className={`kr-share-chips${className ? ` ${className}` : ''}`} role="group" aria-label={lang === 'th' ? 'แชร์' : lang === 'zh' ? '分享' : 'Share'} data-testid={`${testIdPrefix}-chips`}>
      {targets.map((t) => (
        <button key={t.id} type="button" className={`kr-share-chip${t.id === 'native' ? ' is-native' : ''}`} data-testid={`${testIdPrefix}-${t.id}`} onClick={() => void t.run()}>
          {done === t.id ? '✓ ' : ''}
          {t.label}
        </button>
      ))}
    </div>
  )
}
