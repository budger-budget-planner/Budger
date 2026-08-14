from pathlib import Path
from tempfile import NamedTemporaryFile
from zipfile import ZIP_DEFLATED, ZipFile


source = Path("output/problem-tracker.docx")


def cell(width: str, text: str) -> str:
    return (
        f'<w:tc><w:tcPr><w:tcW w:w="{width}" w:type="dxa"/><w:vAlign w:val="top"/></w:tcPr>'
        f'<w:p><w:r><w:t xml:space="preserve">{text}</w:t></w:r></w:p></w:tc>'
    )


row = (
    "<w:tr>"
    + cell("650", "12")
    + cell(
        "4300",
        "Auto-category stop-action errors: export/frontend/src/pages/Transactions.tsx and "
        "HomeSpending.tsx use unguarded async click handlers to list merchant rules and then "
        "disable a rule. A failed lookup or mutation rejects out of the click handler, leaving "
        "the popup state unresolved with no user-facing error.",
    )
    + cell("1300", "pending")
    + cell("850", "2")
    + cell(
        "2100",
        "Add catch/error feedback and close or preserve the prompt deliberately; test rule "
        "lookup failure, update failure, and successful disable behavior.",
    )
    + "</w:tr>"
)

with ZipFile(source, "r") as original, NamedTemporaryFile(
    dir=source.parent, prefix="problem-tracker-", suffix=".docx", delete=False
) as temporary:
    temporary_path = Path(temporary.name)
    with ZipFile(temporary, "w", compression=ZIP_DEFLATED) as repaired:
        for entry in original.infolist():
            content = original.read(entry.filename)
            if entry.filename == "word/document.xml":
                marker = b"</w:tbl>"
                if content.count(marker) != 1:
                    raise SystemExit("Expected problem table was not found")
                content = content.replace(marker, row.encode() + marker, 1)
            repaired.writestr(entry, content)

temporary_path.replace(source)