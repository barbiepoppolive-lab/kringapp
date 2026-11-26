#!/bin/bash
# Rebuild $HOME/ksite_r11 = ksite_r10 (live folder, with functions/) + the daily-bonus /app/ delta; deploy to QA only with "deploy".
set -e
cd $HOME
md5sum mnt/explore/_r11/${DELTA:-r11_app_v4.tgz} | cut -c1-32
rm -rf ksite_r11 && cp -a ksite_r10 ksite_r11 && tar xzf mnt/explore/_r11/${DELTA:-r11_app_v4.tgz} -C ksite_r11/app/
grep -o 'src="[^"]*main[^"]*"' ksite_r11/app/index.html
md5sum ksite_r11/index.html | cut -c1-12
ls -d ksite_r11/functions
if [ "$1" = "deploy" ]; then
  cd ksite_r11 && set -a && . $HOME/mnt/Kring-secrets/cloudflare.env && set +a && timeout 170 npx --yes wrangler@3 pages deploy . --project-name kringapp --branch qa --commit-dirty=true 2>&1 | tail -2
fi
