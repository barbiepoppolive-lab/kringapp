/**
 * Module-scoped Trusted Wallet Event Bus & Atomic Spend Helper (BUG-001, BUG-002 & BUG-017 Defense).
 *
 * Why this exists:
 * 1. Raw `window.dispatchEvent(new CustomEvent('chon:wallet-delta', ...))` from the
 *    browser DevTools console can never be trusted. Only events constructed and
 *    registered inside this module's private `WeakSet<Event>` via
 *    `dispatchInternalWalletDelta` are accepted by `App.tsx`.
 * 2. Every spend path must use `trySpendPaidCoins` so that an overspend (`cost > balance`)
 *    is rejected cleanly (`ok: false, nextPaidCoins: currentPaidCoins`) and NEVER
 *    clamps a smaller balance down to `0` (`Math.max(0, ...)`).
 */

export interface WalletDeltaDetail {
  paidDelta?: number;
  bonusDelta?: number;
  note?: string;
  hideGlobal?: boolean;
  allowEscrowRefund?: boolean;
  /** set by the App wallet handler: true when the delta was applied, false when rejected (insufficient balance / blocked mint) */
  accepted?: boolean;
  /** set by the App handler when a bundled paid spend was rejected (so the bonus is not paid) */
  paidSpendRejected?: boolean;
}

export interface TrySpendResult {
  ok: boolean;
  nextPaidCoins: number;
}

const TRUSTED_WALLET_EVENTS = new WeakSet<Event>();

export function dispatchInternalWalletDelta(detail: WalletDeltaDetail): boolean {
  if (typeof window === 'undefined') return false;
  const event = new CustomEvent<WalletDeltaDetail>('chon:wallet-delta', { detail });
  TRUSTED_WALLET_EVENTS.add(event);
  window.dispatchEvent(event);
  // dispatchEvent is synchronous: the App handler has already written `accepted`.
  // No handler mounted (unit tests rendering a tab alone) → treat as accepted so local demo flows still run.
  return detail.accepted !== false;
}

export function isTrustedWalletEvent(event: Event): boolean {
  return TRUSTED_WALLET_EVENTS.has(event);
}

export function trySpendPaidCoins(currentPaidCoins: number, costCoins: number): TrySpendResult {
  if (!Number.isFinite(costCoins) || costCoins <= 0) {
    return { ok: false, nextPaidCoins: currentPaidCoins };
  }
  if (currentPaidCoins < costCoins) {
    return { ok: false, nextPaidCoins: currentPaidCoins };
  }
  return {
    ok: true,
    nextPaidCoins: currentPaidCoins - costCoins,
  };
}
