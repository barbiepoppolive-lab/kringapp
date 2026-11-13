import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import HostProfileEditor, {
  MAX_VIBE_QUESTIONS,
  MIN_VIBE_QUESTIONS,
  type HostProfileDraft,
} from '../components/host/HostProfileEditor'

const VERIFIED_VECTOR = [1, 0, 0, 0]
const MATCHING_VECTOR = [0.97, 0.24, 0, 0]
const CATFISH_VECTOR = [0, 1, 0, 0]

const FIRST_SUGGESTIONS = [
  'Coffee, night market or street food — what is your ideal first experience?',
  'Which song is on your Kring playlist right now?',
  'Beach day, city exploring or a mountain escape?',
]

function renderEditor(options: { uploadedVector?: number[]; onSave?: (draft: HostProfileDraft) => void } = {}) {
  const uploadedVector = options.uploadedVector ?? MATCHING_VECTOR
  const extractFaceVector = vi.fn(async () => uploadedVector)
  render(
    <HostProfileEditor
      verifiedLiveVector={VERIFIED_VECTOR}
      extractFaceVector={extractFaceVector}
      onSave={options.onSave}
    />,
  )
  return { extractFaceVector }
}

async function uploadPhoto(fileName = 'clear-selfie.jpg') {
  const file = new File(['selfie-bytes'], fileName, { type: 'image/jpeg' })
  await act(async () => {
    fireEvent.change(screen.getByLabelText(/upload a photo/i), { target: { files: [file] } })
  })
}

function questionList() {
  return within(screen.getByRole('list', { name: /vibe check questions/i }))
}

function removeButtons() {
  return questionList().getAllByRole('button', { name: /remove vibe question/i })
}

describe('Host Profile Editor — face-matched photo upload', () => {
  it('awards the "Real Face Matched ✅" badge when an uploaded photo matches the verified face scan', async () => {
    const { extractFaceVector } = renderEditor()

    await uploadPhoto()

    expect(extractFaceVector).toHaveBeenCalledTimes(1)
    expect(extractFaceVector).toHaveBeenCalledWith(expect.any(File))
    const photosList = within(screen.getByRole('list', { name: /face-matched photos/i }))
    expect(photosList.getByText('Real Face Matched ✅')).toBeInTheDocument()
    expect(photosList.getByText(/clear-selfie\.jpg/)).toBeInTheDocument()
    expect(photosList.getByText(/97% match/i)).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('rejects a catfish upload that does not match the verified face scan', async () => {
    const { extractFaceVector } = renderEditor({ uploadedVector: CATFISH_VECTOR })

    await uploadPhoto('someone-elses-photo.jpg')

    expect(extractFaceVector).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('alert')).toHaveTextContent(/does not match your verified face scan/i)
    expect(screen.queryByRole('list', { name: /face-matched photos/i })).not.toBeInTheDocument()
    expect(screen.queryByText(/someone-elses-photo\.jpg/)).not.toBeInTheDocument()
  })

  it('shows a friendly error when no face can be read from the uploaded photo', async () => {
    const extractFaceVector = vi.fn(async () => {
      throw new Error('no face detected')
    })
    render(<HostProfileEditor verifiedLiveVector={VERIFIED_VECTOR} extractFaceVector={extractFaceVector} />)

    await uploadPhoto('blurry.jpg')

    expect(screen.getByRole('alert')).toHaveTextContent(/could not read a face/i)
    expect(screen.queryByRole('list', { name: /face-matched photos/i })).not.toBeInTheDocument()
  })
})

describe('Host Profile Editor — Chemistry Vibe Check', () => {
  it('starts with the minimum of 3 questions and refuses to drop below it', () => {
    renderEditor()

    expect(questionList().getAllByRole('listitem')).toHaveLength(MIN_VIBE_QUESTIONS)

    fireEvent.click(removeButtons()[0])

    expect(questionList().getAllByRole('listitem')).toHaveLength(MIN_VIBE_QUESTIONS)
    expect(screen.getByText(/keep at least 3 vibe check questions/i)).toBeInTheDocument()
  })

  it('adds suggested and custom questions up to the maximum of 5, then blocks more', () => {
    renderEditor()

    fireEvent.change(screen.getByLabelText(/add a suggested vibe check question/i), {
      target: { value: 'Karaoke nights or a sunset river cruise?' },
    })
    expect(questionList().getAllByRole('listitem')).toHaveLength(4)

    fireEvent.change(screen.getByLabelText(/your own vibe check question/i), {
      target: { value: 'Sunrise or sunset person?' },
    })
    fireEvent.click(screen.getByRole('button', { name: /add question/i }))
    expect(questionList().getAllByRole('listitem')).toHaveLength(MAX_VIBE_QUESTIONS)
    expect(screen.getByText(/sunrise or sunset person\?/i)).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText(/your own vibe check question/i), {
      target: { value: 'Dogs or cats?' },
    })
    fireEvent.click(screen.getByRole('button', { name: /add question/i }))

    expect(questionList().getAllByRole('listitem')).toHaveLength(MAX_VIBE_QUESTIONS)
    expect(screen.getByText(/vibe check is full/i)).toBeInTheDocument()
    expect(screen.queryByText(/dogs or cats\?/i)).not.toBeInTheDocument()

    fireEvent.click(removeButtons()[0])
    expect(questionList().getAllByRole('listitem')).toHaveLength(MAX_VIBE_QUESTIONS - 1)
    expect(screen.queryByText(/vibe check is full/i)).not.toBeInTheDocument()
  })
})

describe('Host Profile Editor — Contact-Book phone blocker', () => {
  function blockNumber(rawNumber: string) {
    fireEvent.change(screen.getByLabelText(/phone number to block/i), { target: { value: rawNumber } })
    fireEvent.click(screen.getByRole('button', { name: /block number/i }))
  }

  it('stores only a one-way hash of a blocked phone number', () => {
    renderEditor()

    blockNumber('+66 81 234 5678')

    expect(screen.getByText(/^[0-9a-f]{8}$/, { selector: 'code' })).toBeInTheDocument()
    expect(screen.getByText(/••• 78/)).toBeInTheDocument()
    expect(screen.queryByText(/6681234567/)).not.toBeInTheDocument()
    expect(screen.getByLabelText(/phone number to block/i)).toHaveValue('')
  })

  it('rejects invalid numbers and duplicates, and can unblock again', () => {
    renderEditor()

    blockNumber('12345')
    expect(screen.getByRole('alert')).toHaveTextContent(/valid phone number/i)

    blockNumber('+66 81 234 5678')
    blockNumber('+66 81 234 5678')
    expect(screen.getByRole('alert')).toHaveTextContent(/already on your contact-book block list/i)
    expect(within(screen.getByRole('list', { name: /blocked phone numbers/i })).getAllByRole('listitem')).toHaveLength(1)

    fireEvent.click(screen.getByRole('button', { name: /unblock/i }))
    expect(screen.queryByRole('list', { name: /blocked phone numbers/i })).not.toBeInTheDocument()
  })
})

describe('Host Profile Editor — Foreign Tourists Only visibility', () => {
  it('hides the profile from Thai locals until the toggle is switched on', () => {
    renderEditor()

    const toggle = screen.getByRole('checkbox', { name: /show my profile only to foreign tourists/i })
    expect(toggle).not.toBeChecked()
    expect(screen.queryByText(/only passport-verified foreign tourists/i)).not.toBeInTheDocument()

    fireEvent.click(toggle)

    expect(toggle).toBeChecked()
    expect(screen.getByText(/only passport-verified foreign tourists/i)).toBeInTheDocument()
  })
})

describe('Host Profile Editor — saving the draft', () => {
  it('saves the bio, vibe questions, matched photo, blocked numbers and the privacy toggle', async () => {
    const onSave = vi.fn()
    renderEditor({ onSave })

    fireEvent.change(screen.getByLabelText(/about you/i), {
      target: { value: 'Bangkok local who knows the best night markets.' },
    })
    await uploadPhoto()

    fireEvent.change(screen.getByLabelText(/phone number to block/i), {
      target: { value: '+66 81 234 5678' },
    })
    fireEvent.click(screen.getByRole('button', { name: /block number/i }))
    fireEvent.click(screen.getByRole('checkbox', { name: /show my profile only to foreign tourists/i }))

    fireEvent.click(screen.getByRole('button', { name: /save profile/i }))

    expect(onSave).toHaveBeenCalledTimes(1)
    expect(onSave).toHaveBeenCalledWith({
      bio: 'Bangkok local who knows the best night markets.',
      vibeQuestions: FIRST_SUGGESTIONS,
      photos: [
        {
          id: expect.any(String),
          fileName: 'clear-selfie.jpg',
          similarity: expect.any(Number),
          badge: 'Real Face Matched ✅',
        },
      ],
      blockedPhoneNumbers: [
        {
          id: expect.any(String),
          hash: expect.stringMatching(/^[0-9a-f]{8}$/),
          masked: expect.any(String),
        },
      ],
      foreignTouristsOnly: true,
    })
  })

  it('keeps the save button disabled until the bio is filled in', () => {
    renderEditor()

    expect(screen.getByRole('button', { name: /save profile/i })).toBeDisabled()

    fireEvent.change(screen.getByLabelText(/about you/i), { target: { value: 'Love night markets.' } })

    expect(screen.getByRole('button', { name: /save profile/i })).toBeEnabled()
  })
})
