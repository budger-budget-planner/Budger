import fitz
from pathlib import Path
pdf = Path('output/Budger_Budget_Stretch_Implementation_Plan.pdf')
out = Path('.agents/outputs/stretch-plan-pages')
out.mkdir(parents=True, exist_ok=True)
doc = fitz.open(pdf)
for i, page in enumerate(doc):
    pix = page.get_pixmap(matrix=fitz.Matrix(1.4, 1.4), alpha=False)
    pix.save(out / f'page-{i+1:02d}.png')
print(f'rendered {len(doc)} pages to {out}')
