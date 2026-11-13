import { useState } from 'react'
import {
  KRING_DODO_CATALOG,
  KRING_DODO_TEST_CHECKOUT_URL,
  type KringDodoProductConfig,
} from '../lib/dodoCatalogConfig'

export type B2BPartnerPlanId = 'venue-pin-1990' | 'featured-slot-3990'

export interface B2BPartnerPitchModalProps {
  open?: boolean
  initialPlan?: B2BPartnerPlanId
  onClose?: () => void
  onSelectB2BCheckout?: (product: KringDodoProductConfig, checkoutUrl: string) => void
}

export function B2BPartnerPitchModal({
  open = true,
  initialPlan = 'venue-pin-1990',
  onClose,
  onSelectB2BCheckout,
}: B2BPartnerPitchModalProps) {
  const [selectedPlan, setSelectedPlan] = useState<B2BPartnerPlanId>(initialPlan)
  const [activatedProduct, setActivatedProduct] = useState<KringDodoProductConfig | null>(null)

  if (!open) return null

  const venuePinProduct = KRING_DODO_CATALOG.KRING_B2B_VENUE_PIN_1990_MO
  const featuredSlotProduct = KRING_DODO_CATALOG.KRING_B2B_FEATURED_SLOT_3990_MO
  const activeProduct = selectedPlan === 'featured-slot-3990' ? featuredSlotProduct : venuePinProduct

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Kring B2B Founding Partner Pin & Featured Slot"
      data-testid="b2b-partner-pitch-modal"
      data-dodo-product-id={activeProduct.productId}
      data-dodo-sku={activeProduct.sku}
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
            🏛️ Kring B2B Partner Network · Bangkok &amp; Pattaya
          </h3>
          <p style={{ margin: '2px 0 0', fontSize: 12, color: '#b8c0e0' }}>
            Upfront agreed B2B net rate paid before travel date · Zero street touts
          </p>
        </div>
        {onClose && (
          <button
            type="button"
            data-testid="b2b-modal-close"
            onClick={onClose}
            style={{ background: 'none', border: 0, color: '#ffffff', cursor: 'pointer', fontSize: 16 }}
          >
            ✕
          </button>
        )}
      </div>

      <div
        role="radiogroup"
        aria-label="B2B Partner Plan"
        style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}
      >
        <button
          type="button"
          role="radio"
          aria-checked={selectedPlan === 'venue-pin-1990'}
          data-testid="b2b-plan-venue-pin-1990"
          data-product-id={venuePinProduct.productId}
          onClick={() => {
            setSelectedPlan('venue-pin-1990')
            setActivatedProduct(null)
          }}
          style={{
            borderRadius: 14,
            padding: 12,
            textAlign: 'left',
            cursor: 'pointer',
            border: selectedPlan === 'venue-pin-1990' ? '1px solid #FFD067' : '1px solid rgba(255,255,255,0.18)',
            background: selectedPlan === 'venue-pin-1990' ? 'rgba(255, 178, 30, 0.18)' : 'rgba(255,255,255,0.05)',
            color: '#ffffff',
          }}
        >
          <div style={{ fontSize: 11, fontWeight: 800, color: '#FFD067' }}>
            📍 Founding Venue Pin · {venuePinProduct.trialPeriodDays}-Day Free Trial
          </div>
          <div style={{ fontSize: 16, fontWeight: 800, marginTop: 4 }}>
            ฿{venuePinProduct.thbBaseAmount.toLocaleString('en-US')}/mo
          </div>
          <div style={{ fontSize: 10.5, color: '#b8c0e0', marginTop: 4 }}>
            ID: <code>{venuePinProduct.productId}</code>
          </div>
        </button>

        <button
          type="button"
          role="radio"
          aria-checked={selectedPlan === 'featured-slot-3990'}
          data-testid="b2b-plan-featured-slot-3990"
          data-product-id={featuredSlotProduct.productId}
          onClick={() => {
            setSelectedPlan('featured-slot-3990')
            setActivatedProduct(null)
          }}
          style={{
            borderRadius: 14,
            padding: 12,
            textAlign: 'left',
            cursor: 'pointer',
            border: selectedPlan === 'featured-slot-3990' ? '1px solid #FFD067' : '1px solid rgba(255,255,255,0.18)',
            background: selectedPlan === 'featured-slot-3990' ? 'rgba(52, 70, 255, 0.28)' : 'rgba(255,255,255,0.05)',
            color: '#ffffff',
          }}
        >
          <div style={{ fontSize: 11, fontWeight: 800, color: '#FFD067' }}>
            ⭐ #1 Featured Deals Slot
          </div>
          <div style={{ fontSize: 16, fontWeight: 800, marginTop: 4 }}>
            ฿{featuredSlotProduct.thbBaseAmount.toLocaleString('en-US')}/mo
          </div>
          <div style={{ fontSize: 10.5, color: '#b8c0e0', marginTop: 4 }}>
            ID: <code>{featuredSlotProduct.productId}</code>
          </div>
        </button>
      </div>

      <div
        data-testid="b2b-active-product-summary"
        data-product-id={activeProduct.productId}
        style={{
          borderRadius: 12,
          padding: '10px 12px',
          background: 'rgba(52, 70, 255, 0.12)',
          border: '1px solid rgba(115, 129, 255, 0.3)',
          marginBottom: 12,
          fontSize: 12,
        }}
      >
        <div style={{ fontWeight: 800 }}>{activeProduct.name}</div>
        <div style={{ color: '#FFD067', marginTop: 3 }}>
          Dodo Product ID: <code data-testid="b2b-active-product-id">{activeProduct.productId}</code>
        </div>
      </div>

      <button
        type="button"
        data-testid="b2b-activate-dodo-btn"
        data-product-id={activeProduct.productId}
        data-checkout-url={KRING_DODO_TEST_CHECKOUT_URL}
        onClick={() => {
          setActivatedProduct(activeProduct)
          onSelectB2BCheckout?.(activeProduct, KRING_DODO_TEST_CHECKOUT_URL)
        }}
        style={{
          width: '100%',
          borderRadius: 12,
          padding: '11px 16px',
          border: 0,
          fontWeight: 800,
          fontSize: 13.5,
          cursor: 'pointer',
          background: 'linear-gradient(135deg, #FFB21E 0%, #FFD067 100%)',
          color: '#0B0813',
        }}
      >
        {selectedPlan === 'venue-pin-1990'
          ? 'Start 30-Day Free Founding Pin Trial (฿1,990/mo after)'
          : 'Activate #1 Featured Tourist Deal Slot · ฿3,990/mo'}
      </button>

      {activatedProduct && (
        <p
          data-testid="b2b-activated-status"
          style={{ margin: '8px 0 0', fontSize: 11.5, color: '#86efac', fontWeight: 700 }}
        >
          ✓ Provisioned {activatedProduct.productId} via {KRING_DODO_TEST_CHECKOUT_URL}
        </p>
      )}
    </div>
  )
}

export default B2BPartnerPitchModal
