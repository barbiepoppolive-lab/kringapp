import { useState } from 'react'
import {
  KRING_DODO_CATALOG,
  KRING_DODO_TEST_CHECKOUT_URL,
  getDodoProductByThbTier,
  type KringDodoProductConfig,
} from '../lib/dodoCatalogConfig'
import TopUpSheet from './wallet/TopUpSheet'

export interface TopUpModalProps {
  open?: boolean
  initialThbAmount?: 750 | 1200 | 1600 | number
  onClose?: () => void
  onSelectDodoCheckout?: (product: KringDodoProductConfig, checkoutUrl: string) => void
}

const DODO_BOOKING_TIERS = [750, 1200, 1600] as const

export function TopUpModal({
  open = true,
  initialThbAmount = 750,
  onClose,
  onSelectDodoCheckout,
}: TopUpModalProps) {
  const [selectedThb, setSelectedThb] = useState<number>(initialThbAmount)
  const [checkoutLaunched, setCheckoutLaunched] = useState<boolean>(false)

  if (!open) return null

  const activeDodoProduct = getDodoProductByThbTier(selectedThb)

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Kring Dodo Global Pass & Card Checkout"
      data-testid="kring-topup-modal"
      data-dodo-product-id={activeDodoProduct.productId}
      data-dodo-sku={activeDodoProduct.sku}
      data-dodo-checkout-url={KRING_DODO_TEST_CHECKOUT_URL}
      style={{
        borderRadius: 20,
        padding: 16,
        background: 'linear-gradient(160deg, #131735 0%, #0B0813 100%)',
        border: '1px solid #FFD067',
        color: '#ffffff',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#FFD067' }}>
            💳 Dodo Global Card &amp; Experience Pass Checkout
          </h3>
          <p style={{ margin: '2px 0 0', fontSize: 12, color: '#b8c0e0' }}>
            No ATM needed — Thai ATMs charge ฿220–250 a withdrawal · +฿25 flat service fee
          </p>
        </div>
        {onClose && (
          <button
            type="button"
            data-testid="topup-modal-close"
            onClick={onClose}
            style={{ background: 'none', border: 0, color: '#ffffff', cursor: 'pointer', fontSize: 16 }}
          >
            ✕
          </button>
        )}
      </div>

      <div
        role="radiogroup"
        aria-label="Experience Pass THB Tier"
        style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 12 }}
      >
        {DODO_BOOKING_TIERS.map((tier) => {
          const prod = getDodoProductByThbTier(tier)
          const isSelected = prod.productId === activeDodoProduct.productId
          return (
            <button
              key={tier}
              type="button"
              role="radio"
              aria-checked={isSelected}
              data-testid={`topup-dodo-tier-${tier}`}
              data-product-id={prod.productId}
              onClick={() => {
                setSelectedThb(tier)
                setCheckoutLaunched(false)
              }}
              style={{
                borderRadius: 12,
                padding: '10px 8px',
                cursor: 'pointer',
                border: isSelected ? '1px solid #FFD067' : '1px solid rgba(255,255,255,0.18)',
                background: isSelected ? 'rgba(255, 178, 30, 0.2)' : 'rgba(255,255,255,0.05)',
                color: isSelected ? '#FFD067' : '#d8dcff',
                fontWeight: 800,
                fontSize: 13,
              }}
            >
              <div>฿{tier.toLocaleString('en-US')}</div>
              <div style={{ fontSize: 10.5, fontWeight: 600, opacity: 0.85 }}>+฿{prod.thbServiceFee} Fee</div>
            </button>
          )
        })}
      </div>

      <div
        data-testid="topup-dodo-active-product"
        data-product-id={activeDodoProduct.productId}
        style={{
          borderRadius: 12,
          padding: '10px 12px',
          background: 'rgba(52, 70, 255, 0.14)',
          border: '1px solid rgba(115, 129, 255, 0.35)',
          marginBottom: 12,
          fontSize: 12.5,
        }}
      >
        <div style={{ fontWeight: 800, color: '#ffffff' }}>{activeDodoProduct.name}</div>
        <div style={{ color: '#FFD067', marginTop: 3 }}>
          Total: ฿{activeDodoProduct.thbTotalAmount.toLocaleString('en-US')} (≈ ₹
          {activeDodoProduct.inrApproxAmount.toLocaleString('en-US')}) · Product ID:{' '}
          <code data-testid="topup-dodo-product-id">{activeDodoProduct.productId}</code>
        </div>
      </div>

      <button
        type="button"
        data-testid="topup-dodo-checkout-btn"
        data-product-id={activeDodoProduct.productId}
        data-checkout-url={KRING_DODO_TEST_CHECKOUT_URL}
        onClick={() => {
          setCheckoutLaunched(true)
          onSelectDodoCheckout?.(activeDodoProduct, KRING_DODO_TEST_CHECKOUT_URL)
        }}
        style={{
          width: '100%',
          borderRadius: 12,
          padding: '11px 16px',
          border: 0,
          fontWeight: 800,
          fontSize: 14,
          cursor: 'pointer',
          background: 'linear-gradient(135deg, #FFB21E 0%, #FFD067 100%)',
          color: '#0B0813',
        }}
      >
        Pay ฿{activeDodoProduct.thbTotalAmount.toLocaleString('en-US')} via Dodo Card / Global Pass
      </button>

      {checkoutLaunched && (
        <p
          data-testid="topup-dodo-checkout-status"
          style={{ margin: '8px 0 0', fontSize: 11.5, color: '#86efac', fontWeight: 700 }}
        >
          ✓ Dodo Checkout Session ready ({activeDodoProduct.productId}) → {KRING_DODO_TEST_CHECKOUT_URL}
        </p>
      )}
    </div>
  )
}

export { KRING_DODO_CATALOG, KRING_DODO_TEST_CHECKOUT_URL, getDodoProductByThbTier, TopUpSheet }
export default TopUpModal
