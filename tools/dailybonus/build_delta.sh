set -e
cd /home/claude/kringapp-retention10
npx tsc --noEmit
npx vite build --base=/app/ > /tmp/build3.log 2>&1
grep -o 'src="[^"]*main[^"]*"' dist/index.html
cd dist && python3 - <<'PY'
import hashlib,os
live={}
for l in open('/mnt/user-data/uploads/explore/_r11/r10_app.md5'):
    h,p=l.rstrip('\n').split('  ',1); live[p]=h
ch=[os.path.join(r,f)[2:] for r,_,fs in os.walk('.') for f in fs if live.get(os.path.join(r,f)[2:])!=hashlib.md5(open(os.path.join(r,f),'rb').read()).hexdigest()]
open('/tmp/ch.txt','w').write('\n'.join(ch)); print(len(ch),'files')
PY
tar czf /mnt/user-data/outputs/r11_app_delta.tgz -T /tmp/ch.txt && md5sum /mnt/user-data/outputs/r11_app_delta.tgz
