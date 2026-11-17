/** T301-019 (17 Nov): ?person= carries either a member id (uuid: open that profile) or a name (search People). */
export const isMemberId = (v: string): boolean => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v.trim());
