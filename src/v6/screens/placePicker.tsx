/* A-13 + D-054 · Public Meeting-Place Picker Sheet (100m Check-In Radius + Temple No-Guiding Notice) */
import { useMemo, useState } from 'react'
import { useS } from '../core/store'
import { t } from '../core/data'
import {
  MAX_BUMP_METERS,
  TEMPLE_MEETING_POINT_NOTE_EN,
  TEMPLE_MEETING_POINT_NOTE_TH,
  searchAllowedPublicPlaces,
  isPublicMeetingPlaceAllowed,
  isActivityVenueAllowed,
  BANGKOK_20_PLACES_FIXTURE,
  type CandidatePlace,
} from '../core/placesFilter'
import { I, Ic, Sheet } from '../ui/kit'

export {
  MAX_BUMP_METERS,
  TEMPLE_MEETING_POINT_NOTE_EN,
  TEMPLE_MEETING_POINT_NOTE_TH,
  searchAllowedPublicPlaces,
  isPublicMeetingPlaceAllowed,
  isActivityVenueAllowed,
  BANGKOK_20_PLACES_FIXTURE,
  type CandidatePlace,
}

export function PlacePickerSheet({
  open,
  onClose,
  onSelectPlace,
}: {
  open: boolean
  onClose: () => void
  onSelectPlace: (place: CandidatePlace) => void
}) {
  const s = useS()
  const [placeQ, setPlaceQ] = useState('')
  const placeSearch = useMemo(() => searchAllowedPublicPlaces(placeQ), [placeQ])

  return (
    <Sheet open={open} onClose={onClose}>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <b style={{ fontSize: 18 }}>{t('suggestPlace')}</b>
        <span className="pill gold num" id="place-picker-radius-pill">
          ≤ {MAX_BUMP_METERS} m check-in
        </span>
      </div>
      <label className="inp glass" style={{ width: '100%' }}>
        <Ic p={I.search} s={16} />
        &nbsp;
        <input
          id="place-search-inp"
          type="search"
          placeholder={t('searchPublicPlacePh')}
          aria-label={t('searchPublicPlacePh')}
          value={placeQ}
          onChange={(e) => setPlaceQ(e.target.value)}
        />
      </label>
      {(placeSearch.blockedMatch || placeSearch.templeInteriorBlocked) && (
        <div className="sys" id="place-blocked-msg" style={{ color: 'var(--gold2)' }}>
          <Ic p={I.shield} s={14} />
          <span>{t('placeNotAllowed')}</span>
        </div>
      )}
      <div className="col" style={{ gap: 8, maxHeight: 260, overflowY: 'auto' }}>
        {placeSearch.allowed.map((p) => (
          <button
            key={p.place_id}
            data-place-id={p.place_id}
            className="card col"
            style={{ padding: '10px 12px', textAlign: 'left', gap: 4 }}
            onClick={() => {
              setPlaceQ('')
              onSelectPlace(p)
            }}
          >
            <div className="row" style={{ alignItems: 'center', gap: 10 }}>
              <Ic p={I.pin} s={18} />
              <span className="col grow" style={{ gap: 2 }}>
                <b>{s.lang === 'th' && p.nameTh ? p.nameTh : p.name}</b>
                <span className="small">
                  {p.district} · {p.hours} · ≤ {MAX_BUMP_METERS} m bump
                </span>
              </span>
            </div>
            {p.landmarkOnlyNoGuiding && (
              <div
                className="small"
                data-temple-landmark-note="1"
                style={{ color: 'var(--gold2)', fontSize: 11.5, paddingLeft: 28 }}
              >
                {s.lang === 'th'
                  ? p.noGuidingNoteTh || TEMPLE_MEETING_POINT_NOTE_TH
                  : p.noGuidingNoteEn || TEMPLE_MEETING_POINT_NOTE_EN}
              </div>
            )}
          </button>
        ))}
      </div>
    </Sheet>
  )
}
