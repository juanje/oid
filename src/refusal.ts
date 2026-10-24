/** oid's answer to an attempt it does not accept (NFR-01). */
export interface Refusal {
  failed: string;
  evidence: string;
  next: string;
}

export function formatRefusal(refusal: Refusal): string {
  return `Refused: ${refusal.failed}\nEvidence:\n${refusal.evidence}\nNext: ${refusal.next}\n`;
}
