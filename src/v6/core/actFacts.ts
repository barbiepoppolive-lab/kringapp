/* Activity facts overlay (area E): what the guest needs to judge an activity before booking, kept next to the demo
   activity rows in data.ts (area A) until the host's own listing carries these fields.
   walkKm: about how far the group walks · stairs: none / some / many · pace: easy / moderate / active
   inc / notInc: string keys (af_*) for what the host price covers and what the guest pays for themselves. */
import { t, type Act } from './data'

export type Stairs = 'none' | 'some' | 'many'
export type Pace = 'easy' | 'moderate' | 'active'
export interface ActFacts { walkKm: number; stairs: Stairs; pace: Pace; inc: string[]; notInc: string[] }

export const ACT_FACTS: Record<string, ActFacts> = {
  eat: { walkKm: 2, stairs: 'none', pace: 'easy', inc: ['af_taste56', 'af_water'], notInc: ['af_n_drinks', 'af_n_extra', 'af_n_transport'] },
  muay: { walkKm: 0.5, stairs: 'none', pace: 'active', inc: ['af_gloves', 'af_water'], notInc: ['af_n_food', 'af_n_transport'] },
  market: { walkKm: 1.5, stairs: 'none', pace: 'easy', inc: ['af_garland', 'af_water'], notInc: ['af_n_food', 'af_n_drinks', 'af_n_transport'] },
  river: { walkKm: 1, stairs: 'some', pace: 'moderate', inc: ['af_bike', 'af_boat', 'af_water'], notInc: ['af_n_food', 'af_n_drinks', 'af_n_transport'] },
  temple: { walkKm: 1.5, stairs: 'some', pace: 'easy', inc: ['af_photo', 'af_water'], notInc: ['af_n_food', 'af_n_drinks', 'af_n_entry', 'af_n_transport'] },
  oldtown: { walkKm: 2, stairs: 'none', pace: 'easy', inc: ['af_walkOnly'], notInc: ['af_n_food', 'af_n_drinks', 'af_n_transport'] },
  night: { walkKm: 1.5, stairs: 'none', pace: 'easy', inc: ['af_taste45', 'af_water'], notInc: ['af_n_drinks', 'af_n_extra', 'af_n_transport'] },
  cafe: { walkKm: 1.5, stairs: 'some', pace: 'easy', inc: ['af_desserts'], notInc: ['af_n_drinks', 'af_n_extra', 'af_n_transport'] },
  cook: { walkKm: 0, stairs: 'none', pace: 'easy', inc: ['af_ingr', 'af_recipe', 'af_water'], notInc: ['af_n_drinks', 'af_n_transport'] },
}
/** Facts for an activity; a host listing without them says so plainly instead of guessing. */
export const factsOf = (a: Act): ActFacts | null => ACT_FACTS[a.id] || null

/** "Walking: about 1.5 km · Stairs: some · Pace: easy" */
export function factsLine(f: ActFacts): string {
  const walk = f.walkKm <= 0.2 ? t('af_walk0') : t('af_walk', { km: f.walkKm })
  return [walk, t('af_stairs', { s: t('af_st_' + f.stairs) }), t('af_pace', { p: t('af_p_' + f.pace) })].join(' · ')
}
