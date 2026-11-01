from pathlib import Path
from datetime import datetime
import re
import shutil

root = Path.cwd()
page = root / "language/pyramid_links.html"
if not page.is_file():
    raise SystemExit("Run python3 add_pyramid_source.py from your Learning Lab repository folder.")
text = page.read_text(encoding="utf-8")
source = 'https://www.teacherspayteachers.com/Product/C2-Phonics-Fluency-Pyramids-Pyramid-Reading-Fluency-Decodable-Text-Sentences-ELA-12444432'
if 'id="pyramid-source-link"' in text:
    print("Source link is already installed.")
else:
    heading = re.search(r"</h1\s*>", text, re.IGNORECASE)
    if not heading:
        raise SystemExit("Could not find the page heading. No files changed.")
    paragraph = ('\n<p id="pyramid-source-link" class="library-intro">Source: '
                 '<a href="' + source + '" target="_blank" rel="noopener noreferrer">'
                 'Original Sentence Pyramid resource on Teachers Pay Teachers</a>.</p>\n')
    updated = text[:heading.end()] + paragraph + text[heading.end():]
    backup = root.parent / ("learning-lab-source-backup-" + datetime.now().strftime("%Y%m%d-%H%M%S-%f")) / "language/pyramid_links.html"
    backup.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(page, backup)
    page.write_text(updated, encoding="utf-8")
    print("Added source link to language/pyramid_links.html. Backup:", backup)
