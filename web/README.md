# 업무매뉴얼 작성기 (웹페이지)

앱(`app/`)의 기능을 브라우저에서 돌아가게 옮기고, 웹 전용 기능(매뉴얼 폴더·챗봇·개정 예시)을 더한 페이지입니다.
같은 코드로 두 곳에 올립니다.
- Vercel: https://vercel-dd-383e.vercel.app (`python web/build.py --vercel` → `deploy/vercel/public/index.html`)
- claude.ai 아티팩트: https://claude.ai/artifact/1AnLMULo7vQCSMHku93ZzC (`python web/build.py <폴더>` → `<폴더>/manual-writer.html`)

전체 상황·결정·남은 일은 레포 맨 위 `진행상황.md`에 있습니다.

## 파일
| 파일 | 내용 |
|---|---|
| `shell.html` | 화면 틀·디자인·사이드바. `/*__PARTS__*/`, `/*__DATA__*/` 자리에 코드와 예시 자료가 들어갑니다 |
| `parts/ooxml.js` | Word·엑셀 파일(ZIP 속 XML) 공용 도구 |
| `parts/excel.js` | 엑셀 읽기(자유 배치형 시트)와 쓰기(신규·시트 교체·시트 추가) |
| `parts/word.js` | Word 읽기(제목 판정·개정이력·회색 칸)와 기존 문서 뒤에 장 추가 |
| `parts/store.js` | 매뉴얼 폴더 저장소(Vercel: `/api/store`, 아티팩트: db·assets)와 버전 번호(1 → 1.1 / 2) |
| `parts/app.js` | 화면, 초안 생성(모의/AI), 검토·확정, 폴더 화면·저장, 검색, 개인정보 필터 |
| `parts/chat.js` | 매뉴얼 챗봇 |
| `parts/folderform.js` | 새 폴더 만들기, 파일로 새 버전 올리기 |
| `parts/guide.js` | 작성 가이드(잘한 예 / 아쉬운 예) |
| `parts/examples.js` | 개정 예시 6개 |
| `build.py` | 위 파일 + 원자료·mock·기존 매뉴얼·예상결과 파일을 합쳐 한 페이지로 |
| `tests/` | 브라우저 시험(`setup.sh` 한 번, `run_all.sh`로 전체) |

플랫폼 차이는 `app.js`의 `getCap()`이 맞춥니다: Vercel은 `/api/ai`(OpenRouter)·일반 다운로드, 아티팩트는 `sample`(Claude)·`downloads`·`db`·`assets`.
라이브러리: docx 8.5.0(Word 새로 만들기), JSZip 3.10.1(파일 읽기·고치기).
엑셀·Word를 고칠 때는 파일 속 XML 중 바뀌는 부분만 다시 써서, 갱신·추가 때 다른 시트·기존 장은 원본 그대로 남습니다.
