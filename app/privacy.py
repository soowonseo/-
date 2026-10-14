"""개인정보 필터(PRD 6장 10). 패턴이 감지되면 경고하고 처리를 중단한다.

이미지 속 글자는 읽지 않는다(캡처는 가상 화면만 쓰는 것이 원칙).
"""
import io
import re

import openpyxl
from docx import Document

PATTERNS = [
    ("주민등록번호", re.compile(r"\d{6}-?[1-4]\d{6}")),
    ("휴대폰 번호", re.compile(r"01[016789]-?\d{3,4}-?\d{4}")),
    ("계좌번호", re.compile(r"\d{2,6}-\d{2,6}-\d{2,6}")),
]


def mask(value: str) -> str:
    """경고 화면에도 번호를 그대로 보여 주지 않는다: 앞 3자리만 남긴다."""
    return value[:3] + "*" * (len(value) - 3)


# 계좌번호 패턴(숫자-숫자-숫자)은 날짜 '2023-03-15'도 잡으므로 날짜 모양은 뺀다.
DATE_RE = re.compile(r"(19|20)\d{2}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])")


def scan_text(text: str) -> list[tuple[str, str]]:
    """감지된 (종류, 가린 값) 목록. 같은 자리가 여러 패턴에 걸리면 앞의 것 하나만."""
    found, taken = [], []
    for kind, pattern in PATTERNS:
        for m in pattern.finditer(text or ""):
            if any(m.start() < end and start < m.end() for start, end in taken):
                continue
            if kind == "계좌번호" and DATE_RE.fullmatch(m.group(0)):
                continue
            taken.append(m.span())
            found.append((kind, mask(m.group(0))))
    return found


def file_text(name: str, data: bytes) -> str:
    """검사할 글자를 파일에서 꺼낸다. 이미지는 빈 문자열."""
    lower = name.lower()
    if lower.endswith((".txt", ".sql")):
        return data.decode("utf-8", errors="ignore")
    if lower.endswith(".xlsx"):
        wb = openpyxl.load_workbook(io.BytesIO(data), read_only=True, data_only=True)
        # 글자 칸만 본다. 날짜·숫자로 저장된 칸은 개인정보가 아니다.
        return "\n".join(v for ws in wb.worksheets for row in ws.iter_rows(values_only=True)
                         for v in row if isinstance(v, str))
    if lower.endswith(".docx"):
        doc = Document(io.BytesIO(data))
        cells = [c.text for t in doc.tables for r in t.rows for c in r.cells]
        return "\n".join([p.text for p in doc.paragraphs] + cells)
    return ""


def scan_file(name: str, data: bytes) -> list[tuple[str, str]]:
    return scan_text(file_text(name, data))
