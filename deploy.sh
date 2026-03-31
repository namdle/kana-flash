#!/bin/bash
# Push latest code to GitHub and redeploy on NAS.
# Requires .deploy-config — copy .deploy-config.example and fill in your values.
set -e

if [ ! -f .deploy-config ]; then
  echo "Error: .deploy-config not found. Copy .deploy-config.example and fill in your values."
  exit 1
fi

source .deploy-config

git push
ssh root@"$NAS_HOST" "cd $NAS_DEPLOY_PATH && git pull && docker build -t kana-flash . && docker stop kana-flash && docker rm kana-flash && docker run -d --name kana-flash --restart unless-stopped -p 3000:3000 -v ${NAS_DEPLOY_PATH}/data:/app/data kana-flash"
