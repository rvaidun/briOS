#!/usr/bin/env python3
"""Fetch places from a Google Maps shared list.

Hits the internal /maps/preview/entitylist/getlist endpoint, which is public —
no auth, session, or cookies needed. Outputs a JSON array of place objects to
stdout. Designed to run from cron.

The endpoint returns name, address, lat/lng, and feature ID for each place.
Feature IDs are stored as signed int64 pairs in the response; we decode them
back to the canonical 0xhex:0xhex Google Maps format.

Usage:
    python sync_places.py <url-or-list-id>

Accepts any of:
    https://maps.app.goo.gl/<short>           (short share link)
    https://www.google.com/maps/placelists/list/<id>
    https://www.google.com/maps/@/data=...!2s<id>!3e3
    <id>                                        (raw list ID)
"""
import argparse
import concurrent.futures
import json
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

RESOLVER_URL = (
    "https://www.google.com/maps/preview/entitylist/getlist"
    "?authuser=0&hl=en&gl=us"
    "&pb=!1m4!1s{list_id}!2e1!3m1!1e1!2e2!3e2!4i500"
)
DETAILS_URL_BASE = (
    "https://www.google.com/search"
    "?tbm=map&authuser=0&hl=en&gl=us&q=*&tch=1&ech=1"
)
# Minimal pb prefix: dummy viewport + page size. Feature IDs appended dynamically.
DETAILS_PB_PREFIX = (
    "!4m9!1m3!1d56901922.45882482!2d-140.3854305!3d39.0635711"
    "!2m0!3m2!1i756!2i861!4f13.1!7i50"
)
DETAILS_PB_SUFFIX = "!77b1"
USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36"
)


def _get(url: str, user_agent: str = USER_AGENT) -> tuple[str, str]:
    """GET with browser-ish headers. Returns (final_url, body)."""
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": user_agent,
            "Accept": "*/*",
            "Referer": "https://www.google.com/",
        },
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        return resp.geturl(), resp.read().decode("utf-8")


def _resolve_short_url(url: str) -> str:
    # Google returns a 200 + JS redirect shell when UA is Chrome, but a clean
    # 302 when UA is curl-like. urllib auto-follows 302s — take that branch.
    final, _ = _get(url, user_agent="curl/8.0.0")
    return final


def extract_list_id(url_or_id: str) -> str:
    """Pull the list ID from any accepted input format."""
    s = url_or_id.strip()

    if re.fullmatch(r"[A-Za-z0-9_-]{20,40}", s):
        return s

    if "maps.app.goo.gl" in s:
        s = _resolve_short_url(s)

    m = re.search(r"/maps/placelists/list/([A-Za-z0-9_-]+)", s)
    if m:
        return m.group(1)

    m = re.search(r"!2s([A-Za-z0-9_-]+)!3e3", s)
    if m:
        return m.group(1)

    raise ValueError(f"Could not extract list ID from: {url_or_id!r}")


def _signed_int64_str_to_hex(value: str) -> str:
    n = int(value)
    if n < 0:
        n += 1 << 64
    return f"0x{n:x}"


def parse_place(entry: list) -> dict | None:
    """Pull one place out of the resolver response array.

    Entry shape (positional):
      [0]  null
      [1]  [..., full_address_or_empty, null, short_address, [_,_,lat,lng],
            [id1_signed_str, id2_signed_str], "/g/..." or "/m/..." path]
      [2]  place name
      [3]  user-added note (empty string if none)
      [9]  [added_epoch_seconds, nanos]
    """
    meta = entry[1] if len(entry) > 1 and isinstance(entry[1], list) else []
    name = entry[2] if len(entry) > 2 else None
    note = entry[3] if len(entry) > 3 and isinstance(entry[3], str) else ""
    if not name:
        return None

    full_address = meta[2] if len(meta) > 2 else ""
    short_address = meta[4] if len(meta) > 4 else ""
    coords = meta[5] if len(meta) > 5 and isinstance(meta[5], list) else []
    fid_pair = meta[6] if len(meta) > 6 and isinstance(meta[6], list) else []
    gmaps_path = meta[7] if len(meta) > 7 else None

    lat = coords[2] if len(coords) > 2 else None
    lng = coords[3] if len(coords) > 3 else None

    feature_id = None
    cid = None
    if len(fid_pair) >= 2:
        feature_id = (
            f"{_signed_int64_str_to_hex(fid_pair[0])}:"
            f"{_signed_int64_str_to_hex(fid_pair[1])}"
        )
        # CID is the unsigned-decimal form of the second half. Google Maps
        # accepts `?cid=<decimal>` as a stable deep link.
        cid_int = int(fid_pair[1])
        if cid_int < 0:
            cid_int += 1 << 64
        cid = str(cid_int)

    city = None
    # Prefer short_address ("<street>, <city>, <state> <zip>") then derive from
    # full_address as fallback.
    addr_for_city = short_address or full_address or ""
    if addr_for_city:
        parts = [p.strip() for p in addr_for_city.split(",")]
        if len(parts) >= 2:
            city = parts[-2]

    map_url = f"https://maps.google.com/?cid={cid}" if cid else None

    added_ts = entry[9] if len(entry) > 9 and isinstance(entry[9], list) else None
    added_epoch = added_ts[0] if added_ts else None

    return {
        "name": name,
        "note": note or None,
        "full_address": full_address or None,
        "short_address": short_address or None,
        "city": city,
        "lat": lat,
        "lng": lng,
        "feature_id": feature_id,
        "cid": cid,
        "gmaps_path": gmaps_path,
        "map_url": map_url,
        "added_at_epoch": added_epoch,
    }


def _get_deep(obj: object, *path: object) -> object:
    cur = obj
    for p in path:
        try:
            cur = cur[p]  # type: ignore[index]
        except (IndexError, KeyError, TypeError):
            return None
    return cur


def fetch_details(feature_ids: list[str]) -> dict[str, dict]:
    """Batch-fetch category/tagline/rating/website for the given feature IDs.

    Hits /search?tbm=map with a `pb` that embeds each feature ID. Returns a
    map from feature_id (lowercase hex) to the parsed detail dict.
    """
    if not feature_ids:
        return {}

    fid_block = "".join(
        f"!72m2!1m1!1s{urllib.parse.quote(fid, safe='')}" for fid in feature_ids
    )
    pb = DETAILS_PB_PREFIX + fid_block + DETAILS_PB_SUFFIX
    url = f"{DETAILS_URL_BASE}&pb={pb}"
    _, body = _get(url)

    # Response is a JSON object followed by a JS chunk-terminator comment
    # (e.g. `/*""*/`), so parse incrementally instead of json.loads.
    payload, _end = json.JSONDecoder().raw_decode(body)
    d = payload.get("d", "")
    if d.startswith(")]}'"):
        d = d.split("\n", 1)[1]
    data = json.loads(d)

    entries = data[0][1] if len(data[0]) > 1 else []
    out: dict[str, dict] = {}
    for raw in entries:
        inner = _get_deep(raw, 14)
        if not isinstance(inner, list):
            continue
        feature_id = _get_deep(inner, 10)
        if not isinstance(feature_id, str):
            continue

        categories_raw = _get_deep(inner, 13)
        categories: list[str] = []
        if isinstance(categories_raw, list):
            categories = [c for c in categories_raw if isinstance(c, str)]

        rating = _get_deep(inner, 4, 7)
        if not isinstance(rating, (int, float)):
            rating = None

        website = _get_deep(inner, 7, 0)
        if not isinstance(website, str):
            website = None

        tagline = _get_deep(inner, 32, 0, 1)
        description = _get_deep(inner, 32, 1, 1)

        out[feature_id.lower()] = {
            "categories": categories,
            "primary_category": categories[0] if categories else None,
            "rating": rating,
            "website": website,
            "tagline": tagline if isinstance(tagline, str) else None,
            "description": description if isinstance(description, str) else None,
        }
    return out


def fetch_places(url_or_id: str, with_details: bool = True) -> list[dict]:
    list_id = extract_list_id(url_or_id)
    print(f"list_id={list_id}", file=sys.stderr)

    _, body = _get(RESOLVER_URL.format(list_id=list_id))
    if body.startswith(")]}'"):
        body = body.split("\n", 1)[1]
    data = json.loads(body)

    entries = data[0][8] if len(data[0]) > 8 else None
    if not isinstance(entries, list):
        raise RuntimeError(
            f"Unexpected response shape: data[0][8] is {type(entries).__name__}"
        )

    places = [p for p in (parse_place(e) for e in entries) if p]

    if with_details:
        feature_ids = [p["feature_id"] for p in places if p.get("feature_id")]
        details = fetch_details(feature_ids)
        print(f"details fetched for {len(details)}/{len(feature_ids)} places", file=sys.stderr)
        for p in places:
            fid = (p.get("feature_id") or "").lower()
            d = details.get(fid)
            if d:
                p.update(d)

    return places


# ===== Notion sync =====
#
# Matching: by Map URL (stable CID-based).
#   - Place NOT in Notion → created with every field we have (blanks included,
#     so the row has a complete shape for the user to fill in later).
#   - Place already in Notion → ONLY the Notes field is overwritten from the
#     Google Maps note (so notes written in the Maps app flow through). Every
#     other column (Name, Category, City, Map URL) is left alone so manual
#     edits survive. If Google has no note for that place, the row is skipped
#     entirely — manual Notion notes aren't blanked out.
#   - Place removed from the Google list → left alone in Notion (no deletes).
#
# Writes are parallelized with 3 concurrent workers — under Notion's 3 req/sec
# soft limit.

NOTION_API = "https://api.notion.com/v1"
NOTION_VERSION = "2022-06-28"
NOTION_CONCURRENCY = 3


def _load_env_file(path: Path) -> dict[str, str]:
    """Small .env parser (KEY=VALUE per line, optional quotes, # comments)."""
    out: dict[str, str] = {}
    if not path.exists():
        return out
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, val = line.partition("=")
        val = val.strip()
        if (val.startswith('"') and val.endswith('"')) or (
            val.startswith("'") and val.endswith("'")
        ):
            val = val[1:-1]
        out[key.strip()] = val
    return out


def _notion_request(method: str, path: str, token: str, body: dict | None = None) -> dict:
    url = f"{NOTION_API}/{path.lstrip('/')}"
    data = json.dumps(body).encode("utf-8") if body is not None else None
    req = urllib.request.Request(
        url,
        data=data,
        method=method,
        headers={
            "Authorization": f"Bearer {token}",
            "Notion-Version": NOTION_VERSION,
            "Content-Type": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        err_body = e.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Notion API {method} {path} failed ({e.code}): {err_body}") from e


def _build_create_props(place: dict) -> dict:
    """Build a Notion properties payload for a NEW row.

    Includes every field we know about (blanks included) so the row has a
    complete shape for the user to fill in manually later.
    """
    name = place["name"]
    city = place.get("city") or ""
    note = place.get("note") or ""
    map_url = place.get("map_url") or None
    category = place.get("primary_category")

    return {
        "Name": {"title": [{"text": {"content": name}}]},
        "City": {"rich_text": [{"text": {"content": city}}] if city else []},
        "Map URL": {"url": map_url},
        "Notes": {"rich_text": [{"text": {"content": note}}] if note else []},
        "Category": {"select": {"name": category}} if category else {"select": None},
    }


def _fetch_existing_rows(database_id: str, token: str) -> dict[str, dict]:
    """Return {map_url: {page_id, note}} so we can compare existing notes."""
    out: dict[str, dict] = {}
    cursor: str | None = None
    while True:
        body: dict = {"page_size": 100}
        if cursor:
            body["start_cursor"] = cursor
        data = _notion_request("POST", f"databases/{database_id}/query", token, body)
        for page in data.get("results", []):
            props = page.get("properties", {})
            map_url = props.get("Map URL", {}).get("url")
            if not map_url:
                continue
            note_rts = props.get("Notes", {}).get("rich_text", []) or []
            current_note = "".join(rt.get("plain_text", "") for rt in note_rts)
            out[map_url] = {"page_id": page["id"], "note": current_note}
        if not data.get("has_more"):
            break
        cursor = data.get("next_cursor")
    return out


def upsert_to_notion(
    places: list[dict], database_id: str, token: str
) -> tuple[int, int, int, int]:
    existing = _fetch_existing_rows(database_id, token)
    print(f"existing rows with Map URL: {len(existing)}", file=sys.stderr)

    to_create: list[dict] = []
    to_update_note: list[tuple[str, dict]] = []  # (page_id, place)
    unchanged = 0
    skipped_no_url = 0

    for place in places:
        map_url = place.get("map_url")
        if not map_url:
            skipped_no_url += 1
            continue
        existing_row = existing.get(map_url)
        if existing_row is None:
            to_create.append(place)
            continue
        google_note = place.get("note") or ""
        if google_note and google_note != existing_row["note"]:
            to_update_note.append((existing_row["page_id"], place))
        else:
            unchanged += 1

    def do_create(place: dict) -> str:
        _notion_request(
            "POST",
            "pages",
            token,
            {
                "parent": {"database_id": database_id},
                "properties": _build_create_props(place),
            },
        )
        return f"  created: {place['name']}"

    def do_update_note(page_id: str, place: dict) -> str:
        note = place.get("note") or ""
        _notion_request(
            "PATCH",
            f"pages/{page_id}",
            token,
            {
                "properties": {
                    "Notes": {"rich_text": [{"text": {"content": note}}]},
                }
            },
        )
        return f"  note-updated: {place['name']}"

    with concurrent.futures.ThreadPoolExecutor(max_workers=NOTION_CONCURRENCY) as ex:
        futures = [ex.submit(do_create, p) for p in to_create]
        futures += [ex.submit(do_update_note, pid, p) for pid, p in to_update_note]
        for f in concurrent.futures.as_completed(futures):
            print(f.result(), file=sys.stderr)

    return len(to_create), len(to_update_note), unchanged, skipped_no_url


def main() -> int:
    parser = argparse.ArgumentParser(
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("url", help="Shared list URL, placelists URL, or raw list ID")
    parser.add_argument("--pretty", action="store_true", help="Pretty-print JSON")
    parser.add_argument(
        "--no-details",
        action="store_true",
        help="Skip the secondary category/rating/website fetch (resolver only)",
    )
    parser.add_argument(
        "--upsert",
        action="store_true",
        help="Create new places in the Notion database, and sync the Notes "
        "column on existing rows from the Google Maps note. All other "
        "columns on existing rows are left untouched. Requires NOTION_TOKEN "
        "and NOTION_PLACES_DATABASE_ID in env or .env.",
    )
    args = parser.parse_args()

    places = fetch_places(args.url, with_details=not args.no_details)

    if args.upsert:
        env = _load_env_file(Path(__file__).with_name(".env"))
        token = os.environ.get("NOTION_TOKEN") or env.get("NOTION_TOKEN")
        db_id = os.environ.get("NOTION_PLACES_DATABASE_ID") or env.get(
            "NOTION_PLACES_DATABASE_ID"
        )
        if not token or not db_id:
            print(
                "error: NOTION_TOKEN and NOTION_PLACES_DATABASE_ID must be set",
                file=sys.stderr,
            )
            return 1
        created, note_updated, unchanged, skipped = upsert_to_notion(places, db_id, token)
        print(
            f"sync done: {created} created, {note_updated} notes updated, "
            f"{unchanged} unchanged, {skipped} skipped (no map url)",
            file=sys.stderr,
        )
        return 0

    json.dump(places, sys.stdout, indent=2 if args.pretty else None, ensure_ascii=False)
    sys.stdout.write("\n")
    print(f"fetched {len(places)} places", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
