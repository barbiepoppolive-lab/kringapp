import { describe, it, expect } from 'vitest';
import {
  cosineSimilarity,
  checkDuplicateFaceAccount,
  verifyPhotoMatchesFace,
  preparePdpaAccountDeletion,
  DUPLICATE_ACCOUNT_THRESHOLD,
  PHOTO_FACE_MATCH_THRESHOLD,
} from './faceMatcher';

describe('T-006: Level 2 1-Face = 1-Account & Photo-to-Face Anti-Catfish Engine', () => {
  const realFaceVector = Array.from({ length: 512 }, (_, i) => Math.sin(i * 0.1));
  const samePersonPhotoVector = Array.from({ length: 512 }, (_, i) => Math.sin(i * 0.1 + 0.02));
  const catfishModelVector = Array.from({ length: 512 }, (_, i) => Math.cos(i * 0.7));

  it('computes normalized cosine similarity accurately for 512-dim embeddings', () => {
    expect(cosineSimilarity(realFaceVector, realFaceVector)).toBeCloseTo(1.0, 5);
    const samePersonSim = cosineSimilarity(realFaceVector, samePersonPhotoVector);
    expect(samePersonSim).toBeGreaterThan(0.95);
    const differentPersonSim = cosineSimilarity(realFaceVector, catfishModelVector);
    expect(differentPersonSim).toBeLessThan(0.3);
  });

  it('blocks duplicate account creation when similarity >= 0.85 (1-Face = 1-Account)', () => {
    const existingRegistry = [
      { userId: 'user-existing-1', vector: realFaceVector, isBanned: false },
    ];

    const duplicateAttempt = checkDuplicateFaceAccount(samePersonPhotoVector, existingRegistry);
    expect(duplicateAttempt.isDuplicate).toBe(true);
    expect(duplicateAttempt.matchedUserId).toBe('user-existing-1');
    expect(duplicateAttempt.similarity).toBeGreaterThanOrEqual(DUPLICATE_ACCOUNT_THRESHOLD);

    const newPersonAttempt = checkDuplicateFaceAccount(catfishModelVector, existingRegistry);
    expect(newPersonAttempt.isDuplicate).toBe(false);
    expect(newPersonAttempt.matchedUserId).toBeNull();
  });

  it('verifyPhotoMatchesFace awards Real Face Matched badge (>= 0.80) and rejects catfish photos', () => {
    const validUpload = verifyPhotoMatchesFace(realFaceVector, samePersonPhotoVector);
    expect(validUpload.accepted).toBe(true);
    expect(validUpload.badge).toBe('Real Face Matched ✅');
    expect(validUpload.similarity).toBeGreaterThanOrEqual(PHOTO_FACE_MATCH_THRESHOLD);

    const catfishUpload = verifyPhotoMatchesFace(realFaceVector, catfishModelVector);
    expect(catfishUpload.accepted).toBe(false);
    expect(catfishUpload.reason).toContain('Photo does not match your verified face');
  });

  it('enforces Thai PDPA deletion: wipes raw selfie/photo URLs and keeps ban hash only if banned', () => {
    const normalUserWipe = preparePdpaAccountDeletion({
      userId: 'user-clean',
      isBanned: false,
      rawSelfieUrl: 'https://r2.kringapp.com/selfie-1.jpg',
      galleryPhotoUrls: ['https://r2.kringapp.com/p1.jpg'],
      faceVector: realFaceVector,
    });
    expect(normalUserWipe.rawSelfieUrl).toBeNull();
    expect(normalUserWipe.galleryPhotoUrls).toEqual([]);
    expect(normalUserWipe.retainedFaceVector).toBeNull();

    const bannedUserWipe = preparePdpaAccountDeletion({
      userId: 'user-scammer',
      isBanned: true,
      rawSelfieUrl: 'https://r2.kringapp.com/scammer.jpg',
      galleryPhotoUrls: ['https://r2.kringapp.com/s1.jpg'],
      faceVector: realFaceVector,
    });
    // Raw photos still wiped per PDPA, but non-reversible vector retained on ban-list (D-004)
    expect(bannedUserWipe.rawSelfieUrl).toBeNull();
    expect(bannedUserWipe.galleryPhotoUrls).toEqual([]);
    expect(bannedUserWipe.retainedFaceVector).toHaveLength(512);
  });
});
