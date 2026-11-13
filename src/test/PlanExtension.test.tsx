import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { PlanCard } from '../components/chat/PlanCard'
import { __resetPlanStore, ensureMeetPlan } from '../lib/planStore'

/**
 * KRING FIX2 — paid hourly extensions are removed (founder decision). The ExtendTime tests that lived here were
 * removed with the feature; a time change now goes through the offer card's "Suggest a change" (time).
 */
describe('PlanCard (no hourly extensions)', () => {
  beforeEach(() => {
    __resetPlanStore()
    ensureMeetPlan({ key: 'alex', guest: 'Alex', host: 'Ploy', start: '20:00', priceThb: 1500 })
  })

  it('the plan card shows the held amount in plain words, Directions + Cancel, and never an Extend control', () => {
    const { rerender } = render(
      <PlanCard side="guest" language="en" venue="Yaowarat Rd" startClock="20:00" otherName="Ploy" amountThb={300} amountLine="Comes back if you don't meet" status="yes" planKey="alex" onCancel={() => {}} testId="pc" />,
    )
    expect(screen.getByTestId('pc')).toHaveTextContent('฿300 held')
    expect(screen.getByTestId('pc')).toHaveTextContent("Comes back if you don't meet")
    expect(screen.getByTestId('pc-directions')).toBeInTheDocument()
    expect(screen.getByTestId('pc-cancel')).toBeInTheDocument()
    rerender(<PlanCard side="guest" language="en" venue="Yaowarat Rd" startClock="20:00" otherName="Ploy" amountThb={300} amountLine="x" status="confirmed" planKey="alex" testId="pc" />)
    expect(screen.queryByTestId('pc-cancel')).toBeNull()
    expect(screen.queryByTestId('pc-extend-open')).toBeNull()
    expect(screen.getByTestId('pc')).not.toHaveTextContent(/Extend|ต่อเวลา|\+1 h/)
  })
})
