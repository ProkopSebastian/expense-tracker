# /// script
# requires-python = ">=3.11"
# dependencies = ["cairosvg>=2.8,<3", "pillow>=12,<13"]
# ///

import io
from pathlib import Path
from xml.etree import ElementTree as ET

import cairosvg
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "scripts" / "assets"
PUBLIC = ROOT / "frontend" / "public"
SVG_NAMESPACE = "http://www.w3.org/2000/svg"
ET.register_namespace("", SVG_NAMESPACE)


def rasterize(source: bytes, size: int) -> Image.Image:
    png = cairosvg.svg2png(bytestring=source, output_width=size, output_height=size)
    with Image.open(io.BytesIO(png)) as image:
        return image.convert("RGBA")


def framed_logo() -> bytes:
    root = ET.fromstring((PUBLIC / "logo.svg").read_bytes())
    root.set("viewBox", "0 0 512 512")
    full = ET.parse(ASSETS / "app.svg").getroot()
    background = full.find(f"{{{SVG_NAMESPACE}}}rect")
    if background is None:
        raise ValueError("The full application icon must include a background rectangle")
    root.insert(0, background)
    return ET.tostring(root)


def save_ico(destination: Path, images: dict[int, Image.Image]) -> None:
    largest = max(images)
    images[largest].save(
        destination,
        format="ICO",
        sizes=[(size, size) for size in images],
        append_images=[image for size, image in images.items() if size != largest],
    )


def main() -> None:
    full = (ASSETS / "app.svg").read_bytes()
    compact = framed_logo()
    tiny = (PUBLIC / "favicon.svg").read_bytes()
    sizes = [16, 20, 24, 32, 40, 48, 64, 128, 256]
    images = {
        size: rasterize(tiny if size <= 24 else compact if size <= 64 else full, size)
        for size in sizes
    }
    images[256].save(ASSETS / "app.png")
    for size in [16, 32, 48, 64]:
        images[size].save(ASSETS / f"app-{size}.png")
    save_ico(ASSETS / "app.ico", images)
    save_ico(PUBLIC / "favicon.ico", {size: images[size] for size in [16, 32, 48]})
    # ICNS includes Retina representations: 32 px is also used for 16 pt at 2x.
    rasterize(full, 1024).save(
        ASSETS / "app.icns",
        format="ICNS",
        append_images=[rasterize(tiny, 32), rasterize(compact, 64)],
    )
    print("Exported Windows, Linux, macOS, and browser icons.")


if __name__ == "__main__":
    main()
