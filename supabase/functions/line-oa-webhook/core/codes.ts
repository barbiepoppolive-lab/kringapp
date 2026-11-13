// Referral / scout codes: S-xxxx (scouts), C-xxxx (Sup connectors).
// Alphabet avoids look-alikes (0/O, 1/I/L).
export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

export function randomCode(prefix: 'S' | 'C', rand: () => number = secureRandom): string {
  let s = ''
  for (let i = 0; i < 4; i++) s += CODE_ALPHABET[Math.floor(rand() * CODE_ALPHABET.length) % CODE_ALPHABET.length]
  return `${prefix}-${s}`
}

function secureRandom(): number {
  const a = new Uint32Array(1)
  crypto.getRandomValues(a)
  return a[0] / 0x100000000
}

export const CODE_RE = /^[SC]-[A-Z0-9]{4}$/
