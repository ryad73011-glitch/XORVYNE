#!/usr/bin/env python3
"""Provision a local ffmpeg binary for XORVYNE's real MP4 export.

The binary is a platform-specific artefact, so it is *not* committed to the
repository. This script fetches it into `vendor/ffmpeg/` (git-ignored).

Usage:
    python3 scripts/setup_ffmpeg.py            # auto-detect a source
    python3 scripts/setup_ffmpeg.py --path /usr/bin/ffmpeg

Sources are tried in order:
    1. a system ffmpeg (already installed)
    2. the `imageio-ffmpeg` wheel from PyPI (bundles a static build)

No credentials are required and nothing is uploaded anywhere.
"""

from __future__ import annotations

import argparse
import json
import os
import platform
import shutil
import stat
import subprocess
import sys
import tempfile
import zipfile
from pathlib import Path
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parent.parent
TARGET_DIR = ROOT / "vendor" / "ffmpeg"
TARGET = TARGET_DIR / "ffmpeg"
FONT_DIR = ROOT / "vendor" / "fonts"


def system_ffmpeg() -> str | None:
    found = shutil.which("ffmpeg")
    if found:
        return found
    for candidate in ("/usr/bin/ffmpeg", "/usr/local/bin/ffmpeg", "/opt/homebrew/bin/ffmpeg"):
        if os.path.exists(candidate):
            return candidate
    return None


def compatible_wheel_suffixes() -> tuple[str, ...]:
    """Return supported imageio-ffmpeg wheel platform suffixes, best first."""
    machine = platform.machine().lower()
    if sys.platform.startswith("linux"):
        if machine in {"x86_64", "amd64"}:
            return ("manylinux2014_x86_64.whl",)
        if machine in {"aarch64", "arm64"}:
            return ("manylinux2014_aarch64.whl",)
    elif sys.platform == "darwin":
        if machine in {"arm64", "aarch64"}:
            return ("macosx_11_0_arm64.whl",)
        if machine in {"x86_64", "amd64"}:
            return ("macosx_10_9_intel.macosx_10_9_x86_64.whl",)
    elif sys.platform == "win32":
        if machine in {"amd64", "x86_64"}:
            return ("win_amd64.whl",)
        if machine in {"x86", "i386", "i686"}:
            return ("win32.whl",)
    return ()


def fetch_from_pypi(destination: Path) -> bool:
    """Fetch and extract the wheel matching this OS/architecture."""
    index = "https://pypi.org/pypi/imageio-ffmpeg/json"
    try:
        with urlopen(index, timeout=60) as response:  # fixed HTTPS host
            payload = json.loads(response.read().decode("utf-8"))
        suffixes = compatible_wheel_suffixes()
        files = payload["urls"]
        wheel = next(
            (item for suffix in suffixes for item in files if item["filename"].endswith(suffix)),
            None,
        )
        if wheel is None:
            print(f"  ! no imageio-ffmpeg wheel matches {sys.platform}/{platform.machine()}")
            return False
        with urlopen(wheel["url"], timeout=300) as response:  # URL is returned by the fixed PyPI index
            wheel_bytes = response.read()
        with tempfile.TemporaryDirectory() as temp_dir:
            wheel_path = Path(temp_dir) / wheel["filename"]
            wheel_path.write_bytes(wheel_bytes)
            with zipfile.ZipFile(wheel_path) as archive:
                binaries = [
                    name for name in archive.namelist()
                    if "/binaries/ffmpeg-" in name and not name.endswith("/")
                ]
                if len(binaries) != 1:
                    print(f"  ! expected one ffmpeg binary in {wheel['filename']}, found {len(binaries)}")
                    return False
                destination.write_bytes(archive.read(binaries[0]))
        return True
    except Exception as error:  # pragma: no cover - network dependent
        print(f"  ! could not download the matching wheel: {error}")
        return False


def copy_font() -> None:
    FONT_DIR.mkdir(parents=True, exist_ok=True)
    candidates = [
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
        "/System/Library/Fonts/Supplemental/Arial.ttf",
    ]
    for candidate in candidates:
        if os.path.exists(candidate):
            shutil.copy2(candidate, FONT_DIR / "DejaVuSans.ttf")
            print(f"  + font {candidate} -> vendor/fonts/DejaVuSans.ttf")
            return
    print("  ! no system font found — text overlays will use the ffmpeg default font")


def main() -> int:
    parser = argparse.ArgumentParser(description="Install a local ffmpeg for XORVYNE exports")
    parser.add_argument("--path", help="use an existing ffmpeg binary")
    args = parser.parse_args()

    TARGET_DIR.mkdir(parents=True, exist_ok=True)

    source: str | None = args.path or system_ffmpeg()
    if source:
        print(f"  + using {source}")
        shutil.copy2(source, TARGET)
    else:
        print("  · no system ffmpeg found, fetching a static build…")
        if not fetch_from_pypi(TARGET):
            print("  ! could not obtain ffmpeg. Install it manually and re-run with --path.")
            return 1
        print("  + matching static ffmpeg installed")

    TARGET.chmod(TARGET.stat().st_mode | stat.S_IEXEC | stat.S_IXGRP | stat.S_IXOTH)

    try:
        result = subprocess.run(
            [str(TARGET), "-version"], capture_output=True, text=True, timeout=30, check=True
        )
        version_line = result.stdout.splitlines()[0]
        print(f"  ✓ {version_line}")
    except Exception as error:  # pragma: no cover - platform dependent
        print(f"  ! the binary could not be executed: {error}")
        return 1

    copy_font()
    print(f"  ✓ ffmpeg ready at {TARGET}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
