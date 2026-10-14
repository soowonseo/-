# Vercel 배포 (업무매뉴얼 작성기 웹페이지)

아티팩트와 같은 웹페이지를 Vercel에 올리는 폴더입니다. AI 모드는 **OpenRouter**의 모델(예: 무료 Nemotron)을 씁니다.

- `public/index.html` — 페이지(만들어진 결과물). 직접 고치지 말고 `python web/build.py --vercel`로 다시 만듭니다.
- `api/ai.js` — AI 모드용 서버 함수. 브라우저가 보낸 프롬프트를 OpenRouter로 보내고 답을 스트리밍합니다.
- `api/store.js` — '5. 매뉴얼 폴더'(버전 이력) 저장용 서버 함수. 파일과 목록을 Vercel Blob에 저장합니다.
- `vercel.json` — 정적 페이지는 `public/`, AI 함수 최대 실행 시간 300초, 저장 함수 60초.
- `package.json` — 저장용 라이브러리 `@vercel/blob` 하나(Vercel이 배포할 때 자동 설치).

## 처음 한 번: Vercel에 연결하기
1. https://vercel.com 에 GitHub 계정으로 로그인합니다.
2. **Add New → Project** → GitHub 레포 `soowonseo/-`를 **Import** 합니다.
   (레포가 안 보이면 'Adjust GitHub App Permissions'에서 이 레포를 허용합니다.)
3. **Root Directory**를 `deploy/vercel`로 바꿉니다. ← 꼭 바꾸세요. 레포 맨 위에는 Streamlit 앱이 있어서 그대로 두면 Python 프로젝트로 잘못 인식합니다.
4. Framework Preset은 **Other** 그대로 둡니다.
5. **Environment Variables**에 아래를 넣습니다.
   | 이름 | 값 | 설명 |
   |---|---|---|
   | `OPENROUTER_API_KEY` | OpenRouter에서 받은 키 | 없으면 AI 모드만 안 되고 나머지는 동작합니다. 채팅·코드·교육용 PC에 붙여 넣지 마세요. |
   | `OPENROUTER_MODEL` | 모델 ID | openrouter.ai/models 에서 'nemotron' 검색 → Free로 거르기 → 모델 이름 옆 ID 복사(끝이 `:free`). |
6. **Deploy**를 누릅니다. 1분쯤 뒤 `https://<프로젝트명>.vercel.app` 주소가 나옵니다.

이후에는 `main` 브랜치에 올릴 때마다 자동으로 다시 배포됩니다.
환경 변수를 바꾼 뒤에는 Vercel의 **Deployments → Redeploy**를 한 번 눌러야 적용됩니다.
모델을 바꾸고 싶으면 코드 수정 없이 `OPENROUTER_MODEL`만 바꾸고 Redeploy 하면 됩니다.

## 매뉴얼 폴더(버전 이력) 켜기 — Vercel Blob 연결
확정한 매뉴얼을 업무별 폴더에 v1, v1.1, v1.2 … 로 쌓으려면 저장소를 한 번 연결해야 합니다. 연결 전에는 '5. 매뉴얼 폴더' 화면에 "저장소가 아직 연결되지 않았습니다"가 뜨고, 나머지 기능(초안·확정·내려받기)은 그대로 됩니다.
1. Vercel 프로젝트 화면 → 위쪽 **Storage** 탭 → **Create Database**(또는 Create) → **Blob** 선택.
2. 이름은 아무거나(예: `manual-folders`), 접근 방식은 **Private**을 고릅니다. 지역은 기본값 그대로.
3. 만든 뒤 이 프로젝트에 **Connect** 합니다. 이때 연결 정보(`BLOB_STORE_ID` 또는 예전 방식의 `BLOB_READ_WRITE_TOKEN`)가 자동으로 들어갑니다(직접 입력하지 않습니다).
4. **Deployments → Redeploy**를 한 번 누릅니다.
5. 사이트에서 매뉴얼을 하나 확정한 뒤 '5. 매뉴얼 폴더'에 폴더가 보이면 끝입니다.

- Blob을 **Public**으로 만들었다면 환경 변수 `BLOB_ACCESS` = `public`을 추가하고 Redeploy 하세요. (Private 권장: 파일 주소를 알아도 밖에서 직접 열 수 없습니다.)
- 폴더는 이 사이트를 여는 모든 사람이 함께 봅니다. 로그인·권한 구분이 없으므로 **교육용 가상 자료만** 저장하세요. 누구나 버전을 지울 수도 있습니다.
- 한 번에 올릴 수 있는 크기는 약 4.5MB입니다(Vercel 서버 함수 제한). 이미지가 많은 매뉴얼은 저장이 실패할 수 있습니다.
- Vercel 무료 요금제의 Blob 저장 용량·요청 수 한도 안에서 동작합니다.

## 무료 모델을 쓸 때 알아 둘 점
- **사용 횟수 제한**: OpenRouter 무료 모델은 분당·하루 요청 수가 정해져 있습니다. 넘으면 화면에 "요청이 많습니다" 안내가 뜹니다. 접근 제한이 없으므로 주소를 아는 누구나 이 한도를 함께 씁니다. 교육생이 한꺼번에 누르면 걸리기 쉽습니다.
- **비용**: `:free` 모델은 요금이 없습니다. 유료 모델로 바꾸면 접근 제한이 없어 누구나 키의 사용료를 쓸 수 있으니 그때는 접근 제한을 다시 넣는 것을 검토하세요.
- **입력 데이터 정책**: 무료 모델은 제공사가 입력을 기록·학습에 쓸 수 있습니다(OpenRouter 설정의 Privacy에서 확인). 교육용 가상 자료만 넣으세요.
- **품질**: 한국어 문서·표 형식을 Claude만큼 지키지 못할 수 있습니다. 초안이 6개 섹션 형식이 아니면 "매뉴얼 형식으로 읽지 못했습니다" 안내가 뜨고, 모의 모드로 진행하면 됩니다.
- **생각 과정**: 생각하는 모델이면 생각 과정은 빼고 답만 받습니다(`reasoning.exclude`, `<think>` 제거).

## 동작 차이 (아티팩트와 비교)
| 기능 | 아티팩트 | Vercel |
|---|---|---|
| AI 모드 | 보는 사람의 claude.ai 계정(Claude) | 서버 함수 → OpenRouter 모델 |
| AI 접근 제한 | claude.ai 로그인·허용 | 없음 — 주소를 아는 누구나 AI 모드를 쓸 수 있음 |
| 내려받기 | claude.ai 저장 확인 창 | 일반 브라우저 다운로드 |
| 매뉴얼 폴더 저장 | 아티팩트 자체 저장소(db·assets). 저장은 편집 권한이 있는 사람만 | Vercel Blob (주소를 아는 누구나) |

- 초안 작성 중인 자료는 각자의 브라우저 안에서만 처리됩니다. **최종 컨펌을 누르면** 확정본(과 새 폴더라면 처음 올린 원본)이 저장소에 올라갑니다. AI 모드를 쓰면 그때 입력한 글이 OpenRouter로 전송됩니다.
- Vercel 무료(Hobby) 요금제에서 서버 함수 실행 시간이 짧게 제한되면 긴 초안이 중간에 끊길 수 있습니다.
