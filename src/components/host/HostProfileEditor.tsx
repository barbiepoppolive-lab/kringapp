import { useRef, useState, type ChangeEvent } from 'react'
import { verifyPhotoMatchesFace } from '../../lib/faceMatcher'

export const MIN_VIBE_QUESTIONS = 3
export const MAX_VIBE_QUESTIONS = 5

const VIBE_SUGGESTIONS = [
  'Coffee, night market or street food — what is your ideal first experience?',
  'Which song is on your Kring playlist right now?',
  'Beach day, city exploring or a mountain escape?',
  'Street food stall or a sit-down Thai kitchen?',
  'Karaoke nights or a sunset river cruise?',
]

export interface MatchedProfilePhoto {
  id: string
  fileName: string
  similarity: number
  badge: 'Real Face Matched ✅'
}

export interface BlockedPhoneNumber {
  id: string
  hash: string
  masked: string
}

export interface HostProfileDraft {
  bio: string
  vibeQuestions: string[]
  photos: MatchedProfilePhoto[]
  blockedPhoneNumbers: BlockedPhoneNumber[]
  foreignTouristsOnly: boolean
}

export interface HostProfileEditorProps {
  verifiedLiveVector: number[]
  extractFaceVector: (file: File) => Promise<number[]>
  onSave?: (draft: HostProfileDraft) => void
}

function hashPhoneNumber(phone: string): string {
  let hash = 0x811c9dc5
  for (let i = 0; i < phone.length; i++) {
    hash ^= phone.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

export default function HostProfileEditor({
  verifiedLiveVector,
  extractFaceVector,
  onSave,
}: HostProfileEditorProps) {
  const [bio, setBio] = useState('')
  const [vibeQuestions, setVibeQuestions] = useState<string[]>(VIBE_SUGGESTIONS.slice(0, MIN_VIBE_QUESTIONS))
  const [photos, setPhotos] = useState<MatchedProfilePhoto[]>([])
  const [blockedPhoneNumbers, setBlockedPhoneNumbers] = useState<BlockedPhoneNumber[]>([])
  const [foreignTouristsOnly, setForeignTouristsOnly] = useState(false)
  const [photoError, setPhotoError] = useState<string | null>(null)
  const [checkingPhoto, setCheckingPhoto] = useState<string | null>(null)
  const [phoneInput, setPhoneInput] = useState('')
  const [phoneError, setPhoneError] = useState<string | null>(null)
  const [customQuestion, setCustomQuestion] = useState('')
  const [questionError, setQuestionError] = useState<string | null>(null)
  const idCounter = useRef(0)

  const nextId = (prefix: string): string => {
    idCounter.current += 1
    return `${prefix}-${idCounter.current}`
  }

  const unusedSuggestions = VIBE_SUGGESTIONS.filter((question) => !vibeQuestions.includes(question))
  const canAddQuestion = vibeQuestions.length < MAX_VIBE_QUESTIONS
  const canRemoveQuestion = vibeQuestions.length > MIN_VIBE_QUESTIONS
  const canSave = bio.trim().length > 0

  function addQuestion(question: string) {
    const trimmed = question.trim()
    if (!canAddQuestion) {
      setQuestionError(
        `Vibe Check is full — keep ${MAX_VIBE_QUESTIONS} questions max so it stays a quick 3-tap check.`,
      )
      return
    }
    if (!trimmed || vibeQuestions.includes(trimmed)) return
    setVibeQuestions((prev) => [...prev, trimmed])
    setQuestionError(null)
  }

  function removeQuestion(index: number) {
    if (!canRemoveQuestion) {
      setQuestionError(`Keep at least ${MIN_VIBE_QUESTIONS} Vibe Check questions so guests can start the chat.`)
      return
    }
    setVibeQuestions((prev) => prev.filter((_, i) => i !== index))
    setQuestionError(null)
  }

  async function handlePhotoSelected(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget
    const file = input.files?.[0]
    input.value = ''
    if (!file) return
    setPhotoError(null)
    setCheckingPhoto(file.name)
    try {
      const uploadedPhotoVector = await extractFaceVector(file)
      const result = verifyPhotoMatchesFace(verifiedLiveVector, uploadedPhotoVector)
      const badge = result.badge
      if (result.accepted && badge !== null) {
        setPhotos((prev) => [
          ...prev,
          {
            id: nextId('photo'),
            fileName: file.name,
            similarity: result.similarity,
            badge,
          },
        ])
      } else {
        setPhotoError(result.reason ?? 'That photo was rejected. Please upload a clear photo of your own face.')
      }
    } catch {
      setPhotoError('We could not read a face in that photo. Please upload a clear, well-lit photo of yourself.')
    } finally {
      setCheckingPhoto(null)
    }
  }

  function handleBlockNumber() {
    const normalized = phoneInput.replace(/[^\d+]/g, '')
    const digits = normalized.replace(/\D/g, '')
    if (digits.length < 9 || digits.length > 15) {
      setPhoneError('Enter a valid phone number with country code (9–15 digits).')
      return
    }
    const hash = hashPhoneNumber(normalized)
    if (blockedPhoneNumbers.some((entry) => entry.hash === hash)) {
      setPhoneError('That number is already on your Contact-Book Block list.')
      return
    }
    setPhoneError(null)
    setBlockedPhoneNumbers((prev) => [
      ...prev,
      { id: nextId('blocked'), hash, masked: `••• ${digits.slice(-2)}` },
    ])
    setPhoneInput('')
  }

  function handleUnblock(id: string) {
    setBlockedPhoneNumbers((prev) => prev.filter((entry) => entry.id !== id))
  }

  function handleSave() {
    if (!canSave) return
    onSave?.({
      bio,
      vibeQuestions,
      photos,
      blockedPhoneNumbers,
      foreignTouristsOnly,
    })
  }

  return (
    <section className="mx-auto w-full max-w-md space-y-6 rounded-3xl border border-stone-800 bg-stone-900 p-5 shadow-2xl">
      <header>
        <h2 className="text-lg font-extrabold tracking-tight">
          Local profile <span className="text-amber-400">✦</span>
        </h2>
        <p className="mt-1 text-xs text-stone-400">
          Generous on the outside, protected on the inside: clear face-matched photos, a quick Vibe Check,
          and a privacy shield that keeps local eyes out.
        </p>
      </header>

      <div>
        <label htmlFor="host-bio" className="block text-sm font-bold text-stone-200">
          About you
        </label>
        <textarea
          id="host-bio"
          value={bio}
          onChange={(event) => setBio(event.target.value)}
          rows={3}
          placeholder="Tell guests what makes an experience with you fun…"
          className="mt-2 w-full rounded-xl border border-stone-700 bg-stone-950 p-3 text-xs text-stone-100 placeholder:text-stone-600 focus:border-amber-400 focus:outline-none"
        />
      </div>

      <div>
        <h3 className="text-sm font-bold text-stone-200">
          Chemistry Vibe Check ({MIN_VIBE_QUESTIONS}–{MAX_VIBE_QUESTIONS} questions)
        </h3>
        <p className="mt-1 text-xs text-stone-400">
          Guests answer these in 3 taps before they book — keep it quick and fun.
        </p>

        <ul aria-label="Vibe Check questions" className="mt-3 space-y-2">
          {vibeQuestions.map((question, index) => (
            <li
              key={question}
              className="flex items-start justify-between gap-2 rounded-xl border border-stone-700 bg-stone-950 p-3"
            >
              <span className="text-xs text-stone-200">
                <span className="mr-1.5 font-bold text-amber-400">{index + 1}.</span>
                {question}
              </span>
              <button
                type="button"
                onClick={() => removeQuestion(index)}
                aria-label={`Remove vibe question: ${question}`}
                className="-mr-1 -mt-1 shrink-0 rounded-full px-2 py-1 text-xs text-stone-500 transition-colors hover:text-rose-300"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>

        <div className="mt-3 space-y-2">
          <label htmlFor="vibe-suggestion" className="block text-xs font-medium text-stone-400">
            Add a suggested Vibe Check question
          </label>
          <select
            id="vibe-suggestion"
            value=""
            onChange={(event) => {
              addQuestion(event.target.value)
              event.currentTarget.value = ''
            }}
            className="w-full rounded-xl border border-stone-700 bg-stone-950 p-2.5 text-xs text-stone-100 focus:border-amber-400 focus:outline-none"
          >
            <option value="">Pick a suggested question…</option>
            {unusedSuggestions.map((question) => (
              <option key={question} value={question}>
                {question}
              </option>
            ))}
          </select>

          <label htmlFor="vibe-custom" className="block text-xs font-medium text-stone-400">
            Your own Vibe Check question
          </label>
          <div className="flex gap-2">
            <input
              id="vibe-custom"
              value={customQuestion}
              onChange={(event) => setCustomQuestion(event.target.value)}
              placeholder="e.g. Sunrise or sunset person?"
              className="flex-1 rounded-xl border border-stone-700 bg-stone-950 p-2.5 text-xs text-stone-100 placeholder:text-stone-600 focus:border-amber-400 focus:outline-none"
            />
            <button
              type="button"
              onClick={() => {
                addQuestion(customQuestion)
                setCustomQuestion('')
              }}
              className="rounded-xl border border-stone-700 px-3 py-2.5 text-xs font-semibold text-stone-300 transition-colors hover:bg-stone-800"
            >
              Add question
            </button>
          </div>
        </div>

        {questionError && (
          <p role="alert" className="mt-2 rounded-xl border border-rose-900 bg-rose-950/60 p-2.5 text-xs font-semibold text-rose-200">
            {questionError}
          </p>
        )}
      </div>

      <div>
        <h3 className="text-sm font-bold text-stone-200">Your photos — clear &amp; 100% free</h3>
        <p className="mt-1 text-xs text-stone-400">
          Every photo stays unblurred and free for eligible browsers. Each upload is auto-checked against
          your verified 1-Face scan and earns the <span className="font-semibold text-stone-300">Real Face Matched ✅</span>{' '}
          badge when it is really you — catfish are rejected.
        </p>

        <label
          htmlFor="host-photo-upload"
          className="mt-3 block cursor-pointer rounded-xl border border-dashed border-stone-700 bg-stone-950 p-4 text-center text-xs font-semibold text-stone-300 transition-colors hover:border-amber-400"
        >
          Upload a photo
        </label>
        <input
          id="host-photo-upload"
          type="file"
          accept="image/*"
          onChange={handlePhotoSelected}
          className="sr-only"
        />

        {checkingPhoto && (
          <p className="mt-2 text-xs text-stone-400">Checking “{checkingPhoto}” against your verified face scan…</p>
        )}

        {photoError && (
          <p role="alert" className="mt-2 rounded-xl border border-rose-900 bg-rose-950/60 p-2.5 text-xs font-semibold text-rose-200">
            {photoError}
          </p>
        )}

        {photos.length > 0 && (
          <ul aria-label="Face-matched photos" className="mt-3 space-y-2">
            {photos.map((photo) => (
              <li
                key={photo.id}
                className="flex items-center justify-between gap-2 rounded-xl border border-stone-700 bg-stone-950 p-3"
              >
                <span className="text-xs text-stone-200">{photo.fileName}</span>
                <span className="flex items-center gap-2 text-xs">
                  <span className="text-stone-400">{Math.round(photo.similarity * 100)}% match</span>
                  <span className="font-semibold text-emerald-400">{photo.badge}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <h3 className="text-sm font-bold text-stone-200">Contact-Book Block</h3>
        <p className="mt-1 text-xs text-stone-400">
          Block saved contacts by phone number so people who know you locally can never find your profile.
          We store a one-way hash only — the raw number is never saved.
        </p>

        <div className="mt-3 flex gap-2">
          <input
            id="block-phone"
            value={phoneInput}
            onChange={(event) => setPhoneInput(event.target.value)}
            placeholder="+66 81 234 5678"
            className="flex-1 rounded-xl border border-stone-700 bg-stone-950 p-2.5 text-xs text-stone-100 placeholder:text-stone-600 focus:border-amber-400 focus:outline-none"
          />
          <label htmlFor="block-phone" className="sr-only">
            Phone number to block
          </label>
          <button
            type="button"
            onClick={handleBlockNumber}
            className="rounded-xl border border-stone-700 px-3 py-2.5 text-xs font-semibold text-stone-300 transition-colors hover:bg-stone-800"
          >
            Block number
          </button>
        </div>

        {phoneError && (
          <p role="alert" className="mt-2 rounded-xl border border-rose-900 bg-rose-950/60 p-2.5 text-xs font-semibold text-rose-200">
            {phoneError}
          </p>
        )}

        {blockedPhoneNumbers.length > 0 && (
          <ul aria-label="Blocked phone numbers" className="mt-3 space-y-2">
            {blockedPhoneNumbers.map((entry) => (
              <li
                key={entry.id}
                className="flex items-center justify-between gap-2 rounded-xl border border-stone-700 bg-stone-950 p-3"
              >
                <span className="flex items-center gap-2 text-xs text-stone-400">
                  <span className="font-mono text-stone-300">{entry.masked}</span>
                  <code className="rounded bg-stone-800 px-1.5 py-0.5 font-mono text-[10px] text-stone-400">
                    {entry.hash}
                  </code>
                </span>
                <button
                  type="button"
                  onClick={() => handleUnblock(entry.id)}
                  aria-label={`Unblock ${entry.hash}`}
                  className="rounded-full px-2 py-1 text-xs text-stone-500 transition-colors hover:text-rose-300"
                >
                  Unblock
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <h3 className="text-sm font-bold text-stone-200">Visibility</h3>
        <label className="mt-2 flex items-start gap-2.5 text-xs font-medium text-stone-200">
          <input
            type="checkbox"
            checked={foreignTouristsOnly}
            onChange={(event) => setForeignTouristsOnly(event.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 accent-amber-400"
          />
          Show my profile only to Foreign Tourists (passport verified)
        </label>
        {foreignTouristsOnly && (
          <p className="mt-2 rounded-xl border border-amber-900/60 bg-amber-950/40 p-2.5 text-xs text-amber-200">
            Only passport-verified Foreign Tourists will see your profile, photos and Stories. Thai locals
            are fully hidden — no stigma, no exceptions.
          </p>
        )}
      </div>

      <button
        type="button"
        onClick={handleSave}
        disabled={!canSave}
        className="w-full rounded-xl bg-amber-400 px-3 py-2.5 text-xs font-bold text-stone-950 transition-colors hover:bg-amber-300 disabled:cursor-not-allowed disabled:bg-stone-800 disabled:text-stone-500"
      >
        Save profile
      </button>
    </section>
  )
}
