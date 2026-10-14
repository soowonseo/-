import base64, json, sys
from pathlib import Path
import openpyxl
R = Path(__file__).resolve().parent.parent; A = Path(sys.argv[1]) if len(sys.argv) > 1 else R / "web"
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
        "sql": {"name": "가상_펀드변경조회.sql", "text": (raw / "가상_펀드변경조회.sql").read_text(encoding="utf-8")},
        "xlsx": {"name": "펀드변경_처리.xlsx", "text": xlsx_text},
        "images": [{"name": n, "dataUrl": "data:image/png;base64," + base64.b64encode((raw / n).read_bytes()).decode()}
                   for n in ["업무흐름도.png", "캡처1_신청화면.png", "캡처2_오류화면.png", "캡처3_엑셀체크리스트.png", "캡처4_쿼리결과.png"]],
        "autoMemo": (raw / "memo_자동재배분_러프.txt").read_text(encoding="utf-8"),
    },
}
html = (R / "web" / "manual-writer.template.html").read_text(encoding="utf-8")
payload = json.dumps(data, ensure_ascii=False).replace("</", "<\\/")
(A / "manual-writer.html").write_text(html.replace("/*__DATA__*/", payload, 1), encoding="utf-8")
print("bytes", (A / "manual-writer.html").stat().st_size)
