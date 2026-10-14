"""변경 감지(PRD 6장 9): 섹션 번호가 같은 섹션끼리 difflib로 비교해 추가/변경/삭제를 표시한다."""
import difflib
import re

import manual_md

ADDED, CHANGED, SAME, DELETED = "추가", "변경", "동일", "삭제"


def _lines(text: str) -> list[str]:
    """비교용 정리: 출처 태그는 빼고, 그림은 파일명 대신 설명으로 비교한다(As-Is와 To-Be의 파일명이 다르므로)."""
    text = manual_md.TOKEN_RE.sub(lambda m: f"[그림: {m.group(2).partition('|')[2] or m.group(2)}]"
                                  if m.group(1) == "IMAGE" else f"[캡처 필요: {m.group(2)}]", text)
    text = manual_md.strip_source_tags(text)
    return [re.sub(r"\s+", " ", ln).strip() for ln in text.splitlines() if ln.strip()]


def compare(asis_sections: list[dict], tobe_sections: list[dict]) -> tuple[dict, list[dict]]:
    """To-Be 섹션 번호 → {status, title_changed, old_title, diff}, 그리고 삭제된 As-Is 섹션 목록."""
    old = {s["no"]: s for s in asis_sections}
    result = {}
    for s in tobe_sections:
        before = old.get(s["no"])
        if before is None:
            result[s["no"]] = {"status": ADDED, "diff": []}
            continue
        a, b = _lines(before["text"]), _lines(s["text"])
        title_changed = before["title"].strip() != s["title"].strip()
        if a == b and not title_changed:
            result[s["no"]] = {"status": SAME, "diff": []}
            continue
        diff = [ln for ln in difflib.ndiff(a, b) if ln[:1] in "+-"]
        result[s["no"]] = {"status": CHANGED, "title_changed": title_changed, "old_title": before["title"], "diff": diff}
    tobe_nos = {s["no"] for s in tobe_sections}
    deleted = [s for s in asis_sections if s["no"] not in tobe_nos]
    return result, deleted


def summary(result: dict, deleted: list[dict]) -> str:
    """개정내용 기본값에 쓰는 한 줄: '변경 2, 4-3 / 추가 4-4 / 삭제 5'."""
    parts = []
    for label in (CHANGED, ADDED):
        nos = [no for no, r in result.items() if r["status"] == label]
        if nos:
            parts.append(f"{label} {', '.join(nos)}")
    if deleted:
        parts.append(f"{DELETED} {', '.join(s['no'] for s in deleted)}")
    return " / ".join(parts)
