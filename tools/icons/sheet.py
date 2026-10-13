"""Every class's skill icons side by side, a row a class, as the player sees them: each large, then at a hotbar
slot's size (60 px, the size the set is judged at) square and as the round touch button cuts it. Pictures not yet in
the game can be tried in a skill's place (padded and sized as `add` would make them), marked as new."""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

from export import SIDE, icon_from
from skills import Skill

# a skill's icon large, at a slot's size, and the gaps round them
LARGE = 192
SLOT = 60
GAP = 14
# the heights of a class's heading and a skill's name under its icons
HEADING = 30
NAME = 34
# the page, the HUD's dark, and its text
BACKGROUND = (20, 20, 26)
TEXT = (220, 214, 200)
NEW = (255, 214, 90)


def font(size: int) -> ImageFont.ImageFont:
    """The default font at `size` px."""
    return ImageFont.load_default(size=size)


def round_mask(side: int) -> Image.Image:
    """The round touch button's shape at `side` px, its edge smoothed (drawn at four times the size)."""
    big = Image.new('L', (side * 4, side * 4), 0)
    ImageDraw.Draw(big).ellipse((0, 0, side * 4 - 1, side * 4 - 1), fill=255)
    return big.resize((side, side), Image.LANCZOS)


def icon_of(skill: Skill, tries: dict[str, Path]) -> Image.Image | None:
    """The skill's icon at the game's size: a tried picture's, else its painted one's, else none (it shows its
    glyph)."""
    if skill.impl in tries:
        return icon_from(tries[skill.impl])
    if not skill.art.exists():
        return None
    with Image.open(skill.art) as image:
        return image.convert('RGB').resize((SIDE, SIDE), Image.LANCZOS)


def cell_size() -> tuple[int, int]:
    """A skill's cell, its icons and its name."""
    return LARGE, LARGE + GAP + SLOT + NAME


def draw_cell(page: Image.Image, at: tuple[int, int], skill: Skill, icon: Image.Image | None, new: bool) -> None:
    """Draws one skill's cell at `at`: its icon large, at a slot's size square and round, and its name."""
    left, top = at
    draw = ImageDraw.Draw(page)
    if icon is None:
        draw.rectangle((left, top, left + LARGE - 1, top + LARGE - 1), outline=(90, 90, 100))
        draw.text((left + LARGE / 2, top + LARGE / 2), 'no icon', fill=TEXT, font=font(16), anchor='mm')
    else:
        page.paste(icon.resize((LARGE, LARGE), Image.LANCZOS), (left, top))
        small = icon.resize((SLOT, SLOT), Image.LANCZOS)
        row = top + LARGE + GAP
        middle = left + LARGE // 2
        page.paste(small, (middle - SLOT - GAP // 2, row))
        page.paste(small, (middle + GAP // 2, row), round_mask(SLOT))
    name = f'{skill.name} (new)' if new else skill.name
    colour = NEW if new else TEXT
    draw.text((left + LARGE / 2, top + LARGE + GAP + SLOT + 8), name, fill=colour, font=font(14), anchor='mt')
    swatch = top + LARGE + GAP + SLOT + 26
    draw.rectangle((left + LARGE / 2 - 12, swatch, left + LARGE / 2 + 12, swatch + 3), fill=skill.colour)


def sheet(classes: dict[str, list[Skill]], tries: dict[str, Path]) -> Image.Image:
    """The sheet of every class's icons (`tries`: pictures to show in some skills' places, by impl)."""
    width, height = cell_size()
    most = max(len(skills) for skills in classes.values())
    page_width = GAP + most * (width + GAP)
    page_height = GAP + len(classes) * (HEADING + height + GAP)
    page = Image.new('RGB', (page_width, page_height), BACKGROUND)
    draw = ImageDraw.Draw(page)
    top = GAP
    for name, skills in classes.items():
        draw.text((GAP, top), name, fill=TEXT, font=font(20))
        top += HEADING
        for index, skill in enumerate(skills):
            left = GAP + index * (width + GAP)
            draw_cell(page, (left, top), skill, icon_of(skill, tries), skill.impl in tries)
        top += height + GAP
    return page
