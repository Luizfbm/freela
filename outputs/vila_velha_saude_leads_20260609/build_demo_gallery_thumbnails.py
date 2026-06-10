from pathlib import Path
import re

from PIL import Image


ROOT = Path("/Users/luiz_fbm/Documents/programacao/freela")
GALLERY = ROOT / "demos" / "gallery.js"
THUMBNAILS = ROOT / "demos" / "thumbnails"


def slugs():
    text = GALLERY.read_text(encoding="utf-8")
    return re.findall(r'slug: "([^"]+)"', text)


def build_thumbnail(slug):
    source = ROOT / "demos" / slug / "screenshot-desktop.png"
    output = THUMBNAILS / f"{slug}.jpg"
    with Image.open(source) as image:
        image = image.convert("RGB")
        target_width = 640
        target_height = 400
        scale = target_width / image.width
        resized = image.resize((target_width, max(target_height, int(image.height * scale))))
        crop = resized.crop((0, 0, target_width, target_height))
        crop.save(output, quality=84, optimize=True)


def main():
    THUMBNAILS.mkdir(parents=True, exist_ok=True)
    for slug in slugs():
        build_thumbnail(slug)
    print(f"Thumbnails gerados: {len(slugs())}")


if __name__ == "__main__":
    main()
