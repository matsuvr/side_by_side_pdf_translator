from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter

SIZE = 1024
img = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
draw = ImageDraw.Draw(img)

# Rounded dark navy tile with a subtle vertical gradient.
for y in range(SIZE):
    t = y / (SIZE - 1)
    r = int(11 + 10 * t)
    g = int(19 + 20 * t)
    b = int(34 + 30 * t)
    draw.line([(0, y), (SIZE, y)], fill=(r, g, b, 255), width=1)

mask = Image.new("L", (SIZE, SIZE), 0)
ImageDraw.Draw(mask).rounded_rectangle([0, 0, SIZE - 1, SIZE - 1], radius=220, fill=255)
img.putalpha(mask)

# Warm rust accent glow in the lower right.
glow = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
gd = ImageDraw.Draw(glow)
gd.ellipse([470, 470, 1050, 1050], fill=(180, 83, 9, 90))

glow = glow.filter(ImageFilter.GaussianBlur(90))
img.alpha_composite(glow)
img.putalpha(mask)

# Open book, drawn with clean geometric pages.
cream = (250, 243, 230, 255)
cream_shadow = (224, 211, 190, 255)
rust = (207, 108, 28, 255)
rust_dark = (143, 58, 8, 255)

left_page = [(150, 300), (492, 246), (492, 710), (150, 762)]
right_page = [(532, 246), (874, 300), (874, 762), (532, 710)]
draw.polygon(left_page, fill=cream)
draw.polygon(right_page, fill=cream)
draw.line([(150, 300), (492, 246), (492, 710), (150, 762), (150, 300)], fill=cream_shadow, width=8)
draw.line([(532, 246), (874, 300), (874, 762), (532, 710), (532, 246)], fill=cream_shadow, width=8)
draw.line([(492, 246), (532, 246)], fill=cream, width=12)

# Page rules.
for offset in range(3):
    y = 400 + offset * 72
    draw.line([(222, y + 26), (424, y - 4)], fill=(223, 211, 191, 255), width=15)
    draw.line([(600, y - 4), (802, y + 26)], fill=(223, 211, 191, 255), width=15)

# Rust bookmark on the spine.
draw.polygon([(492, 246), (532, 246), (532, 560), (512, 525), (492, 560)], fill=rust)

# Small spark above the book.
draw.polygon(
    [(512, 112), (548, 196), (632, 232), (548, 268), (512, 352), (476, 268), (392, 232), (476, 196)],
    fill=rust,
)
draw.ellipse([494, 214, 530, 250], fill=(255, 235, 206, 255))

# Bottom rule.
draw.rounded_rectangle([250, 850, 774, 870], radius=10, fill=(215, 122, 44, 210))

output = Path(__file__).resolve().parent.parent / "build" / "icon.png"
output.parent.mkdir(exist_ok=True)
img.save(output)
print(f"wrote {output}")
