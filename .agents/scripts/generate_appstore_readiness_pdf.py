from __future__ import annotations

from pathlib import Path
import textwrap


OUT = Path("reports/budger-app-store-readiness-audit.pdf")
PAGE_W, PAGE_H = 612, 792
MARGIN = 48
CONTENT_W = PAGE_W - (2 * MARGIN)


def esc(value: str) -> str:
    return (
        value.replace("\\", "\\\\")
        .replace("(", "\\(")
        .replace(")", "\\)")
        .replace("—", "-")
        .replace("–", "-")
        .replace("’", "'")
        .replace("“", '"')
        .replace("”", '"')
        .replace("→", "->")
        .replace("✓", "[x]")
    )


def wrap(text: str, width: int) -> list[str]:
    return textwrap.wrap(
        text,
        width=width,
        break_long_words=False,
        break_on_hyphens=False,
        replace_whitespace=False,
    ) or [""]


class Pdf:
    def __init__(self) -> None:
        self.pages: list[list[str]] = []
        self.current: list[str] = []
        self.y = PAGE_H - 56
        self.page_number = 0

    def start_page(self) -> None:
        if self.current:
            self.finish_page()
        self.page_number += 1
        self.current = []
        self.y = PAGE_H - 56
        self.rect(0, 0, PAGE_W, PAGE_H, (0.97, 0.98, 0.99), fill=True)
        self.rect(0, PAGE_H - 12, PAGE_W, 12, (0.04, 0.10, 0.18), fill=True)
        self.text("BUDGER  /  APP STORE READINESS AUDIT", MARGIN, PAGE_H - 34, 8, "F2", (0.30, 0.38, 0.48))

    def finish_page(self) -> None:
        self.line(MARGIN, 35, PAGE_W - MARGIN, 35, (0.82, 0.85, 0.89), 0.6)
        self.text(f"Budger App Store readiness audit  |  {self.page_number}", MARGIN, 21, 7.5, "F1", (0.38, 0.43, 0.50))
        self.pages.append(self.current)
        self.current = []

    def ensure(self, needed: float) -> None:
        if self.y - needed < 54:
            self.start_page()

    def raw(self, command: str) -> None:
        self.current.append(command)

    def text(self, value: str, x: float, y: float, size: float, font: str = "F1", color=(0.10, 0.13, 0.18)) -> None:
        r, g, b = color
        self.raw(f"{r:.3f} {g:.3f} {b:.3f} rg BT /{font} {size:.2f} Tf {x:.2f} {y:.2f} Td ({esc(value)}) Tj ET")

    def rect(self, x: float, y: float, w: float, h: float, color, fill=True, stroke=None, radius=0) -> None:
        r, g, b = color
        if radius:
            # Small rounded-card approximation using a regular rectangle.
            pass
        op = "f" if fill else "S"
        self.raw(f"{r:.3f} {g:.3f} {b:.3f} rg {x:.2f} {y:.2f} {w:.2f} {h:.2f} re {op}")
        if stroke:
            sr, sg, sb = stroke
            self.raw(f"{sr:.3f} {sg:.3f} {sb:.3f} RG 0.7 w {x:.2f} {y:.2f} {w:.2f} {h:.2f} re S")

    def line(self, x1, y1, x2, y2, color=(0, 0, 0), width=1) -> None:
        r, g, b = color
        self.raw(f"{r:.3f} {g:.3f} {b:.3f} RG {width:.2f} w {x1:.2f} {y1:.2f} m {x2:.2f} {y2:.2f} l S")

    def para(self, text: str, size=9.5, leading=14, color=(0.19, 0.23, 0.29), indent=0, width=92, font="F1", gap=5) -> None:
        lines = []
        for paragraph in text.split("\n"):
            lines.extend(wrap(paragraph, width) if paragraph else [""])
        self.ensure(len(lines) * leading + gap)
        for line in lines:
            self.text(line, MARGIN + indent, self.y, size, font, color)
            self.y -= leading
        self.y -= gap

    def heading(self, text: str, level=2) -> None:
        size = 15 if level == 1 else 11.5
        leading = 19 if level == 1 else 16
        self.ensure(leading + 12)
        color = (0.04, 0.10, 0.18) if level == 1 else (0.09, 0.27, 0.43)
        self.text(text, MARGIN, self.y, size, "F2", color)
        self.y -= leading
        if level == 1:
            self.line(MARGIN, self.y + 4, MARGIN + 82, self.y + 4, (0.95, 0.42, 0.12), 2.4)
            self.y -= 9
        else:
            self.y -= 4

    def bullet(self, text: str, level=0) -> None:
        indent = level * 16
        bullet_x = MARGIN + indent
        text_x = bullet_x + 11
        lines = wrap(text, 86 - level * 2)
        self.ensure(len(lines) * 13 + 2)
        self.text("-", bullet_x, self.y, 10, "F2", (0.95, 0.42, 0.12))
        for i, line in enumerate(lines):
            self.text(line, text_x, self.y, 9.2, "F1", (0.19, 0.23, 0.29))
            self.y -= 13
        self.y -= 2

    def code(self, text: str) -> None:
        lines = text.splitlines()
        h = len(lines) * 12 + 16
        self.ensure(h + 6)
        top = self.y + 5
        self.rect(MARGIN, top - h, CONTENT_W, h, (0.91, 0.93, 0.96), fill=True)
        cy = top - 13
        for line in lines:
            self.text(line, MARGIN + 12, cy, 8.4, "F3", (0.10, 0.18, 0.25))
            cy -= 12
        self.y = top - h - 8

    def callout(self, label: str, text: str, color=(0.95, 0.42, 0.12)) -> None:
        lines = wrap(text, 83)
        h = 30 + len(lines) * 13
        self.ensure(h + 10)
        top = self.y + 4
        self.rect(MARGIN, top - h, CONTENT_W, h, (1.0, 0.97, 0.92), fill=True, stroke=(0.96, 0.73, 0.45))
        self.rect(MARGIN, top - h, 5, h, color, fill=True)
        self.text(label.upper(), MARGIN + 16, top - 18, 8.5, "F2", (0.66, 0.28, 0.06))
        cy = top - 33
        for line in lines:
            self.text(line, MARGIN + 16, cy, 9.2, "F1", (0.25, 0.22, 0.17))
            cy -= 13
        self.y = top - h - 10

    def build(self) -> bytes:
        if self.current:
            self.finish_page()
        objects: list[bytes] = []
        def obj(data: bytes) -> int:
            objects.append(data)
            return len(objects)

        catalog = obj(b"<< /Type /Catalog /Pages 2 0 R >>")
        pages_obj = obj(b"<< /Type /Pages /Kids [] /Count 0 >>")
        f1 = obj(b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>")
        f2 = obj(b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>")
        f3 = obj(b"<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>")
        page_ids = []
        content_ids = []
        for page_commands in self.pages:
            stream = "\n".join(page_commands).encode("latin-1", "replace")
            content_ids.append(obj(b"<< /Length %d >>\nstream\n%s\nendstream" % (len(stream), stream)))
            page_ids.append(obj(b""))
        kids = " ".join(f"{pid} 0 R" for pid in page_ids)
        objects[pages_obj - 1] = f"<< /Type /Pages /Kids [{kids}] /Count {len(page_ids)} >>".encode()
        for i, pid in enumerate(page_ids):
            objects[pid - 1] = (
                f"<< /Type /Page /Parent {pages_obj} 0 R /MediaBox [0 0 {PAGE_W} {PAGE_H}] "
                f"/Resources << /Font << /F1 {f1} 0 R /F2 {f2} 0 R /F3 {f3} 0 R >> >> "
                f"/Contents {content_ids[i]} 0 R >>"
            ).encode()
        out = bytearray(b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n")
        offsets = [0]
        for n, data in enumerate(objects, 1):
            offsets.append(len(out))
            out.extend(f"{n} 0 obj\n".encode())
            out.extend(data)
            out.extend(b"\nendobj\n")
        xref = len(out)
        out.extend(f"xref\n0 {len(objects)+1}\n".encode())
        out.extend(b"0000000000 65535 f \n")
        for offset in offsets[1:]:
            out.extend(f"{offset:010d} 00000 n \n".encode())
        out.extend(f"trailer\n<< /Size {len(objects)+1} /Root {catalog} 0 R >>\nstartxref\n{xref}\n%%EOF\n".encode())
        return bytes(out)


def make_document() -> Pdf:
    p = Pdf()
    p.start_page()
    p.text("App Store wrapper readiness", MARGIN, p.y, 25, "F2", (0.04, 0.10, 0.18))
    p.y -= 28
    p.text("Budger  |  Read-only technical audit", MARGIN, p.y, 11, "F1", (0.38, 0.43, 0.50))
    p.y -= 25
    p.callout("Current status: not App Store-ready yet", "The repository has a useful compliance scaffold, but it is not currently a buildable iOS application.")

    p.heading("What is already in good shape", 1)
    for item in [
        "Production frontend is reachable at https://budger.app",
        "Production backend health endpoint responds successfully",
        "Production frontend build passes",
        "Privacy policy includes crash-report consent, data export, account deletion, and receipt/photo handling",
        "In-app data export endpoint exists",
        "Account deletion flow exists",
        "Crash reporting is opt-in by default",
        "Camera and photo-library browser functionality exists",
        "Backend has APNs-related code",
        "An initial PrivacyInfo.xcprivacy file exists",
        "An initial Expo-style iOS configuration exists",
        "The web app has notification permission and push subscription logic",
    ]:
        p.bullet(item)

    p.heading("What is missing before a native build can be produced", 1)
    p.para("The export/ios directory currently contains only:")
    p.bullet("app.config.ts")
    p.bullet("PrivacyInfo.xcprivacy")
    p.para("It does not contain:")
    for item in [
        "An Xcode project",
        "An Expo project with package.json",
        "Native iOS source files",
        "CocoaPods configuration",
        "EAS configuration",
        "App icon assets",
        "Splash-screen assets",
        "A valid EAS project ID",
        "Signing or provisioning configuration",
        "A buildable .ipa",
    ]:
        p.bullet(item)
    p.para("The configuration references these missing files:")
    p.code("export/ios/assets/icon.png\nexport/ios/assets/splash.png\nexport/ios/assets/adaptive-icon.png")
    p.para("It also contains the placeholder:")
    p.code("REPLACE_WITH_EAS_PROJECT_ID")
    p.para("The current iOS folder is therefore a preparation template, not something that can be opened in Xcode or uploaded to App Store Connect.")

    p.heading("Important technical concern: this is currently a web app, not a native app", 1)
    p.para("The application uses:")
    for item in [
        "React/Vite",
        "Browser localStorage",
        "Browser service workers",
        "Browser Notification",
        "Browser PushManager",
        "VAPID web push",
        "Browser camera/file APIs",
    ]:
        p.bullet(item)
    p.para("A simple WKWebView wrapper would not automatically provide:")
    for item in [
        "Native APNs push notifications",
        "Native background tasks",
        "Native camera/photo integrations",
        "Native biometric authentication",
        "Reliable iOS push-token registration",
        "Native offline behavior",
        "Native Live Activities",
    ]:
        p.bullet(item)
    p.para("The existing backend APNs code is not enough by itself. A native iOS client would need to register an APNs token and send that token to the backend through a native bridge or native app code.")
    p.para("Apple could also reject a basic website wrapper under the minimum-functionality guideline if it does not provide meaningful native-app value.")

    p.heading("Configuration items that need correction or verification", 1)
    p.para("The current scaffold includes declarations that are not yet backed by native implementation:")
    for item in [
        "aps-environment",
        "Background fetch",
        "Remote notifications",
        "Face ID usage description",
        "Native camera/photo permission declarations",
        "Live Activity comments",
    ]:
        p.bullet(item)
    p.para("These should only remain if the final native app actually implements those capabilities. In particular:")
    for item in [
        "Face ID is described as a future feature but is not implemented.",
        "Background fetch is declared, but the current application uses browser/service-worker behavior rather than a native background task.",
        "APNs is declared, but native token registration is not present.",
        "The notification system currently uses web push rather than native APNs.",
    ]:
        p.bullet(item)
    p.para("Leaving unsupported declarations in the final binary could create App Review questions or privacy inconsistencies.")

    p.heading("Privacy and App Store compliance status", 1)
    p.para("The privacy foundation is promising but still needs final verification.")
    p.para("Already present:")
    for item in [
        "Privacy policy",
        "Data export",
        "Account deletion request flow",
        "Crash-report consent",
        "Privacy manifest draft",
        "Camera/photo explanations",
    ]:
        p.bullet(item)
    p.para("Still required:")
    for item in [
        "App Store Connect privacy questionnaire",
        "Accurate declaration of email address, name, financial information, photos, device identifiers, and crash/performance data",
        "Confirmation of whether Sentry data is linked to identity",
        "Confirmation of whether receipt images are retained and for how long",
        "Confirmation of all third-party processors",
        "Final privacy manifest generated from the actual native dependencies",
        "App Review test account and review notes",
        "Verification that account deletion works from the submitted iOS build",
    ]:
        p.bullet(item)
    p.para("The privacy manifest should also be reviewed against the actual native dependency tree. It is currently written for an anticipated Expo/native app, not an existing compiled app.")

    p.heading("Typecheck status", 1)
    p.para("The production frontend build passes.")
    p.para("The full frontend typecheck currently reports unrelated existing errors in:")
    for item in [
        "HouseholdDonutChart.tsx",
        "Household.tsx",
        "usePullToRefresh.ts",
        "Duplicate translation keys in i18n.ts",
    ]:
        p.bullet(item)
    p.para("Those should be fixed before treating the repository as release-clean, although they do not prevent the current Vite production build.")

    p.heading("Overall assessment", 1)
    p.para("I would classify the project as:")
    for label, value in [
        ("Web/PWA production readiness", "Good"),
        ("Privacy-feature readiness", "Mostly good"),
        ("Native iOS wrapper readiness", "Early scaffold only"),
        ("App Store upload readiness", "Not ready"),
        ("Estimated remaining work", "A proper native-wrapper implementation, not merely packaging"),
    ]:
        p.bullet(f"{label}: {value}")
    p.para("Once the native approach is selected - Expo/React Native or Capacitor - the wrapper can be prepared with native push/camera/permissions, an Xcode project, assets, signing configuration, and an App Store submission workflow.")
    return p


if __name__ == "__main__":
    OUT.parent.mkdir(parents=True, exist_ok=True)
    pdf = make_document().build()
    OUT.write_bytes(pdf)
    print(f"Wrote {OUT} ({len(pdf)} bytes)")