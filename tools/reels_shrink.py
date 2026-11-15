"""One-off (16 Nov perf job): make existing Reels light enough for 4G.

For every Reel in kr8_posts: if the video is heavier than ~1.7 Mbit/s or wider than 720 px, it is re-encoded with ffmpeg to
720x1280 (centre crop to 9:16), H.264 High ~1.3 Mbit/s (max 1.5), AAC 96 kbit/s, +faststart; a poster over 70 KB is
re-encoded as a 540x960 progressive JPEG (q70). New files go to NEW paths in the same member folder (the originals stay),
with Cache-Control max-age=31536000. Then kr8_posts.video_path / poster_path point at the new files.

Steps (each needs the previous one):
  python3 tools/reels_shrink.py plan          # download + transcode locally, print before/after sizes. Writes nothing anywhere.
  python3 tools/reels_shrink.py upload        # uploads the new files to storage (new names; nothing in the app changes yet)
  python3 tools/reels_shrink.py sql           # prints the UPDATE statements (and the UNDO statements) to apply in SQL
Needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment, and ffmpeg/ffprobe.
"""
import json, os, subprocess, sys, tempfile, uuid, urllib.request

URL = os.environ['SUPABASE_URL'].rstrip('/')
KEY = os.environ['SUPABASE_SERVICE_ROLE_KEY']
WORK = os.environ.get('REELS_WORK', os.path.join(tempfile.gettempdir(), 'kr8_reels_shrink'))
MAX_BPS = 1_700_000
POSTER_MAX = 70_000
H = {'apikey': KEY, 'Authorization': f'Bearer {KEY}'}


def req(method, path, body=None, headers=None):
    r = urllib.request.Request(URL + path, data=body, method=method, headers={**H, **(headers or {})})
    with urllib.request.urlopen(r, timeout=300) as res:
        return res.read()


def probe(f):
    out = subprocess.run(['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height:stream_side_data=rotation:format=duration,bit_rate',
                          '-of', 'json', f], capture_output=True, text=True).stdout
    j = json.loads(out or '{}')
    s = (j.get('streams') or [{}])[0]
    return {'w': s.get('width', 0), 'h': s.get('height', 0), 'dur': float(j.get('format', {}).get('duration', 0) or 0), 'bps': int(j.get('format', {}).get('bit_rate', 0) or 0)}


def transcode(src, dst):
    vf = "scale='if(gt(a,9/16),-2,720)':'if(gt(a,9/16),1280,-2)',crop=720:1280,setsar=1"
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', src, '-vf', vf, '-r', '30', '-c:v', 'libx264', '-profile:v', 'high', '-preset', 'slow',
                    '-b:v', '1300k', '-maxrate', '1500k', '-bufsize', '2600k', '-pix_fmt', 'yuv420p',
                    '-c:a', 'aac', '-b:a', '96k', '-ac', '2', '-movflags', '+faststart', dst], check=True)


def main():
    step = sys.argv[1] if len(sys.argv) > 1 else 'plan'
    os.makedirs(WORK, exist_ok=True)
    posts = json.loads(req('GET', '/rest/v1/kr8_posts?select=id,author,video_path,poster_path,duration_ms&kind=eq.reel&video_path=not.is.null&order=created_at'))
    plan_file = os.path.join(WORK, 'plan.json')
    plan = json.load(open(plan_file)) if os.path.exists(plan_file) and step != 'plan' else {}
    if step == 'plan':
        for p in posts:
            vid, pos = p['video_path'], p['poster_path']
            entry = {'id': p['id'], 'old_video': vid, 'old_poster': pos}
            lv = os.path.join(WORK, vid.replace('/', '_'))
            if not os.path.exists(lv):
                open(lv, 'wb').write(req('GET', f'/storage/v1/object/kr8-reels/{vid}'))
            info = probe(lv)
            size = os.path.getsize(lv)
            bps = info['bps'] or (size * 8 / max(info['dur'], 0.1))
            entry.update({'old_bytes': size, 'old_bps': int(bps), 'w': info['w'], 'h': info['h']})
            if bps > MAX_BPS or min(info['w'], info['h']) > 720:
                nv = f"{vid.split('/')[0]}/{uuid.uuid4()}.mp4"
                out = os.path.join(WORK, nv.replace('/', '_'))
                transcode(lv, out)
                entry.update({'new_video': nv, 'new_video_file': out, 'new_bytes': os.path.getsize(out)})
            if pos:
                lp = os.path.join(WORK, pos.replace('/', '_'))
                if not os.path.exists(lp):
                    open(lp, 'wb').write(req('GET', f'/storage/v1/object/kr8-reels/{pos}'))
                if os.path.getsize(lp) > POSTER_MAX:
                    np_ = f"{pos.split('/')[0]}/{uuid.uuid4()}.jpg"
                    outp = os.path.join(WORK, np_.replace('/', '_'))
                    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', lp, '-vf', "scale=540:960:force_original_aspect_ratio=increase,crop=540:960", '-q:v', '11', outp], check=True)
                    entry.update({'old_poster_bytes': os.path.getsize(lp), 'new_poster': np_, 'new_poster_file': outp, 'new_poster_bytes': os.path.getsize(outp)})
            plan[p['id']] = entry
            print(f"{p['id'][:8]} video {entry['old_bytes']/1e6:.1f} MB @ {entry['old_bps']/1e6:.2f} Mbit/s"
                  + (f" -> {entry['new_bytes']/1e6:.1f} MB" if 'new_bytes' in entry else ' (already light)')
                  + (f" · poster {entry['old_poster_bytes']//1000} KB -> {entry['new_poster_bytes']//1000} KB" if 'new_poster' in entry else ''))
        json.dump(plan, open(plan_file, 'w'), indent=1)
        print('plan saved:', plan_file)
    elif step == 'upload':
        for e in plan.values():
            for k, f, t in (('new_video', 'new_video_file', 'video/mp4'), ('new_poster', 'new_poster_file', 'image/jpeg')):
                if k in e:
                    req('POST', f"/storage/v1/object/kr8-reels/{e[k]}", open(e[f], 'rb').read(),
                        {'Content-Type': t, 'cache-control': 'max-age=31536000', 'x-upsert': 'false'})
                    print('uploaded', e[k])
    elif step == 'sql':
        print('begin;')
        for e in plan.values():
            sets = []
            if 'new_video' in e: sets.append(f"video_path = '{e['new_video']}', width = 720, height = 1280")
            if 'new_poster' in e: sets.append(f"poster_path = '{e['new_poster']}'")
            if sets: print(f"update public.kr8_posts set {', '.join(sets)} where id = '{e['id']}' and video_path = '{e['old_video']}';")
        print('commit;\n-- UNDO:')
        for e in plan.values():
            if 'new_video' in e or 'new_poster' in e:
                print(f"-- update public.kr8_posts set video_path = '{e['old_video']}', poster_path = '{e['old_poster']}' where id = '{e['id']}';")


if __name__ == '__main__':
    main()
