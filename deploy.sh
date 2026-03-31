#!/bin/bash
# Push latest code to GitHub and redeploy on NAS
set -e
git push
ssh root@192.168.4.137 "cd /mnt/user/appdata/kana-flash && git pull && docker compose up --build -d"
