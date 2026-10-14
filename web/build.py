"""아티팩트 페이지 만들기: shell.html + parts/*.js + 예시 자료 → manual-writer.html

사용: python web/build.py [출력 폴더]   (기본: web/)
"""
import base64
import json
import sys
from pathlib import Path

import openpyxl

WEB = Path(__file__).resolve().parent
R = WEB.parent
OUT = Path(sys.argv[1]) if len(sys.argv) > 1 else WEB
PARTS = ["ooxml", "excel", "word", "app"]


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
    }
    shell = (WEB / "shell.html").read_text(encoding="utf-8")
    parts = "\n".join((WEB / "parts" / f"{n}.js").read_text(encoding="utf-8") for n in PARTS)
    payload = json.dumps(data, ensure_ascii=False).replace("</", "<\\/")
    html = shell.replace("/*__PARTS__*/", parts.replace("</script", "<\\/script"), 1).replace("/*__DATA__*/", payload, 1)
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "manual-writer.html").write_text(html, encoding="utf-8")
    print("bytes", (OUT / "manual-writer.html").stat().st_size)


if __name__ == "__main__":
    main()
