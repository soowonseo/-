#!/usr/bin/env bash
# 전체 시험: 페이지를 다시 만들고, 가짜 AI 서버·Vercel 흉내 서버를 띄운 뒤 모든 시험을 돌린다.
# 결과는 화면에 출력되고, 만든 파일은 web/tests/out/ 에 남는다. 마지막 줄들의 '오류: []'를 확인한다.
set -e
cd "$(dirname "$0")"
REPO=../..
python $REPO/web/build.py out/artifact
python $REPO/web/build.py --vercel
rm -rf out/blob && mkdir -p out/blob
node mock_openrouter.mjs fake_ai_answer.txt & AI_PID=$!
PORT=8791 STORE_FS_DIR="$PWD/out/blob" OPENROUTER_API_KEY=or-test-key OPENROUTER_MODEL=nvidia/test-nemotron:free OPENROUTER_BASE_URL=http://127.0.0.1:8788 node dev_server.mjs & DEV_PID=$!
trap 'kill $AI_PID $DEV_PID 2>/dev/null' EXIT
for i in 1 2 3 4 5 6 7 8 9 10; do curl -s -o /dev/null http://127.0.0.1:8791/ && break; sleep 1; done
URL=http://127.0.0.1:8791
clean() { rm -rf out/blob/*; }
echo "== PRD 8장 테스트 (아티팩트 페이지)";   python test_prd.py
echo "== 변경 강조";                         python test_diff.py
echo "== 개정 예시 6개 (예상결과 파일과 비교)"; python test_examples.py
echo "== 작성 가이드";                       python test_guide.py
echo "== 매뉴얼 폴더 (Vercel)";      clean;  python test_folders.py $URL/
echo "== 매뉴얼 폴더 (아티팩트 저장소 흉내)";  python test_artifact_store.py $URL/art.html
echo "== 폴더 수정·가져오기 (Vercel)"; clean; python test_import.py $URL/
echo "== 확정 화면 저장 설정 (Vercel)"; clean; python test_save.py $URL/
echo "== 챗봇·폴더 직접 관리 (Vercel, 가짜 AI)"; clean; python test_chat.py $URL/
echo "== 챗봇·폴더 직접 관리 (아티팩트, 가짜 Claude)"; python test_chat.py $URL/art.html stub
