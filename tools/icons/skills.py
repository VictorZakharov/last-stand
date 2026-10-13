"""The classes' skills as the game's data lists them (`src/data/classes/<class>.ts`): each skill's impl name, which
names its painted icon (`src/ui/skillArt/<impl>.webp`), its name and its icon's colour (`SkillDef.icon.color`)."""
import re
from dataclasses import dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CLASSES = ROOT / 'src' / 'data' / 'classes'
ART = ROOT / 'src' / 'ui' / 'skillArt'

# a skill's impl and name, as its first line in the data gives them
SKILL = re.compile(r"impl: '(\w+)', name: '([^']+)'")
# the colour of the first icon after it, the skill's own
COLOUR = re.compile(r"icon: \{[^}]*color: '(#[0-9a-fA-F]{6})'")


@dataclass
class Skill:
    """One skill of a class: its impl (its icon's file name), its name and its icon's colour."""
    impl: str
    name: str
    colour: str

    @property
    def art(self) -> Path:
        """The skill's painted icon, where the game finds it."""
        return ART / f'{self.impl}.webp'


def skills_in(source: str) -> list[Skill]:
    """The skills a class's data file lists, in its order."""
    skills = []
    for match in SKILL.finditer(source):
        colour = COLOUR.search(source, match.end())
        skills.append(Skill(match.group(1), match.group(2), colour.group(1) if colour else '#ffffff'))
    return skills


def class_skills() -> dict[str, list[Skill]]:
    """Each class's skills, by the name of its data file (`mage`, `ranger`, `warrior`)."""
    classes = {}
    for path in sorted(CLASSES.glob('*.ts')):
        skills = skills_in(path.read_text(encoding='utf-8'))
        if skills:
            classes[path.stem] = skills
    return classes
