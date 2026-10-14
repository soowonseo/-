"""SQLite 저장소. 테이블 구조는 PRD 5장을 따른다."""
import json
import sqlite3
import uuid
from datetime import datetime

from config import DATA_DIR

DB_PATH = DATA_DIR / "manual.db"

SCHEMA = """
CREATE TABLE IF NOT EXISTS manual (
    manual_id TEXT PRIMARY KEY, task_name TEXT, dept TEXT, version INTEGER,
    status TEXT, content_md TEXT, source_files TEXT, origin TEXT, job_type TEXT,
    source_format TEXT, source_file TEXT, source_sheet TEXT, output_format TEXT,
    created_at DATETIME, confirmed_by TEXT, confirmed_at DATETIME
);
CREATE TABLE IF NOT EXISTS manual_section (
    section_id TEXT PRIMARY KEY, manual_id TEXT, version INTEGER,
    section_no TEXT, section_title TEXT, section_text TEXT
);
CREATE TABLE IF NOT EXISTS asset (
    asset_id TEXT PRIMARY KEY, manual_id TEXT, file_name TEXT, asset_type TEXT,
    target_section TEXT, caption TEXT
);
CREATE TABLE IF NOT EXISTS feedback (
    feedback_id TEXT PRIMARY KEY, manual_id TEXT, version INTEGER, section_id TEXT,
    comment TEXT, status TEXT, created_at DATETIME
);
CREATE TABLE IF NOT EXISTS revision (
    manual_id TEXT, version INTEGER, change_summary TEXT,
    confirmed_by TEXT, confirmed_at DATETIME
);
CREATE TABLE IF NOT EXISTS qa_log (
    qa_id TEXT PRIMARY KEY, question TEXT, answer TEXT, cited_section_ids TEXT,
    mode TEXT, asked_at DATETIME
);
"""


def connect() -> sqlite3.Connection:
    DATA_DIR.mkdir(exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.executescript(SCHEMA)
    return conn


def new_id() -> str:
    return uuid.uuid4().hex[:12]


def now() -> str:
    return datetime.now().isoformat(timespec="seconds")


def create_manual(*, job_type, task_name, output_format, source_format, source_sheet,
                  source_files) -> str:
    manual_id = new_id()
    with connect() as conn:
        conn.execute(
            "INSERT INTO manual (manual_id, task_name, version, status, source_files, origin,"
            " job_type, source_format, source_sheet, output_format, created_at)"
            " VALUES (?, ?, 0, '초안', ?, '생성', ?, ?, ?, ?, ?)",
            (manual_id, task_name, json.dumps(source_files, ensure_ascii=False), job_type,
             source_format, source_sheet, output_format, now()),
        )
    return manual_id


def set_source_file(manual_id, file_name) -> None:
    with connect() as conn:
        conn.execute("UPDATE manual SET source_file = ? WHERE manual_id = ?", (file_name, manual_id))


def add_asset(manual_id, file_name, asset_type, target_section=None, caption=None) -> str:
    asset_id = new_id()
    with connect() as conn:
        conn.execute(
            "INSERT INTO asset VALUES (?, ?, ?, ?, ?, ?)",
            (asset_id, manual_id, file_name, asset_type, target_section, caption),
        )
    return asset_id


def get_manual(manual_id):
    with connect() as conn:
        return conn.execute("SELECT * FROM manual WHERE manual_id = ?", (manual_id,)).fetchone()


def list_assets(manual_id):
    with connect() as conn:
        return conn.execute("SELECT * FROM asset WHERE manual_id = ?", (manual_id,)).fetchall()


def save_draft(manual_id, *, task_name, dept, version, content_md, sections) -> None:
    """초안 본문과 섹션을 저장한다. 같은 버전의 섹션은 새로 덮어쓴다."""
    with connect() as conn:
        conn.execute(
            "UPDATE manual SET task_name = ?, dept = ?, version = ?, content_md = ? WHERE manual_id = ?",
            (task_name, dept, version, content_md, manual_id),
        )
        conn.execute("DELETE FROM manual_section WHERE manual_id = ? AND version = ?", (manual_id, version))
        conn.executemany(
            "INSERT INTO manual_section VALUES (?, ?, ?, ?, ?, ?)",
            [(new_id(), manual_id, version, s["no"], s["title"], s["text"]) for s in sections],
        )


def list_sections(manual_id, version):
    with connect() as conn:
        return conn.execute(
            "SELECT * FROM manual_section WHERE manual_id = ? AND version = ? ORDER BY rowid",
            (manual_id, version),
        ).fetchall()


def update_section(manual_id, version, section_no, text) -> None:
    """섹션 하나의 본문을 바꾸고, 매뉴얼 전체 마크다운(content_md)도 다시 맞춘다."""
    import manual_md

    with connect() as conn:
        conn.execute(
            "UPDATE manual_section SET section_text = ? WHERE manual_id = ? AND version = ? AND section_no = ?",
            (text, manual_id, version, section_no),
        )
        row = conn.execute("SELECT content_md FROM manual WHERE manual_id = ?", (manual_id,)).fetchone()
        meta, _ = manual_md.split_frontmatter(row["content_md"])
        sections = [{"no": s["section_no"], "title": s["section_title"], "text": s["section_text"],
                     "level": 1 if "-" not in s["section_no"] else 2}
                    for s in conn.execute(
                        "SELECT * FROM manual_section WHERE manual_id = ? AND version = ? ORDER BY rowid",
                        (manual_id, version))]
        conn.execute("UPDATE manual SET content_md = ? WHERE manual_id = ?",
                     (manual_md.join_sections(meta, sections), manual_id))


def add_feedback(manual_id, version, section_id, comment, status) -> None:
    with connect() as conn:
        conn.execute("INSERT INTO feedback VALUES (?, ?, ?, ?, ?, ?, ?)",
                     (new_id(), manual_id, version, section_id, comment, status, now()))


def list_feedback(manual_id, version):
    with connect() as conn:
        return conn.execute(
            "SELECT * FROM feedback WHERE manual_id = ? AND version = ? ORDER BY created_at, rowid",
            (manual_id, version),
        ).fetchall()


def confirm(manual_id, *, confirmed_by, change_summary) -> None:
    with connect() as conn:
        manual = conn.execute("SELECT version FROM manual WHERE manual_id = ?", (manual_id,)).fetchone()
        at = now()
        conn.execute("UPDATE manual SET status = '확정', confirmed_by = ?, confirmed_at = ? WHERE manual_id = ?",
                     (confirmed_by, at, manual_id))
        conn.execute("INSERT INTO revision VALUES (?, ?, ?, ?, ?)",
                     (manual_id, manual["version"], change_summary, confirmed_by, at))
