#!/bin/bash
# Push latest code to GitHub and redeploy on NAS
set -e
git push
ssh root@lenas.local "cd /mnt/user/appdata/kana-flash && git pull && docker build -t kana-flash . && docker stop kana-flash && docker rm kana-flash && docker run -d --name kana-flash --restart unless-stopped -p 3000:3000 -v /mnt/user/appdata/kana-flash/data:/app/data kana-flash"
