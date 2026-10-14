"""설정과 동작 모드(API/모의) 판단."""
import os
from pathlib import Path

import streamlit as st

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"


def _read_dotenv(path: Path) -> dict:
    """프로젝트 맨 위의 .env를 읽는다. 없으면 빈 dict."""
    values = {}
    if not path.exists():
        return values
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        values[key.strip()] = value.strip().strip('"').strip("'")
    return values


def get_api_key() -> str:
    """.env가 우선이고, 없으면 환경 변수(클라우드 환경 설정)를 쓴다."""
    return _read_dotenv(ROOT / ".env").get("ANTHROPIC_API_KEY") or os.environ.get("ANTHROPIC_API_KEY", "")


def is_api_mode() -> bool:
    return bool(get_api_key())


def show_mode_badge() -> None:
    if is_api_mode():
        st.success("🟢 API 모드 — Claude가 초안 작성·재작성·캡처 설명·Q&A 답변을 합니다.")
    else:
        st.info("🟡 모의 모드 — API 키가 없어 미리 만든 예시(mock/)로 동작합니다.")
