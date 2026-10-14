"""페이지 만들기: shell.html + parts/*.js + 예시 자료 → 한 장짜리 HTML

사용:
  python web/build.py [출력 폴더]      아티팩트용 → <폴더>/manual-writer.html (기본: web/)
  python web/build.py --vercel         Vercel용 → deploy/vercel/public/index.html
"""
import base64
import json
import sys
from pathlib import Path

import openpyxl

WEB = Path(__file__).resolve().parent
R = WEB.parent
VERCEL = "--vercel" in sys.argv
ARGS = [a for a in sys.argv[1:] if not a.startswith("--")]
OUT = Path(ARGS[0]) if ARGS else (R / "deploy" / "vercel" / "public" if VERCEL else WEB)
PARTS = ["ooxml", "excel", "word", "store", "app", "examples"]


def b64(path: Path) -> str:
    return base64.b64encode(path.read_bytes()).decode()


def main() -> None:
    raw = R / "원자료"
    wb = openpyxl.load_workbook(raw / "펀드변경_처리.xlsx")
    xlsx_text = "\n".join(
        f"[시트: {ws.title}]\n" + "\n".join(", ".join("" if v is None else str(v) for v in row)
                                           for row in ws.iter_rows(values_only=True) if any(v is not None for v in row))
        for ws in wb.worksheets)
    data = {
        "mock": {"fund": (R / "mock/mock_manual.md").read_text(encoding="utf-8"),
                 "auto": (R / "mock/mock_자동재배분.md").read_text(encoding="utf-8")},
        "samples": {
            "memo": {"name": "memo_펀드변경.txt", "text": (raw / "memo_펀드변경.txt").read_text(encoding="utf-8")},
            "memoV2": {"name": "memo_펀드변경_v2.txt", "text": (raw / "memo_펀드변경_v2.txt").read_text(encoding="utf-8")},
            "sql": {"name": "가상_펀드변경조회.sql", "text": (raw / "가상_펀드변경조회.sql").read_text(encoding="utf-8")},
            "xlsx": {"name": "펀드변경_처리.xlsx", "text": xlsx_text},
            "images": [{"name": n, "dataUrl": "data:image/png;base64," + b64(raw / n)}
                       for n in ["업무흐름도.png", "캡처1_신청화면.png", "캡처2_오류화면.png", "캡처3_엑셀체크리스트.png", "캡처4_쿼리결과.png"]],
            "autoMemo": (raw / "memo_자동재배분_러프.txt").read_text(encoding="utf-8"),
        },
        "existing": {
            "wordV1": {"name": "가상_펀드변경_매뉴얼_v1.docx", "b64": b64(R / "word/가상_펀드변경_매뉴얼_v1.docx")},
            "wordV2": {"name": "예상결과_펀드변경_매뉴얼_v2.docx", "b64": b64(R / "mock/예상결과_펀드변경_매뉴얼_v2.docx")},
            "excelV1": {"name": "가상_업무매뉴얼_v1.xlsx", "b64": b64(R / "excel/가상_업무매뉴얼_v1.xlsx")},
        },
        # '개정 예시' 화면에서 내려받는 예상 결과(To-Be) 파일
        "expected": {
            "addWord": {"name": "예상결과_추가_Word_7장자동재배분.docx", "b64": b64(R / "mock/예상결과_추가_Word_7장자동재배분.docx")},
            "addExcel": {"name": "예상결과_추가_엑셀_시트추가.xlsx", "b64": b64(R / "mock/예상결과_추가_엑셀_시트추가.xlsx")},
            "updExcel": {"name": "예상결과_업무매뉴얼_v2.xlsx", "b64": b64(R / "mock/예상결과_업무매뉴얼_v2.xlsx")},
            "newExcel": {"name": "예상결과_펀드변경_매뉴얼_v2_단독.xlsx", "b64": b64(R / "mock/예상결과_펀드변경_매뉴얼_v2_단독.xlsx")},
        },
    }
    shell = (WEB / "shell.html").read_text(encoding="utf-8")
    parts = "\n".join((WEB / "parts" / f"{n}.js").read_text(encoding="utf-8") for n in PARTS)
    payload = json.dumps(data, ensure_ascii=False).replace("</", "<\\/")
    html = shell.replace("/*__PARTS__*/", parts.replace("</script", "<\\/script"), 1).replace("/*__DATA__*/", payload, 1)
    OUT.mkdir(parents=True, exist_ok=True)
    if VERCEL:
        # 아티팩트는 문서 틀을 자동으로 씌우지만, Vercel은 완전한 HTML 문서가 필요하다.
        html = ('<!doctype html>\n<html lang="ko">\n<head>\n<meta charset="utf-8">\n'
                '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
                '<script>window.__PLATFORM__ = "vercel";</script>\n'
                '<style>body{margin:0;font:14px system-ui,sans-serif}img{max-width:100%}[hidden]{display:none!important}</style>\n'
                '</head>\n<body>\n' + html + '\n</body>\n</html>\n')
        target = OUT / "index.html"
    else:
        target = OUT / "manual-writer.html"
    target.write_text(html, encoding="utf-8")
    print(target, "bytes", target.stat().st_size)


if __name__ == "__main__":
    main()
