import json
from pathlib import Path

STORAGE = Path(__file__).resolve().parents[1] / "storage"
PROJECTS_DIR = STORAGE / "projects"
IMAGES_DIR = STORAGE / "images"
VIDEOS_DIR = STORAGE / "videos"

MEDIA_KEYS = {"imagePath", "videoPath", "upscaledVideoPath", "finalVideoPath"}
IMAGE_EXTS = {".png", ".jpg", ".jpeg", ".webp"}
VIDEO_EXTS = {".mp4", ".webm", ".mov"}


def collect_paths(obj: object, found: set[str]) -> None:
    if isinstance(obj, dict):
        for key, value in obj.items():
            if key in MEDIA_KEYS and isinstance(value, str) and value.strip():
                found.add(Path(value.strip()).name)
            else:
                collect_paths(value, found)
    elif isinstance(obj, list):
        for item in obj:
            collect_paths(item, found)


def main() -> None:
    referenced: set[str] = set()
    project_files = sorted(PROJECTS_DIR.glob("*.json"))

    for project_file in project_files:
        with project_file.open("r", encoding="utf-8") as handle:
            collect_paths(json.load(handle), referenced)

    orphans: list[Path] = []
    for directory, extensions in ((IMAGES_DIR, IMAGE_EXTS), (VIDEOS_DIR, VIDEO_EXTS)):
        if not directory.exists():
            continue
        for path in directory.iterdir():
            if not path.is_file() or path.suffix.lower() not in extensions:
                continue
            if path.name not in referenced:
                orphans.append(path)

    print(f"Projects scanned: {len(project_files)}")
    print(f"Referenced media files: {len(referenced)}")
    print(f"Orphan files to delete: {len(orphans)}")

    deleted = 0
    for path in sorted(orphans):
        print(f"  DELETE {path}")
        path.unlink()
        deleted += 1

    print(f"Deleted {deleted} orphan image/video file(s).")


if __name__ == "__main__":
    main()
