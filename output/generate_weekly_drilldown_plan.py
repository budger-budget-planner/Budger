#!/usr/bin/env python3
"""Generate the updated Budger weekly dashboard drill-down implementation plan."""

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)


OUT = "output/Budger_Weekly_Drilldown_Implementation_Plan_Updated.pdf"

INK = colors.HexColor("#16181d")
SLATE = colors.HexColor("#475569")
MUTED = colors.HexColor("#64748b")
LINE = colors.HexColor("#d7dee8")
PANEL = colors.HexColor("#f4f7fb")
BLUE = colors.HexColor("#2563eb")
BLUE_LIGHT = colors.HexColor("#e8f0ff")
GREEN = colors.HexColor("#047857")
GREEN_LIGHT = colors.HexColor("#e9f8f1")
RED = colors.HexColor("#b91c1c")
RED_LIGHT = colors.HexColor("#fff0f0")
AMBER = colors.HexColor("#a16207")
AMBER_LIGHT = colors.HexColor("#fff8df")
WHITE = colors.white

styles = getSampleStyleSheet()


def ps(name, parent="Normal", **kwargs):
    return ParagraphStyle(name, parent=styles[parent], **kwargs)


TITLE = ps(
    "Title2",
    fontName="Helvetica-Bold",
    fontSize=25,
    leading=30,
    textColor=WHITE,
    alignment=TA_CENTER,
    spaceAfter=7,
)
SUBTITLE = ps(
    "Subtitle2",
    fontName="Helvetica",
    fontSize=11,
    leading=16,
    textColor=colors.HexColor("#dbeafe"),
    alignment=TA_CENTER,
)
META = ps(
    "Meta2",
    fontName="Helvetica",
    fontSize=8.5,
    leading=12,
    textColor=colors.HexColor("#cbd5e1"),
    alignment=TA_CENTER,
)
H1 = ps(
    "H12",
    fontName="Helvetica-Bold",
    fontSize=16,
    leading=20,
    textColor=INK,
    spaceBefore=11,
    spaceAfter=5,
)
H2 = ps(
    "H22",
    fontName="Helvetica-Bold",
    fontSize=11.5,
    leading=15,
    textColor=BLUE,
    spaceBefore=8,
    spaceAfter=3,
)
BODY = ps(
    "Body2",
    fontName="Helvetica",
    fontSize=9.25,
    leading=13.5,
    textColor=INK,
    spaceAfter=4,
)
SMALL = ps(
    "Small2",
    fontName="Helvetica",
    fontSize=8.3,
    leading=11.5,
    textColor=SLATE,
    spaceAfter=2,
)
BULLET = ps(
    "Bullet2",
    fontName="Helvetica",
    fontSize=9.1,
    leading=13.2,
    textColor=INK,
    leftIndent=12,
    firstLineIndent=-8,
    spaceAfter=2,
)
CODE = ps(
    "Code2",
    fontName="Courier",
    fontSize=7.8,
    leading=10.5,
    textColor=colors.HexColor("#1e3a8a"),
    backColor=PANEL,
    leftIndent=5,
    rightIndent=5,
    borderPadding=4,
    spaceAfter=4,
)
NOTE = ps(
    "Note2",
    fontName="Helvetica-Oblique",
    fontSize=8.5,
    leading=12,
    textColor=MUTED,
    spaceAfter=3,
)
TABLE_HEAD = ps(
    "TableHead2",
    fontName="Helvetica-Bold",
    fontSize=8.2,
    leading=10.5,
    textColor=WHITE,
)
TABLE_CELL = ps(
    "TableCell2",
    fontName="Helvetica",
    fontSize=8.1,
    leading=10.8,
    textColor=INK,
)


def P(text, style=BODY):
    return Paragraph(text, style)


def bullets(items, style=BULLET):
    return [P(f"&bull; {item}", style) for item in items]


def section_label(text):
    return Table(
        [[P(text.upper(), ps("SectionLabel2", fontName="Helvetica-Bold", fontSize=7.5,
                             leading=9, textColor=BLUE, letterSpacing=1.1))]],
        colWidths=[174 * mm],
        style=TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), BLUE_LIGHT),
            ("BOX", (0, 0), (-1, -1), 0.4, colors.HexColor("#bfd2f6")),
            ("LEFTPADDING", (0, 0), (-1, -1), 7),
            ("RIGHTPADDING", (0, 0), (-1, -1), 7),
            ("TOPPADDING", (0, 0), (-1, -1), 5),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ]),
    )


def info_box(title, body, background=PANEL, stripe=BLUE):
    return Table(
        [[P(f"<b>{title}</b><br/>{body}", BODY)]],
        colWidths=[174 * mm],
        style=TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), background),
            ("BOX", (0, 0), (-1, -1), 0.5, LINE),
            ("LINEBEFORE", (0, 0), (0, -1), 3, stripe),
            ("LEFTPADDING", (0, 0), (-1, -1), 10),
            ("RIGHTPADDING", (0, 0), (-1, -1), 10),
            ("TOPPADDING", (0, 0), (-1, -1), 7),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
        ]),
    )


def table(rows, widths, row_backgrounds=None):
    rendered = []
    for row_index, row in enumerate(rows):
        rendered.append([
            P(str(cell), TABLE_HEAD if row_index == 0 else TABLE_CELL)
            for cell in row
        ])
    commands = [
        ("BACKGROUND", (0, 0), (-1, 0), INK),
        ("TEXTCOLOR", (0, 0), (-1, 0), WHITE),
        ("BOX", (0, 0), (-1, -1), 0.5, LINE),
        ("INNERGRID", (0, 0), (-1, -1), 0.3, LINE),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ]
    if row_backgrounds:
        for row_index, bg in row_backgrounds.items():
            commands.append(("BACKGROUND", (0, row_index), (-1, row_index), bg))
    else:
        commands.append(("ROWBACKGROUNDS", (0, 1), (-1, -1), [WHITE, PANEL]))
    return Table(rendered, colWidths=widths, style=TableStyle(commands))


def footer(canvas, doc):
    canvas.saveState()
    canvas.setStrokeColor(LINE)
    canvas.setLineWidth(0.4)
    canvas.line(18 * mm, 12 * mm, 192 * mm, 12 * mm)
    canvas.setFont("Helvetica", 7.5)
    canvas.setFillColor(MUTED)
    canvas.drawString(18 * mm, 7 * mm, "Budger - Weekly category drill-down")
    canvas.drawRightString(192 * mm, 7 * mm, f"Page {doc.page}")
    canvas.restoreState()


def build():
    doc = SimpleDocTemplate(
        OUT,
        pagesize=A4,
        leftMargin=18 * mm,
        rightMargin=18 * mm,
        topMargin=16 * mm,
        bottomMargin=17 * mm,
        title="Budger - Updated Weekly Drill-down Implementation Plan",
        author="Budger Engineering",
    )
    story = []

    # Cover
    cover = Table(
        [[
            P("BUDGER", ps("CoverBrand2", fontName="Helvetica-Bold", fontSize=10,
                           leading=12, textColor=colors.HexColor("#93c5fd"),
                           alignment=TA_CENTER)),
        ], [
            P("Weekly Category<br/>Drill-down", TITLE),
        ], [
            P("Updated implementation plan", SUBTITLE),
        ], [
            P("Locked requirements from the supplied support screenshots", META),
        ]],
        colWidths=[174 * mm],
        style=TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), INK),
            ("BOX", (0, 0), (-1, -1), 1.2, colors.HexColor("#334155")),
            ("LEFTPADDING", (0, 0), (-1, -1), 14),
            ("RIGHTPADDING", (0, 0), (-1, -1), 14),
            ("TOPPADDING", (0, 0), (-1, -1), 11),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 11),
        ]),
    )
    story += [Spacer(1, 19 * mm), cover, Spacer(1, 10 * mm)]
    story.append(info_box(
        "Implementation status",
        "Planning is complete. No production code changes are included in this document. "
        "When implementation begins, every shipping change belongs in <b>export/frontend/</b> "
        "or <b>export/backend/</b>; artifacts remain for local development and verification only.",
        background=BLUE_LIGHT,
        stripe=BLUE,
    ))
    story += [
        Spacer(1, 7 * mm),
        P("<b>Scope</b>", H2),
        P(
            "Add a long-press entry point to the dashboard category budget donut and open a "
            "second, category-specific donut showing the selected month's spending across four "
            "calendar periods. The feature must feel like the existing household and personal "
            "donut interactions, use authenticated server data, and hand off to the existing "
            "full-month transaction list without inventing a parallel flow.",
            BODY,
        ),
        P("<b>Non-goals</b>", H2),
        *bullets([
            "Do not change the existing short-tap category selection.",
            "Do not change center double-tap mode switching.",
            "Do not make uncategorized, recurring-payment, unbudgeted, or empty categories drillable.",
            "Do not download all transactions to the browser to calculate the weekly chart.",
            "Do not deploy to Vercel or Render from this work; GitHub push is the handoff point.",
        ]),
        PageBreak(),
    ]

    # Requirements
    story += [
        section_label("1. Locked product behavior"),
        P("Interaction entry point", H1),
        P(
            "Reuse the household donut's pointer-based long-press model. The category segment "
            "must be eligible before a timer starts, and the normal tap action must remain the "
            "same when the hold does not fire.",
            BODY,
        ),
        *bullets([
            "Start a roughly 500 ms hold on an eligible dashboard category segment.",
            "Cancel on pointer release, pointer cancellation, or movement away from the segment.",
            "When the hold fires, suppress the click/tap selection that would otherwise follow.",
            "Preserve the current short-tap behavior and center double-tap mode switching unchanged.",
            "Eligibility requires a real category with a positive budget and spending in the selected month.",
            "No drill-down for uncategorized spending, recurring-payment slices, categories without a positive budget, or categories with no spending.",
        ]),
        P("Weekly state", H2),
        *bullets([
            "Dashboard owns the selected drill-down category and the weekly state.",
            "The existing view remains the category budget donut; long press transitions to the selected category's weekly donut.",
            "The weekly header includes a back arrow, category name, selected month, and effective category budget.",
            "The selected month is the month currently shown by the dashboard.",
            "Back navigation returns to the original category donut and clears weekly state completely.",
            "Copy the existing household/personal donut animation sequence 1:1: fade other segments, expand the selected segment into a neutral arc, then reveal the weekly chart.",
        ]),
        info_box(
            "Important handoff rule",
            "The weekly screen must include a <b>Show transactions</b> action. It returns the user "
            "to the home/spending tab at <b>/</b>, requests the full selected month, and applies the "
            "existing category-name filter. It must not filter only the first 15 records. Clearing "
            "the filter must restore the normal unfiltered list. Returning to the dashboard later "
            "must show the default dashboard view, not the weekly drill-down.",
            background=GREEN_LIGHT,
            stripe=GREEN,
        ),
        Spacer(1, 5 * mm),
        P("Files touched by the feature", H2),
        table([
            ["Area", "Shipping location", "Responsibility"],
            ["Donut interaction", "export/frontend/src/components/DonutBudgetChart.tsx", "Long press, eligibility, click suppression, animation reuse"],
            ["Weekly chart", "export/frontend/src/components/WeeklyCategoryDonut.tsx", "Four-period donut, legend, exact percentage math"],
            ["Dashboard state", "export/frontend/src/pages/Dashboard.tsx", "Selected category/month state, query, transition, back/reset, handoff"],
            ["Copy", "export/frontend/src/lib/i18n.ts", "Week labels, date ranges, back/help text, transaction CTA"],
            ["Summary API", "export/backend/src/routes/summary.ts", "Authenticated weekly category aggregation"],
            ["Contract", "lib/api-spec/openapi.yaml + generated client/types", "OpenAPI source and regenerated hooks/schemas; sync shipping copies as applicable"],
        ], [31 * mm, 70 * mm, 73 * mm]),
        PageBreak(),
    ]

    # API
    story += [
        section_label("2. Authenticated weekly data contract"),
        P("Endpoint", H1),
        P(
            "Use the dedicated summary route rather than downloading transactions to the browser. "
            "The workspace already contains the draft <b>GET /summary/category-weeks</b> contract "
            "and generated types; implementation work must audit, complete, and synchronize it "
            "rather than create a second endpoint.",
            BODY,
        ),
        table([
            ["Request", "Required behavior"],
            ["GET /api/summary/category-weeks", "Authenticated request for one category and one dashboard month."],
            ["month=YYYY-MM", "Validate the exact month format; use the dashboard's selected month."],
            ["categoryId=&lt;positive integer&gt;", "Validate the category identifier and enforce ownership."],
            ["currency=&lt;display currency&gt;", "Apply the same native/display currency rules as the existing dashboard summary."],
        ], [52 * mm, 122 * mm]),
        Spacer(1, 4 * mm),
        P("Response shape", H2),
        P(
            "Return the category context and exactly four calendar periods. The server owns the "
            "date boundaries so the frontend cannot duplicate or drift from the aggregation rules.",
            BODY,
        ),
        P(
            '<font name="Courier">month, categoryId, categoryName, budget, totalSpent, weeks[4]</font>',
            CODE,
        ),
        P(
            '<font name="Courier">week: { index, startDate, endDate, days, spent, entriesCount }</font>',
            CODE,
        ),
        P("Server-side inclusion/exclusion rules", H2),
        *bullets([
            "Current-user ownership and selected-category ownership are checked server-side.",
            "Use the selected month and the request's native/display currency filtering rules.",
            "Exclude locked or unavailable currency entries.",
            "Exclude realized-goal-funded entries.",
            "Exclude Larder funds.",
            "Use the same effective category budget as the existing dashboard donut, including applicable budget-stretch adjustments.",
            "Return actual ISO date-only startDate and endDate values; the frontend formats them for display.",
            "Use the same transaction inclusion semantics as the existing dashboard summary so weekly totals reconcile to totalSpent.",
        ]),
        info_box(
            "Security and consistency",
            "Unauthorized, invalid, or unavailable category requests must be rejected. The route "
            "must not expose weekly data for another user's category. The response should be "
            "sufficient for rendering the chart without a second client-side ownership or date-boundary implementation.",
            background=AMBER_LIGHT,
            stripe=AMBER,
        ),
        PageBreak(),
    ]

    # Calendar and chart math
    story += [
        section_label("3. Calendar allocation and exact chart math"),
        P("Deterministic calendar periods", H1),
        P(
            "Split the actual calendar month into four contiguous periods. Extra days are assigned "
            "from week 1 forward. The API returns the actual boundaries and day counts.",
            BODY,
        ),
        table([
            ["Month length", "Period day counts"],
            ["28 days", "7 / 7 / 7 / 7"],
            ["29 days", "8 / 7 / 7 / 7"],
            ["30 days", "8 / 8 / 7 / 7"],
            ["31 days", "8 / 8 / 8 / 7"],
        ], [52 * mm, 122 * mm]),
        Spacer(1, 4 * mm),
        P("Weekly donut model", H2),
        *bullets([
            "The colored portions represent spending in each non-empty period against the full effective category budget, not against a separate per-period budget.",
            "Render one dimmed remainder for all unused budget. Future or empty periods are absorbed into this remainder instead of receiving their own empty arc.",
            "The center shows total spent and budget usage percentage when a meaningful percentage exists.",
            "The legend lists every calendar period in date order with week number, date-only range, spent amount, and entry count.",
            "A future/empty period shows no percentage label because no spending has happened yet; it still appears in the dated legend with zero amount and zero entries.",
        ]),
        P("Exact 100% requirement", H2),
        P(
            "Calculate arc fractions from cent-rounded amounts. Let <b>B</b> be the effective budget, "
            "<b>S</b> the sum of weekly spending, and <b>R = max(B - S, 0)</b>. When the category "
            "is not over budget, the rendered fractions are each non-empty week's <b>spent / B</b> "
            "plus one remainder of <b>R / B</b>, which totals exactly 100%. Do not round each arc "
            "independently and accept a drift.",
            BODY,
        ),
        P(
            "For visible labels, round all but the balancing remainder to the chosen precision and "
            "set the final displayed remainder to <b>100% - the sum of displayed non-empty week values</b>. "
            "This preserves the intended examples: 33.3%, 25%, 10%, and a 31.7% remainder; if "
            "whole percentages are used, a 33%, 25%, 10% display must end with 32%.",
            BODY,
        ),
        info_box(
            "Over-budget state",
            "When total spending exceeds the effective budget, remove the remainder entirely. "
            "Render weekly spending with the same over-budget red treatment used by the existing "
            "donut. Never display a negative remainder or a fabricated future-week percentage.",
            background=RED_LIGHT,
            stripe=RED,
        ),
        Spacer(1, 5 * mm),
        P("Worked example", H2),
        table([
            ["Period", "Date range", "Spent", "Entries", "Display rule"],
            ["Week 1", "01.04-08.04", "400", "4", "33.3% of 1,200"],
            ["Week 2", "09.04-16.04", "300", "3", "25% of 1,200"],
            ["Week 3", "17.04-22.04", "120", "2", "10% of 1,200"],
            ["Week 4", "23.04-30.04", "0", "0", "No percentage; future/empty"],
            ["Remainder", "All unused budget", "380", "-", "31.7%, dimmed"],
        ], [23 * mm, 38 * mm, 25 * mm, 22 * mm, 66 * mm]),
        PageBreak(),
    ]

    # Implementation phases
    story += [
        section_label("4. Implementation sequence"),
        P("Phase A - Verify the existing contract and helpers", H1),
        *bullets([
            "Trace the current dashboard summary's ownership, currency, locked-entry, realized-goal, Larder, and stretch-adjustment logic.",
            "Confirm the existing category-weeks OpenAPI path, schemas, generated client hook, and backend implementation all describe the same response.",
            "Add or update pure calendar allocation helpers so 28/29/30/31-day months produce the locked distributions and actual date boundaries.",
            "Keep generated files generated: change the OpenAPI source first, then rerun codegen before consuming changed types.",
        ]),
        P("Phase B - Complete the backend aggregation", H1),
        *bullets([
            "Implement the authenticated category-weeks handler in export/backend/src/routes/summary.ts.",
            "Reuse existing summary query predicates and effective-budget calculations instead of duplicating business rules.",
            "Aggregate by transaction date into the four server-defined periods; return spent and entriesCount per period.",
            "Ensure empty/future periods are returned with zero values and valid date-only boundaries.",
            "Return explicit authorization/validation failures for invalid or unauthorized requests.",
        ]),
        P("Phase C - Add the weekly visual state", H1),
        *bullets([
            "Add export/frontend/src/components/WeeklyCategoryDonut.tsx for weekly arc construction, the single dimmed remainder, center labels, and dated legend.",
            "Keep the component data-driven and avoid client-side transaction fetching.",
            "Use the selected category's existing color for spent arcs and the existing red over-budget treatment when applicable.",
            "Make narrow segments and all interactive targets accessible to touch, following the existing donut hit-target approach.",
        ]),
        P("Phase D - Wire Dashboard and interactions", H1),
        *bullets([
            "Add selected category and weekly drill-down state to export/frontend/src/pages/Dashboard.tsx.",
            "Add the 500 ms long-press lifecycle to export/frontend/src/components/DonutBudgetChart.tsx, including cancellation and click suppression.",
            "Start the weekly query only after an eligible category is selected; key it by month, categoryId, and currency.",
            "Reuse the existing household/personal transition timing and cleanup timers.",
            "Back clears weekly state; dashboard mount/re-entry starts at the default category donut.",
        ]),
        P("Phase E - Transaction handoff and localization", H1),
        *bullets([
            "Navigate the Show transactions action to the existing home/spending tab at /.",
            "Pass the selected month in the existing full-month loading mechanism and apply the category-name filter.",
            "Ensure the home list has all records for that month before filtering; do not filter a first-page/first-15 subset.",
            "Allow the user to clear the category filter and return to the complete month list.",
            "Add week/date-range labels and back/help/CTA copy to export/frontend/src/lib/i18n.ts for supported languages.",
        ]),
        PageBreak(),
    ]

    # Verification
    story += [
        section_label("5. Verification before GitHub push"),
        P("Calendar and data checks", H1),
        *bullets([
            "February with 28 days produces 7/7/7/7 and contiguous dates.",
            "Leap-year February with 29 days produces 8/7/7/7 and contiguous dates.",
            "April, June, September, and November with 30 days produce 8/8/7/7.",
            "A 31-day month produces 8/8/8/7.",
            "The four periods cover the month once, with no gaps or duplicate boundary dates.",
            "Weekly spent totals reconcile exactly to the category total for the same query rules.",
            "Effective budget matches the existing dashboard donut, including stretch adjustments.",
            "Arc fractions sum to exactly 100% in the non-over-budget state after cent rounding and balancing.",
        ]),
        P("Interaction checks", H1),
        *bullets([
            "Long press opens the weekly view only for a positive-budget category with spending.",
            "Short tap still selects the category exactly as before.",
            "Center double-tap mode switching remains unchanged.",
            "Movement, release, and cancellation stop an in-progress hold.",
            "Uncategorized, recurring-payment, unbudgeted, and empty segments do nothing.",
            "Back returns to the original donut and removes the weekly state.",
            "Animation and cleanup behavior matches the household/personal donut sequence.",
        ]),
        P("Display and handoff checks", H1),
        *bullets([
            "Legend periods are date-only and listed in chronological order.",
            "A future/empty period has no percentage label.",
            "Unused budget is one dimmed remainder, not four separate dimmed slices.",
            "The example 400/300/120 against 1,200 displays 33.3%, 25%, 10%, and 31.7% remainder.",
            "If the category is over budget, the remainder disappears and the existing red treatment is used.",
            "Show transactions opens the home tab with the full selected month and category-name filter.",
            "Clearing the filter restores all records for the selected month.",
            "Re-entering the dashboard starts in its default view.",
        ]),
        P("Build and release checks", H1),
        *bullets([
            "Frontend typecheck passes.",
            "Backend typecheck/build passes.",
            "OpenAPI codegen completes after any contract change.",
            "The shipping diff contains changes only under export/frontend, export/backend, and the required contract/generated sources.",
            "Push the completed shipping changes to GitHub; do not trigger Vercel or Render deploys.",
        ]),
        Spacer(1, 6 * mm),
        info_box(
            "Definition of done",
            "The feature is ready for the user's manual deployment step only when the weekly API, "
            "weekly donut, long-press behavior, exact 100% math, full-month transaction handoff, "
            "dashboard reset, and all calendar cases above pass together.",
            background=GREEN_LIGHT,
            stripe=GREEN,
        ),
        Spacer(1, 6 * mm),
        P(
            "This updated plan supersedes the earlier draft where it conflicts. The single dimmed "
            "remainder, exact percentage balancing, date-only labels, no percentage for future/empty "
            "periods, full-month handoff, and 1:1 animation reuse are locked requirements.",
            NOTE,
        ),
    ]

    doc.build(story, onFirstPage=footer, onLaterPages=footer)
    print(f"PDF written: {OUT}")


if __name__ == "__main__":
    build()