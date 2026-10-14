"""업무매뉴얼 자동 작성 PoC — 실행: streamlit run app/main.py"""
import streamlit as st

from config import show_mode_badge

st.set_page_config(page_title="업무매뉴얼 자동 작성 PoC", page_icon="📘", layout="wide")

pages = [
    st.Page("views/input.py", title="1. 자료 입력", icon="📥", default=True),
    st.Page("views/review.py", title="2. 검토·확정", icon="📝"),
    st.Page("views/qa.py", title="3. 매뉴얼 Q&A", icon="💬"),
    st.Page("views/guide.py", title="4. 작성 가이드", icon="📖"),
]
nav = st.navigation(pages)

show_mode_badge()
nav.run()
