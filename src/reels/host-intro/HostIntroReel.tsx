/**
 * A-18 · Remotion Template `reels/host-intro` (1080×1920, 16 s @ 30 fps = 480 frames)
 *
 * Brand palette only:
 * - night:    #05060D
 * - anchan:   #3446FF
 * - marigold: #FFB21E
 *
 * Women-led creative captioned for women travellers:
 * "Travelling Thailand solo? Meet a verified local who shows you her Bangkok"
 * "Nothing charged until you meet" / "ไม่เรียกเก็บเงินจนกว่าจะพบกัน"
 * End card: two-door CTA ("Pre-register as a host" + "Join the traveller waitlist"),
 * referral QR/link https://kringapp.com/?ref=H-<id>, and #โฆษณา #ad.
 */

import type { CSSProperties } from 'react';
import {
  BRAND_PALETTE,
  checkAndCorrectHostReel,
  type HostReelInput,
} from './moderationChecklist';

export const REEL_COMPOSITION_CONFIG = {
  id: 'reels/host-intro',
  width: 1080,
  height: 1920,
  fps: 30,
  durationInFrames: 480, // 16.0 seconds (within 15–20 s requirement)
} as const;

export interface HostIntroReelProps {
  spec: HostReelInput;
  frame?: number;
}

export function HostIntroReel({ spec, frame = 0 }: HostIntroReelProps) {
  const { correctedSpec } = checkAndCorrectHostReel(spec);
  const photos = correctedSpec.photos.slice(0, 6);
  const photoFramesTotal = 360; // first 12s: cycle through 4–6 photos
  const framesPerPhoto = Math.max(1, Math.floor(photoFramesTotal / Math.max(1, photos.length)));
  const isEndCard = frame >= photoFramesTotal;
  const activePhotoIndex = Math.min(photos.length - 1, Math.floor(frame / framesPerPhoto));
  const activePhoto = photos[activePhotoIndex] || photos[0] || '';

  const rootStyle: CSSProperties = {
    width: 1080,
    height: 1920,
    position: 'relative',
    overflow: 'hidden',
    backgroundColor: BRAND_PALETTE.night,
    color: '#FFFFFF',
    fontFamily: "'Plus Jakarta Sans', 'Noto Sans Thai', sans-serif",
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
    padding: 64,
    boxSizing: 'border-box',
  };

  return (
    <div id="kring-host-intro-reel" style={rootStyle}>
      {/* Background photo layer during first 12s */}
      {!isEndCard && activePhoto && (
        <img
          src={activePhoto}
          alt={correctedSpec.activityEn}
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            opacity: 0.62,
          }}
        />
      )}

      {/* Brand night gradient overlay */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: isEndCard
            ? `radial-gradient(circle at 50% 28%, ${BRAND_PALETTE.anchan} 0%, ${BRAND_PALETTE.night} 72%)`
            : `linear-gradient(180deg, ${BRAND_PALETTE.night}CC 0%, transparent 35%, ${BRAND_PALETTE.night}F2 88%)`,
        }}
      />

      {/* Top header: Kring badge + Sponsored disclosure (#โฆษณา #ad) */}
      <div
        style={{
          position: 'relative',
          zIndex: 2,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <div
          style={{
            backgroundColor: BRAND_PALETTE.anchan,
            color: '#FFFFFF',
            padding: '14px 28px',
            borderRadius: 999,
            fontWeight: 800,
            fontSize: 30,
          }}
        >
          Kring · กริ๊ง! · Verified Local Host
        </div>
        <div
          id="reel-sponsored-tag"
          style={{
            backgroundColor: BRAND_PALETTE.night,
            border: `2px solid ${BRAND_PALETTE.marigold}`,
            color: BRAND_PALETTE.marigold,
            padding: '12px 24px',
            borderRadius: 999,
            fontWeight: 700,
            fontSize: 28,
          }}
        >
          {correctedSpec.sponsoredTag}
        </div>
      </div>

      {/* Main content area: Photo slides (0-12s) OR Two-Door End Card (12-16s) */}
      {!isEndCard ? (
        <div
          style={{
            position: 'relative',
            zIndex: 2,
            display: 'flex',
            flexDirection: 'column',
            gap: 24,
            marginBottom: 40,
          }}
        >
          {/* Women-traveller hook burned-in caption */}
          <div
            style={{
              backgroundColor: BRAND_PALETTE.night,
              borderLeft: `10px solid ${BRAND_PALETTE.marigold}`,
              padding: '24px 28px',
              borderRadius: 24,
            }}
          >
            <div style={{ fontSize: 34, fontWeight: 700, color: BRAND_PALETTE.marigold }}>
              {correctedSpec.captionHookEn}
            </div>
            <div style={{ fontSize: 30, fontWeight: 600, marginTop: 8 }}>
              {correctedSpec.captionHookTh}
            </div>
          </div>

          {/* Host First Name + Activity + Public Neighbourhood */}
          <div
            style={{
              backgroundColor: BRAND_PALETTE.night,
              border: `3px solid ${BRAND_PALETTE.anchan}`,
              padding: '28px 32px',
              borderRadius: 28,
            }}
          >
            <div style={{ fontSize: 54, fontWeight: 800, color: BRAND_PALETTE.marigold }}>
              {correctedSpec.firstNameEn} ({correctedSpec.firstNameTh})
            </div>
            <div style={{ fontSize: 40, fontWeight: 700, marginTop: 10 }}>
              {correctedSpec.activityEn} · {correctedSpec.neighbourhoodEn}
            </div>
            <div style={{ fontSize: 34, fontWeight: 600, marginTop: 6 }}>
              {correctedSpec.activityTh} · {correctedSpec.neighbourhoodTh}
            </div>
          </div>

          {/* Zero-advance promise burned in (TH + EN) */}
          <div
            style={{
              backgroundColor: BRAND_PALETTE.marigold,
              color: BRAND_PALETTE.night,
              padding: '22px 32px',
              borderRadius: 24,
              fontWeight: 800,
              fontSize: 36,
              textAlign: 'center',
            }}
          >
            {correctedSpec.promiseLineEn} · {correctedSpec.promiseLineTh}
          </div>
        </div>
      ) : (
        /* END CARD (12s–16s): Two-door Pre-registration CTA + Host Referral QR/link */
        <div
          id="reel-end-card"
          style={{
            position: 'relative',
            zIndex: 2,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 28,
            textAlign: 'center',
            marginBottom: 40,
          }}
        >
          <div style={{ fontSize: 52, fontWeight: 800, color: BRAND_PALETTE.marigold }}>
            {correctedSpec.firstNameEn} · {correctedSpec.neighbourhoodEn}
          </div>
          <div style={{ fontSize: 36, fontWeight: 700 }}>
            {correctedSpec.promiseLineEn} · {correctedSpec.promiseLineTh}
          </div>

          {/* Two-door CTA buttons */}
          <div
            style={{
              width: '100%',
              backgroundColor: BRAND_PALETTE.marigold,
              color: BRAND_PALETTE.night,
              padding: '26px 32px',
              borderRadius: 28,
              fontSize: 40,
              fontWeight: 800,
            }}
          >
            1. {correctedSpec.endCardCtaHostEn} · สมัครโฮสต์ล่วงหน้า
          </div>

          <div
            style={{
              width: '100%',
              backgroundColor: BRAND_PALETTE.anchan,
              color: '#FFFFFF',
              padding: '26px 32px',
              borderRadius: 28,
              fontSize: 40,
              fontWeight: 800,
            }}
          >
            2. {correctedSpec.endCardCtaTravellerEn} · ลงชื่อรอนักท่องเที่ยว
          </div>

          {/* Referral Link & QR Box */}
          <div
            style={{
              backgroundColor: BRAND_PALETTE.night,
              border: `4px solid ${BRAND_PALETTE.marigold}`,
              borderRadius: 28,
              padding: '24px 36px',
              marginTop: 8,
            }}
          >
            <div style={{ fontSize: 30, fontWeight: 700, color: BRAND_PALETTE.marigold }}>
              Scan or visit · No Kring fee via host link
            </div>
            <div style={{ fontSize: 36, fontWeight: 800, marginTop: 8 }}>
              {correctedSpec.referralUrl}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
