from __future__ import annotations

import streamlit as st

from ..config import settings
from ..database import Database


@st.cache_resource
def get_database() -> Database:
    return Database(settings.database_path)
