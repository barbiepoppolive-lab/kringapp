/**
 * T-006 (Level 2): 1-Face = 1-Account & Automatic Photo-to-Face Matching Engine (D-004, D-013)
 * Uses 512-dimensional face embeddings with cosine similarity.
 */

export const FACE_VECTOR_DIM = 512;
export const DUPLICATE_ACCOUNT_THRESHOLD = 0.85;
export const PHOTO_FACE_MATCH_THRESHOLD = 0.80;

export interface RegisteredFaceEntry {
  userId: string;
  vector: number[];
  isBanned: boolean;
}

export interface DuplicateCheckResult {
  isDuplicate: boolean;
  matchedUserId: string | null;
  isBannedMatch: boolean;
  similarity: number;
}

export interface PhotoMatchResult {
  accepted: boolean;
  similarity: number;
  badge: 'Real Face Matched ✅' | null;
  reason?: string;
}

export function cosineSimilarity(vecA: number[], vecB: number[]): number {
  if (vecA.length !== vecB.length || vecA.length === 0) {
    throw new Error('Face vectors must have identical non-zero dimensions');
  }
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dot += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export function checkDuplicateFaceAccount(
  candidateVector: number[],
  registry: RegisteredFaceEntry[],
  threshold: number = DUPLICATE_ACCOUNT_THRESHOLD
): DuplicateCheckResult {
  let highestSim = 0;
  let matchedEntry: RegisteredFaceEntry | null = null;

  for (const entry of registry) {
    const sim = cosineSimilarity(candidateVector, entry.vector);
    if (sim > highestSim) {
      highestSim = sim;
      matchedEntry = entry;
    }
  }

  if (matchedEntry && highestSim >= threshold) {
    return {
      isDuplicate: true,
      matchedUserId: matchedEntry.userId,
      isBannedMatch: matchedEntry.isBanned,
      similarity: Number(highestSim.toFixed(4)),
    };
  }

  return {
    isDuplicate: false,
    matchedUserId: null,
    isBannedMatch: false,
    similarity: Number(highestSim.toFixed(4)),
  };
}

export function verifyPhotoMatchesFace(
  verifiedLiveVector: number[],
  uploadedPhotoVector: number[],
  threshold: number = PHOTO_FACE_MATCH_THRESHOLD
): PhotoMatchResult {
  const similarity = Number(cosineSimilarity(verifiedLiveVector, uploadedPhotoVector).toFixed(4));
  if (similarity >= threshold) {
    return {
      accepted: true,
      similarity,
      badge: 'Real Face Matched ✅',
    };
  }
  return {
    accepted: false,
    similarity,
    badge: null,
    reason: 'Photo does not match your verified face scan. Please upload an authentic photo of yourself.',
  };
}

export interface PdpaDeletionInput {
  userId: string;
  isBanned: boolean;
  rawSelfieUrl: string | null;
  galleryPhotoUrls: string[];
  faceVector: number[];
}

export interface PdpaDeletionResult {
  userId: string;
  rawSelfieUrl: null;
  galleryPhotoUrls: [];
  retainedFaceVector: number[] | null;
  wipedAt: string;
}

/**
 * Enforces Thai PDPA compliance (D-004, D-013):
 * Immediately deletes all raw selfie and gallery photos on account deletion.
 * Only retains the non-reversible mathematical vector if the user was banned for fraud/safety violations.
 */
export function preparePdpaAccountDeletion(input: PdpaDeletionInput): PdpaDeletionResult {
  return {
    userId: input.userId,
    rawSelfieUrl: null,
    galleryPhotoUrls: [],
    retainedFaceVector: input.isBanned ? [...input.faceVector] : null,
    wipedAt: new Date().toISOString(),
  };
}
