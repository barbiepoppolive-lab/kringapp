/**
 * Optional gender on the Kring card (founder, 15 Nov 2026): Male · Female · Kathoey · Prefer not to say.
 * Never pre-filled, never needed to make a card, shown to others only when the member switches "Show on my card" on.
 * Not used for ranking, rewards, People or the feed. The database keeps those rules (migration 0050).
 */
export type Gender = 'male' | 'female' | 'kathoey';
export const GENDERS: readonly Gender[] = ['male', 'female', 'kathoey'] as const;
/** English is the key; Thai is in KX_L (ชาย · หญิง · กะเทย). */
export const GENDER_LABEL: Record<Gender, string> = { male: 'Male', female: 'Female', kathoey: 'Kathoey' };
export const isGender = (g: unknown): g is Gender => typeof g === 'string' && (GENDERS as readonly string[]).includes(g);
/** What goes to the server: no gender means "show" is off too. */
export const genderPayload = (g: Gender | null, show: boolean): { gender: Gender | null; show: boolean } => ({ gender: g, show: !!g && show });
/** What other people may see on the card: the value only when the member chose to show it. */
export const shownGender = (c: { gender?: string | null; show_gender?: boolean | null } | null | undefined): Gender | null =>
  (c && c.show_gender === true && isGender(c.gender) ? c.gender : null);

type Tx = (en: string) => string;

/** required (26 Nov, founder): new cards must pick one; no "Prefer not to say", a tapped chip can't be un-picked. */
export function GenderRow(props: { L: Tx; value: Gender | null; show: boolean; onChange: (g: Gender | null, show: boolean) => void; disabled?: boolean; required?: boolean; missing?: boolean }) {
  const { L, value, show } = props;
  return (
    <div className="kx-gender" id="kxGender" role="group" aria-labelledby="kxGenderLab">
      <span className="kx-lab" id="kxGenderLab">{L('I am')}</span>
      <div className="kx-chips kx-gchips">
        {GENDERS.map((g) => (
          <button key={g} type="button" data-gender={g} aria-pressed={value === g} className={value === g ? 'on' : ''} disabled={props.disabled}
            onClick={() => props.onChange(value === g && !props.required ? null : g, value === g && !props.required ? false : show)}>{L(GENDER_LABEL[g])}</button>
        ))}
        {props.required ? null : <button type="button" data-gender="none" aria-pressed={value === null} className={value === null ? 'on' : ''} disabled={props.disabled}
          onClick={() => props.onChange(null, false)}>{L('Prefer not to say')}</button>}
      </div>
      <label className={`kx-gshow${value ? '' : ' off'}`}>
        <input type="checkbox" id="kxGenderShow" checked={!!value && show} disabled={!value || props.disabled} onChange={(e) => props.onChange(value, e.target.checked)} />
        <i aria-hidden="true" /><span>{L('Show on my card')}</span>
      </label>
      {props.required
        ? <p className={`kx-gnote${props.missing ? ' kx-gmiss' : ''}`} id="kxGenderNote" role={props.missing ? 'alert' : undefined}>{L('Required. You choose whether it shows on your card.')}</p>
        : <p className="kx-gnote" id="kxGenderNote">{L('Optional. You choose whether it shows on your card.')}</p>}
    </div>
  );
}

/** The small chip on a card / profile. Renders nothing unless there is a value to show. */
export function GenderChip(props: { L: Tx; gender: string | null | undefined }) {
  return isGender(props.gender) ? <span className="kx-gchip" data-gender-chip={props.gender}>{props.L(GENDER_LABEL[props.gender])}</span> : null;
}
