"""매뉴얼 Q&A. 섹션 단위로 검색한다(PRD 6장 11). 지금은 모의 모드만(API 모드는 11단계).

모의 모드 점수: 질문을 공백으로 나눈 단어가 섹션에 몇 개 있는지 센다.
한국어는 '무료로', '변경이면'처럼 조사가 붙으므로, 단어가 없으면 끝 글자를 하나씩 줄여(최소 2글자) 다시 찾는다.
"""
import re
from dataclasses import dataclass

import db
import generator
import manual_md

NOT_FOUND = "매뉴얼에 없는 내용입니다."
UNCONFIRMED = "매뉴얼에 아직 확인되지 않은 항목입니다."
MIN_MATCH_RATIO = 0.5
TOP_K = 3


@dataclass
class Hit:
    section: dict
    score: float
    matched: list[tuple[str, str]]   # (질문 단어, 섹션에서 찾은 형태)
    label: str
    best: list[str] | None = None


# 질문 말투일 뿐 내용이 아닌 단어(점수에서 뺀다)
FILLER = {"뭐야", "뭐예요", "어떻게", "언제", "얼마야", "얼마", "있어", "있나요", "되나요", "돼", "해", "하면", "되나"}


def _words(question: str) -> list[str]:
    words = [re.sub(r"[^\w-]", "", w).strip("-") for w in question.split()]
    return [w for w in words if len(w) >= 2 and w not in FILLER]


def _find(word: str, text: str) -> str | None:
    """단어 또는 조사를 떼어 낸 앞부분(최소 2글자)이 text에 있으면 그 형태를 돌려준다."""
    for end in range(len(word), 1, -1):
        if word[:end] in text:
            return word[:end]
    return None


def _task_key(name: str) -> str:
    return re.sub(r"\s+", "", generator.task_label(name or ""))


def _label(row) -> str:
    """근거 표기: 매뉴얼명·버전·섹션. 엑셀은 '파일명 > 시트명 > 단계'."""
    section = f"{row['section_no']}. {row['section_title']}"
    if row["origin"] == "업로드" and row["source_sheet"]:
        return f"{row['source_file']} > {row['source_sheet']} > {section}"
    if row["origin"] == "업로드":
        return f"{row['source_file']} · v{row['manual_version']} · {section}"
    return f"{row['task_name']} 매뉴얼 · v{row['manual_version']} (확정본) · {section}"


def latest_only(rows) -> list:
    """같은 업무가 여러 개면 확정본 > 업로드본, 높은 버전, 나중에 확정한 것 하나만 남긴다."""
    best = {}
    for r in rows:
        key = _task_key(r["task_name"])
        rank = (r["origin"] != "업로드", r["manual_version"], r["confirmed_at"] or "")
        if key not in best or rank > best[key][0]:
            best[key] = (rank, r["manual_id"])
    keep = {manual_id for _, manual_id in best.values()}
    return [r for r in rows if r["manual_id"] in keep]


def search(question: str) -> tuple[list[Hit], int]:
    words = _words(question)
    hits = []
    for r in latest_only(db.searchable_sections()):
        text = f"{r['section_title']}\n{r['section_text']}"
        found = [(w, m) for w in words if (m := _find(w, text))]
        # 조사를 덜 떼어 낸(원래 단어에 가까운) 일치일수록 점수가 높다.
        quality = sum(len(m) / len(w) for w, m in found)
        in_task = sum(1 for w in words if _find(w, r["task_name"] or ""))
        if found or in_task:
            hits.append(Hit(dict(r), quality + in_task, found, _label(r)))  # 업무명을 직접 말하면 그 업무 우선
    hits.sort(key=lambda h: -h.score)
    return hits[:TOP_K], len(words)


def _best_lines(section_text: str, matched: list[tuple[str, str]], limit: int = 3) -> list[str]:
    """맞은 단어가 가장 많이(길게) 든 줄. 그림 설명(엑셀 옆·아래 설명 포함)도 한 줄로 본다."""
    text = manual_md.TOKEN_RE.sub(lambda m: "\n" + m.group(2).partition("|")[2] + "\n", section_text)
    lines = [ln.strip() for ln in text.splitlines() if ln.strip() and not ln.strip().startswith(("```", "|---"))]
    scored = sorted(((sum(len(m) / len(w) for w, m in set(matched) if m in ln), i, ln) for i, ln in enumerate(lines)),
                    key=lambda x: (-x[0], x[1]))
    if not scored or scored[0][0] == 0:
        return []
    return [ln for score, _, ln in scored if score == scored[0][0]][:limit]


def answer(question: str) -> dict:
    """모의 모드 답변: 가장 잘 맞는 섹션의 원문(관련 줄)과 근거."""
    hits, n_words = search(question)
    if not hits or n_words == 0 or hits[0].score / n_words < MIN_MATCH_RATIO:
        result = {"answer": NOT_FOUND, "lines": [], "hits": [], "status": "없음"}
    else:
        hits = [h for h in hits if h.score / n_words >= MIN_MATCH_RATIO]   # 근거도 같은 기준을 넘는 것만
        top = hits[0]
        lines = _best_lines(top.section["section_text"], top.matched)
        if any(manual_md.CHECK_NEEDED in ln for ln in lines):
            result = {"answer": UNCONFIRMED, "lines": lines, "hits": hits, "status": "확인 필요"}
        else:
            result = {"answer": "\n".join(manual_md.strip_source_tags(ln) for ln in lines), "lines": lines,
                      "hits": hits, "status": "답변"}
    for h in result["hits"]:
        h.best = _best_lines(h.section["section_text"], h.matched, limit=1)
    db.add_qa_log(question, result["answer"], [h.section["section_id"] for h in result["hits"]], "모의")
    return result
