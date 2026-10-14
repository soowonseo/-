# Vercel 배포 (업무매뉴얼 작성기 웹페이지)

아티팩트와 같은 웹페이지를 Vercel에 올리는 폴더입니다.

- `public/index.html` — 페이지(만들어진 결과물). 직접 고치지 말고 `python web/build.py --vercel`로 다시 만듭니다.
- `api/claude.js` — AI 모드용 서버 함수. 브라우저가 보낸 프롬프트를 Claude(Opus 5.5)에 보내고 답을 스트리밍합니다.
- `vercel.json` — 정적 페이지는 `public/`, 서버 함수 최대 실행 시간 300초.
- `package.json` — 서버 함수가 쓰는 Anthropic SDK.

## 처음 한 번: Vercel에 연결하기
1. https://vercel.com 에 GitHub 계정으로 로그인합니다.
2. **Add New → Project** → GitHub 레포 `soowonseo/-`를 **Import** 합니다.
   (레포가 안 보이면 'Adjust GitHub App Permissions'에서 이 레포를 허용합니다.)
3. **Root Directory**를 `deploy/vercel`로 바꿉니다. ← 꼭 바꾸세요. 레포 맨 위에는 Streamlit 앱이 있어서 그대로 두면 Python 프로젝트로 잘못 인식합니다.
4. Framework Preset은 **Other** 그대로 둡니다.
5. **Environment Variables**에 아래를 넣습니다.
   | 이름 | 값 | 설명 |
   |---|---|---|
   | `ANTHROPIC_API_KEY` | Anthropic 콘솔에서 발급한 키 | 없으면 AI 모드만 안 되고 나머지는 동작합니다. 채팅·코드·교육용 PC에 붙여 넣지 마세요. |
   | `AI_ACCESS_CODE` | 정한 접근 코드(예: 교육 당일 공지) | 주소가 공개라서, 이 코드를 아는 사람만 AI 모드로 키를 쓰게 합니다. 강력 권장. |
6. **Deploy**를 누릅니다. 1분쯤 뒤 `https://<프로젝트명>.vercel.app` 주소가 나옵니다.

이후에는 `main` 브랜치에 올릴 때마다 자동으로 다시 배포됩니다.
환경 변수를 바꾼 뒤에는 Vercel의 **Deployments → Redeploy**를 한 번 눌러야 적용됩니다.

## 동작 차이 (아티팩트와 비교)
| 기능 | 아티팩트 | Vercel |
|---|---|---|
| AI 모드 | 보는 사람의 claude.ai 계정 | 서버 함수 + `ANTHROPIC_API_KEY` (비용은 키 주인 부담) |
| AI 접근 제한 | claude.ai 로그인·허용 | `AI_ACCESS_CODE` (왼쪽 'AI 접근 코드' 칸) |
| 내려받기 | claude.ai 저장 확인 창 | 일반 브라우저 다운로드 |
| 저장 | 없음(새로고침하면 초기화) | 없음(새로고침하면 초기화) |

- 올린 파일은 각자의 브라우저 안에서만 처리되고 서버에 저장되지 않습니다. AI 모드를 쓰면 그때 입력한 글이 Claude API로 전송됩니다.
- Vercel 무료(Hobby) 요금제에서 서버 함수 실행 시간이 짧게 제한되면 긴 초안이 중간에 끊길 수 있습니다. 그때는 `vercel.json`의 `maxDuration`이 요금제 한도 안인지 확인하세요.
