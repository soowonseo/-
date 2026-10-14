# 업무매뉴얼 작성기 (아티팩트 웹페이지)

앱(`app/`)의 1~10단계를 브라우저에서 돌아가게 옮긴 웹페이지입니다.
게시본: https://claude.ai/artifact/1AnLMULo7vQCSMHku93ZzC

- `shell.html` — 화면 틀과 디자인. `/*__PARTS__*/`, `/*__DATA__*/` 자리에 코드와 예시 자료가 들어갑니다.
- `parts/ooxml.js` — Word·엑셀 파일(ZIP 속 XML) 공용 도구
- `parts/excel.js` — 엑셀 읽기(자유 배치형 시트 파싱)와 쓰기(신규·시트 교체·시트 추가)
- `parts/word.js` — Word 읽기(두 단계 제목 판정)와 기존 문서 뒤에 장 추가
- `parts/app.js` — 화면, 초안 생성(모의/AI), 검토·확정, Q&A, 개인정보 필터, 4. 작성 가이드
- `build.py` — 위 파일과 원자료·mock·기존 매뉴얼 예시를 합쳐 한 페이지를 만듭니다.
  `python web/build.py <출력 폴더>` → `<출력 폴더>/manual-writer.html`

엑셀·Word를 고칠 때는 파일 속 XML 중 바뀌는 부분만 다시 써서, 갱신·추가 때 다른 시트·기존 장은 원본 그대로 남습니다.
라이브러리: docx 8.5.0(Word 새로 만들기), JSZip 3.10.1(파일 읽기·고치기).
아티팩트 기능: `sample`(AI 모드, 보는 사람의 claude.ai 계정 사용), `downloads`(파일 내려받기).
새로고침하면 확정한 매뉴얼과 Q&A 목록이 비워집니다(저장 기능은 실제 배포 때 추가).
