"""매뉴얼 중간 형식(마크다운) 다루기.

Word든 엑셀이든 모두 이 마크다운으로 바꿔 저장하고, 출력할 때만 원래 형식으로 되돌린다(PRD 6장 2).
- 이미지: {{IMAGE:파일명|설명}}
- 캡처가 필요한 자리: {{CAPTURE_NEEDED:필요한 화면 설명}}
- 쿼리: ```sql 블록
"""
import re

FRONTMATTER_RE = re.compile(r"\A---\n(.*?)\n---\n", re.S)
HEADING_RE = re.compile(r"^(#{1,3})\s+(\d+(?:-\d+)*)\.\s*(.*?)\s*$")
TOKEN_RE = re.compile(r"\{\{(IMAGE|CAPTURE_NEEDED):([^}]*)\}\}")
SOURCE_TAG_RE = re.compile(r"\s*\[(?:메모|줄글|SQL|기존매뉴얼|엑셀(?::[^\]]*)?|캡처\d*)\]")
CHECK_NEEDED = "[확인 필요]"


def split_frontmatter(md: str) -> tuple[dict, str]:
    match = FRONTMATTER_RE.match(md)
    if not match:
        return {}, md
    meta = {}
    for line in match.group(1).splitlines():
        if ":" in line:
            key, value = line.split(":", 1)
            meta[key.strip()] = value.strip()
    return meta, md[match.end():]


def split_sections(body: str) -> list[dict]:
    """'# 1. 업무개요', '## 4-1. 신청' 같은 제목으로 자른다. 코드 블록 안의 #은 무시한다."""
    sections = []
    current = None
    in_code = False
    for line in body.splitlines():
        if line.strip().startswith("```"):
            in_code = not in_code
        match = None if in_code else HEADING_RE.match(line)
        if match:
            current = {"no": match.group(2), "title": match.group(3),
                       "level": len(match.group(1)), "lines": []}
            sections.append(current)
        elif current is not None:
            current["lines"].append(line)
    for s in sections:
        s["text"] = "\n".join(s.pop("lines")).strip("\n")
    return sections


def join_sections(meta: dict, sections: list[dict]) -> str:
    parts = []
    if meta:
        parts.append("---\n" + "\n".join(f"{k}: {v}" for k, v in meta.items()) + "\n---\n")
    for s in sections:
        parts.append(f"{'#' * s['level']} {s['no']}. {s['title']}\n\n{s['text']}\n")
    return "\n".join(parts)


def strip_source_tags(text: str) -> str:
    """출처 태그는 화면에서만 보이고 최종 파일에서는 뺀다. [확인 필요]는 남긴다."""
    return SOURCE_TAG_RE.sub("", text)


def image_refs(text: str) -> list[tuple[str, str]]:
    return [tuple((v.split("|", 1) + [""])[:2]) for k, v in TOKEN_RE.findall(text) if k == "IMAGE"]


def count_open_items(md: str, available_images: set[str]) -> dict:
    """[확인 필요] 개수와, 캡처가 비어 있는 자리 개수(자리표시 + 파일 없는 이미지)."""
    capture = sum(1 for kind, value in TOKEN_RE.findall(md)
                  if kind == "CAPTURE_NEEDED" or value.split("|", 1)[0] not in available_images)
    return {"check": md.count(CHECK_NEEDED), "capture": capture}
