from pathlib import Path
import re

from PIL import Image, ImageDraw, ImageFont


ROOT = Path("/Users/luiz_fbm/Documents/programacao/freela")
OUT_DIR = ROOT / "outputs" / "vila_velha_saude_leads_20260609"
README = ROOT / "demos" / "README.md"
START = "<!-- vila-velha-hot-demos:start -->"
END = "<!-- vila-velha-hot-demos:end -->"


def load_slugs():
    text = README.read_text(encoding="utf-8")
    block = text.split(START, 1)[1].split(END, 1)[0]
    return sorted(dict.fromkeys(re.findall(r"/demos/([^/\s]+)/", block)))


def make_sheet(slugs, kind):
    thumb_width = 260 if kind == "desktop" else 150
    thumb_height = 620 if kind == "desktop" else 620
    cols = 3 if kind == "desktop" else 6
    label_height = 42
    gap = 18
    margin = 24
    rows = (len(slugs) + cols - 1) // cols
    width = margin * 2 + cols * thumb_width + (cols - 1) * gap
    height = margin * 2 + rows * (thumb_height + label_height) + (rows - 1) * gap

    sheet = Image.new("RGB", (width, height), "#f5f5f2")
    draw = ImageDraw.Draw(sheet)
    font = ImageFont.load_default()

    for index, slug in enumerate(slugs):
        row, col = divmod(index, cols)
        x = margin + col * (thumb_width + gap)
        y = margin + row * (thumb_height + label_height + gap)
        image_path = ROOT / "demos" / slug / f"screenshot-{kind}.png"
        with Image.open(image_path) as image:
            image = image.convert("RGB")
            scale = thumb_width / image.width
            resized = image.resize((thumb_width, max(1, int(image.height * scale))))
            crop = resized.crop((0, 0, thumb_width, min(thumb_height, resized.height)))
            if crop.height < thumb_height:
                frame = Image.new("RGB", (thumb_width, thumb_height), "#ffffff")
                frame.paste(crop, (0, 0))
                crop = frame
            sheet.paste(crop, (x, y))
        draw.rectangle((x, y, x + thumb_width - 1, y + thumb_height - 1), outline="#c8c8c2", width=1)
        draw.text((x, y + thumb_height + 8), slug[:34], fill="#222222", font=font)

    output = OUT_DIR / f"hot-demos-contact-sheet-{kind}.jpg"
    sheet.save(output, quality=88)
    return output


def main():
    slugs = load_slugs()
    for kind in ("desktop", "mobile"):
        output = make_sheet(slugs, kind)
        print(output)


if __name__ == "__main__":
    main()
