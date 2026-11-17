import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { isMemberId } from './deepLink';

describe('T301-019 ?person= deep link', () => {
  it('a member uuid is an id; a name is not', () => {
    expect(isMemberId('3f7791e9-ddb4-549b-9e5c-99fc9435ad34')).toBe(true);
    expect(isMemberId('3F7791E9-DDB4-549B-9E5C-99FC9435AD34')).toBe(true);
    for (const v of ['Arm', 'arm-3f77', '', '3f7791e9ddb4549b9e5c99fc9435ad34']) expect(isMemberId(v)).toBe(false);
  });
  it('the app opens the profile for an id and only searches People for a name', () => {
    const src = fs.readFileSync(path.join(__dirname, 'KringAppV8.tsx'), 'utf8');
    expect(src).toMatch(/personParam && isMemberId\(personParam\)[\s\S]{0,200}setDeepPersonId/);
    expect(src).toMatch(/void openProfile\(id\);\n  \}, \[deepPersonId, live, v5AuthReady\]\)/);
  });
});
