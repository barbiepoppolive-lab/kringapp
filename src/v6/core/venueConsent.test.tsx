import { describe, expect, it, beforeEach } from 'vitest'
import { render, fireEvent, waitFor } from '@testing-library/react'
import { App } from '../App'
import {
  MAX_VENUE_MEDIA_FILES,
  VENUE_CONSENT_TEXT_VERSION,
  buildVenueMediaBucketPath,
  getSavedVenueConsents,
  sanitizeBizCode,
  submitVenueMediaConsent,
} from './account'

describe('OPUS-NIGHT-03-CONSENT-PAGE (#venue-consent?biz=<code>)', () => {
  beforeEach(() => {
    localStorage.clear()
    window.location.hash = '#venue-consent?biz=roots-bkk'
  })

  it('sanitizes biz_code and formats storage bucket path under venue-media/<biz>', () => {
    expect(sanitizeBizCode('Roots_BKK!@#')).toBe('roots_bkk')
    expect(buildVenueMediaBucketPath('roots-bkk', 'latte art.mp4', 0)).toBe('venue-media/roots-bkk/1_latte_art.mp4')
  })

  it('stores biz_code, consent_text_version, consented_at, and up to 8 files without IP address (PDPA minimal)', async () => {
    const files = Array.from({ length: 3 }, (_, i) => new File(['x'], `photo_${i + 1}.jpg`, { type: 'image/jpeg' }))
    const res = await submitVenueMediaConsent({
      bizCode: 'roots-bkk',
      venueName: 'Roots Coffee',
      contact: '@rootscoffee',
      files,
    })
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.record.biz_code).toBe('roots-bkk')
      expect(res.record.consent_text_version).toBe(VENUE_CONSENT_TEXT_VERSION)
      expect(Boolean(Date.parse(res.record.consented_at))).toBe(true)
      expect(res.record.media_paths).toEqual([
        'venue-media/roots-bkk/1_photo_1.jpg',
        'venue-media/roots-bkk/2_photo_2.jpg',
        'venue-media/roots-bkk/3_photo_3.jpg',
      ])
      expect('ip' in (res.record as unknown as Record<string, unknown>)).toBe(false)
      expect('ip_address' in (res.record as unknown as Record<string, unknown>)).toBe(false)
    }

    const tooMany = Array.from({ length: MAX_VENUE_MEDIA_FILES + 1 }, (_, i) => new File(['x'], `p${i}.jpg`))
    const failRes = await submitVenueMediaConsent({ bizCode: 'roots-bkk', files: tooMany })
    expect(failRes.ok).toBe(false)
    if (!failRes.ok) {
      expect(failRes.error).toBe('MAX_8_FILES_EXCEEDED')
    }
  })

  it('renders #venue-consent?biz=roots-bkk with Thai first, exact English consent text below, LINE/email field, and ยินยอม / I agree button', async () => {
    const { container } = render(<App start="venue-consent" />)

    const thP = container.querySelector('#vc-consent-th')
    const enP = container.querySelector('#vc-consent-en')
    expect(thP?.textContent).toContain('Kring ขออนุญาตใช้ภาพถ่ายและวิดีโอของ Roots Coffee')
    expect(enP?.textContent).toBe(
      'Kring may use photos/videos of Roots Coffee in the Kring app and on Kring social accounts, always with your name and tag. Ask us any time and we remove it.',
    )

    const agreeBtn = container.querySelector('#vc-agree') as HTMLButtonElement
    expect(agreeBtn?.textContent).toBe('ยินยอม / I agree')

    const contactInput = container.querySelector('#vc-contact') as HTMLInputElement
    fireEvent.change(contactInput, { target: { value: '@rootscoffee' } })

    fireEvent.click(agreeBtn)

    await waitFor(() => {
      const doneBox = container.querySelector('#vc-done')
      expect(doneBox).not.toBeNull()
      expect(doneBox?.textContent).toContain('biz_code: roots-bkk')
      expect(doneBox?.textContent).toContain(`consent_text_version: ${VENUE_CONSENT_TEXT_VERSION}`)
    })

    const saved = getSavedVenueConsents()
    expect(saved.length).toBe(1)
    expect(saved[0].biz_code).toBe('roots-bkk')
    expect(saved[0].contact).toBe('@rootscoffee')
  })
})
