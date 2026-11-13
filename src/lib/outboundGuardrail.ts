/**
 * TypeScript Outbound Communication Guardrail (v4.0 — Opus 5.5 Pass-1 Enforced)
 */
export interface OutboundGuardRule {
  pattern: RegExp;
  reason: string;
}

export const FORBIDDEN_OUTBOUND_PATTERNS: OutboundGuardRule[] = [
  {
    pattern: /\b(zoom|google\s*meet|calendly|teams\s*call|video\s*call|jump\s*on\s*a\s*(?:quick\s*|brief\s*)?call|schedule\s*a\s*call|\d+\s*-?\s*minute\s*call|phone\s*call)\b/i,
    reason: 'Founder Red Line: Never schedule or propose any call, Zoom, or Google Meet with partners or hosts. Everything must be closed on text.'
  },
  {
    pattern: /escrow|held in|hold(s|ing) (the )?(funds|money)|payout ledger|\b\d{1,2}\s?%\s?(margin|commission|cut)|USDT|TRC-?20|ERC-?20|\b\d{1,3}(\.\d+){3}\b|Rocker|Ploy|Nirav|9000966360/i,
    reason: 'Opus 5.5 A.10 Guardrail: Forbidden money/escrow wording, commission %, crypto/USDT, server IP, invented staff names (Rocker/Ploy/Nirav), or unverified phone number.'
  },
  {
    pattern: /\b(lucky\s*pool|lucky\s*chon|7-?eleven\s*barcode|lounge\s*fireworks|champagne\s*tower)\b/i,
    reason: 'v3.0 Blueprint Guard: Never reference killed features.'
  },
  {
    pattern: /\b(800\s*[-–to]+\s*1,?500\s*(?:baht|thb)|฿\s*800\s*[-–to]+\s*฿?\s*1,?500|keep\s+up\s+to\s+85%|start\s+tomorrow)\b/i,
    reason: 'Opus 5.5 & Founder Guard: Never put fixed 800-1500 Baht amounts, unverified 85% host splits, or "start tomorrow" pressure in outreach.'
  }
];

export const APPROVED_MESSAGE_IDS = new Set<string>([]);

export function validateOutboundMessage(
  subject: string,
  bodyHtmlOrText: string,
  options: { dryRun?: boolean; messageId?: string } = {}
): void {
  const combined = `${subject || ''}\n${bodyHtmlOrText || ''}`;
  for (const rule of FORBIDDEN_OUTBOUND_PATTERNS) {
    const match = combined.match(rule.pattern);
    if (match) {
      throw new Error(`[OUTBOUND_GUARDRAIL_BLOCKED] Matched "${match[0]}" — ${rule.reason}`);
    }
  }
  if (!options.dryRun && (!options.messageId || !APPROVED_MESSAGE_IDS.has(options.messageId))) {
    throw new Error(
      `[OUTBOUND_GUARDRAIL_DRY_RUN_DEFAULT] Sending by script is disabled per Opus 5.5 Section C. Message "${options.messageId || 'unnamed'}" must be approved in tickets/outbox/ and sent from the native mailbox thread.`
    );
  }
}
