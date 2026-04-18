"""
Supabase client for the GNOSIS backend.
Uses the service role key to bypass RLS for server-side operations.
"""

import os
from supabase import create_client, Client


def get_supabase() -> Client:
    url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        raise RuntimeError("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")
    return create_client(url, key)
