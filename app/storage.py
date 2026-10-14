"""업로드 파일 저장. 작업(manual_id)마다 data/uploads/<manual_id>/ 폴더를 쓴다."""
from pathlib import Path

from config import DATA_DIR


def upload_dir(manual_id: str) -> Path:
    path = DATA_DIR / "uploads" / manual_id
    path.mkdir(parents=True, exist_ok=True)
    return path


def save_upload(manual_id: str, uploaded_file) -> str:
    """Streamlit 업로드 파일을 저장하고 파일명을 돌려준다."""
    name = Path(uploaded_file.name).name
    (upload_dir(manual_id) / name).write_bytes(uploaded_file.getvalue())
    return name


def save_text(manual_id: str, name: str, text: str) -> str:
    (upload_dir(manual_id) / name).write_text(text, encoding="utf-8")
    return name


IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg"}


def is_image(file_name: str) -> bool:
    """자료 종류 '엑셀'은 엑셀 파일과 엑셀 캡처 둘 다 뜻하므로, 그림 여부는 확장자로 판단한다."""
    return Path(file_name).suffix.lower() in IMAGE_EXTENSIONS
