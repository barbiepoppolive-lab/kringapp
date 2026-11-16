"""Reel trim e2e (16 Nov): Pixel 7 profile, Google Chrome (H.264 decode). Uses harness/trim.html (the app's real code).
  1. 84 s 720x1280 clip (testsrc2 + 440 Hz tone, 33 MB) -> trim step -> drag -> "Use this part" -> prepare via WebCodecs
  2. the same with WebCodecs removed -> MediaRecorder re-record of only the part (the iPhone / old WebView route)
  3. a 30 s clip skips the trim step
Checks: output is not the picked file, durationMs = window, real length (ffprobe) = window <= 60 s, audio present and not silent.
Usage: npx vite --port 5199 &   then   python3 tools/trim_e2e.py [base url] [screenshot dir]
"""
import asyncio, base64, json, os, subprocess, sys, tempfile
from playwright.async_api import async_playwright
D = os.environ.get('TRIM_WORK', os.path.join(tempfile.gettempdir(), 'kr8_trim_e2e'))
os.makedirs(D, exist_ok=True)
BASE = (sys.argv[1] if len(sys.argv) > 1 else 'http://127.0.0.1:5199') + '/harness/trim.html'
OUT = sys.argv[2] if len(sys.argv) > 2 else D
LONG, SHORT = os.path.join(D, 'long84.mp4'), os.path.join(D, 'short30.mp4')
for f, d, hz in ((LONG, 84, 440), (SHORT, 30, 660)):
    if not os.path.exists(f):
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'lavfi', '-i', f'testsrc2=s=720x1280:r=30:d={d}', '-f', 'lavfi', '-i', f'sine=frequency={hz}:sample_rate=48000:d={d}',
                        '-c:v', 'libx264', '-preset', 'veryfast', '-b:v', '3M', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k', '-shortest', '-movflags', '+faststart', f], check=True)
fails = []
def check(cond, msg):
    print(('PASS ' if cond else 'FAIL ') + msg); 
    if not cond: fails.append(msg)

def ffprobe(path):
    j = json.loads(subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration:stream=codec_type,codec_name,width,height', '-of', 'json', path], capture_output=True, text=True).stdout)
    return float(j['format']['duration']), [(s['codec_type'], s['codec_name']) for s in j['streams']]

async def state(page): return await page.evaluate('window.__trim')
async def wait_step(page, steps, t=180):
    for _ in range(t * 4):
        s = await state(page)
        if s and s.get('step') in steps: return s
        await page.wait_for_timeout(250)
    raise RuntimeError('timeout ' + str(await state(page)))

async def save_blob(page, name):
    b64 = await page.evaluate("""async () => { const b = new Uint8Array(await window.__blob.arrayBuffer()); let s=''; for (let i=0;i<b.length;i+=0x8000) s+=String.fromCharCode.apply(null,b.subarray(i,i+0x8000)); return btoa(s); }""")
    p = os.path.join(D, name); open(p, 'wb').write(base64.b64decode(b64)); return p

async def drag(page, sel, dx):
    b = await page.locator(sel).bounding_box()
    x, y = b['x'] + b['width'] / 2, b['y'] + b['height'] / 2
    await page.mouse.move(x, y); await page.mouse.down()
    for i in range(1, 11): await page.mouse.move(x + dx * i / 10, y)
    await page.mouse.up()

async def run(p, lang, novenc=False, shot=None, end_drag=0, move_drag=0):
    br = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--autoplay-policy=no-user-gesture-required'])
    dev = dict(p.devices['Pixel 7'])
    if shot: dev.update(viewport={'width': 390, 'height': 844}, device_scale_factor=2)
    ctx = await br.new_context(**dev)
    page = await ctx.new_page()
    page.on('pageerror', lambda e: print('PAGEERROR', e))
    if novenc: await page.add_init_script('delete window.VideoEncoder; delete window.VideoDecoder;')
    await page.goto(f'{BASE}?lang={lang}')
    await page.wait_for_selector('#goCompose[data-step=pick]')
    await page.set_input_files('#reelFile', LONG)
    s = await wait_step(page, ['trim', 'compose', 'problem'], 60)
    check(s['step'] == 'trim', f'[{lang}{" rec" if novenc else ""}] 84 s clip opens the trim step (got {s})')
    await page.wait_for_selector('#goTrim')
    txt = await page.inner_text('#goTrimLen')
    check(txt.replace(' ', '') == '1:00/1:24', f'window label shows "{txt}"')
    if shot:
        await page.wait_for_timeout(2500)      # thumbnails + first frame
        await drag(page, '#goTrimWindow', 70)  # move the window a little, so the shot shows dimmed parts on both sides
        await drag(page, '#goTrimEnd', -40)
        await page.wait_for_timeout(1200)
        await page.screenshot(path=shot)
        print('shot', shot, await page.inner_text('#goTrimLen'))
    await page.wait_for_timeout(3000)      # strip pictures
    if move_drag: await drag(page, '#goTrimWindow', move_drag)
    if end_drag: await drag(page, '#goTrimEnd', end_drag)
    label = await page.inner_text('#goTrimLen')
    thumbs = await page.evaluate("[...document.querySelectorAll('.go-tthumbs i')].filter(i => i.style.backgroundImage).length")
    check(thumbs >= 6, f'strip has {thumbs}/8 pictures')
    vt = await page.evaluate("document.getElementById('goTrimVideo').currentTime")
    await page.click('#goTrimUse')
    s = await wait_step(page, ['compose'], 10)
    win = s['window']; wl = (win['endMs'] - win['startMs']) / 1000
    print('window', win, 'label', label, 'preview t', vt)
    check(5 <= wl <= 60, f'window {wl:.1f} s is 5–60 s')
    await page.wait_for_selector('#goCompose[data-step=compose]')
    clip = await page.inner_text('#addReelPicker span')
    check(clip.strip() == f'{round(wl)} s', f'compose shows the part length ({clip})')
    await page.click('#shareNowBtn')
    s = await wait_step(page, ['ready', 'failed'], 240)
    print('result', json.dumps(s))
    check(s['step'] == 'ready', 'prepare finished')
    if s['step'] == 'ready':
        check(not s['isFile'], 'the uploaded blob is not the picked file')
        check(s['size'] < os.path.getsize(LONG), f"output {s['size']/1e6:.1f} MB < input {os.path.getsize(LONG)/1e6:.1f} MB")
        check(abs(s['reportedMs'] - wl * 1000) < 1, f"durationMs = window ({s['reportedMs']})")
        check(s['outSec'] <= 60.6 and abs(s['outSec'] - wl) <= 0.6, f"output duration {s['outSec']:.2f} s ≈ window {wl:.2f} s")
        check(s['audio'], f"output has audio ({s['audioCodec']})")
        f = await save_blob(page, f'out_{lang}{"_rec" if novenc else ""}.' + ('webm' if 'webm' in s['mime'] else 'mp4'))
        dur, streams = ffprobe(f)
        print('ffprobe', dur, streams)
        check(dur <= 61 and abs(dur - wl) <= 0.7, f'ffprobe duration {dur:.2f} s')
        check(any(t == 'audio' for t, _ in streams), 'ffprobe sees an audio stream')
        # the sound must really be there (not silence): mean volume of the 440 Hz tone
        vol = subprocess.run(['ffmpeg', '-v', 'info', '-i', f, '-af', 'volumedetect', '-vn', '-f', 'null', '-'], capture_output=True, text=True).stderr
        mv = [l for l in vol.splitlines() if 'mean_volume' in l]
        print(mv)
        check(bool(mv) and float(mv[0].split(':')[1].split()[0]) > -40, 'audio is not silent')
    await br.close()

async def run_short(p):
    br = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--autoplay-policy=no-user-gesture-required'])
    ctx = await br.new_context(**p.devices['Pixel 7'])
    page = await ctx.new_page()
    await page.goto(f'{BASE}?lang=en')
    await page.wait_for_selector('#goCompose[data-step=pick]')
    await page.set_input_files('#reelFile', SHORT)
    s = await wait_step(page, ['trim', 'compose', 'problem'], 60)
    check(s['step'] == 'compose' and await page.locator('#goTrim').count() == 0, f'30 s clip skips the trim step ({s})')
    await br.close()

async def run_fail(p):
    # no WebCodecs encoder AND no MediaRecorder: TRIM_FAIL, never the whole long file
    br = await p.chromium.launch(executable_path='/usr/bin/google-chrome')
    ctx = await br.new_context(**p.devices['Pixel 7'])
    page = await ctx.new_page()
    await page.add_init_script('delete window.VideoEncoder; delete window.VideoDecoder; delete window.MediaRecorder;')
    await page.goto(f'{BASE}?lang=th')
    await page.set_input_files('#reelFile', LONG)
    await page.wait_for_selector('#goTrim')
    await page.click('#goTrimUse')
    await page.click('#shareNowBtn')
    s = await wait_step(page, ['ready', 'failed'], 60)
    check(s['step'] == 'failed' and s.get('code') == 'TRIM_FAIL', f'no encoder + no recorder -> TRIM_FAIL ({s})')
    await br.close()

async def main():
    async with async_playwright() as p:
        if not os.environ.get('ONLY_REC'):
            await run(p, 'th', shot=os.path.join(OUT, 'Trim_th.png'))
            await run(p, 'en', shot=os.path.join(OUT, 'Trim_en.png'), move_drag=60)
        await run(p, 'en', novenc=True, end_drag=-150, move_drag=40)   # MediaRecorder re-record fallback (no WebCodecs, like older iPhones)
        await run_short(p)
        await run_fail(p)
    print('\nFAILS:', fails if fails else 'none')
    sys.exit(1 if fails else 0)
if __name__ == "__main__": asyncio.run(main())
