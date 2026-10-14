# 업무매뉴얼 작성기 (아티팩트 웹페이지)

앱(`app/`)의 1~4단계를 브라우저에서 돌아가게 옮긴 웹페이지입니다.
게시본: https://claude.ai/artifact/1AnLMULo7vQCSMHku93ZzC

- `manual-writer.template.html` — 페이지 원본. `/*__DATA__*/` 자리에 예시 자료가 들어갑니다.
- `build.py` — 원자료/·mock/ 파일을 넣어 완성 페이지를 만듭니다.
  `python web/build.py <출력 폴더>` → `<출력 폴더>/manual-writer.html`
- 완성 페이지는 예시 이미지가 들어가 커서 레포에는 올리지 않습니다.

아티팩트 기능: `sample`(AI 모드, 보는 사람의 claude.ai 계정 사용), `downloads`(Word 내려받기).
