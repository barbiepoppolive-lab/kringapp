import { useState } from 'react'
import {
  preparePdpaAccountDeletion,
  type PdpaDeletionInput,
  type PdpaDeletionResult,
} from '../../lib/faceMatcher'
import { useLanguage } from '../../i18n/LanguageContext'
import '../../styles/deep-motion.css'
import { formatBaht } from '../../lib/money'

export const PIN_LENGTH = 4

export interface VaultRetainedData {
  vipLevel: string
  faceVerified: boolean
  coinBalance: number
}

export interface HibernationSummary {
  guestId: string
  wipedChats: number
  wipedNotifications: number
  retained: VaultRetainedData
  hibernatedAt: string
}

export interface GuestPrivacyVaultProps {
  guestId?: string
  retained?: VaultRetainedData
  initialPin?: string | null
  chatCount?: number
  notificationCount?: number
  pdpaUser?: PdpaDeletionInput | null
  onHibernate?: (summary: HibernationSummary) => void
  onUnlock?: (summary: HibernationSummary) => void
  onDeleteAccount?: (result: PdpaDeletionResult) => void
  /** Atlas D16: when set, "Delete account" opens the ONE delete confirm instead of this panel's own section */
  onRequestDelete?: () => void
}

export const DEMO_VAULT_RETAINED: VaultRetainedData = {
  vipLevel: 'Gold Front-Row VIP',
  faceVerified: true,
  coinBalance: 1250,
}

interface DeleteAccountSectionProps {
  guestId: string
  isConfirmed: boolean
  onConfirmedChange: (checked: boolean) => void
  onDelete: () => void
}

function DeleteAccountSection({
  guestId,
  isConfirmed,
  onConfirmedChange,
  onDelete,
}: DeleteAccountSectionProps) {
  const [isOpen, setIsOpen] = useState(false)

  if (!isOpen) {
    return (
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="w-full rounded-xl border border-rose-900/70 bg-rose-950/40 px-3 py-2.5 text-xs font-bold text-rose-200 transition-colors hover:bg-rose-950/70"
      >
        Delete account &amp; wipe all data (PDPA)
      </button>
    )
  }

  return (
    <div
      role="group"
      aria-label="PDPA account deletion"
      className="space-y-3 rounded-2xl border border-rose-900/70 bg-rose-950/30 p-3"
    >
      <p className="text-xs text-rose-100">
        This permanently deletes account #{guestId} and immediately wipes your raw selfie and gallery
        photos. Your verified badge and wallet balance are gone for good and cannot be restored.
      </p>
      <label className="flex items-start gap-2.5 text-xs font-medium text-rose-100">
        <input
          type="checkbox"
          checked={isConfirmed}
          onChange={(event) => onConfirmedChange(event.target.checked)}
          className="mt-0.5 h-4 w-4 shrink-0 accent-rose-400"
        />
        I understand this is permanent and my wallet balance is forfeited.
      </label>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onDelete}
          disabled={!isConfirmed}
          className="flex-1 rounded-xl bg-rose-500 px-3 py-2.5 text-xs font-bold text-stone-950 transition-colors hover:bg-rose-400 disabled:cursor-not-allowed disabled:bg-stone-800 disabled:text-stone-500"
        >
          Permanently delete my account
        </button>
        <button
          type="button"
          onClick={() => {
            onConfirmedChange(false)
            setIsOpen(false)
          }}
          className="rounded-xl border border-stone-700 px-3 py-2.5 text-xs font-semibold text-stone-300 transition-colors hover:bg-stone-800"
        >
          Keep my account
        </button>
      </div>
    </div>
  )
}

export default function GuestPrivacyVault({
  guestId = 'ghost-guest',
  retained = DEMO_VAULT_RETAINED,
  initialPin = null,
  chatCount = 0,
  notificationCount = 0,
  pdpaUser = null,
  onHibernate,
  onUnlock,
  onDeleteAccount,
  onRequestDelete,
}: GuestPrivacyVaultProps) {
  const [pin, setPin] = useState<string | null>(initialPin)
  const [isHibernated, setIsHibernated] = useState(false)
  const [summary, setSummary] = useState<HibernationSummary | null>(null)
  const [pinDraft, setPinDraft] = useState('')
  const [pinConfirm, setPinConfirm] = useState('')
  const [pinError, setPinError] = useState<string | null>(null)
  const [unlockDraft, setUnlockDraft] = useState('')
  const [unlockError, setUnlockError] = useState<string | null>(null)
  const [isDeleteConfirmed, setIsDeleteConfirmed] = useState(false)
  const [deletionResult, setDeletionResult] = useState<PdpaDeletionResult | null>(null)
  // Round 4 · Ploy B12: Thai copy in Thai mode (English stays the default the tests read)
  const th = useLanguage().language === 'th'
  const tr = (en: string, thText: string) => (th ? thText : en)

  function handleSavePin() {
    if (!new RegExp(`^\\d{${PIN_LENGTH}}$`).test(pinDraft)) {
      setPinError(tr(`Your vault PIN must be exactly ${PIN_LENGTH} digits.`, `PIN ต้องเป็นตัวเลข ${PIN_LENGTH} หลักพอดี`))
      return
    }
    if (pinDraft !== pinConfirm) {
      setPinError(tr('Those PINs do not match. Please type the same PIN twice.', 'PIN สองช่องไม่ตรงกัน ลองพิมพ์ให้เหมือนกันอีกครั้ง'))
      return
    }
    setPin(pinDraft)
    setPinDraft('')
    setPinConfirm('')
    setPinError(null)
  }

  function handleHibernate() {
    if (pin === null) return
    const createdSummary: HibernationSummary = {
      guestId,
      wipedChats: chatCount,
      wipedNotifications: notificationCount,
      retained,
      hibernatedAt: new Date().toISOString(),
    }
    setSummary(createdSummary)
    setIsHibernated(true)
    setUnlockDraft('')
    setUnlockError(null)
    setIsDeleteConfirmed(false)
    onHibernate?.(createdSummary)
  }

  function handleUnlock() {
    if (pin === null) return
    if (unlockDraft !== pin) {
      setUnlockError(tr('Wrong PIN — please try again.', 'PIN ไม่ถูก ลองอีกครั้งนะ'))
      setUnlockDraft('')
      return
    }
    setUnlockError(null)
    setUnlockDraft('')
    setIsHibernated(false)
    if (summary) {
      onUnlock?.(summary)
    }
  }

  function handleDeleteAccount() {
    if (!isDeleteConfirmed) return
    const deletionInput: PdpaDeletionInput = pdpaUser ?? {
      userId: guestId,
      isBanned: false,
      rawSelfieUrl: null,
      galleryPhotoUrls: [],
      faceVector: [],
    }
    const result = preparePdpaAccountDeletion(deletionInput)
    setDeletionResult(result)
    setIsDeleteConfirmed(false)
    setIsHibernated(false)
    setSummary(null)
    setPin(null)
    setUnlockDraft('')
    setUnlockError(null)
    onDeleteAccount?.(result)
  }

  if (deletionResult) {
    return (
      <section className="mx-auto w-full max-w-md space-y-4 rounded-3xl border border-rose-900/70 bg-stone-900 p-5 shadow-2xl">
        <header>
          <h2 className="text-lg font-extrabold tracking-tight text-rose-200">Account deleted</h2>
          <p role="status" className="mt-1 text-xs text-stone-400">
            Account #{deletionResult.userId} and all raw biometric photos were wiped on{' '}
            {new Date(deletionResult.wipedAt).toLocaleString()}.
          </p>
        </header>
        <ul aria-label="PDPA deletion record" className="space-y-2">
          <li className="rounded-xl border border-stone-700 bg-stone-950 p-3 text-xs text-stone-300">
            Raw selfie photo: deleted
          </li>
          <li className="rounded-xl border border-stone-700 bg-stone-950 p-3 text-xs text-stone-300">
            Gallery photos: deleted
          </li>
          <li className="rounded-xl border border-stone-700 bg-stone-950 p-3 text-xs text-stone-300">
            Fraud-prevention face vector:{' '}
            {deletionResult.retainedFaceVector === null
              ? 'not retained'
              : 'retained hash only (banned account)'}
          </li>
        </ul>
        <p className="text-[11px] text-stone-500">
          Nothing is left to unlock. Install the app again any time to start a fresh verified profile.
        </p>
      </section>
    )
  }

  return (
    <section className="dm-depth-scope dm-depth-root mx-auto w-full max-w-md space-y-4 rounded-3xl border border-stone-800 bg-stone-900 p-5 shadow-2xl">
      <header>
        <h2 className="text-lg font-extrabold tracking-tight">
          {tr('Guest Privacy Vault', 'ตู้เซฟความเป็นส่วนตัว')} <span className="text-amber-400">🛫</span>
        </h2>
        <p className="mt-1 text-xs text-stone-400">
          {tr(
            'Flying home? One tap wipes your local chats and notifications and locks the account behind your PIN. Your verified badge and wallet balance stay safe for your next Bangkok trip.',
            'จะพักการใช้งานสักพัก? แตะเดียวลบแชทและแจ้งเตือนในเครื่อง แล้วล็อกบัญชีด้วย PIN ส่วนเลเวล ป้ายยืนยันตัวตน และยอดเหรียญยังอยู่ครบ',
          )}
        </p>
      </header>

      {pin === null ? (
        <div className="space-y-3 rounded-2xl border border-stone-700 bg-stone-950 p-3">
          <h3 className="text-sm font-bold text-stone-200">{tr(`Set your ${PIN_LENGTH}-digit vault PIN`, `ตั้ง PIN ${PIN_LENGTH} หลัก`)}</h3>
          <p className="text-xs text-stone-400">
            {tr(
              'This PIN locks the vault while you are away. Choose digits you will still remember on your next trip — nobody, including support, can reset it for you.',
              'PIN นี้ล็อกตู้เซฟตอนคุณไม่อยู่ เลือกเลขที่จำได้แน่ๆ เพราะไม่มีใครรีเซ็ตให้ได้ แม้แต่ทีมงาน',
            )}
          </p>
          <div>
            <label htmlFor="vault-pin" className="block text-xs font-medium text-stone-400">
              {tr('Vault PIN', 'PIN ตู้เซฟ')}
            </label>
            <input
              id="vault-pin"
              type="password"
              inputMode="numeric"
              autoComplete="new-password"
              maxLength={PIN_LENGTH}
              value={pinDraft}
              onChange={(event) => setPinDraft(event.target.value.replace(/\D/g, '').slice(0, PIN_LENGTH))}
              className="mt-1 w-full rounded-xl border border-stone-700 bg-stone-950 p-2.5 text-center font-mono text-lg tracking-[0.5em] text-stone-100 focus:border-amber-400 focus:outline-none"
            />
          </div>
          <div>
            <label htmlFor="vault-pin-confirm" className="block text-xs font-medium text-stone-400">
              {tr('Confirm vault PIN', 'ยืนยัน PIN อีกครั้ง')}
            </label>
            <input
              id="vault-pin-confirm"
              type="password"
              inputMode="numeric"
              autoComplete="new-password"
              maxLength={PIN_LENGTH}
              value={pinConfirm}
              onChange={(event) =>
                setPinConfirm(event.target.value.replace(/\D/g, '').slice(0, PIN_LENGTH))
              }
              className="mt-1 w-full rounded-xl border border-stone-700 bg-stone-950 p-2.5 text-center font-mono text-lg tracking-[0.5em] text-stone-100 focus:border-amber-400 focus:outline-none"
            />
          </div>
          {pinError && (
            <p role="alert" className="rounded-xl border border-rose-900 bg-rose-950/60 p-2.5 text-xs font-semibold text-rose-200">
              {pinError}
            </p>
          )}
          <button
            type="button"
            onClick={handleSavePin}
            className="w-full rounded-xl bg-amber-400 px-3 py-2.5 text-xs font-bold text-stone-950 transition-colors hover:bg-amber-300"
          >
            {tr('Save vault PIN', 'บันทึก PIN')}
          </button>
        </div>
      ) : isHibernated ? (
        <div className="space-y-3 rounded-2xl border border-emerald-900/70 bg-emerald-950/30 p-3">
          <h3 className="text-sm font-bold text-emerald-200">{tr('Hibernated — safe travels home', 'พักบัญชีแล้ว · เดินทางปลอดภัยนะ')}</h3>
          {summary && (
            <ul aria-label="Hibernation summary" className="space-y-2">
              <li className="flex items-center justify-between text-xs text-stone-300">
                <span>{tr('Local chats wiped', 'ลบแชทในเครื่อง')}</span>
                <span className="font-bold text-emerald-300">{summary.wipedChats}</span>
              </li>
              <li className="flex items-center justify-between text-xs text-stone-300">
                <span>{tr('Notifications wiped', 'ลบแจ้งเตือน')}</span>
                <span className="font-bold text-emerald-300">{summary.wipedNotifications}</span>
              </li>
              <li className="flex items-center justify-between text-xs text-stone-300">
                <span>{tr('Kept for next trip', 'เก็บไว้ให้ครั้งหน้า')}</span>
                <span className="font-bold text-amber-300">
                  {retained.vipLevel} · ✅ verified · {formatBaht(retained.coinBalance)} balance
                </span>
              </li>
            </ul>
          )}
          <div>
            <label htmlFor="vault-unlock-pin" className="block text-xs font-medium text-stone-400">
              {tr('Enter your vault PIN to unlock', 'ใส่ PIN เพื่อปลดล็อก')}
            </label>
            <input
              id="vault-unlock-pin"
              type="password"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={PIN_LENGTH}
              value={unlockDraft}
              onChange={(event) => setUnlockDraft(event.target.value.replace(/\D/g, '').slice(0, PIN_LENGTH))}
              className="mt-1 w-full rounded-xl border border-stone-700 bg-stone-950 p-2.5 text-center font-mono text-lg tracking-[0.5em] text-stone-100 focus:border-amber-400 focus:outline-none"
            />
          </div>
          {unlockError && (
            <p role="alert" className="rounded-xl border border-rose-900 bg-rose-950/60 p-2.5 text-xs font-semibold text-rose-200">
              {unlockError}
            </p>
          )}
          <button
            type="button"
            onClick={handleUnlock}
            className="w-full rounded-xl bg-amber-400 px-3 py-2.5 text-xs font-bold text-stone-950 transition-colors hover:bg-amber-300"
          >
            {tr('Unlock vault', 'ปลดล็อก')}
          </button>
          {onRequestDelete ? (
            <button
              type="button"
              onClick={onRequestDelete}
              className="w-full rounded-xl bg-rose-950/40 px-3 py-2.5 text-xs font-bold text-rose-200 transition-colors hover:bg-rose-950/70"
            >
              {tr('Delete account', 'ลบบัญชี')}
            </button>
          ) : (
            <DeleteAccountSection
              guestId={guestId}
              isConfirmed={isDeleteConfirmed}
              onConfirmedChange={setIsDeleteConfirmed}
              onDelete={handleDeleteAccount}
            />
          )}
        </div>
      ) : (
        <div className="space-y-3 rounded-2xl border border-stone-700 bg-stone-950 p-3">
          <h3 className="text-sm font-bold text-stone-200">{tr('Vault ready', 'ตู้เซฟพร้อมแล้ว')}</h3>
          <ul aria-label="Vault contents" className="space-y-2">
            <li className="flex items-center justify-between text-xs text-stone-300">
              <span>{tr('Member level', 'สถานะสมาชิก')}</span>
              <span className="font-bold text-amber-300">{retained.vipLevel}</span>
            </li>
            <li className="flex items-center justify-between text-xs text-stone-300">
              <span>{tr('Verified badge', 'ป้ายยืนยันตัวตน')}</span>
              <span className="font-bold text-emerald-300">
                {retained.faceVerified ? tr('Face / Passport ✅', 'ใบหน้า / พาสปอร์ต ✅') : tr('Not verified', 'ยังไม่ยืนยัน')}
              </span>
            </li>
            <li className="flex items-center justify-between text-xs text-stone-300">
              <span>{tr('Wallet balance', 'ยอดในกระเป๋า')}</span>
              <span className="font-bold text-amber-300">
                {formatBaht(retained.coinBalance)}
              </span>
            </li>
          </ul>
          <p className="text-xs text-stone-400">
            {th
              ? `พักบัญชีจะลบแชท ${chatCount} ห้อง และแจ้งเตือน ${notificationCount} รายการออกจากเครื่องนี้ ไม่เหลืออะไรให้ใครแอบอ่าน`
              : `Hibernation wipes ${chatCount} local ${chatCount === 1 ? 'chat' : 'chats'} and ${notificationCount} notifications from this phone. Nothing is left for anyone else to read on your device.`}
          </p>
          <button
            type="button"
            onClick={handleHibernate}
            className="w-full rounded-xl bg-amber-400 px-3 py-2.5 text-xs font-bold text-stone-950 transition-colors hover:bg-amber-300"
          >
            {tr('Airport Hibernation Mode (1-Tap)', 'พักบัญชี (แตะเดียว)')}
          </button>
          {summary && (
            <p className="text-[11px] text-stone-500">
              Last hibernation: {new Date(summary.hibernatedAt).toLocaleString()} · wiped{' '}
              {summary.wipedChats} local chats and {summary.wipedNotifications} notifications.
            </p>
          )}
          {onRequestDelete ? (
            <button
              type="button"
              onClick={onRequestDelete}
              className="w-full rounded-xl bg-rose-950/40 px-3 py-2.5 text-xs font-bold text-rose-200 transition-colors hover:bg-rose-950/70"
            >
              {tr('Delete account', 'ลบบัญชี')}
            </button>
          ) : (
            <DeleteAccountSection
              guestId={guestId}
              isConfirmed={isDeleteConfirmed}
              onConfirmedChange={setIsDeleteConfirmed}
              onDelete={handleDeleteAccount}
            />
          )}
        </div>
      )}
    </section>
  )
}
