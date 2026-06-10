from html.parser import HTMLParser
from pathlib import Path
import re
import sys


ROOT = Path("/Users/luiz_fbm/Documents/programacao/freela")
README = ROOT / "demos" / "README.md"
START = "<!-- vila-velha-hot-demos:start -->"
END = "<!-- vila-velha-hot-demos:end -->"
REQUIRED_FILES = (
    "index.html",
    "styles.css",
    "script.js",
    "copy-whatsapp.md",
    "assets/hero.jpg",
    "screenshot-desktop.png",
    "screenshot-mobile.png",
)


class DemoHTMLParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.robots_content = None
        self.viewport = False
        self.stylesheet = False
        self.script = False
        self.title = False

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == "meta" and attrs.get("name") == "robots":
            self.robots_content = attrs.get("content")
        if tag == "meta" and attrs.get("name") == "viewport":
            self.viewport = True
        if tag == "link" and attrs.get("rel") == "stylesheet":
            self.stylesheet = True
        if tag == "script" and attrs.get("src") == "script.js":
            self.script = True

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)

    def handle_data(self, data):
        if self.get_starttag_text() is not None and data.strip():
            pass


def load_slugs():
    text = README.read_text(encoding="utf-8")
    try:
        block = text.split(START, 1)[1].split(END, 1)[0]
    except IndexError:
        raise RuntimeError("Bloco de demos Hot não encontrado no README.")

    slugs = re.findall(r"/demos/([^/\s]+)/", block)
    return sorted(dict.fromkeys(slugs))


def validate_slug(slug):
    demo_dir = ROOT / "demos" / slug
    failures = []

    for required in REQUIRED_FILES:
        if not (demo_dir / required).exists():
            failures.append(f"{slug}: arquivo ausente: {required}")

    html_path = demo_dir / "index.html"
    if not html_path.exists():
        return failures

    parser = DemoHTMLParser()
    try:
        parser.feed(html_path.read_text(encoding="utf-8"))
        parser.close()
    except Exception as exc:
        failures.append(f"{slug}: parser HTML falhou: {exc}")
        return failures

    html = html_path.read_text(encoding="utf-8")
    if "<title>" not in html or "</title>" not in html:
        failures.append(f"{slug}: title ausente")
    if parser.robots_content != "noindex, nofollow":
        failures.append(f"{slug}: robots inválido: {parser.robots_content!r}")
    if not parser.viewport:
        failures.append(f"{slug}: meta viewport ausente")
    if not parser.stylesheet:
        failures.append(f"{slug}: stylesheet ausente")
    if not parser.script:
        failures.append(f"{slug}: script.js não referenciado")
    if "Conceito visual não oficial" not in html:
        failures.append(f"{slug}: aviso de conceito visual não oficial ausente")

    return failures


def main():
    slugs = load_slugs()
    failures = []
    for slug in slugs:
        failures.extend(validate_slug(slug))

    if failures:
        print("\n".join(failures), file=sys.stderr)
        return 1

    print(f"HTML parser ok: {len(slugs)} demos validadas.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
