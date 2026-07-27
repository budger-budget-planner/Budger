
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm
from reportlab.lib import colors
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    HRFlowable, KeepTogether
)
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_JUSTIFY
from reportlab.platypus import PageBreak

# ── Colour palette ─────────────────────────────────────────────────────────
DARK_BG    = colors.HexColor("#0f0f0f")
CARD_BG    = colors.HexColor("#1a1a1a")
ORANGE     = colors.HexColor("#f97316")
WHITE      = colors.white
GREY_LT    = colors.HexColor("#d1d5db")
GREY_MD    = colors.HexColor("#6b7280")
GREY_DK    = colors.HexColor("#374151")
ACCENT_BLU = colors.HexColor("#818cf8")
RED        = colors.HexColor("#f87171")
GREEN      = colors.HexColor("#34d399")

def build_pdf(path: str):
    doc = SimpleDocTemplate(
        path,
        pagesize=A4,
        leftMargin=2*cm, rightMargin=2*cm,
        topMargin=2*cm, bottomMargin=2*cm,
        title="Budger – Budget Stretch Feature: Implementation Plan",
        author="Budger Engineering",
    )

    styles = getSampleStyleSheet()

    # ── Custom paragraph styles ──────────────────────────────────────────────
    def PS(name, parent="Normal", **kw):
        return ParagraphStyle(name, parent=styles[parent], **kw)

    cover_title = PS("CoverTitle",
        fontSize=28, leading=36, textColor=WHITE,
        fontName="Helvetica-Bold", alignment=TA_CENTER, spaceAfter=8)

    cover_sub = PS("CoverSub",
        fontSize=13, leading=18, textColor=ORANGE,
        fontName="Helvetica-Bold", alignment=TA_CENTER, spaceAfter=4)

    cover_meta = PS("CoverMeta",
        fontSize=10, leading=14, textColor=GREY_MD,
        fontName="Helvetica", alignment=TA_CENTER, spaceAfter=2)

    h1 = PS("H1",
        fontSize=17, leading=22, textColor=ORANGE,
        fontName="Helvetica-Bold", spaceBefore=18, spaceAfter=6)

    h2 = PS("H2",
        fontSize=13, leading=17, textColor=WHITE,
        fontName="Helvetica-Bold", spaceBefore=12, spaceAfter=4)

    h3 = PS("H3",
        fontSize=11, leading=15, textColor=GREY_LT,
        fontName="Helvetica-Bold", spaceBefore=8, spaceAfter=3)

    body = PS("Body",
        fontSize=9.5, leading=14, textColor=GREY_LT,
        fontName="Helvetica", spaceAfter=4, alignment=TA_JUSTIFY)

    bullet = PS("Bullet",
        fontSize=9.5, leading=14, textColor=GREY_LT,
        fontName="Helvetica", spaceAfter=2,
        leftIndent=14, firstLineIndent=-8)

    sub_bullet = PS("SubBullet",
        fontSize=9, leading=13, textColor=GREY_MD,
        fontName="Helvetica", spaceAfter=1,
        leftIndent=28, firstLineIndent=-8)

    code_style = PS("Code",
        fontSize=8.5, leading=12, textColor=ACCENT_BLU,
        fontName="Courier", spaceAfter=2,
        leftIndent=14, backColor=CARD_BG)

    note_style = PS("Note",
        fontSize=9, leading=13, textColor=ORANGE,
        fontName="Helvetica-Oblique", spaceAfter=4,
        leftIndent=12, borderPadding=4)

    section_label = PS("SectionLabel",
        fontSize=8, leading=10, textColor=GREY_MD,
        fontName="Helvetica-Bold", spaceAfter=0,
        letterSpacing=1.2, alignment=TA_LEFT)

    story = []
    P = Paragraph
    SP = Spacer

    def HR(color=GREY_DK, thickness=0.5, spaceB=4, spaceA=4):
        return HRFlowable(width="100%", thickness=thickness, color=color,
                          spaceAfter=spaceA, spaceBefore=spaceB)

    def phase_header(num, title, subtitle, effort, phase_color=ORANGE):
        data = [[
            P(f"<font color='#{phase_color.hexval()[2:]}' size='22'><b>Phase {num}</b></font>", styles["Normal"]),
            P(f"<font color='#ffffff' size='14'><b>{title}</b></font><br/><font color='#6b7280' size='9'>{subtitle}</font>", styles["Normal"]),
            P(f"<font color='#f97316' size='9'><b>{effort}</b></font>", styles["Normal"]),
        ]]
        t = Table(data, colWidths=[3*cm, 11*cm, 2.5*cm])
        t.setStyle(TableStyle([
            ("BACKGROUND",    (0,0), (-1,-1), CARD_BG),
            ("ROWBACKGROUNDS",(0,0), (-1,-1), [CARD_BG]),
            ("BOX",           (0,0), (-1,-1), 1, GREY_DK),
            ("TOPPADDING",    (0,0), (-1,-1), 10),
            ("BOTTOMPADDING", (0,0), (-1,-1), 10),
            ("LEFTPADDING",   (0,0), (-1,-1), 10),
            ("RIGHTPADDING",  (0,0), (-1,-1), 10),
            ("VALIGN",        (0,0), (-1,-1), "MIDDLE"),
            ("LINEBEFORE",    (0,0), (0,-1), 3, ORANGE),
        ]))
        return t

    def two_col(left_items, right_items, left_label="", right_label=""):
        """Render two lists side-by-side."""
        def render_items(items, label):
            lines = []
            if label:
                lines.append(P(f"<b><font color='#6b7280' size='8'>{label}</font></b>", styles["Normal"]))
            for item in items:
                lines.append(P(f"<font color='#d1d5db' size='9'>• {item}</font>", styles["Normal"]))
            return lines

        left_cell  = render_items(left_items, left_label)
        right_cell = render_items(right_items, right_label)
        data = [[left_cell, right_cell]]
        t = Table(data, colWidths=[8*cm, 8*cm])
        t.setStyle(TableStyle([
            ("VALIGN",      (0,0), (-1,-1), "TOP"),
            ("LEFTPADDING", (0,0), (-1,-1), 0),
            ("RIGHTPADDING",(0,0), (-1,-1), 4),
        ]))
        return t

    def info_box(text, color=GREY_DK, text_color=GREY_LT):
        data = [[P(f"<font color='#{text_color.hexval()[2:]}' size='9'>{text}</font>", styles["Normal"])]]
        t = Table(data, colWidths=[16.5*cm])
        t.setStyle(TableStyle([
            ("BACKGROUND",   (0,0), (-1,-1), color),
            ("BOX",          (0,0), (-1,-1), 0.5, GREY_DK),
            ("LEFTPADDING",  (0,0), (-1,-1), 10),
            ("RIGHTPADDING", (0,0), (-1,-1), 10),
            ("TOPPADDING",   (0,0), (-1,-1), 7),
            ("BOTTOMPADDING",(0,0), (-1,-1), 7),
        ]))
        return t

    # ════════════════════════════════════════════════════════════════════════
    # COVER PAGE
    # ════════════════════════════════════════════════════════════════════════
    story += [
        SP(1, 3*cm),
        P("🦡 Budger", cover_meta),
        SP(1, 0.3*cm),
        P("Budget Stretch", cover_title),
        SP(1, 0.2*cm),
        P("Feature Implementation Plan", cover_sub),
        SP(1, 0.5*cm),
        HR(ORANGE, 1.5),
        SP(1, 0.4*cm),
        P("Prepared: July 2026 &nbsp;|&nbsp; Version 1.0 &nbsp;|&nbsp; Status: Draft", cover_meta),
        SP(1, 1.5*cm),
    ]

    # Summary table
    summary_data = [
        [P("<b><font color='#f97316'>Feature</font></b>", styles["Normal"]),
         P("<font color='#d1d5db'>Budget Stretch — borrow budget between categories or months</font>", styles["Normal"])],
        [P("<b><font color='#f97316'>Phases</font></b>", styles["Normal"]),
         P("<font color='#d1d5db'>6 implementation phases</font>", styles["Normal"])],
        [P("<b><font color='#f97316'>Scope</font></b>", styles["Normal"]),
         P("<font color='#d1d5db'>DB schema · API · OpenAPI codegen · 4 frontend tabs</font>", styles["Normal"])],
        [P("<b><font color='#f97316'>New DB tables</font></b>", styles["Normal"]),
         P("<font color='#d1d5db'>budget_stretches</font>", styles["Normal"])],
        [P("<b><font color='#f97316'>Modified files</font></b>", styles["Normal"]),
         P("<font color='#d1d5db'>~18 files (schema, routes, spec, 4 pages, 2 chart components)</font>", styles["Normal"])],
        [P("<b><font color='#f97316'>Icon</font></b>", styles["Normal"]),
         P("<font color='#d1d5db'>ArrowRightLeft (Lucide) — conveys transfer between two sides</font>", styles["Normal"])],
    ]
    summary_table = Table(summary_data, colWidths=[4.5*cm, 12*cm])
    summary_table.setStyle(TableStyle([
        ("BACKGROUND",    (0,0), (-1,-1), CARD_BG),
        ("ROWBACKGROUNDS",(0,0), (-1,0), [CARD_BG]),
        ("BOX",           (0,0), (-1,-1), 0.5, GREY_DK),
        ("INNERGRID",     (0,0), (-1,-1), 0.3, GREY_DK),
        ("LEFTPADDING",   (0,0), (-1,-1), 10),
        ("RIGHTPADDING",  (0,0), (-1,-1), 10),
        ("TOPPADDING",    (0,0), (-1,-1), 7),
        ("BOTTOMPADDING", (0,0), (-1,-1), 7),
        ("VALIGN",        (0,0), (-1,-1), "MIDDLE"),
        ("LINEBEFORE",    (0,0), (0,-1), 3, ORANGE),
    ]))
    story += [summary_table, SP(1, 1*cm)]

    story.append(PageBreak())

    # ════════════════════════════════════════════════════════════════════════
    # SECTION 0 – FEATURE OVERVIEW
    # ════════════════════════════════════════════════════════════════════════
    story += [
        P("FEATURE OVERVIEW", section_label),
        HR(ORANGE, 1, 2, 6),
        P("What is Budget Stretch?", h1),
        P(
            "Budget Stretch lets a user temporarily expand a category's monthly budget in one of two ways, "
            "without permanently changing the category's base budget setting. Each stretch is always tied "
            "to exactly one transaction.",
            body),
        SP(1, 0.2*cm),
    ]

    stretch_types = [
        ["Type", "Description", "Constraint"],
        [
            P("<b><font color='#f97316'>Cross-Category</font></b>", styles["Normal"]),
            P("<font color='#d1d5db'>Transfer budget from category B to category A within the same month. "
              "Category A's effective budget grows; B's shrinks.</font>", styles["Normal"]),
            P("<font color='#6b7280'>Both categories belong to the same user. One stretch per transaction.</font>", styles["Normal"]),
        ],
        [
            P("<b><font color='#f97316'>Cross-Month</font></b>", styles["Normal"]),
            P("<font color='#d1d5db'>Borrow from the same category's next month. "
              "This month's effective budget grows up to 150%; next month's shrinks to 50%.</font>", styles["Normal"]),
            P("<font color='#6b7280'>Max 50% of category budget. Allowed once per two consecutive months. "
              "If stretched in March, April is locked; next allowed: May.</font>", styles["Normal"]),
        ],
    ]
    tt = Table(stretch_types, colWidths=[3.5*cm, 7.5*cm, 5.5*cm])
    tt.setStyle(TableStyle([
        ("BACKGROUND",    (0,0), (-1,0), GREY_DK),
        ("BACKGROUND",    (0,1), (-1,-1), CARD_BG),
        ("ROWBACKGROUNDS",(0,1), (-1,-1), [CARD_BG, colors.HexColor("#1f1f1f")]),
        ("BOX",           (0,0), (-1,-1), 0.5, GREY_DK),
        ("INNERGRID",     (0,0), (-1,-1), 0.3, GREY_DK),
        ("LEFTPADDING",   (0,0), (-1,-1), 8),
        ("RIGHTPADDING",  (0,0), (-1,-1), 8),
        ("TOPPADDING",    (0,0), (-1,-1), 7),
        ("BOTTOMPADDING", (0,0), (-1,-1), 7),
        ("VALIGN",        (0,0), (-1,-1), "TOP"),
        ("FONTNAME",      (0,0), (-1,0), "Helvetica-Bold"),
        ("FONTSIZE",      (0,0), (-1,0), 9),
        ("TEXTCOLOR",     (0,0), (-1,0), GREY_LT),
    ]))
    story += [tt, SP(1, 0.4*cm)]

    story += [
        P("Key Business Rules", h2),
        P("• A transaction may carry <b>at most one</b> stretch — it cannot simultaneously be stretched cross-category and cross-month.", bullet),
        P("• Cross-month stretches require the amount to be <b>≤ 50% of the target category's base budget</b>. "
          "Accordingly, this month's effective budget is base + stretch (max 150%), next month's is base − stretch (min 50%).", bullet),
        P("• The two-month cooldown for cross-month stretches is per-category: if category A was stretched in March→April, "
          "it cannot be cross-month-stretched again until May→June.", bullet),
        P("• Cross-category stretches do <b>not</b> affect the total monthly budget — they redistribute it.", bullet),
        P("• Cross-month stretches <b>do</b> change the effective total monthly budget for both months.", bullet),
        P("• If a user has <b>no categories</b>, the Stretch section is hidden in the transaction form.", bullet),
        SP(1, 0.3*cm),
    ]

    story.append(PageBreak())

    # ════════════════════════════════════════════════════════════════════════
    # SECTION 1 – VISUAL REPRESENTATION SUMMARY
    # ════════════════════════════════════════════════════════════════════════
    story += [
        P("VISUAL REPRESENTATION ACROSS TABS", section_label),
        HR(ORANGE, 1, 2, 6),
        P("Where Stretch Appears in the UI", h1),
    ]

    vis_data = [
        ["Tab", "What changes", "Colour signal"],
        ["Home",
         "Transaction rows: orange 'Stretch' badge\nMonthly total: adjusted + orange label beneath",
         "Orange badge, orange text"],
        ["Categories",
         "Category cards: 'stretched by ±X' orange label\n(cross-cat: both donor and receiver labeled; cross-month: receiver in current month + hardcoded deduction in next month)",
         "Orange font labels"],
        ["Dashboard",
         "DonutBudgetChart: orange border on stretched segments\nBudget total adjusted for cross-month stretches\nDonut 360° represents adjusted budget when any cross-month stretch is active",
         "Orange segment border (overridden by red if also over-budget)"],
        ["Household",
         "Household donut ring: orange border if user has any cross-month stretch\nPersonal donut: same rules as Dashboard donut",
         "Orange ring border on user slice"],
    ]
    vt = Table(vis_data, colWidths=[2.8*cm, 8.7*cm, 5*cm])
    vt.setStyle(TableStyle([
        ("BACKGROUND",    (0,0), (-1,0), GREY_DK),
        ("BACKGROUND",    (0,1), (-1,-1), CARD_BG),
        ("ROWBACKGROUNDS",(0,1), (-1,-1), [CARD_BG, colors.HexColor("#1f1f1f")]),
        ("BOX",           (0,0), (-1,-1), 0.5, GREY_DK),
        ("INNERGRID",     (0,0), (-1,-1), 0.3, GREY_DK),
        ("LEFTPADDING",   (0,0), (-1,-1), 8),
        ("RIGHTPADDING",  (0,0), (-1,-1), 8),
        ("TOPPADDING",    (0,0), (-1,-1), 7),
        ("BOTTOMPADDING", (0,0), (-1,-1), 7),
        ("VALIGN",        (0,0), (-1,-1), "TOP"),
        ("FONTNAME",      (0,0), (-1,0), "Helvetica-Bold"),
        ("FONTSIZE",      (0,0), (-1,0), 9),
        ("FONTSIZE",      (0,1), (-1,-1), 9),
        ("TEXTCOLOR",     (0,0), (-1,0), GREY_LT),
        ("TEXTCOLOR",     (0,1), (-1,-1), GREY_LT),
    ]))
    story += [vt, SP(1, 0.5*cm)]

    story.append(PageBreak())

    # ════════════════════════════════════════════════════════════════════════
    # PHASE 1
    # ════════════════════════════════════════════════════════════════════════
    story += [
        P("IMPLEMENTATION PHASES", section_label),
        HR(ORANGE, 1, 2, 6),
        SP(1, 0.1*cm),
        phase_header(1, "Database Schema & Migration",
                     "New table · Drizzle schema · Migration file", "Small"),
        SP(1, 0.3*cm),
        P("New Table: <font color='#818cf8'>budget_stretches</font>", h2),
        P("Create <font color='#818cf8'>lib/db/src/schema/budget_stretches.ts</font> "
          "with the following columns:", body),
    ]

    schema_rows = [
        ["Column", "Type", "Description"],
        ["id", "serial PK", "Auto-increment primary key"],
        ["userId", "integer FK → users", "Owner of the stretch"],
        ["transactionId", "integer FK → transactions", "The one transaction this stretch belongs to (unique)"],
        ["month", "text (YYYY-MM)", "The month of the stretched category (current month)"],
        ["toCategoryId", "integer FK → categories", "Category receiving the extra budget"],
        ["fromCategoryId", "integer FK → categories", "Category donating budget (same as toCategoryId for cross-month)"],
        ["amount", "numeric(12,2)", "Amount of budget transferred"],
        ["stretchType", "text", "'cross_category' | 'cross_month'"],
        ["createdAt", "timestamp", "Record creation timestamp"],
    ]
    st = Table(schema_rows, colWidths=[3.5*cm, 4*cm, 9*cm])
    st.setStyle(TableStyle([
        ("BACKGROUND",    (0,0), (-1,0), GREY_DK),
        ("BACKGROUND",    (0,1), (-1,-1), CARD_BG),
        ("ROWBACKGROUNDS",(0,1), (-1,-1), [CARD_BG, colors.HexColor("#1f1f1f")]),
        ("BOX",           (0,0), (-1,-1), 0.5, GREY_DK),
        ("INNERGRID",     (0,0), (-1,-1), 0.3, GREY_DK),
        ("LEFTPADDING",   (0,0), (-1,-1), 7),
        ("RIGHTPADDING",  (0,0), (-1,-1), 7),
        ("TOPPADDING",    (0,0), (-1,-1), 5),
        ("BOTTOMPADDING", (0,0), (-1,-1), 5),
        ("VALIGN",        (0,0), (-1,-1), "TOP"),
        ("FONTNAME",      (0,0), (-1,0), "Helvetica-Bold"),
        ("FONTSIZE",      (0,0), (-1,-1), 9),
        ("TEXTCOLOR",     (0,0), (-1,0), GREY_LT),
        ("TEXTCOLOR",     (0,1), (-1,-1), GREY_LT),
    ]))
    story += [st, SP(1, 0.3*cm)]

    story += [
        P("Constraints & Indexes", h3),
        P("• <b>UNIQUE</b> constraint on <font color='#818cf8'>transactionId</font> — one stretch per transaction, enforced at DB level.", bullet),
        P("• Index on <font color='#818cf8'>(userId, month)</font> — fast lookup for summary endpoints.", bullet),
        P("• Index on <font color='#818cf8'>(toCategoryId, month)</font> — used by cross-month cooldown check.", bullet),
        P("• No FK constraint on transactionId to avoid circular imports (same pattern as <font color='#818cf8'>splitId</font> on transactions).", bullet),
        SP(1, 0.2*cm),
        P("Files to create / modify:", h3),
        P("• <b>Create:</b> <font color='#818cf8'>lib/db/src/schema/budget_stretches.ts</font>", bullet),
        P("• <b>Modify:</b> <font color='#818cf8'>lib/db/src/schema/index.ts</font> — add export", bullet),
        P("• <b>Run:</b> <font color='#818cf8'>pnpm --filter @workspace/db run generate</font> → produces migration <font color='#818cf8'>0007_budget_stretches.sql</font>", bullet),
        P("• Migration applied automatically at API server startup via <font color='#818cf8'>migrate()</font>.", bullet),
        SP(1, 0.3*cm),
    ]

    story.append(PageBreak())

    # ════════════════════════════════════════════════════════════════════════
    # PHASE 2
    # ════════════════════════════════════════════════════════════════════════
    story += [
        phase_header(2, "API – Stretch CRUD & Validation",
                     "Express routes · Zod validation · Business rule enforcement", "Medium"),
        SP(1, 0.3*cm),
        P("New Route File: <font color='#818cf8'>artifacts/api-server/src/routes/budget-stretches.ts</font>", h2),
        SP(1, 0.1*cm),
    ]

    endpoints_data = [
        ["Method + Path", "Description"],
        ["GET /budget-stretches?month=YYYY-MM",
         "List all stretches for the authenticated user in a given month. "
         "Used by summary endpoints and frontend labels."],
        ["POST /budget-stretches",
         "Create a stretch. Accepts: transactionId, toCategoryId, fromCategoryId, amount, stretchType. "
         "Runs all business-rule validations before inserting."],
        ["DELETE /budget-stretches/:id",
         "Remove a stretch. Only the owning user may delete. Invalidates nothing server-side — "
         "the frontend must re-fetch summary/spending."],
    ]
    et = Table(endpoints_data, colWidths=[6*cm, 10.5*cm])
    et.setStyle(TableStyle([
        ("BACKGROUND",    (0,0), (-1,0), GREY_DK),
        ("BACKGROUND",    (0,1), (-1,-1), CARD_BG),
        ("ROWBACKGROUNDS",(0,1), (-1,-1), [CARD_BG, colors.HexColor("#1f1f1f")]),
        ("BOX",           (0,0), (-1,-1), 0.5, GREY_DK),
        ("INNERGRID",     (0,0), (-1,-1), 0.3, GREY_DK),
        ("LEFTPADDING",   (0,0), (-1,-1), 8),
        ("RIGHTPADDING",  (0,0), (-1,-1), 8),
        ("TOPPADDING",    (0,0), (-1,-1), 6),
        ("BOTTOMPADDING", (0,0), (-1,-1), 6),
        ("VALIGN",        (0,0), (-1,-1), "TOP"),
        ("FONTNAME",      (0,0), (-1,0), "Helvetica-Bold"),
        ("FONTSIZE",      (0,0), (-1,-1), 9),
        ("TEXTCOLOR",     (0,0), (-1,0), GREY_LT),
        ("TEXTCOLOR",     (0,1), (-1,-1), GREY_LT),
    ]))
    story += [et, SP(1, 0.3*cm)]

    story += [
        P("Validation Logic (POST /budget-stretches)", h3),
        P("<b>Rule 1 – One stretch per transaction:</b> Query budget_stretches WHERE transactionId = X. "
          "If found, reject with 409.", bullet),
        P("<b>Rule 2 – Category ownership:</b> Both toCategoryId and fromCategoryId must belong to the "
          "authenticated user. Reject with 403 otherwise.", bullet),
        P("<b>Rule 3 – Cross-month amount cap:</b> When stretchType = 'cross_month' (fromCategoryId === toCategoryId), "
          "the amount must be ≤ 50% of the category's base budget. Reject with 422 with a message showing the max allowed.", bullet),
        P("<b>Rule 4 – Cross-month cooldown:</b> For cross_month, check if any stretch with toCategoryId = X and "
          "month = previous YYYY-MM exists. If yes, reject with 422: 'Cross-month stretch locked for this category until [next available month].'", bullet),
        P("<b>Rule 5 – Transaction exists &amp; belongs to user:</b> Validate transactionId ownership.", bullet),
        P("<b>Rule 6 – Month derivation:</b> The month is derived from the transaction's date field (first 7 chars), "
          "never passed in by the client, to prevent spoofing.", bullet),
        SP(1, 0.2*cm),
        P("Route Registration", h3),
        P("• <b>Modify:</b> <font color='#818cf8'>artifacts/api-server/src/routes/index.ts</font> — mount <font color='#818cf8'>budgetStretchesRouter</font> at <font color='#818cf8'>/api</font>.", bullet),
        SP(1, 0.3*cm),
    ]

    story.append(PageBreak())

    # ════════════════════════════════════════════════════════════════════════
    # PHASE 3
    # ════════════════════════════════════════════════════════════════════════
    story += [
        phase_header(3, "OpenAPI Spec & Codegen",
                     "New schemas · New paths · Regenerate hooks", "Small"),
        SP(1, 0.3*cm),
        P("Modify: <font color='#818cf8'>lib/api-spec/openapi.yaml</font>", h2),
        P("Add a <font color='#818cf8'>budgetStretches</font> tag and the following paths:", body),
        SP(1, 0.1*cm),
        P("New Paths", h3),
        P("• <font color='#818cf8'>GET /budget-stretches</font> (operationId: listBudgetStretches) — query param: month (YYYY-MM)", bullet),
        P("• <font color='#818cf8'>POST /budget-stretches</font> (operationId: createBudgetStretch)", bullet),
        P("• <font color='#818cf8'>DELETE /budget-stretches/{id}</font> (operationId: deleteBudgetStretch)", bullet),
        SP(1, 0.15*cm),
        P("New Schemas", h3),
        P("• <font color='#818cf8'>BudgetStretch</font> — id, transactionId, userId, month, toCategoryId, fromCategoryId, amount, stretchType, createdAt", bullet),
        P("• <font color='#818cf8'>BudgetStretchInput</font> — transactionId, toCategoryId, fromCategoryId, amount, stretchType", bullet),
        SP(1, 0.15*cm),
        P("Modify Existing Schemas", h3),
        P("• <font color='#818cf8'>Transaction</font> schema: add optional <font color='#818cf8'>stretch</font> field "
          "(nullable BudgetStretch object, populated server-side when the transaction has an associated stretch).", bullet),
        P("• <font color='#818cf8'>CategorySpending</font> schema (used by GET /summary/spending): add "
          "<font color='#818cf8'>stretchAmount</font> (number, default 0), "
          "<font color='#818cf8'>stretchType</font> (string | null), "
          "<font color='#818cf8'>isStretched</font> (boolean).", bullet),
        P("• <font color='#818cf8'>SpendingSummary</font> response: add "
          "<font color='#818cf8'>adjustedTotalBudget</font> (number | null) — set when any cross-month stretch is active.", bullet),
        SP(1, 0.15*cm),
        P("Codegen", h3),
        P("• After spec changes, run: <font color='#818cf8'>pnpm --filter @workspace/api-spec run codegen</font>", bullet),
        P("• This regenerates <font color='#818cf8'>lib/api-client-react/src/generated/api.ts</font> and "
          "<font color='#818cf8'>lib/api-zod/src/generated/</font> — do not manually edit these files.", bullet),
        SP(1, 0.3*cm),
    ]

    story.append(PageBreak())

    # ════════════════════════════════════════════════════════════════════════
    # PHASE 4
    # ════════════════════════════════════════════════════════════════════════
    story += [
        phase_header(4, "API – Stretch-Aware Summary Endpoint",
                     "Modify GET /summary/spending · Adjust budgets · Inject stretch metadata", "Medium"),
        SP(1, 0.3*cm),
        P("Modify: <font color='#818cf8'>artifacts/api-server/src/routes/summary.ts</font>", h2),
        P("The <font color='#818cf8'>getSpendingGrouped()</font> function must be extended to fetch and apply "
          "stretches when computing effective budgets for each category.", body),
        SP(1, 0.15*cm),
        P("Logic Changes", h3),
        P("<b>1. Fetch stretches for the month:</b> At the start of <font color='#818cf8'>getSpendingGrouped()</font>, "
          "load all budget_stretches WHERE userId = X AND month = YYYY-MM.", bullet),
        P("<b>2. Build a stretch map:</b> Key = categoryId → { effectiveBudget, stretchAmount, stretchType, isStretched }.", bullet),
        P("<b>3. Apply cross-category stretches:</b> toCategoryId gets base_budget + amount; "
          "fromCategoryId gets base_budget − amount. Total budget unchanged.", bullet),
        P("<b>4. Apply cross-month stretches:</b> toCategoryId (in current month) gets base_budget + amount. "
          "Total budget for this month increases by the sum of all cross-month stretch amounts.", bullet),
        P("<b>5. Previous month deduction:</b> For the previous month's query, any cross-month stretches where "
          "fromCategoryId = toCategoryId and month = current−1 reduce that category's effective budget by the amount.", bullet),
        P("<b>6. Return adjustedTotalBudget:</b> If any cross-month stretch is active, set "
          "<font color='#818cf8'>adjustedTotalBudget</font> on the response; otherwise null.", bullet),
        P("<b>7. Enrich each category item</b> with: <font color='#818cf8'>isStretched</font>, "
          "<font color='#818cf8'>stretchAmount</font>, <font color='#818cf8'>stretchType</font> from the stretch map.", bullet),
        SP(1, 0.2*cm),
        P("Modify: <font color='#818cf8'>artifacts/api-server/src/routes/transactions.ts</font>", h2),
        P("The <font color='#818cf8'>enrichTransaction()</font> function and the GET /transactions route must "
          "join budget_stretches and return the <font color='#818cf8'>stretch</font> field on each transaction "
          "that has one.", body),
        P("• Batch-load stretches for all returned transaction IDs — never N+1 queries.", bullet),
        SP(1, 0.3*cm),
    ]

    story.append(PageBreak())

    # ════════════════════════════════════════════════════════════════════════
    # PHASE 5
    # ════════════════════════════════════════════════════════════════════════
    story += [
        phase_header(5, "Frontend – Transaction Form",
                     "Stretch section in TxForm · Three-way toggle · Two dropdowns · Validation", "Large"),
        SP(1, 0.3*cm),
        P("Modify: <font color='#818cf8'>artifacts/finance-app/src/pages/Transactions.tsx</font>", h2),
        P("The Stretch section is added to <font color='#818cf8'>TxForm</font> (both create and edit), "
          "positioned immediately below the Goal contribution section — matching its layout pattern.", body),
        SP(1, 0.15*cm),
        P("UI Structure", h3),
        P("• <b>Section header:</b> 'Stretch budget' label with <font color='#818cf8'>ArrowRightLeft</font> icon "
          "(Lucide). Only rendered when the user has at least one category.", bullet),
        P("• <b>Three-way toggle</b> (matches Goal toggle style): <b>No</b> (default) · <b>Fully</b> · <b>Partially</b>.", bullet),
        P("• When <b>Fully</b> or <b>Partially</b> selected, two dropdowns appear:", bullet),
        P("  — <b>'Which'</b> dropdown: target category (toCategoryId). Pre-selects the transaction's current category if set.", sub_bullet),
        P("  — <b>'From which'</b> dropdown: source category (fromCategoryId). "
          "Top item by default: same category as 'Which' with label '(from next month)'. "
          "Below it: all other user categories.", sub_bullet),
        P("• When <b>Partially</b> selected: numeric input for the stretch amount appears below the dropdowns.", bullet),
        SP(1, 0.15*cm),
        P("Validation UX", h3),
        P("<b>Cross-month path</b> (user selects same category in both dropdowns):", h3),
        P("  • If transaction amount > 50% of that category's base budget: show inline warning "
          "'Cross-month stretch not available — transaction exceeds 50% of this category's budget.' "
          "The 'from next month' option is hidden from the second dropdown for this transaction.", sub_bullet),
        P("  • Partial amount input: show 'Max: [50% of budget] [currency]'. "
          "If entered amount exceeds 50% of budget: disable Submit button, show "
          "'Amount too large — maximum allowed is [X] ([currency]).'", sub_bullet),
        P("<b>Cross-category path</b> (different categories in both dropdowns):", h3),
        P("  • No special amount cap, but submit is disabled if amount field is empty (Partially mode).", sub_bullet),
        SP(1, 0.15*cm),
        P("Form Submission", h3),
        P("• On transaction save (POST or PATCH), if stretch toggle ≠ 'No':", bullet),
        P("  — After the transaction is saved and its ID is available, call POST /budget-stretches with the stretch payload.", sub_bullet),
        P("  — If the transaction already has a stretch (edit mode) and the user changes or removes it: "
          "call DELETE /budget-stretches/:id first, then create the new one.", sub_bullet),
        P("  — Invalidate <font color='#818cf8'>getListTransactionsQueryKey()</font> and "
          "<font color='#818cf8'>getGetSpendingSummaryQueryKey()</font> after stretch operations.", sub_bullet),
        SP(1, 0.3*cm),
    ]

    story.append(PageBreak())

    # ════════════════════════════════════════════════════════════════════════
    # PHASE 6
    # ════════════════════════════════════════════════════════════════════════
    story += [
        phase_header(6, "Frontend – All Four Tabs",
                     "Home · Categories · Dashboard · Household visual integration", "Large"),
        SP(1, 0.3*cm),

        # ── Home Tab ──────────────────────────────────────────────────────
        P("Home Tab — <font color='#818cf8'>HomeSpending.tsx</font>", h2),
        P("Transaction rows: if <font color='#818cf8'>transaction.stretch</font> is present, render an orange "
          "'Stretch' badge (<font color='#818cf8'>bg-orange-500/15 text-orange-400 text-[10px] font-semibold</font>) "
          "to the right of the category badge on that row.", body),
        P("Monthly total budget display:", body),
        P("• When <font color='#818cf8'>adjustedTotalBudget</font> is returned by GET /summary/spending "
          "(non-null, ≠ base total): display the adjusted total in place of the base total.", bullet),
        P("• Render an orange label underneath: "
          "<b>'+X [currency] stretched from next month'</b> (current month) or "
          "<b>'−X [currency] stretched to last month'</b> (following month showing deduction).", bullet),
        SP(1, 0.3*cm),

        # ── Categories Tab ────────────────────────────────────────────────
        P("Categories Tab — <font color='#818cf8'>Categories.tsx</font>", h2),
        P("Fetch GET /budget-stretches?month=YYYY-MM alongside existing category data.", body),
        P("For each category card:", body),
        P("• <b>Cross-category stretch (receiver):</b> show orange label 'stretched by +X [currency]'.", bullet),
        P("• <b>Cross-category stretch (donor):</b> show orange label 'stretched by −X [currency]'.", bullet),
        P("• <b>Cross-month stretch (current month — receiver):</b> show orange label 'stretched by +X [currency] from next month'.", bullet),
        P("• <b>Cross-month stretch (next month — deduction):</b> show hardcoded orange label 'stretched by −X [currency] from last month'. "
          "This requires fetching the previous month's cross-month stretches for this category.", bullet),
        P("Labels are shown in orange (<font color='#818cf8'>text-orange-400</font>) beneath the existing "
          "budget/spending info inside the category card.", bullet),
        SP(1, 0.3*cm),

        # ── Dashboard Tab ─────────────────────────────────────────────────
        P("Dashboard Tab — <font color='#818cf8'>Dashboard.tsx</font> + <font color='#818cf8'>DonutBudgetChart.tsx</font>", h2),

        P("Changes to <font color='#818cf8'>DonutBudgetChart</font>:", h3),
        P("• Extend <font color='#818cf8'>SpendingItem</font> type with: "
          "<font color='#818cf8'>isStretched?: boolean</font>, "
          "<font color='#818cf8'>stretchAmount?: number</font>, "
          "<font color='#818cf8'>stretchType?: string</font>.", bullet),
        P("• Add new <font color='#818cf8'>GroupBorder</font> rendering path: when <font color='#818cf8'>isStretched === true</font>, "
          "draw an orange outer stroke ring on the segment (same technique as the existing red ring for over-budget). "
          "Orange ring is suppressed if the segment is also over-budget (red ring takes priority). "
          "Both labels still appear (red % overflown + orange stretch info).", bullet),
        P("• Accept an optional <font color='#818cf8'>adjustedTotalBudget</font> prop. When provided, the 360° of the "
          "donut represent <font color='#818cf8'>adjustedTotalBudget</font> instead of the sum of all category budgets. "
          "This prop is passed from Dashboard when any cross-month stretch is active for the viewed month.", bullet),

        P("Changes to <font color='#818cf8'>Dashboard.tsx</font>:", h3),
        P("• Read <font color='#818cf8'>adjustedTotalBudget</font> from the GET /summary/spending response.", bullet),
        P("• Pass it to <font color='#818cf8'>DonutBudgetChart</font> as a prop when non-null.", bullet),
        P("• Show adjusted budget total in the stat cards with the same orange label logic as Home tab.", bullet),
        SP(1, 0.3*cm),

        # ── Household Tab ─────────────────────────────────────────────────
        P("Household Tab — <font color='#818cf8'>Household.tsx</font> + <font color='#818cf8'>HouseholdDonutChart.tsx</font>", h2),
        P("Changes to <font color='#818cf8'>HouseholdDonutChart</font>:", h3),
        P("• The household donut shows each member's slice. If a member has any cross-month stretches "
          "active in the current month, their slice gets an orange outer stroke ring.", bullet),
        P("• For the per-user personal donut (if rendered): apply the same logic as DonutBudgetChart above "
          "— orange borders for stretched segments, adjusted 360° for cross-month stretches.", bullet),
        P("• Cross-category-only stretches (no adjustment to total budget): no change to the household slice ring.", bullet),
        SP(1, 0.3*cm),
    ]

    story.append(PageBreak())

    # ════════════════════════════════════════════════════════════════════════
    # DEPENDENCY MAP
    # ════════════════════════════════════════════════════════════════════════
    story += [
        P("PHASE DEPENDENCIES & SEQUENCING", section_label),
        HR(ORANGE, 1, 2, 6),
        P("Phase Dependency Map", h1),
        body and None,
    ]
    story.pop()  # remove None

    dep_data = [
        ["Phase", "Depends on", "Can run in parallel with"],
        ["Phase 1 – DB Schema",        "—",                         "Nothing (must be first)"],
        ["Phase 2 – API CRUD",         "Phase 1 (schema types)",    "Phase 3 (spec can be written independently)"],
        ["Phase 3 – OpenAPI + Codegen","Phase 1 (schema knowledge)","Phase 2 (no code dependency)"],
        ["Phase 4 – Summary endpoint", "Phases 1 + 2",              "Phase 3 codegen (spec changes inform, but not block)"],
        ["Phase 5 – Tx Form UI",       "Phase 3 codegen complete",  "Phase 4 (independent of summary changes)"],
        ["Phase 6 – All 4 Tabs",       "Phases 3 + 4 complete",     "Can start Phase 6 Home+Categories while Dashboard awaits Phase 4"],
    ]
    dt = Table(dep_data, colWidths=[4.5*cm, 4.5*cm, 7.5*cm])
    dt.setStyle(TableStyle([
        ("BACKGROUND",    (0,0), (-1,0), GREY_DK),
        ("BACKGROUND",    (0,1), (-1,-1), CARD_BG),
        ("ROWBACKGROUNDS",(0,1), (-1,-1), [CARD_BG, colors.HexColor("#1f1f1f")]),
        ("BOX",           (0,0), (-1,-1), 0.5, GREY_DK),
        ("INNERGRID",     (0,0), (-1,-1), 0.3, GREY_DK),
        ("LEFTPADDING",   (0,0), (-1,-1), 8),
        ("RIGHTPADDING",  (0,0), (-1,-1), 8),
        ("TOPPADDING",    (0,0), (-1,-1), 6),
        ("BOTTOMPADDING", (0,0), (-1,-1), 6),
        ("VALIGN",        (0,0), (-1,-1), "TOP"),
        ("FONTNAME",      (0,0), (-1,0), "Helvetica-Bold"),
        ("FONTSIZE",      (0,0), (-1,-1), 9),
        ("TEXTCOLOR",     (0,0), (-1,0), GREY_LT),
        ("TEXTCOLOR",     (0,1), (-1,-1), GREY_LT),
    ]))
    story += [dt, SP(1, 0.4*cm)]

    story += [
        P("Recommended Build Order", h2),
        P("<b>1.</b> Phase 1 (DB) → then fork:", bullet),
        P("    a) Phase 2 (API CRUD) &amp; Phase 3 (OpenAPI) in parallel", sub_bullet),
        P("<b>2.</b> Run codegen once Phase 3 spec is finalised", bullet),
        P("<b>3.</b> Phase 4 (summary endpoint) — requires Phase 1 + 2", bullet),
        P("<b>4.</b> Phase 5 (transaction form) — requires codegen from Phase 3", bullet),
        P("<b>5.</b> Phase 6 (four tabs) — Home + Categories can start after Phase 3 codegen; "
          "Dashboard + Household wait for Phase 4", bullet),
        SP(1, 0.5*cm),
    ]

    story.append(PageBreak())

    # ════════════════════════════════════════════════════════════════════════
    # FULL FILE CHECKLIST
    # ════════════════════════════════════════════════════════════════════════
    story += [
        P("FULL FILE CHANGE CHECKLIST", section_label),
        HR(ORANGE, 1, 2, 6),
        P("Files to Create or Modify", h1),
    ]

    checklist_data = [
        ["File", "Action", "Phase"],
        ["lib/db/src/schema/budget_stretches.ts",                           "Create",  "1"],
        ["lib/db/src/schema/index.ts",                                      "Modify",  "1"],
        ["lib/db/migrations/0007_budget_stretches.sql",                     "Generate","1"],
        ["lib/api-spec/openapi.yaml",                                       "Modify",  "3"],
        ["lib/api-client-react/src/generated/api.ts",                       "Regen",   "3"],
        ["lib/api-zod/src/generated/ (all files)",                          "Regen",   "3"],
        ["artifacts/api-server/src/routes/budget-stretches.ts",             "Create",  "2"],
        ["artifacts/api-server/src/routes/index.ts",                        "Modify",  "2"],
        ["artifacts/api-server/src/routes/transactions.ts",                 "Modify",  "4"],
        ["artifacts/api-server/src/routes/summary.ts",                      "Modify",  "4"],
        ["artifacts/finance-app/src/pages/Transactions.tsx",                "Modify",  "5"],
        ["artifacts/finance-app/src/pages/HomeSpending.tsx",                "Modify",  "6"],
        ["artifacts/finance-app/src/pages/Categories.tsx",                  "Modify",  "6"],
        ["artifacts/finance-app/src/pages/Dashboard.tsx",                   "Modify",  "6"],
        ["artifacts/finance-app/src/pages/Household.tsx",                   "Modify",  "6"],
        ["artifacts/finance-app/src/components/DonutBudgetChart.tsx",       "Modify",  "6"],
        ["artifacts/finance-app/src/components/HouseholdDonutChart.tsx",    "Modify",  "6"],
    ]
    ct = Table(checklist_data, colWidths=[9.5*cm, 2.5*cm, 1.5*cm])
    ct.setStyle(TableStyle([
        ("BACKGROUND",    (0,0), (-1,0), GREY_DK),
        ("BACKGROUND",    (0,1), (-1,-1), CARD_BG),
        ("ROWBACKGROUNDS",(0,1), (-1,-1), [CARD_BG, colors.HexColor("#1f1f1f")]),
        ("BOX",           (0,0), (-1,-1), 0.5, GREY_DK),
        ("INNERGRID",     (0,0), (-1,-1), 0.3, GREY_DK),
        ("LEFTPADDING",   (0,0), (-1,-1), 8),
        ("RIGHTPADDING",  (0,0), (-1,-1), 8),
        ("TOPPADDING",    (0,0), (-1,-1), 5),
        ("BOTTOMPADDING", (0,0), (-1,-1), 5),
        ("VALIGN",        (0,0), (-1,-1), "MIDDLE"),
        ("FONTNAME",      (0,0), (-1,0), "Helvetica-Bold"),
        ("FONTSIZE",      (0,0), (-1,-1), 8.5),
        ("TEXTCOLOR",     (0,0), (-1,0), GREY_LT),
        ("TEXTCOLOR",     (0,1), (-1,-1), GREY_LT),
        ("ALIGN",         (1,0), (2,-1), "CENTER"),
    ]))
    story += [ct, SP(1, 0.5*cm)]

    # ════════════════════════════════════════════════════════════════════════
    # EDGE CASES & NOTES
    # ════════════════════════════════════════════════════════════════════════
    story += [
        P("EDGE CASES & IMPLEMENTATION NOTES", section_label),
        HR(ORANGE, 1, 2, 6),
        P("Key Edge Cases", h1),
        P("• <b>Deleting a stretched transaction:</b> The stretch row should be cascade-deleted via "
          "application logic (or a DB-level ON DELETE CASCADE on budget_stretches.transactionId). "
          "The effective budget in both affected months automatically reverts to normal on the next "
          "summary fetch since the stretch row is gone.", bullet),
        P("• <b>Editing a transaction's category after setting a stretch:</b> If the user changes the "
          "transaction's category in edit mode, the stretch's toCategoryId should be updated accordingly, "
          "or the stretch should be cleared and re-created. Simplest: clear the stretch and prompt the "
          "user to re-set it.", bullet),
        P("• <b>Currency:</b> Stretch amounts are stored in the user's native currency. No conversion is "
          "needed — the category budget is always in native currency.", bullet),
        P("• <b>Household context:</b> Stretches are personal (userId-scoped). A category shared to a household "
          "goal does not propagate its stretch to other members.", bullet),
        P("• <b>Cross-month cooldown when a stretch is deleted:</b> Deleting a cross-month stretch "
          "lifts the cooldown — the category becomes stretchable again in the freed month pair.", bullet),
        P("• <b>Recurring payments:</b> The stretch UI is shown for recurring-payment transactions the same "
          "as for regular transactions — no special handling needed.", bullet),
        P("• <b>Donut total budget = 0:</b> If all categories have no budget set, "
          "<font color='#818cf8'>adjustedTotalBudget</font> remains null and the donut renders normally.", bullet),
        SP(1, 0.5*cm),
        info_box(
            "Icon selection: ArrowRightLeft (Lucide React) — already installed in the project. "
            "Conveys bilateral transfer between two sides, fitting both stretch modes. "
            "Used in the TxForm section header and in any stretch badge/label where an icon is appropriate.",
            CARD_BG, GREY_LT
        ),
        SP(1, 0.3*cm),
    ]

    doc.build(story)


build_pdf("output/Budger_Budget_Stretch_Implementation_Plan.pdf")
print("PDF generated successfully.")
