/**
 * Instagram DM drafts for the admin "Replies to send" queue.
 * T-301 (T301-006): the personal outreach drafts (handles, names, old prize figure) were bundled into the PUBLIC admin
 * JavaScript, so anyone could read them. They are removed from the app; drafts are written and kept outside the bundle.
 * The queue simply shows no Instagram cards until drafts come from a protected source.
 */
export type IgDm = { h: string; tier: string; followers: string; niche: string; ref: string; th: string; en: string };
export const IG_TOP: IgDm[] = [];
