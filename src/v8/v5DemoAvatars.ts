/* Example (demo) Reels only: guests get no author photos from kr8_feed (privacy rule for every real member, unchanged).
   These fixed seed posts belong to flagged demo accounts (kring_demo, ids 11111111-1111-4111-8111-*), so the app shows their
   bundled AI cast avatar instead. Matched by exact post id, never by name, so a real member can never pick one up. */
const F = (k: string) => `${import.meta.env.BASE_URL}media/demo/faces/${k}.jpg`;
const DEMO_POST_AVATAR: Record<string, string> = {
  '3670e009-c72f-5795-8481-930752ccf1de': 'mint',     // Bang Pu
  '239b48bf-b829-5f11-960d-8c6c83504367': 'minjun',   // lantern room
  'f6338575-7b5b-537c-825f-af4129a82bbb': 'lena',     // Dusit Arun
  '5e2ce0d6-8bbb-5838-8740-5535ea8d87a3': 'nat',      // fireworks
  '15895572-7901-5bf9-a17a-f02553e2d387': 'aom',      // Benjakitti
  '7c867cb6-eb09-4d4b-8258-df8bc4995ef5': 'yui',      // Yaowarat
  'ea76a274-21c4-5410-8d11-3c45f44b2228': 'ton',      // So Heng Tai
  '7b480493-aa09-55e6-b396-305dd260b439': 'marcus',   // Lumpini
  '6adbfa9b-190b-52a7-a467-60071066fbab': 'ploy',     // Erawan
  '7a93e490-f61b-5716-8fd0-08a356532974': 'valeria',  // Sky Park
};
/** Bundled avatar for a demo seed post, or undefined for every other post. */
export function demoPostAvatar(postId: string): string | undefined {
  const k = DEMO_POST_AVATAR[postId];
  return k ? F(k) : undefined;
}
