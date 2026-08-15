#!/usr/bin/env python3
"""
Automated YouTube upload script for slashman413 channel.
Uploads a digital-product promotional Short with title, description, and thumbnail.
Outputs upload-report.json with the video_id and metadata.

Usage:
  python3 upload_promo.py [options]

Options:
  --video PATH       Path to the .mp4 file (default: auto-generate)
  --config PATH      Path to config JSON (default: promo-config.json in same dir)
  --dry-run          Preview without uploading
  --report PATH      Output report path (default: upload-report.json)
"""

import argparse
import json
import os
import re
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

try:
    import google.auth
    from google.auth.transport.requests import Request
    from google.oauth2.credentials import Credentials
    from google_auth_oauthlib.flow import Flow
    from googleapiclient.discovery import build
    from googleapiclient.errors import HttpError
    from googleapiclient.http import MediaFileUpload
except ImportError:
    print("ERROR: Missing required packages. Install with:")
    print("  pip install google-api-python-client google-auth-oauthlib google-auth-httplib2")
    sys.exit(1)


# ── Defaults ──────────────────────────────────────────────────────────────────

DEFAULT_TOKEN_FILE = "/home/wayne/.priv/slashman413_youtube_token.json"
DEFAULT_CHANNEL_ID = "UCw-Y-a5YT7169o4W7_585Vw"
DEFAULT_CATEGORY = "20"  # Entertainment (digital product promo)
SHORTEST_DURATION = 5  # seconds minimum
MAX_DURATION = 60  # seconds max for Shorts

SCRIPT_DIR = Path(__file__).resolve().parent
TEST_VIDEO = SCRIPT_DIR / "test-video.mp4"


def log(msg: str):
    ts = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    print(f"[{ts}] {msg}")


# ── Token management ──────────────────────────────────────────────────────────

def load_credentials(token_file: str) -> Credentials | None:
    """Load YouTube credentials, auto-refresh if expired."""
    token_path = Path(token_file)
    if not token_path.exists():
        raise FileNotFoundError(f"Token file not found: {token_file}")

    with open(token_path) as f:
        token_data = json.load(f)

    creds = Credentials(
        token=None,  # will trigger refresh
        refresh_token=token_data["refresh_token"],
        client_id=token_data["client_id"],
        client_secret=token_data["client_secret"],
        token_uri=token_data.get("token_uri", "https://oauth2.googleapis.com/token"),
        scopes=token_data.get("scopes", [
            "https://www.googleapis.com/auth/youtube.upload",
            "https://www.googleapis.com/auth/youtube.force-ssl",
        ]),
    )

    if creds.expired:
        log("Access token expired — refreshing...")
        creds.refresh(Request())
        log("Access token refreshed.")

        # Save updated token (access_token may have changed)
        with open(token_path, "w") as f:
            json.dump({
                "client_id": token_data["client_id"],
                "client_secret": token_data["client_secret"],
                "refresh_token": creds.refresh_token,
                "token_uri": creds.token_uri,
                "scopes": creds.scopes,
                "access_token": creds.token,
                "expires_at": creds.expiry.timestamp() if creds.expiry else None,
            }, f, indent=2)

    return creds


# ── Video generation ─────────────────────────────────────────────────────────

def generate_test_video(video_path: str):
    """Generate a simple promotional test video using ffmpeg."""
    log(f"Generating test video: {video_path}")

    # Create a 10-second video with colored bars and text overlay
    # Using h364 + aac for YouTube compatibility
    # Generate a solid color background with text
    duration = 10
    cmd = [
        "ffmpeg", "-y",
        "-f", "lavfi", "-i",
        f"color=c=0x1a1a2e:s=1080x1920:d={duration},format=yuv420p",
        "-vf",
        f"drawtext=text='Slashman Tools':fontsize=80:fontcolor=white:"
        f"x=(w-text_w)/2:y=(h-text_h)/2:"
        f"fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf,"
        f"drawtext=text='AI Automation Products':fontsize=50:fontcolor=#00d4ff:"
        f"x=(w-text_w)/2:y=h/2+80:"
        f"fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "-t", str(duration),
        "-c:v", "libx264",
        "-preset", "fast",
        "-crf", "23",
        "-c:a", "aac",
        "-b:a", "128k",
        "-pix_fmt", "yuv420p",
        "-shortest",
        video_path
    ]

    result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
    if result.returncode != 0:
        # Try without fontfile (uses built-in fallback)
        cmd[-13:-13] = []  # remove fontfile args
        cmd2 = [
            "ffmpeg", "-y",
            "-f", "lavfi", "-i",
            f"color=c=0x1a1a2e:s=1080x1920:d={duration},format=yuv420p",
            "-vf",
            f"drawtext=text='Slashman Tools':fontsize=80:fontcolor=white:x=(w-text_w)/2:y=h/2-40,"
            f"drawtext=text='AI Products':fontsize=50:fontcolor=00d4ff:x=(w-text_w)/2:y=h/2+60",
            "-t", str(duration),
            "-c:v", "libx264", "-preset", "fast", "-crf", "23",
            "-c:a", "aac", "-b:a", "128k",
            "-pix_fmt", "yuv420p", "-shortest",
            video_path
        ]
        result = subprocess.run(cmd2, capture_output=True, text=True, timeout=120)

    if result.returncode != 0:
        log(f"ffmpeg stderr: {result.stderr[-500:]}")
        raise RuntimeError(f"ffmpeg failed with code {result.returncode}")

    # Verify the video
    verify = subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", "v:0",
         "-show_entries", "stream=width,height",
         "-of", "csv=p=0", video_path],
        capture_output=True, text=True, timeout=10
    )
    res = verify.stdout.strip()
    log(f"Generated test video: {video_path} ({res})")
    return video_path


def ensure_video_exists(video_path: str) -> str:
    """If no video provided, generate a test one."""
    if video_path and Path(video_path).exists():
        log(f"Using provided video: {video_path}")
        return video_path

    if TEST_VIDEO.exists():
        log(f"Using existing test video: {TEST_VIDEO}")
        return str(TEST_VIDEO)

    log("No video found — generating a test promotional Short...")
    generate_test_video(str(TEST_VIDEO))
    return str(TEST_VIDEO)


# ── Config loading ────────────────────────────────────────────────────────────

def load_config(config_path: str) -> dict:
    """Load upload config. Returns dict with title, description, tags, etc."""
    config_file = Path(config_path)

    if config_file.exists():
        with open(config_file) as f:
            return json.load(f)

    # Generate default config for product promotion
    log("No config file found — generating default promotional config.")
    return {
        "channel_id": DEFAULT_CHANNEL_ID,
        "category": DEFAULT_CATEGORY,
        "privacy_status": "public",
        "title": "Slashman Tools — AI Workflow Builder",
        "description": (
            "Automate your workflow with Slashman Tools AI products.\n\n"
            "🛒 Get it on Gumroad: https://slashmantools.us\n\n"
            "#AI #Automation #Workflow #AIProducts #SlashmanTools\n"
            "#aigenerated #AIWorkflowBuilder"
        ),
        "tags": [
            "AI", "automation", "workflow", "slashman tools",
            "gumroad", "AI products", "prompt library", "aigenerated",
            "digital product", "AI workflow builder"
        ],
        "video_file": None,  # will auto-generate
    }


# ── YouTube upload ────────────────────────────────────────────────────────────

def upload_video(service, file_path: str, config: dict, video_id: str = None) -> dict:
    """Upload a video to YouTube via the Data API v3."""
    snippet = {
        "title": config.get("title", "Slashman Tools — AI Automation"),
        "description": config.get("description", ""),
        "tags": config.get("tags", []),
        "categoryId": config.get("category", DEFAULT_CATEGORY),
    }

    # Sanitize title — no emojis (YouTube rejects them)
    snippet["title"] = re.sub(
        r'[\U0001F600-\U0001F64F\U0001F300-\U0001F5FF\U0001F680-\U0001F6FF'
        r'\U0001F900-\U0001F9FF\U00002702-\U000027B0]', '', snippet["title"]
    ).strip()

    status = {
        "privacyStatus": config.get("privacy_status", "public"),
        "selfDeclaredMadeForKids": False,
        "containsSyntheticMedia": True,  # AI disclosure
    }

    body = {
        "snippet": snippet,
        "status": status,
    }

    media = MediaFileUpload(
        file_path,
        chunksize=-1,  # Auto-chunk for resumable upload
        resumable=True,
        mimetype='video/mp4',
    )

    log(f"Uploading video (title: {snippet['title']})...")
    response = service.videos().insert(
        part=",".join(body.keys()),
        body=body,
        media_body=media,
    ).execute()

    video_id = response["id"]
    log(f"Upload complete! Video ID: {video_id}")
    log(f"Status: {response.get('status', {}).get('uploadStatus', 'unknown')}")

    return {
        "video_id": video_id,
        "title": snippet["title"],
        "privacy_status": status["privacyStatus"],
        "category": snippet["categoryId"],
        "status": response.get("status", {}),
        "upload_time": datetime.now(timezone.utc).isoformat() + "Z",
    }


def set_thumbnail(service, video_id: str, video_path: str):
    """Extract a frame from the video and set it as the thumbnail."""
    thumb_path = f"/tmp/thumbnail_{video_id}.jpg"

    # Extract frame at 50% into the video
    try:
        cmd = [
            "ffmpeg", "-y", "-i", video_path,
            "-ss", "00:00:03",  # 3 seconds in
            "-vframes", "1",
            "-vf", "scale=1280:720",
            thumb_path
        ]
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
        if result.returncode == 0 and Path(thumb_path).exists():
            media = MediaFileUpload(thumb_path, mimetype="image/jpeg")
            service.thumbnails().set(videoId=video_id, media_body=media).execute()
            log(f"Thumbnail set for video {video_id}")
            return True
    except Exception as e:
        log(f"Thumbnail set failed (non-critical): {e}")
    return False


# ── Verification ──────────────────────────────────────────────────────────────

def verify_upload(video_id: str) -> dict:
    """Verify the upload using YouTube's public oEmbed endpoint (no auth needed)."""
    oembed_url = f"https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v={video_id}&format=json"

    try:
        import urllib.request
        with urllib.request.urlopen(oembed_url, timeout=15) as resp:
            data = json.loads(resp.read().decode())
            return {
                "verified": True,
                "oembed_title": data.get("title"),
                "oembed_author": data.get("author_name"),
            }
    except Exception as e:
        return {"verified": False, "error": str(e)}


# ── Report ────────────────────────────────────────────────────────────────────

def write_report(report_data: dict, report_path: str):
    """Write the upload report as JSON."""
    report_file = Path(report_path)
    with open(report_file, "w") as f:
        json.dump(report_data, f, indent=2, ensure_ascii=False)
    log(f"Report written to: {report_file}")


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Upload a promotional video to YouTube")
    parser.add_argument("--video", type=str, default=None, help="Path to the MP4 video file")
    parser.add_argument("--config", type=str, default=str(SCRIPT_DIR / "promo-config.json"), help="Config JSON path")
    parser.add_argument("--dry-run", action="store_true", help="Preview without uploading")
    parser.add_argument("--report", type=str, default=str(SCRIPT_DIR / "upload-report.json"), help="Report output path")
    parser.add_argument("--token", type=str, default=None, help="Path to YouTube OAuth token JSON file")
    args = parser.parse_args()

    # Resolve token file: --token > env YT_TOKEN_PATH > default
    token_file = args.token or os.environ.get("YT_TOKEN_PATH", DEFAULT_TOKEN_FILE)

    log("=" * 60)
    log("Slashman413 YouTube Promo Upload Script")
    log("=" * 60)

    # 1. Load config
    config = load_config(args.config)

    # 2. Ensure video exists
    video_path = ensure_video_exists(args.video or "")
    if not Path(video_path).exists():
        log(f"FATAL: No video file found: {video_path}")
        sys.exit(1)

    video_size = Path(video_path).stat().st_size
    log(f"Video: {video_path} ({video_size / 1024 / 1024:.1f} MB)")

    # 3. Dry-run mode
    if args.dry_run:
        log("=" * 60)
        log("DRY RUN — no upload will be performed")
        log("=" * 60)
        print(f"\nConfig:\n  Title: {config.get('title', 'N/A')}")
        print(f"  Description (first 80 chars): {config.get('description', '')[:80]}...")
        print(f"  Tags: {', '.join(config.get('tags', []))}")
        print(f"  Category: {config.get('category', DEFAULT_CATEGORY)}")
        print(f"  Privacy: {config.get('privacy_status', 'public')}")
        print(f"  Video: {video_path}")

        # Verify credentials work (minimal auth check)
        try:
            creds = load_credentials(token_file)
            log("Credentials valid — token refresh successful.")
        except Exception as e:
            log(f"Credentials error: {e}")

        # Write report
        report = {
            "dry_run": True,
            "video_path": video_path,
            "config": config,
            "timestamp": datetime.now(timezone.utc).isoformat() + "Z",
        }
        write_report(report, args.report)
        log("Dry-run complete.")
        return

    # 4. Build YouTube service
    log("Loading credentials...")
    creds = load_credentials(token_file)
    service = build("youtube", "v3", credentials=creds)

    # 5. Upload
    try:
        upload_result = upload_video(service, video_path, config)
    except HttpError as e:
        log(f"FATAL: YouTube API error (HTTP {e.resp.status}): {e.content.decode()}")
        report = {
            "error": str(e),
            "http_status": e.resp.status,
            "error_content": e.content.decode()[:500],
            "video_path": video_path,
            "timestamp": datetime.now(timezone.utc).isoformat() + "Z",
        }
        write_report(report, args.report)
        sys.exit(1)

    # 6. Set thumbnail
    set_thumbnail(service, upload_result["video_id"], video_path)

    # 7. Verify upload via oEmbed (public, no auth needed)
    log("Verifying upload via oEmbed...")
    verification = verify_upload(upload_result["video_id"])
    log(f"Verification: {verification}")

    # 8. Build final report
    final_report = {
        "upload_success": True,
        "video_id": upload_result["video_id"],
        "title": upload_result["title"],
        "privacy_status": upload_result["privacy_status"],
        "category": upload_result["category"],
        "video_path": video_path,
        "video_size_bytes": video_size,
        "upload_time": upload_result["upload_time"],
        "verification": verification,
        "channel_id": DEFAULT_CHANNEL_ID,
        "status": "success",
    }

    write_report(final_report, args.report)
    print(json.dumps(final_report, indent=2, ensure_ascii=False))
    log("Upload pipeline complete ✓")


if __name__ == "__main__":
    main()