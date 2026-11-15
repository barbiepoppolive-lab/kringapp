import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, fireEvent, waitFor } from '@testing-library/react';
import fs from 'node:fs';
import path from 'node:path';
import { detectLang, firstOf, geminiPrompt, geminiProvider, handle, iappProvider, isLang, mask, nothingToTranslate, TARGETS, tidy, unmask, type Claim, type Deps, type Provider } from '../../supabase/functions/kr8-translate/core';
import { KX_L } from './v5Strings';

const liveMock = vi.hoisted(() => ({ rpc: vi.fn(), session: { access_token: 'tok' } as { access_token: string } | null }));
vi.mock('./v5Live', () => ({ v5Client: async () => ({ auth: { getSession: async () => ({ data: { session: liveMock.session } }) }, rpc: liveMock.rpc }) }));
import { _resetDevice, deviceSupported, needing, readerLang, serverTranslate, useChatTranslate, type ChatMsg } from './v5Translate';

const them = (id: string, text: string): ChatMsg => ({ id, sender: 'them', text });
const me = (id: string, text: string): ChatMsg => ({ id, sender: 'me', text });
const okFetch = (body: unknown, status = 200) => vi.fn(async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;
afterEach(() => { cleanup(); vi.unstubAllGlobals(); _resetDevice(); localStorage.clear(); });
beforeEach(() => { liveMock.rpc.mockReset(); liveMock.rpc.mockResolvedValue({ data: [], error: null }); liveMock.session = { access_token: 'tok' }; });

describe('which language is this message in', () => {
  it('Thai chat lines with slang and particles are Thai', () => {
    for (const s of ['แก ว่างป่ะ', 'ได้เลยน้า เจอกันหน้า BTS อารีย์ 6 โมงนะ', '555 ตลกอ่ะ', 'โอเคค่ะ 👍']) expect(detectLang(s)).toBe('th');
  });
  it('other scripts are certain; Japanese is not mistaken for Chinese', () => {
    expect(detectLang('今晚有空吗？')).toBe('zh');
    expect(detectLang('今晩ひま？一緒に行かない？')).toBe('ja');
    expect(detectLang('오늘 저녁에 시간 돼?')).toBe('ko');
    expect(detectLang('आज शाम को मिलते हैं')).toBe('hi');
    expect(detectLang('Привет, как дела')).toBe('ru');
    expect(detectLang('مرحبا كيف حالك')).toBe('ar');
  });
  it('Latin letters count as English unless the sender\'s card says another Latin-script language and no English', () => {
    expect(detectLang('lol yes, count me in')).toBe('en');
    expect(detectLang('on se retrouve à six heures', ['FR'])).toBe('fr');
    expect(detectLang('see you at six', ['FR', 'EN'])).toBe('en');
    expect(detectLang('Hẹn gặp bạn lúc sáu giờ nhé')).toBe('vi');
  });
  it('nothing to translate: laughter numbers, emoji, a bare link', () => {
    for (const s of ['555', '👍👍', '  ', 'https://maps.app.goo.gl/abc', '6?']) expect(detectLang(s)).toBeNull();
  });
  it('the 14 card languages are the accepted targets', () => {
    expect([...TARGETS].sort()).toEqual(['ar', 'de', 'en', 'es', 'fr', 'hi', 'id', 'ja', 'ko', 'ms', 'ru', 'th', 'vi', 'zh']);
    expect(isLang('xx')).toBe(false); expect(isLang('TH')).toBe(false);
  });
});

describe('what leaves for the provider', () => {
  it('phone numbers, emails, links, @handles and the brand are swapped out and put back', () => {
    const src = 'โทรมา 081-234-5678 หรือแอด @mint.bkk เมล a.b@x.co ดู https://kringapp.com/r/abc ใน กริ๊ง! นะ';
    const { masked, parts } = mask(src);
    expect(masked).not.toMatch(/081|mint\.bkk|a\.b@x\.co|kringapp\.com|กริ๊ง/);
    expect(parts.length).toBe(5);
    expect(unmask(masked, parts)).toBe(src);
    const back = unmask(masked.replace(/[\u0E00-\u0E7F]+/g, 'word'), parts)!;            // a "translation" that kept every placeholder
    for (const x of ['081-234-5678', '@mint.bkk', 'a.b@x.co', 'https://kringapp.com/r/abc', 'กริ๊ง!']) expect(back).toContain(x);
  });
  it('a translation that lost or invented a placeholder is not trusted', () => {
    const { parts } = mask('call 0812345678 now');
    expect(unmask('call now', parts)).toBeNull();
    expect(unmask('call [[1]] or [[2]]', parts)).toBeNull();
  });
  it('a line that is only a number or a link is not sent at all', () => {
    expect(nothingToTranslate(mask('0812345678').masked)).toBe(true);
    expect(nothingToTranslate(mask('555 😂').masked)).toBe(true);
    expect(nothingToTranslate(mask('ไปกัน 6 โมง').masked)).toBe(false);
  });
  it('machine Thai\'s "คะ/ครับ" hedge is tidied away; other languages untouched', () => {
    expect(tidy('แล้วเวลาไหนสะดวกสำหรับคุณคะ/ครับ?', 'th')).toBe('แล้วเวลาไหนสะดวกสำหรับคุณ?');
    expect(tidy('โทรหาฉันที่ [[1]] นะคะ/นะครับ', 'th')).toBe('โทรหาฉันที่ [[1]] นะ');
    expect(tidy('เยี่ยมเลยค่ะ/ครับ ฉันอาจจะมาสาย', 'th')).toBe('เยี่ยมเลย ฉันอาจจะมาสาย');
    expect(tidy('either/or works', 'en')).toBe('either/or works');
  });
  it('the iApp call: form fields, key in the header, text out; errors and timeouts give null', async () => {
    const f = vi.fn(async (_u: string, o: RequestInit) => { expect((o.headers as Record<string, string>).apikey).toBe('KEY'); const b = o.body as FormData; expect([b.get('text'), b.get('source_lang'), b.get('target_lang')]).toEqual(['สวัสดี', 'th', 'en']);
      return new Response(JSON.stringify({ translation: ' Hello ' }), { status: 200 }); });
    expect(await iappProvider('KEY', f as unknown as typeof fetch).translate('สวัสดี', 'th', 'en')).toBe('Hello');
    expect(await iappProvider('KEY', okFetch({ message: 'no credit' }, 402)).translate('x', 'th', 'en')).toBeNull();
    expect(await iappProvider('KEY', (async () => { throw new Error('net'); }) as unknown as typeof fetch).translate('x', 'th', 'en')).toBeNull();
    expect(await iappProvider('KEY', okFetch({ translation: '' })).translate('x', 'th', 'en')).toBeNull();
  });
});

describe('the server function\'s decision (provider and database mocked)', () => {
  const prov = (out: string | null): Provider & { translate: ReturnType<typeof vi.fn> } => ({ name: 'iapp', translate: vi.fn(async () => out) });
  const deps = (claim: Claim | null, p: Provider | null, userId: string | null = 'u1'): Deps & { store: ReturnType<typeof vi.fn>; claim: ReturnType<typeof vi.fn> } =>
    ({ userId, claim: vi.fn(async () => claim), store: vi.fn(async () => undefined), provider: p });
  it('not signed in → 401, the database is not even asked', async () => {
    const d = deps({ status: 'go', text: 'แก ว่างป่ะ' }, prov('x'), null);
    expect(await handle({ message_id: 5, target: 'en' }, d)).toEqual({ http: 401, body: { status: 'sign_in' } });
    expect(d.claim).not.toHaveBeenCalled();
  });
  it('not in that chat → 403 with no text; the provider is never called', async () => {
    const p = prov('x'); const d = deps({ status: 'forbidden' }, p);
    expect(await handle({ message_id: 5, target: 'en' }, d)).toEqual({ http: 403, body: { status: 'forbidden' } });
    expect(p.translate).not.toHaveBeenCalled();
  });
  it('bad input → 400', async () => {
    for (const bad of [{ message_id: 'x', target: 'en' }, { message_id: 5, target: 'xx' }, { message_id: 0, target: 'en' }, {}]) expect((await handle(bad, deps(null, null))).http).toBe(400);
  });
  it('already translated → served from the store, provider not called', async () => {
    const p = prov('x'); const d = deps({ status: 'cached', text: 'Are you free?', source: 'th' }, p);
    expect(await handle({ message_id: 5, target: 'en' }, d)).toEqual({ http: 200, body: { status: 'ok', text: 'Are you free?', source: 'th', via: 'cache' } });
    expect(p.translate).not.toHaveBeenCalled();
  });
  it('go → masked text to the provider, protected parts put back, result stored once', async () => {
    const p = prov('Call [[1]], are you free tonight?'); const d = deps({ status: 'go', text: 'โทร 0812345678 นะ แก ว่างป่ะ เย็นนี้', sender_langs: ['TH'] }, p);
    const r = await handle({ message_id: 7, target: 'en' }, d);
    expect(p.translate).toHaveBeenCalledWith('โทร [[1]] นะ แก ว่างป่ะ เย็นนี้', 'th', 'en');
    expect(r.body).toEqual({ status: 'ok', text: 'Call 0812345678, are you free tonight?', source: 'th', via: 'iapp' });
    expect(d.store).toHaveBeenCalledWith(7, 'en', 'th', 'iapp', 'Call 0812345678, are you free tonight?');
  });
  it('message already in the reader\'s language, or nothing to translate → "same", provider not called', async () => {
    const p = prov('x');
    expect((await handle({ message_id: 5, target: 'th' }, deps({ status: 'go', text: 'ไปกันเลย' }, p))).body.status).toBe('same');
    expect((await handle({ message_id: 5, target: 'en' }, deps({ status: 'go', text: '555' }, p))).body.status).toBe('same');
    expect(p.translate).not.toHaveBeenCalled();
  });
  it.each(['limit_minute', 'limit_member', 'limit_day'])('%s → 429, no text', async (s) => {
    const p = prov('x');
    expect(await handle({ message_id: 5, target: 'en' }, deps({ status: s }, p))).toEqual({ http: 429, body: { status: s } });
    expect(p.translate).not.toHaveBeenCalled();
  });
  it('switched off / too long / own message → said plainly, provider not called', async () => {
    for (const s of ['off', 'too_long', 'own']) expect(await handle({ message_id: 5, target: 'en' }, deps({ status: s }, prov('x')))).toEqual({ http: 200, body: { status: s } });
  });
  it('provider down, no key, a broken answer or the database down → "unavailable", never an error page, nothing stored', async () => {
    const go: Claim = { status: 'go', text: 'แก ว่างป่ะ' };
    for (const d of [deps(go, prov(null)), deps(go, null), deps(null, prov('x')), deps({ status: 'go', text: 'โทร 0812345678 นะแก' }, prov('call me'))]) {
      const r = await handle({ message_id: 5, target: 'en' }, d);
      expect(r.http).toBe(200); expect(r.body.status).toBe('unavailable'); expect(r.body.text).toBeUndefined(); expect(String(r.body.why)).toMatch(/^[a-z0-9.:,-]*$/i);
      expect(d.store).not.toHaveBeenCalled();
    }
  });
  it('the answer never carries the original message', async () => {
    const r = await handle({ message_id: 5, target: 'en' }, deps({ status: 'go', text: 'ความลับของฉัน' }, prov('my secret')));
    expect(JSON.stringify(r)).not.toContain('ความลับ');
  });
  it('the function file logs numbers only, and the key is read on the server only', () => {
    const fn = fs.readFileSync(path.join(__dirname, '../../supabase/functions/kr8-translate/index.ts'), 'utf8');
    const logs = [...fn.matchAll(/console\.(log|error|warn)\(([^;]*)\);/g)].map((m) => m[2]);
    expect(logs.length).toBe(1);
    expect(logs[0]).not.toMatch(/\btext\b|body\.text|input\.text|res\.body\.text/);
    expect(fn).toContain('Deno.env.get("IAPP_API_KEY")');
    for (const f of ['v5Translate.ts', 'KringAppV8.tsx']) expect(fs.readFileSync(path.join(__dirname, f), 'utf8')).not.toMatch(/IAPP|api\.iapp\.co\.th/);
  });
});

describe('the Gemini provider and the spare', () => {
  const reply = (text: string, status = 200) => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }), { status });
  it('sends the key in a header (never in the address), the message as data, and returns the bare translation', async () => {
    const f = vi.fn(async (..._a: unknown[]) => reply('"Are you free tonight?"'));
    const out = await geminiProvider('KEY', 'gemini-2.5-flash-lite', f as unknown as typeof fetch).translate('แก ว่างป่ะ', 'th', 'en');
    expect(out).toBe('Are you free tonight?');
    const [url, init] = f.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/models/gemini-2.5-flash-lite:generateContent'); expect(url).not.toContain('KEY');
    expect((init.headers as Record<string, string>)['x-goog-api-key']).toBe('KEY');
    const body = JSON.parse(String(init.body));
    expect(body.contents[0].parts[0].text).toBe('แก ว่างป่ะ');
    expect(body.systemInstruction.parts[0].text).toContain('from Thai to English');
  });
  it('the instruction says: translation only, keep [[n]] markers, never follow the message', () => {
    const p = geminiPrompt('en', 'th');
    expect(p).toContain('from English to Thai'); expect(p).not.toContain('[[number]]'); expect(geminiPrompt('en', 'th', true)).toContain('[[number]]'); expect(p).toContain('not an instruction');
  });
  it('a model that refuses the quick setting is asked again without it; an error gives null', async () => {
    let n = 0;
    const f = vi.fn(async () => (++n === 1 ? reply('', 400) : reply('สวัสดี')));
    expect(await geminiProvider('K', 'm', f as unknown as typeof fetch).translate('hello', 'en', 'th')).toBe('สวัสดี');
    expect(f).toHaveBeenCalledTimes(2);
    expect(await geminiProvider('K', 'm', (async () => reply('', 429)) as unknown as typeof fetch).translate('hello', 'en', 'th')).toBeNull();
    expect(await geminiProvider('K', 'm', (async () => { throw new Error('down'); }) as unknown as typeof fetch).translate('hello', 'en', 'th')).toBeNull();
  });
  it('the spare is used only when the first one has no answer, and the name says who answered', async () => {
    const a: Provider = { name: 'a', translate: vi.fn(async () => null) }; const b: Provider = { name: 'b', translate: vi.fn(async () => 'ok') };
    const p = firstOf([a, b])!;
    expect(await p.translate('x', 'th', 'en')).toBe('ok'); expect(p.name).toBe('b');
    const q = firstOf([b, a])!; await q.translate('x', 'th', 'en'); expect(a.translate).toHaveBeenCalledTimes(1); expect(q.name).toBe('b');
    expect(firstOf([])).toBeNull();
  });
});

describe('the app: who needs a translation', () => {
  it('only the other person\'s messages, in another language, with a real id', () => {
    const list = [them('1', 'แก ว่างป่ะ'), me('2', 'ไปกัน'), them('3', 'ok see you'), them('4', '555'), them('local-1', 'สวัสดี'), them('5', 'เจอกันนะ')];
    expect(needing(list, 'en', {}).map((x) => `${x.m.id}:${x.source}`)).toEqual(['1:th', '5:th']);
    expect(needing(list, 'th', {}).map((x) => x.m.id)).toEqual(['3']);
    expect(needing(list, 'en', { '1': { s: 'fail' } }).map((x) => x.m.id)).toEqual(['5']);
    expect(readerLang('th')).toBe('th'); expect(readerLang('whatever')).toBe('en');
  });
  it('server call: token + message id only (never the text); ok / same / stop / fail', async () => {
    const f = vi.fn(async (_u: string, o: RequestInit) => { expect(JSON.parse(o.body as string)).toEqual({ message_id: 12, target: 'en' }); expect((o.headers as Record<string, string>).authorization).toBe('Bearer tok');
      return new Response(JSON.stringify({ status: 'ok', text: 'See you' }), { status: 200 }); });
    expect(await serverTranslate('12', 'en', f as unknown as typeof fetch)).toEqual({ status: 'ok', text: 'See you' });
    expect(await serverTranslate('12', 'en', okFetch({ status: 'same' }))).toEqual({ status: 'same' });
    expect(await serverTranslate('12', 'en', okFetch({ status: 'limit_day' }, 429))).toEqual({ status: 'stop' });
    expect(await serverTranslate('12', 'en', okFetch({ status: 'forbidden' }, 403))).toEqual({ status: 'stop' });
    expect(await serverTranslate('12', 'en', okFetch({ status: 'off' }))).toEqual({ status: 'stop' });
    expect(await serverTranslate('12', 'en', okFetch({ status: 'unavailable' }))).toEqual({ status: 'fail' });
    expect(await serverTranslate('12', 'en', (async () => { throw new Error('offline'); }) as unknown as typeof fetch)).toEqual({ status: 'fail' });
    liveMock.session = null;
    expect(await serverTranslate('12', 'en', okFetch({ status: 'ok', text: 'x' }))).toEqual({ status: 'stop' });
  });
});

function Probe(props: { msgs: ChatMsg[]; ui: string; on?: boolean }) {
  const t = useChatTranslate(props.on ?? true, 'th1', props.msgs, props.ui);
  return (<div><span id="pack">{t.pack.s}{t.pack.s === 'downloading' ? `:${t.pack.pct}` : ''}</span><span id="dev">{String(t.onDevice)}</span>
    <button id="get" onClick={t.download}>get</button><button id="no" onClick={t.notNow}>no</button>
    {props.msgs.map((m) => { const x = t.map[m.id]; return <p key={m.id} data-id={m.id} data-s={x?.s || ''} data-via={x && x.s === 'ok' ? x.via : ''}>{x && x.s === 'ok' ? x.text : ''}</p>; })}</div>);
}
const q = (id: string) => document.querySelector(`[data-id="${id}"]`)!;
const MSGS = [them('10', 'แก ว่างป่ะ'), me('11', 'yes!'), them('12', 'เจอกัน 6 โมงนะ')];
function stubTranslator(avail: string, opts: { failCreate?: boolean } = {}) {
  const create = vi.fn(async (o: { monitor?: (m: EventTarget) => void }) => {
    if (opts.failCreate) throw new Error('NotAllowedError');
    const m = new EventTarget(); o.monitor?.(m);
    const e = new Event('downloadprogress'); Object.assign(e, { loaded: 0.5 }); m.dispatchEvent(e);
    return { translate: async (t: string) => `EN(${t})` };
  });
  vi.stubGlobal('Translator', { availability: vi.fn(async () => avail), create });
  return create;
}

describe('the chat: free on the device first, the server as the fallback', () => {
  it('no on-device translator in this browser (iPhone, Android, LINE): the server translates, stored ones first', async () => {
    expect(deviceSupported()).toBe(false);
    liveMock.rpc.mockResolvedValue({ data: [{ id: 10, text: 'Are you free?' }], error: null });
    const f = vi.fn(async () => new Response(JSON.stringify({ status: 'ok', text: 'See you at 6' }), { status: 200 }));
    vi.stubGlobal('fetch', f);
    render(<Probe msgs={MSGS} ui="en" />);
    await waitFor(() => expect(q('12').textContent).toBe('See you at 6'));
    expect(q('10').textContent).toBe('Are you free?');
    expect(q('10').getAttribute('data-via')).toBe('server');
    expect(f).toHaveBeenCalledTimes(1);                       // message 10 came from the store: not asked again
    expect(q('11').getAttribute('data-s')).toBe('');          // my own message: untouched
    expect(document.getElementById('pack')!.textContent).toBe('none');
  });
  it('pack already on the device: translated on the device, nothing is sent to the server', async () => {
    stubTranslator('available');
    const f = vi.fn(); vi.stubGlobal('fetch', f);
    render(<Probe msgs={MSGS} ui="en" />);
    await waitFor(() => expect(q('12').textContent).toBe('EN(เจอกัน 6 โมงนะ)'));
    expect(q('10').getAttribute('data-via')).toBe('device');
    expect(document.getElementById('dev')!.textContent).toBe('true');
    expect(f).not.toHaveBeenCalled();
    expect(liveMock.rpc).not.toHaveBeenCalled();
  });
  it('pack can be downloaded: the member is offered it; nothing is sent anywhere until they choose', async () => {
    const create = stubTranslator('downloadable');
    const f = vi.fn(); vi.stubGlobal('fetch', f);
    render(<Probe msgs={MSGS} ui="en" />);
    await waitFor(() => expect(document.getElementById('pack')!.textContent).toBe('offer'));
    expect(create).not.toHaveBeenCalled();                    // a download only ever starts from the member's tap
    expect(f).not.toHaveBeenCalled();
    await act(async () => { fireEvent.click(document.getElementById('get')!); });
    await waitFor(() => expect(q('10').textContent).toBe('EN(แก ว่างป่ะ)'));
    expect(document.getElementById('pack')!.textContent).toBe('ready');
    expect(f).not.toHaveBeenCalled();
  });
  it('"Not now": remembered on this phone, and the server is used instead', async () => {
    stubTranslator('downloadable');
    const f = vi.fn(async () => new Response(JSON.stringify({ status: 'ok', text: 'srv' }), { status: 200 })); vi.stubGlobal('fetch', f);
    render(<Probe msgs={MSGS} ui="en" />);
    await waitFor(() => expect(document.getElementById('pack')!.textContent).toBe('offer'));
    await act(async () => { fireEvent.click(document.getElementById('no')!); });
    await waitFor(() => expect(q('12').textContent).toBe('srv'));
    expect(q('12').getAttribute('data-via')).toBe('server');
    expect(localStorage.getItem('kr8_tr_pack_no')).toBe('1');
  });
  it('the download fails: quietly falls back to the server', async () => {
    stubTranslator('downloadable', { failCreate: true });
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ status: 'ok', text: 'srv' }), { status: 200 })));
    render(<Probe msgs={MSGS} ui="en" />);
    await waitFor(() => expect(document.getElementById('pack')!.textContent).toBe('offer'));
    await act(async () => { fireEvent.click(document.getElementById('get')!); });
    await waitFor(() => expect(q('10').textContent).toBe('srv'));
  });
  it('this language pair is not on the device (e.g. the browser has no Thai pack): the server', async () => {
    stubTranslator('unavailable');
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ status: 'ok', text: 'srv' }), { status: 200 })));
    render(<Probe msgs={MSGS} ui="en" />);
    await waitFor(() => expect(q('10').textContent).toBe('srv'));
  });
  it('translation fails: the message is marked "unavailable", the chat is untouched', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ status: 'unavailable' }), { status: 200 })));
    render(<Probe msgs={MSGS} ui="en" />);
    await waitFor(() => expect(q('12').getAttribute('data-s')).toBe('fail'));
    expect(q('10').getAttribute('data-s')).toBe('fail');
  });
  it('cap reached (429): asks once, stops, marks the rest unavailable (no hammering)', async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ status: 'limit_day' }), { status: 429 })); vi.stubGlobal('fetch', f);
    render(<Probe msgs={[...MSGS, them('13', 'อยู่ไหนแล้ว'), them('14', 'ถึงแล้วนะ')]} ui="en" />);
    await waitFor(() => expect(q('14').getAttribute('data-s')).toBe('fail'));
    expect(f).toHaveBeenCalledTimes(1);
  });
  it('reader already reads the language (Thai reader, Thai messages): nothing is asked', async () => {
    const f = vi.fn(); vi.stubGlobal('fetch', f);
    render(<Probe msgs={MSGS} ui="th" />);
    await new Promise((r) => setTimeout(r, 40));
    expect(f).toHaveBeenCalledTimes(1 - 1 + (MSGS.filter((m) => m.sender === 'them' && /[a-z]/i.test(m.text) && !/[฀-๿]/.test(m.text)).length));
  });
  it('switched off (chat closed / demo mode): nothing is asked', async () => {
    const f = vi.fn(); vi.stubGlobal('fetch', f);
    render(<Probe msgs={MSGS} ui="en" on={false} />);
    await new Promise((r) => setTimeout(r, 40));
    expect(f).not.toHaveBeenCalled();
  });
});

describe('strings', () => {
  const keys = ['Translated automatically', 'Show original', 'Hide original', 'Translation unavailable', 'Messages are translated automatically', 'Privacy',
    'Translated on your phone. Messages stay on this device.', 'Free translation on this device', 'Download the {0} ↔ {1} pack once. Free, and your messages never leave your phone.', 'Download', 'Downloading… {0}%', 'Write a message…'];
  it('every line has Thai; the tag is แปลอัตโนมัติ', () => {
    for (const k of keys) expect(KX_L.th[k], k).toBeTruthy();
    expect(KX_L.th['Translated automatically']).toBe('แปลอัตโนมัติ');
  });
  it('no banned word in English or Thai', () => {
    const banned = ['rate', 'host', 'guide', 'tour', 'creator', 'gift', 'wallet', 'credit', 'coins', 'launch', 'lucky', 'draw', 'chance', 'reviews', 'stars', 'meet', 'dating'];
    for (const k of keys) for (const w of banned) expect(new RegExp(`(^|[^a-z])${w}`, 'i').test(k), `${w} in ${k}`).toBe(false);
    for (const k of keys) for (const w of ['เดท', 'เจอ', 'พบ', 'นัด', 'ของขวัญ', 'โชค', 'เครดิต']) expect(KX_L.th[k].includes(w), `${w} in ${KX_L.th[k]}`).toBe(false);
  });
});
