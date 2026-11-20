#!/usr/bin/env python3
"""0165 backfill (20 Nov 2026): 1 frame per second of every Reel video → the same 64-bit dHash as
supabase/functions/face-check-aws/reelprint.ts (grey, area-averaged 9 x 8 grid, right cell brighter = 1).
Usage: reelprint_backfill.py signed.json out.json   (signed.json = storage sign answer [{path, signedURL}]; needs ffmpeg)."""
import json, os, subprocess, sys, tempfile, glob, concurrent.futures as cf
from PIL import Image

def dhash_file(fn):
    im = Image.open(fn).convert('RGB'); w, h = im.size; px = im.load()
    s = [0.0] * 72; c = [0] * 72
    for y in range(h):
        gy = min(7, (y * 8) // h)
        for x in range(w):
            gx = min(8, (x * 9) // w); r, g, b = px[x, y]
            s[gy * 9 + gx] += 0.299 * r + 0.587 * g + 0.114 * b; c[gy * 9 + gx] += 1
    bits = 0
    for k in range(64):
        gy, gx = divmod(k, 8)
        a = s[gy * 9 + gx] / (c[gy * 9 + gx] or 1); b = s[gy * 9 + gx + 1] / (c[gy * 9 + gx + 1] or 1)
        bits = (bits << 1) | (1 if b > a else 0)
    return '%016x' % bits

def one(x, base):
    path = x['path']; d = tempfile.mkdtemp(dir=base)
    url = 'https://pedxoxpammnyfnizljyj.supabase.co/storage/v1' + x['signedURL']
    subprocess.call(['ffmpeg', '-v', 'error', '-y', '-t', '60', '-i', url, '-vf', 'fps=1,scale=180:-2', d + '/f_%03d.jpg'], timeout=240)
    out = []
    for i, fn in enumerate(sorted(glob.glob(d + '/f_*.jpg'))):
        out.append({'video_path': path, 'at': '%ds' % i, 'h': dhash_file(fn)}); os.remove(fn)
    os.rmdir(d)
    return out

if __name__ == '__main__':
    signed = json.load(open(sys.argv[1])); base = tempfile.mkdtemp()
    with cf.ThreadPoolExecutor(8) as ex: rows = [r for rs in ex.map(lambda x: one(x, base), signed) for r in rs]
    json.dump(rows, open(sys.argv[2], 'w')); print(len(rows), 'prints from', len(signed), 'videos')
