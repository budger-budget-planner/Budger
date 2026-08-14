#!/usr/bin/env python3
"""Append one escaped, readable row to output/problem-tracker.docx."""

from argparse import ArgumentParser
from pathlib import Path
from tempfile import NamedTemporaryFile
from zipfile import ZIP_DEFLATED, ZipFile
from xml.sax.saxutils import escape


def cell(width: str, text: str) -> str:
    return (
        f'<w:tc><w:tcPr><w:tcW w:w="{width}" w:type="dxa"/>'
        f'<w:vAlign w:val="top"/></w:tcPr><w:p><w:r><w:t '
        f'xml:space="preserve">{escape(text)}</w:t></w:r></w:p></w:tc>'
    )


parser = ArgumentParser()
parser.add_argument("--number", required=True)
parser.add_argument("--description", required=True)
parser.add_argument("--status", default="pending")
parser.add_argument("--severity", required=True)
parser.add_argument("--next", dest="next_move", required=True)
args = parser.parse_args()

source = Path("output/problem-tracker.docx")
row = (
    "<w:tr>"
    + cell("650", args.number)
    + cell("4300", args.description)
    + cell("1300", args.status)
    + cell("850", args.severity)
    + cell("2100", args.next_move)
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