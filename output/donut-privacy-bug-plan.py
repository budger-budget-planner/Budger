#!/usr/bin/env python3
"""Generate Budger – Household Donut Privacy Bug Analysis PDF."""

from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.lib.colors import HexColor, white, black
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    HRFlowable, KeepTogether
)
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_JUSTIFY

W, H = A4
L, R, T, B = 18*mm, 18*mm, 18*mm, 16*mm

NEAR_BLACK  = HexColor("#111111")
DARK        = HexColor("#1a1a1a")
GREY        = HexColor("#3a3a3a")
MID_GREY    = HexColor("#888888")
LIGHT_GREY  = HexColor("#e8e8e8")
OFF_WHITE   = HexColor("#f7f7f7")
RED_DARK    = HexColor("#991111")
RED_MID     = HexColor("#cc2222")
RED_LIGHT   = HexColor("#ffdddd")
AMBER_DARK  = HexColor("#7a5300")
AMBER_MID   = HexColor("#d97706")
AMBER_LIGHT = HexColor("#fff3cd")
GREEN_DARK  = HexColor("#145214")
GREEN_LIGHT = HexColor("#d4edda")
BLUE_DARK   = HexColor("#0c3b6e")
BLUE_LIGHT  = HexColor("#dce8f8")

styles = getSampleStyleSheet()

def style(name, **kw):
    s = ParagraphStyle(name, **kw)
    return s

COVER_TITLE = style("CoverTitle",
    fontName="Helvetica-Bold", fontSize=26, leading=32,
    textColor=white, alignment=TA_CENTER, spaceAfter=6)
COVER_SUB = style("CoverSub",
    fontName="Helvetica", fontSize=12, leading=18,
    textColor=HexColor("#cccccc"), alignment=TA_CENTER, spaceAfter=4)
COVER_META = style("CoverMeta",
    fontName="Helvetica-Oblique", fontSize=9, leading=14,
    textColor=HexColor("#aaaaaa"), alignment=TA_CENTER)

H1 = style("H1",
    fontName="Helvetica-Bold", fontSize=15, leading=20,
    textColor=NEAR_BLACK, spaceBefore=14, spaceAfter=5)
H2 = style("H2",
    fontName="Helvetica-Bold", fontSize=11.5, leading=15,
    textColor=NEAR_BLACK, spaceBefore=10, spaceAfter=3)
BODY = style("Body",
    fontName="Helvetica", fontSize=9.5, leading=14.5,
    textColor=DARK, alignment=TA_JUSTIFY, spaceAfter=4)
BODY_SMALL = style("BodySmall",
    fontName="Helvetica", fontSize=8.5, leading=13,
    textColor=GREY, alignment=TA_JUSTIFY, spaceAfter=3)
CODE = style("Code",
    fontName="Courier", fontSize=8, leading=12,
    textColor=HexColor("#222222"), backColor=HexColor("#f0f0f0"),
    borderPadding=(3,5,3,5), spaceAfter=5)
LABEL = style("Label",
    fontName="Helvetica-Bold", fontSize=8, leading=11,
    textColor=NEAR_BLACK)
NOTE = style("Note",
    fontName="Helvetica-Oblique", fontSize=8.5, leading=13,
    textColor=MID_GREY, spaceAfter=3)

def hr(color=LIGHT_GREY, thickness=0.5, spaceBefore=6, spaceAfter=6):
    return HRFlowable(width="100%", thickness=thickness,
                      color=color, spaceBefore=spaceBefore, spaceAfter=spaceAfter)

def severity_badge(sev):
    colors = {
        "CRITICAL": (RED_DARK, RED_LIGHT, "CRITICAL"),
        "HIGH":     (AMBER_DARK, AMBER_LIGHT, "HIGH"),
        "MEDIUM":   (BLUE_DARK,  BLUE_LIGHT,  "MEDIUM"),
        "LOW":      (GREEN_DARK, GREEN_LIGHT,  "LOW"),
    }
    fg, bg, label = colors.get(sev, (GREY, LIGHT_GREY, sev))
    return Table([[Paragraph(f"<b>{label}</b>",
                  style(f"Badge{sev}", fontName="Helvetica-Bold", fontSize=7.5,
                        textColor=fg, alignment=TA_CENTER))]],
                 colWidths=[20*mm],
                 style=TableStyle([
                     ("BACKGROUND", (0,0), (-1,-1), bg),
                     ("ROUNDEDCORNERS", [3]),
                     ("TOPPADDING",    (0,0), (-1,-1), 2),
                     ("BOTTOMPADDING", (0,0), (-1,-1), 2),
                     ("LEFTPADDING",   (0,0), (-1,-1), 4),
                     ("RIGHTPADDING",  (0,0), (-1,-1), 4),
                 ]))

def scenario_block(number, title, severity, location, trigger, root_cause,
                   impact, fix_summary, fix_detail):
    sev_colors = {
        "CRITICAL": (RED_MID,   RED_LIGHT),
        "HIGH":     (AMBER_MID, AMBER_LIGHT),
        "MEDIUM":   (BLUE_DARK, BLUE_LIGHT),
        "LOW":      (GREEN_DARK, GREEN_LIGHT),
    }
    stripe, bg = sev_colors.get(severity, (GREY, LIGHT_GREY))

    header_data = [[
        Paragraph(f"<b>Scenario {number}</b>", style(f"SH{number}",
            fontName="Helvetica-Bold", fontSize=10, textColor=stripe)),
        Paragraph(f"<b>{title}</b>", style(f"ST{number}",
            fontName="Helvetica-Bold", fontSize=10, textColor=NEAR_BLACK)),
        severity_badge(severity),
    ]]
    header_tbl = Table(header_data, colWidths=[28*mm, 113*mm, 25*mm],
        style=TableStyle([
            ("BACKGROUND",    (0,0), (-1,-1), bg),
            ("TOPPADDING",    (0,0), (-1,-1), 7),
            ("BOTTOMPADDING", (0,0), (-1,-1), 7),
            ("LEFTPADDING",   (0,0), (-1,-1), 7),
            ("RIGHTPADDING",  (0,0), (-1,-1), 4),
            ("VALIGN",        (0,0), (-1,-1), "MIDDLE"),
        ]))

    def row(label, value):
        return [
            Paragraph(label, LABEL),
            Paragraph(value,  BODY_SMALL),
        ]

    detail_rows = [
        row("Location", location),
        row("Trigger", trigger),
        row("Root cause", root_cause),
        row("Impact", impact),
        row("Fix summary", fix_summary),
    ]

    detail_tbl = Table(detail_rows, colWidths=[28*mm, 138*mm],
        style=TableStyle([
            ("BACKGROUND",    (0,0), (-1,-1), white),
            ("TOPPADDING",    (0,0), (-1,-1), 4),
            ("BOTTOMPADDING", (0,0), (-1,-1), 4),
            ("LEFTPADDING",   (0,0), (0,-1), 7),
            ("LEFTPADDING",   (1,0), (1,-1), 5),
            ("RIGHTPADDING",  (0,0), (-1,-1), 5),
            ("VALIGN",        (0,0), (-1,-1), "TOP"),
            ("LINEBELOW",     (0,0), (-1,-2), 0.3, LIGHT_GREY),
            ("LINEAFTER",     (0,0), (0,-1), 0.3, LIGHT_GREY),
        ]))

    if fix_detail:
        code_block = [Paragraph(fix_detail, CODE)]
    else:
        code_block = []

    outer = Table(
        [[header_tbl]] +
        [[detail_tbl]] +
        ([[Paragraph("    " + fix_detail, CODE)]] if fix_detail else []),
        colWidths=[166*mm],
        style=TableStyle([
            ("BOX",         (0,0), (-1,-1), 0.5, stripe),
            ("TOPPADDING",  (0,0), (-1,-1), 0),
            ("BOTTOMPADDING",(0,0),(-1,-1), 0),
            ("LEFTPADDING", (0,0), (-1,-1), 0),
            ("RIGHTPADDING",(0,0), (-1,-1), 0),
        ]))

    return KeepTogether([outer, Spacer(1, 7*mm)])


def build():
    doc = SimpleDocTemplate(
        "output/Budger_Donut_Privacy_Bug_Analysis.pdf",
        pagesize=A4,
        leftMargin=L, rightMargin=R, topMargin=T, bottomMargin=B,
        title="Budger – Household Donut Privacy Bug Analysis",
        author="Budger Engineering",
    )

    story = []

    # ── Cover ────────────────────────────────────────────────────────────────
    cover_tbl = Table(
        [[Paragraph("BUDGER", style("CoverApp", fontName="Helvetica-Bold",
                    fontSize=11, textColor=HexColor("#888888"), alignment=TA_CENTER))],
         [Paragraph("Household Donut<br/>Privacy Bug Analysis", COVER_TITLE)],
         [Spacer(1, 4*mm)],
         [Paragraph("Root-cause investigation &amp; full fix plan", COVER_SUB)],
         [Spacer(1, 2*mm)],
         [Paragraph("July 2026 — Engineering Internal", COVER_META)],
        ],
        colWidths=[166*mm],
        style=TableStyle([
            ("BACKGROUND",    (0,0), (-1,-1), NEAR_BLACK),
            ("TOPPADDING",    (0,0), (-1,-1), 6),
            ("BOTTOMPADDING", (0,0), (-1,-1), 6),
            ("LEFTPADDING",   (0,0), (-1,-1), 12),
            ("RIGHTPADDING",  (0,0), (-1,-1), 12),
            ("BOX",           (0,0), (-1,-1), 1.5, MID_GREY),
        ]))
    story += [cover_tbl, Spacer(1, 10*mm)]

    # ── Executive Summary ────────────────────────────────────────────────────
    story += [
        Paragraph("Executive Summary", H1),
        hr(),
        Paragraph(
            "The household donut chart showed all member dashboards — including the head's own — "
            "as 'Private' after the head switched transaction categories several times. "
            "The underlying backend privacy logic is correct: the server never blocks the head from "
            "viewing anyone's data. The bug is entirely in the frontend: <b>any fetch error from "
            "<i>useGetMemberSpending</i> unconditionally triggers setIsPrivate(true)</b>, regardless of "
            "whether the error is a genuine privacy block (HTTP 403) or a transient server problem "
            "(500, timeout, network loss). Rapid category reassignment causes the server to run "
            "several expensive parallel DB queries simultaneously, which can return a 500 error — "
            "falsely locking every drilled member view as 'Private'.",
            BODY),
        Paragraph(
            "Six distinct failure scenarios have been identified. Each is described below with its "
            "trigger, root cause, user impact, and the specific code change needed to resolve it.",
            BODY),
        Spacer(1, 5*mm),
    ]

    # ── Severity legend ──────────────────────────────────────────────────────
    leg_data = [[
        severity_badge("CRITICAL"),
        Paragraph("Directly reproducible; corrupts core UX, destroys user trust.", BODY_SMALL),
        severity_badge("HIGH"),
        Paragraph("Reproducible under common usage; significant UX damage.", BODY_SMALL),
    ],[
        severity_badge("MEDIUM"),
        Paragraph("Uncommon or requires edge conditions; noticeable but recoverable.", BODY_SMALL),
        severity_badge("LOW"),
        Paragraph("Rare or cosmetic; polishes reliability.", BODY_SMALL),
    ]]
    leg_tbl = Table(leg_data, colWidths=[22*mm, 58*mm, 22*mm, 64*mm],
        style=TableStyle([
            ("BACKGROUND",    (0,0), (-1,-1), OFF_WHITE),
            ("TOPPADDING",    (0,0), (-1,-1), 5),
            ("BOTTOMPADDING", (0,0), (-1,-1), 5),
            ("LEFTPADDING",   (0,0), (-1,-1), 6),
            ("VALIGN",        (0,0), (-1,-1), "MIDDLE"),
            ("BOX",           (0,0), (-1,-1), 0.4, LIGHT_GREY),
        ]))
    story += [Paragraph("Severity legend", H2), leg_tbl, Spacer(1, 8*mm)]

    # ── Scenario 1 ──────────────────────────────────────────────────────────
    story.append(Paragraph("Failure Scenarios", H1))
    story.append(hr())

    story.append(scenario_block(
        number=1,
        title="Any fetch error treated as a privacy block",
        severity="CRITICAL",
        location="frontend · HouseholdDonutChart.tsx line 547–549",
        trigger=(
            "The useGetMemberSpending query returns any non-2xx response while the donut is in "
            "drill-down mode (drillPhase ≠ 'idle'). Caused here by rapid category switching "
            "which temporarily overloads the server."
        ),
        root_cause=(
            "useEffect(() =&gt; { if (memberSpendError &amp;&amp; drillPhase !== 'idle') setIsPrivate(true); }) "
            "does not inspect the HTTP status code. A 500, 503, network timeout, or any other "
            "transient error sets isPrivate = true identically to a genuine 403 'blocked' response. "
            "The head's own donut is also affected because the frontend has no self-exemption — "
            "only the backend does."
        ),
        impact=(
            "All drilled member views, including the head's own dashboard, lock to the 'Private' "
            "padlock screen for the rest of the session. The user must close and reopen the app to recover. "
            "Completely destroys trust in the privacy system."
        ),
        fix_summary=(
            "Inspect the HTTP status code of memberSpendError. Only set isPrivate(true) when the "
            "status is exactly 403. For all other errors show a dismissible error banner with a "
            "Retry button instead of the padlock animation."
        ),
        fix_detail=(
            "// Change the effect to check error.status before locking:\n"
            "useEffect(() => {\n"
            "  if (!memberSpendError || drillPhase === 'idle') return;\n"
            "  const status = (memberSpendError as any)?.status as number | undefined;\n"
            "  if (status === 403) setIsPrivate(true);\n"
            "  else setMemberFetchError(true); // new state → show retry banner\n"
            "}, [memberSpendError, drillPhase]);"
        ),
    ))

    story.append(scenario_block(
        number=2,
        title="Server overload from concurrent category-switch invalidations",
        severity="HIGH",
        location="backend · households.ts GET /households/members/:userId/spending",
        trigger=(
            "The head reassigns transaction categories several times in quick succession. "
            "Each save fires multiple queryClient.invalidateQueries calls; the donut's "
            "useGetMemberSpending query refetches concurrently with these."
        ),
        root_cause=(
            "The member spending endpoint fires five parallel DB queries (transactions, categories, "
            "recurringPayments, rpLogs, householdMember). Under concurrent load from rapid "
            "category mutations, one of these may time out or the Neon connection pool may be "
            "exhausted, causing a 500 response. Combined with Scenario 1, this is sufficient to "
            "trigger the privacy lockout."
        ),
        impact=(
            "Intermittent 500 errors that the frontend misreads as privacy blocks. Also degrades "
            "perceived backend reliability. Likely the direct cause of the reported crash."
        ),
        fix_summary=(
            "1) getGetMemberSpendingQueryKey is not in the category-change invalidation list — "
            "confirm and document this explicitly so future changes do not accidentally add it. "
            "2) Add a try/catch around the parallel DB block in the spending route and return "
            "503 with a machine-readable code ('db_error') instead of letting Express throw a 500. "
            "3) After Scenario 1 is fixed, a 503 will show a retry banner rather than a padlock."
        ),
        fix_detail=None,
    ))

    story.append(scenario_block(
        number=3,
        title="isPrivate state not reset when drilling back",
        severity="HIGH",
        location="frontend · HouseholdDonutChart.tsx startDrillBack() ~line 782",
        trigger=(
            "A member's donut shows the privacy padlock (isPrivate = true, from any previous "
            "error or a real 403). The user taps to drill back to the household view. "
            "They then tap-and-hold to drill into a different member."
        ),
        root_cause=(
            "startDrillBack() never calls setIsPrivate(false). The isPrivate state persists across "
            "the drill-back animation. When startDrillDown() fires for the next member it does call "
            "setIsPrivate(false), but there is a React render cycle between removeQueries and the "
            "new fetch completing. If the new member's query also has a cached error at that moment, "
            "the useEffect fires again before setIsPrivate(false) is processed."
        ),
        impact=(
            "A padlock shown for member A can bleed visually into the drill-back or the next "
            "member's view. In the worst case the lock animation re-triggers immediately for "
            "a member who is not actually private."
        ),
        fix_summary=(
            "Add setIsPrivate(false) and setLockPhase(null) at the very start of startDrillBack(), "
            "before any animation timers are scheduled. This ensures the lock state is always "
            "cleared the moment the user begins retreating from a drilled view."
        ),
        fix_detail=(
            "function startDrillBack() {\n"
            "  if (drillPhase !== 'personal') return;\n"
            "  lockTimersRef.current.forEach(clearTimeout);\n"
            "  lockTimersRef.current = [];\n"
            "  setIsPrivate(false);   // ← add this\n"
            "  setLockPhase(null);    // ← add this\n"
            "  // ... rest of existing drill-back logic\n"
            "}"
        ),
    ))

    story.append(scenario_block(
        number=4,
        title="Window-focus refetch triggers error on iOS PWA return",
        severity="HIGH",
        location="frontend · HouseholdDonutChart.tsx useGetMemberSpending options",
        trigger=(
            "The user drills into a member's donut, switches to another iOS app (banking app, "
            "messages, etc.) and returns to Budger. React Query's default refetchOnWindowFocus "
            "fires the member spending query. If the server is briefly slow at that moment "
            "(wake-up latency on Render's free tier, Neon cold start), the fetch errors."
        ),
        root_cause=(
            "useGetMemberSpending has no refetchOnWindowFocus override, so it inherits React "
            "Query's global default of true. Combined with Scenario 1's error-to-private "
            "mapping, a single focus event can lock all member views."
        ),
        impact=(
            "Especially damaging on iOS where app-switching is the primary multitasking model. "
            "Users who briefly check another app and return find their household donut locked."
        ),
        fix_summary=(
            "Set refetchOnWindowFocus: false on the useGetMemberSpending call inside "
            "HouseholdDonutChart. Member spending data does not need to be instantly fresh on "
            "focus return; it refreshes naturally when the user drills back and re-drills. "
            "Alternatively, set a staleTime of at least 60 seconds."
        ),
        fix_detail=(
            "const { data: memberSpendRaw, isError: memberSpendError } =\n"
            "  useGetMemberSpending(realMemberId, {\n"
            "    query: {\n"
            "      enabled: drillPhase !== 'idle' && !isVirtualDrill && realMemberId > 0,\n"
            "      refetchOnWindowFocus: false,   // ← add\n"
            "      staleTime: 60_000,             // ← add\n"
            "      retry: false,                  // ← add (avoids retry storms)\n"
            "    },\n"
            "  });"
        ),
    ))

    story.append(scenario_block(
        number=5,
        title="Household membership drift causes 403 on self or 404 on valid member",
        severity="MEDIUM",
        location="backend · households.ts GET /households/members/:userId/spending line 343",
        trigger=(
            "A user leaves and rejoins a household (or is removed and re-invited). In rare "
            "cases the users.householdId column and the household_members table become "
            "temporarily inconsistent — the backend code itself notes this risk in a comment. "
            "Can also happen if a member is removed while someone else is drilling into their donut."
        ),
        root_cause=(
            "The route checks currentUser.householdId (from the users table) but looks up "
            "membership by userId alone in household_members. If these are out of sync, the "
            "route returns 403 ('Not in a household') for currentUser or 404 ('Member not "
            "found') for targetUser. Frontend treats both as an error → Scenario 1 fires → "
            "privacy lockout."
        ),
        impact=(
            "Intermittent: only affects users who recently changed household membership. "
            "They see all member donuts as 'Private' until app reload syncs the cache."
        ),
        fix_summary=(
            "1) Use machine-readable error codes for 403/404 ('not_in_household', "
            "'member_not_found') so the frontend can distinguish them from a real privacy block. "
            "2) After Scenario 1 is fixed these will show a retry banner rather than a padlock. "
            "3) On the backend, consider a single source of truth query that joins users and "
            "household_members rather than checking both independently."
        ),
        fix_detail=None,
    ))

    story.append(scenario_block(
        number=6,
        title="React Query retry storms re-trigger the lock animation",
        severity="MEDIUM",
        location="frontend · HouseholdDonutChart.tsx useGetMemberSpending + lock animation effect",
        trigger=(
            "Any transient error on the member spending fetch. React Query retries failed "
            "queries up to 3 times by default with exponential backoff."
        ),
        root_cause=(
            "Each retry cycle that fails sets memberSpendError = true then false then true again. "
            "The useEffect on [memberSpendError, drillPhase] fires on every transition. "
            "Combined with Scenario 1 this re-triggers setIsPrivate(true) and the lock animation "
            "starts over multiple times — padlock pops, fades, then pops again — deeply confusing UX "
            "even if only a transient server hiccup occurred."
        ),
        impact=(
            "Visual glitches: the padlock animation plays 2–3 times. After retries succeed "
            "(if the error was transient), isPrivate may remain true because setIsPrivate(false) "
            "is never called on query recovery."
        ),
        fix_summary=(
            "Set retry: false on useGetMemberSpending (covered in Scenario 4's fix). "
            "Additionally, add a recovery path: if memberSpendError was true but the query "
            "subsequently succeeds (isSuccess flips to true), call setIsPrivate(false) and "
            "setMemberFetchError(false) to restore the normal view automatically."
        ),
        fix_detail=(
            "useEffect(() => {\n"
            "  // Clear error states if a previously-failed query recovers\n"
            "  if (!memberSpendError && drillPhase !== 'idle') {\n"
            "    setMemberFetchError(false);\n"
            "    // Do NOT auto-clear isPrivate — a real 403 should stay locked\n"
            "    // until the user explicitly drills back out.\n"
            "  }\n"
            "}, [memberSpendError, drillPhase]);"
        ),
    ))

    # ── Fix Priority Table ───────────────────────────────────────────────────
    story += [
        Paragraph("Implementation Order", H1),
        hr(),
        Paragraph(
            "All six scenarios should be resolved together in a single focused sprint. "
            "The table below shows the recommended implementation order — earlier items unblock later ones.",
            BODY),
        Spacer(1, 3*mm),
    ]

    pri_header = [
        Paragraph("<b>#</b>", LABEL),
        Paragraph("<b>Action</b>", LABEL),
        Paragraph("<b>File</b>", LABEL),
        Paragraph("<b>Blocks</b>", LABEL),
        Paragraph("<b>Effort</b>", LABEL),
    ]
    pri_rows = [
        pri_header,
        ["1", "Scenario 1: only 403 → isPrivate", "HouseholdDonutChart.tsx", "All others", "30 min"],
        ["2", "Scenario 4: disable refetchOnWindowFocus + retry:false", "HouseholdDonutChart.tsx", "4, 6", "10 min"],
        ["3", "Scenario 3: reset isPrivate in startDrillBack", "HouseholdDonutChart.tsx", "3", "10 min"],
        ["4", "Scenario 6: add recovery path on query success", "HouseholdDonutChart.tsx", "6", "15 min"],
        ["5", "Scenario 2: add try/catch + 503 in spending route", "households.ts", "2", "20 min"],
        ["6", "Scenario 5: machine-readable error codes on 403/404", "households.ts", "5", "15 min"],
    ]

    def fmt_row(row):
        if row is pri_header:
            return row
        return [Paragraph(str(cell), BODY_SMALL) for cell in row]

    pri_tbl = Table(
        [fmt_row(r) for r in pri_rows],
        colWidths=[8*mm, 64*mm, 46*mm, 22*mm, 20*mm],
        style=TableStyle([
            ("BACKGROUND",    (0,0), (-1,0),  NEAR_BLACK),
            ("TEXTCOLOR",     (0,0), (-1,0),  white),
            ("BACKGROUND",    (0,1), (-1,1),  RED_LIGHT),
            ("BACKGROUND",    (0,2), (-1,2),  AMBER_LIGHT),
            ("BACKGROUND",    (0,3), (-1,3),  AMBER_LIGHT),
            ("BACKGROUND",    (0,4), (-1,4),  BLUE_LIGHT),
            ("BACKGROUND",    (0,5), (-1,5),  BLUE_LIGHT),
            ("BACKGROUND",    (0,6), (-1,6),  GREEN_LIGHT),
            ("TOPPADDING",    (0,0), (-1,-1), 5),
            ("BOTTOMPADDING", (0,0), (-1,-1), 5),
            ("LEFTPADDING",   (0,0), (-1,-1), 6),
            ("GRID",          (0,0), (-1,-1), 0.3, LIGHT_GREY),
            ("VALIGN",        (0,0), (-1,-1), "TOP"),
        ]))
    story += [pri_tbl, Spacer(1, 8*mm)]

    # ── Testing checklist ────────────────────────────────────────────────────
    story += [
        Paragraph("Verification Checklist", H1),
        hr(),
        Paragraph(
            "After all fixes are applied, run through each of the following test cases "
            "before shipping:", BODY),
        Spacer(1, 2*mm),
    ]

    checks = [
        ("1", "Drill into any member; rapidly switch categories 5+ times on the Transactions page while staying drilled. Donut must NOT show padlock.", "CRITICAL"),
        ("2", "Drill into own donut as head. Must never show padlock (own data is never blocked).", "CRITICAL"),
        ("3", "Simulate a 500 from /members/:id/spending (e.g. via DevTools throttle → Offline). Must show retry banner, not padlock.", "CRITICAL"),
        ("4", "Drill into a member, switch apps for 5 s, return to Budger. Donut must still show data, not padlock.", "HIGH"),
        ("5", "Drill into member A (with real 403 = private). Drill back. Drill into member B (not private). B must show real data.", "HIGH"),
        ("6", "Drill into a private member. Drill back. Verify isPrivate is reset (household view looks normal).", "HIGH"),
        ("7", "Trigger a transient 503 during drill. Verify no padlock, error banner shows. Restore connectivity; verify retry auto-refreshes data.", "MEDIUM"),
        ("8", "Remove a member while another user's session is drilling into that member. Must show 'member not found' banner, not padlock.", "MEDIUM"),
    ]

    chk_rows = [[
        Paragraph("<b>#</b>", LABEL),
        Paragraph("<b>Test case</b>", LABEL),
        Paragraph("<b>Severity tested</b>", LABEL),
    ]] + [
        [Paragraph(c[0], BODY_SMALL), Paragraph(c[1], BODY_SMALL), severity_badge(c[2])]
        for c in checks
    ]

    chk_tbl = Table(chk_rows, colWidths=[8*mm, 128*mm, 25*mm],
        style=TableStyle([
            ("BACKGROUND",    (0,0), (-1,0), NEAR_BLACK),
            ("TEXTCOLOR",     (0,0), (-1,0), white),
            ("ROWBACKGROUNDS",(0,1), (-1,-1), [white, OFF_WHITE]),
            ("TOPPADDING",    (0,0), (-1,-1), 5),
            ("BOTTOMPADDING", (0,0), (-1,-1), 5),
            ("LEFTPADDING",   (0,0), (-1,-1), 6),
            ("GRID",          (0,0), (-1,-1), 0.3, LIGHT_GREY),
            ("VALIGN",        (0,0), (-1,-1), "TOP"),
        ]))
    story.append(chk_tbl)
    story.append(Spacer(1, 8*mm))

    # ── Footer note ──────────────────────────────────────────────────────────
    story.append(Paragraph(
        "This document covers only the household donut privacy system. "
        "No other subsystems (Larder, Goals, Splits, Recurring Payments) are in scope.",
        NOTE))

    doc.build(story)
    print("PDF written: output/Budger_Donut_Privacy_Bug_Analysis.pdf")

build()
