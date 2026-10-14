#!/usr/bin/env bash
# 시험 준비(한 번만): 파이썬 패키지, 브라우저, 페이지 라이브러리, Vercel 함수 라이브러리
set -e
cd "$(dirname "$0")"
pip install -r requirements.txt
python -m playwright install chromium || echo "브라우저 설치를 건너뜀(이미 있거나 CHROMIUM_PATH를 쓸 때)"
npm install --no-audit --no-fund
npm install --no-audit --no-fund --prefix ../../deploy/vercel
echo "준비 끝. 이제 bash web/tests/run_all.sh"
