#!/usr/bin/env python3
"""Build the Week 1 homework report as a polished PDF."""

from __future__ import annotations

import json
from pathlib import Path

from reportlab.graphics.shapes import Drawing, Line, Rect, String
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    HRFlowable,
    KeepTogether,
    PageBreak,
    Paragraph,
    Preformatted,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)


HERE = Path(__file__).resolve().parent
OUTPUT = HERE / "output" / "pdf" / "week1-random-lunch-report.pdf"
CONFIRMATORY_DATA = HERE / "confirmatory-distribution-100000.json"

NAVY = colors.HexColor("#19324D")
BLUE = colors.HexColor("#2878B5")
SKY = colors.HexColor("#EAF4FB")
CORAL = colors.HexColor("#E96B56")
INK = colors.HexColor("#24313D")
MUTED = colors.HexColor("#62717F")
LIGHT = colors.HexColor("#F4F7F9")
RULE = colors.HexColor("#D6E0E7")
GREEN = colors.HexColor("#2F855A")


def p(text: str, style: ParagraphStyle) -> Paragraph:
    return Paragraph(text, style)


def icon_comparison_table(styles):
    data = [
        ["Menu item", "Original class", "Verified replacement", "Reason"],
        ["Ramen", "fa-bowl-hot", "fa-bowl-food", "Original glyph absent"],
        ["Pasta", "fa-pasta", "fa-plate-wheat", "Original glyph absent"],
        ["Soup", "fa-bowl", "fa-mug-hot", "Original glyph absent"],
    ]
    table = Table(data, colWidths=[25 * mm, 34 * mm, 39 * mm, 55 * mm], repeatRows=1)
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), NAVY),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, -1), 8.2),
                ("TEXTCOLOR", (0, 1), (-1, -1), INK),
                ("BACKGROUND", (0, 1), (-1, -1), colors.white),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, LIGHT]),
                ("GRID", (0, 0), (-1, -1), 0.35, RULE),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("LEFTPADDING", (0, 0), (-1, -1), 6),
                ("RIGHTPADDING", (0, 0), (-1, -1), 6),
                ("TOPPADDING", (0, 0), (-1, -1), 6),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
            ]
        )
    )
    return table


def results_table(styles):
    data = [
        ["Run", "N", "Expected/item", "chi-square", "p-value", "Decision at 0.05"],
        ["Exploratory handler run", "1,000", "83.33", "26.264", "0.00593", "Reject H0"],
        ["Pre-specified handler run", "100,000", "8,333.33", "31.477", "0.000925", "Reject H0"],
        ["Seeded harness check", "100,000", "8,333.33", "4.484", "0.9536", "Do not reject"],
        ["Direct diagnostic", "1,000,000", "83,333.33", "11.796", "0.3792", "Do not reject"],
    ]
    table = Table(data, colWidths=[39 * mm, 18 * mm, 26 * mm, 22 * mm, 21 * mm, 32 * mm], repeatRows=1)
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), NAVY),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, -1), 7.6),
                ("TEXTCOLOR", (0, 1), (-1, -1), INK),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, LIGHT]),
                ("GRID", (0, 0), (-1, -1), 0.35, RULE),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("ALIGN", (1, 1), (-1, -1), "CENTER"),
                ("LEFTPADDING", (0, 0), (-1, -1), 4),
                ("RIGHTPADDING", (0, 0), (-1, -1), 4),
                ("TOPPADDING", (0, 0), (-1, -1), 6),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
            ]
        )
    )
    return table


def distribution_chart() -> Drawing:
    raw = json.loads(CONFIRMATORY_DATA.read_text(encoding="utf-8"))
    by_name = {item["name"]: item["count"] for item in raw["distribution"]}
    names = [
        "Pizza", "Sushi", "Burger", "Salad", "Tacos", "Ramen",
        "Sandwich", "Pasta", "Curry", "Steak", "Soup", "BBQ",
    ]
    counts = [by_name[name] for name in names]

    width, height = 500, 225
    drawing = Drawing(width, height)
    left, bottom, plot_w, plot_h = 48, 48, 435, 145
    max_y = 9000
    expected = 100000 / 12

    drawing.add(Rect(0, 0, width, height, fillColor=colors.white, strokeColor=None))
    for tick in range(0, max_y + 1, 3000):
        y = bottom + plot_h * tick / max_y
        drawing.add(Line(left, y, left + plot_w, y, strokeColor=RULE, strokeWidth=0.5))
        drawing.add(String(left - 7, y - 3, f"{tick:,}", textAnchor="end", fontName="Helvetica", fontSize=7, fillColor=MUTED))

    expected_y = bottom + plot_h * expected / max_y
    drawing.add(Line(left, expected_y, left + plot_w, expected_y, strokeColor=CORAL, strokeWidth=1.2, strokeDashArray=[4, 3]))
    drawing.add(String(left + plot_w - 2, expected_y + 4, "expected 8,333", textAnchor="end", fontName="Helvetica-Bold", fontSize=7, fillColor=CORAL))

    step = plot_w / len(names)
    bar_w = step * 0.58
    for index, (name, count) in enumerate(zip(names, counts)):
        x = left + index * step + (step - bar_w) / 2
        bar_h = plot_h * count / max_y
        fill = BLUE if abs(count - expected) < 250 else CORAL
        drawing.add(Rect(x, bottom, bar_w, bar_h, fillColor=fill, strokeColor=None))
        drawing.add(String(x + bar_w / 2, bottom - 13, str(index), textAnchor="middle", fontName="Helvetica-Bold", fontSize=7, fillColor=INK))
        drawing.add(String(x + bar_w / 2, bottom - 24, name, textAnchor="middle", fontName="Helvetica", fontSize=5.8, fillColor=MUTED))

    drawing.add(Line(left, bottom, left + plot_w, bottom, strokeColor=INK, strokeWidth=0.8))
    drawing.add(Line(left, bottom, left, bottom + plot_h, strokeColor=INK, strokeWidth=0.8))
    drawing.add(String(left + plot_w / 2, 8, "Menu index (name)", textAnchor="middle", fontName="Helvetica-Bold", fontSize=8, fillColor=INK))
    drawing.add(String(10, bottom + plot_h / 2, "Counts", textAnchor="middle", fontName="Helvetica-Bold", fontSize=8, fillColor=INK, angle=90))
    drawing.add(String(left, height - 14, "Figure 1. Confirmatory handler run: 100,000 selections", fontName="Helvetica-Bold", fontSize=9, fillColor=NAVY))
    return drawing


def page_decor(canvas, doc):
    canvas.saveState()
    page = canvas.getPageNumber()
    width, height = A4
    canvas.setStrokeColor(RULE)
    canvas.setLineWidth(0.5)
    canvas.line(22 * mm, height - 17 * mm, width - 22 * mm, height - 17 * mm)
    canvas.setFont("Helvetica", 7.5)
    canvas.setFillColor(MUTED)
    canvas.drawString(22 * mm, height - 13.5 * mm, "LLM4Rec - Week 1 | Random Lunch Recommender")
    canvas.drawRightString(width - 22 * mm, height - 13.5 * mm, "Draft for author review")
    canvas.line(22 * mm, 15 * mm, width - 22 * mm, 15 * mm)
    canvas.drawString(22 * mm, 10.5 * mm, "Reproducible report generated from repository artifacts")
    canvas.drawRightString(width - 22 * mm, 10.5 * mm, f"Page {page}")
    canvas.restoreState()


def build_pdf():
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    styles = getSampleStyleSheet()
    styles.add(ParagraphStyle(
        name="ReportTitle", parent=styles["Title"], fontName="Helvetica-Bold",
        fontSize=24, leading=28, textColor=NAVY, alignment=TA_LEFT, spaceAfter=8,
    ))
    styles.add(ParagraphStyle(
        name="Subtitle", parent=styles["Normal"], fontName="Helvetica",
        fontSize=11, leading=15, textColor=MUTED, spaceAfter=14,
    ))
    styles.add(ParagraphStyle(
        name="Identity", parent=styles["Normal"], fontName="Helvetica",
        fontSize=10, leading=14, textColor=INK, spaceAfter=14,
    ))
    styles.add(ParagraphStyle(
        name="Section", parent=styles["Heading1"], fontName="Helvetica-Bold",
        fontSize=15, leading=18, textColor=NAVY, spaceBefore=11, spaceAfter=7,
    ))
    styles.add(ParagraphStyle(
        name="Subsection", parent=styles["Heading2"], fontName="Helvetica-Bold",
        fontSize=11, leading=14, textColor=BLUE, spaceBefore=8, spaceAfter=4,
    ))
    styles.add(ParagraphStyle(
        name="Body", parent=styles["BodyText"], fontName="Helvetica",
        fontSize=9.2, leading=13.2, textColor=INK, spaceAfter=6,
    ))
    styles.add(ParagraphStyle(
        name="Small", parent=styles["BodyText"], fontName="Helvetica",
        fontSize=7.8, leading=10.6, textColor=MUTED, spaceAfter=4,
    ))
    styles.add(ParagraphStyle(
        name="Callout", parent=styles["BodyText"], fontName="Helvetica",
        fontSize=9, leading=13, textColor=INK, leftIndent=10, rightIndent=10,
        borderColor=BLUE, borderWidth=0.8, borderPadding=9, backColor=SKY,
        spaceBefore=6, spaceAfter=8,
    ))
    styles.add(ParagraphStyle(
        name="CodeBlock", parent=styles["Code"], fontName="Courier",
        fontSize=7.4, leading=10, textColor=INK, leftIndent=8, rightIndent=8,
        borderColor=RULE, borderWidth=0.5, borderPadding=8, backColor=LIGHT,
        spaceBefore=4, spaceAfter=8,
    ))
    styles.add(ParagraphStyle(
        name="Reference", parent=styles["BodyText"], fontName="Helvetica",
        fontSize=7.8, leading=10.4, textColor=INK, leftIndent=12, firstLineIndent=-12,
        spaceAfter=5,
    ))
    styles.add(ParagraphStyle(
        name="CenterSmall", parent=styles["Small"], alignment=TA_CENTER,
    ))

    doc = SimpleDocTemplate(
        str(OUTPUT), pagesize=A4,
        rightMargin=22 * mm, leftMargin=22 * mm,
        topMargin=23 * mm, bottomMargin=21 * mm,
        title="Week 1 Homework Report - Random Lunch Recommender",
        author="Raimova Alina",
        subject="Debugging external icons and validating uniform random selection",
    )

    story = []
    story += [
        Spacer(1, 8 * mm),
        p("Debugging and Validating a<br/>Random Lunch Recommender", styles["ReportTitle"]),
        p("Week 1 homework report | 14 September 2026", styles["Subtitle"]),
        p("<b>Raimova Alina</b> | aaraimova@edu.hse.ru | Individual", styles["Identity"]),
        p(
            "<b>Date:</b> 2026-09-14<br/>"
            "<b>Assignment:</b> Random Lunch Recommender (Week 1, A01)",
            styles["Identity"],
        ),
        HRFlowable(width="100%", thickness=2, color=CORAL, spaceBefore=2, spaceAfter=14),
        p("Abstract", styles["Section"]),
        p(
            "A generated lunch recommender intermittently showed a food name without its icon, making a correct random choice appear broken. "
            "I traced the failure to three Font Awesome class names that are unavailable in the pinned Free 6.4.0 stylesheet, replaced them with verified classes, and separated HTML, CSS, and JavaScript. "
            "The selection rule maps the approximately uniform range of Math.random() to 12 equal intervals, while four validation runs produced p-values of 0.00593, 0.000925, 0.9536, and 0.3792. "
            "The code path is correct, but finite experiments cannot prove randomness and the conflicting unseeded results require cautious reporting rather than a claim of uniformity.",
            styles["Body"],
        ),
        p("Index terms", styles["Subsection"]),
        p("random recommender; Math.random; chi-square goodness-of-fit; Font Awesome; prompt engineering", styles["Body"]),
        p("1. Problem and objective", styles["Section"]),
        p(
            "The Week 1 prototype recommends one of 12 lunch options. The visible symptom was intermittent: the text updated correctly, but the associated image sometimes disappeared. Because exactly three options used invalid icon identifiers, the symptom was expected on about 3/12 = 25% of selections if the menu index was uniform. The goal was to isolate the display defect, improve the generation prompt so the defect is less likely to recur, and validate the random-index logic without overstating statistical evidence.",
            styles["Body"],
        ),
        p("Contributions", styles["Subsection"]),
        p(
            "(1) Root-cause analysis against the exact dependency version; (2) a three-file implementation in the student's repository; (3) an end-to-end click-handler test harness; (4) a pre-specified chi-square experiment with preserved outcomes; and (5) a prompt that requires dependency-aware asset validation.",
            styles["Body"],
        ),
        p(
            "Scope note: the course repository was inspected read-only. All implementation and experiment artifacts are under llm-4-res-sys/week1.",
            styles["Callout"],
        ),
        PageBreak(),
    ]

    story += [
        p("2. Diagnosis: the random choice was not the display bug", styles["Section"]),
        p(
            "The original page loaded Font Awesome Free 6.4.0, then assigned an icon class from the same array that stores each food name. Browser inspection showed that fa-bowl-hot, fa-pasta, and fa-bowl had no glyph definition in that exact stylesheet. For those menu entries, the DOM element existed and the name rendered, but the icon pseudo-element had no content. The selection formula itself still returned a valid array element.",
            styles["Body"],
        ),
        icon_comparison_table(styles),
        Spacer(1, 5),
        p(
            "The repaired array is in script.js lines 1-14, and the selection remains at lines 24-25. Structure, design, and behavior were separated into index.html, style.css, and script.js so a dependency or logic failure can be inspected independently.",
            styles["Small"],
        ),
        p("Why the first prompt allowed the mistake", styles["Subsection"]),
        p(
            "The initial request described the product but did not pin the icon library's edition, require Free-tier compatibility, ask the model to verify every generated class against the loaded stylesheet, or require an exhaustive render test. A plausible class name can therefore look correct to a language model even when it is absent from the dependency actually loaded by the page. This is a dependency-contract failure, not a randomness failure.",
            styles["Body"],
        ),
        p("Improved prompt", styles["Subsection"]),
        Preformatted(
            "Build a random lunch generator using separate index.html, style.css,\n"
            "and script.js files. Use only icons available in Font Awesome Free\n"
            "6.4.0 from the provided CDN. Before returning the code, verify every\n"
            "icon class against that exact stylesheet and render-test all 12 menu\n"
            "items in a browser. If an exact food icon is unavailable, use a\n"
            "verified generic fallback and list the substitution. Do not use\n"
            "Pro-only, version-mismatched, or guessed icon names. Add a test that\n"
            "fails when any menu item has no rendered icon glyph.",
            styles["CodeBlock"],
        ),
        p(
            "The key change is not merely 'be careful.' It defines the external contract (Free 6.4.0), an observable acceptance criterion (all 12 glyphs render), a fallback policy, and a failing test. These constraints turn an ambiguous visual request into a verifiable engineering task.",
            styles["Callout"],
        ),
        PageBreak(),
    ]

    story += [
        p("3. Why the index rule is uniform in theory", styles["Section"]),
        Preformatted(
            "const randomIndex = Math.floor(Math.random() * lunchMenu.length);\n"
            "const selectedLunch = lunchMenu[randomIndex];",
            styles["CodeBlock"],
        ),
        p(
            "ECMAScript specifies that Math.random() returns a positive Number greater than or equal to 0 and strictly less than 1, chosen pseudo-randomly with an approximately uniform distribution [1]. With n = 12, multiplying by 12 gives a value in [0, 12), and Math.floor maps it to an integer from 0 through 11. Index i is selected exactly when the random value falls in [i/12, (i+1)/12). All 12 intervals have equal width 1/12, so P(index = i) = 1/12 under the specification's approximate-uniformity assumption.",
            styles["Body"],
        ),
        p(
            "Boundary check: 0 is included and maps to index 0; 1 is excluded, so index 12 cannot occur. The formula has no off-by-one error. It does not provide cryptographic randomness, and the exact generator algorithm is implementation-defined.",
            styles["Callout"],
        ),
        p("4. Experimental protocol", styles["Section"]),
        p(
            "The null hypothesis H0 states that every menu item has probability 1/12. The alternative H1 states that at least one probability differs. Pearson's chi-square statistic is sum((observed - expected)^2 / expected) across 12 categories [2]. With no fitted parameters, degrees of freedom are 12 - 1 = 11. The decision threshold was alpha = 0.05, and every expected count greatly exceeded the common minimum of five.",
            styles["Body"],
        ),
        p("End-to-end handler simulation", styles["Subsection"]),
        p(
            "distribution-test.js loads the real script.js in a Node VM, captures the registered button handler, invokes it N times, and records the food-name updates. The 500 ms display delay is replaced with an immediate callback; the random draw occurs before that callback, so this changes runtime duration but not item selection. A second deterministic check replaced Math.random with the same seeded generator in both a direct formula path and the registered-handler path. Their 100,000-count vectors matched exactly, demonstrating that the harness preserves index-to-menu mapping.",
            styles["Body"],
        ),
        p("Pre-specified confirmatory run", styles["Subsection"]),
        p(
            "Before the 100,000-selection run, the sample size, 12 equal categories, alpha level, one-run policy, and rule against replacing an inconvenient p-value were written down. The raw counts and test output were preserved. This prevents rerunning until a preferred conclusion appears.",
            styles["Body"],
        ),
        p("Reproduction commands", styles["Subsection"]),
        Preformatted(
            "cd llm-4-res-sys/week1\n"
            "node distribution-test.js 1000\n"
            "python3 chi-square-test.py distribution-1000.json\n"
            "node distribution-test.js 100000\n"
            "python3 chi-square-test.py confirmatory-distribution-100000.json\n"
            "node harness-validation.js",
            styles["CodeBlock"],
        ),
        PageBreak(),
    ]

    story += [
        p("5. Results", styles["Section"]),
        results_table(styles),
        Spacer(1, 7),
        distribution_chart(),
        p(
            "The plotted bars use the array order 0-11. The dashed line is the equal-frequency expectation. The largest confirmatory deviations were Burger (+332.7) and Curry (-293.3) relative to 8,333.3 expected selections.",
            styles["CenterSmall"],
        ),
        p("Interpretation", styles["Subsection"]),
        p(
            "Both unseeded handler samples reject H0 at alpha = 0.05. These outcomes are real and must not be relabeled as proof of uniformity. At the same time, the seeded handler/direct-path comparison matches exactly, and a separate one-million-draw direct diagnostic does not reject H0. Therefore, the implementation supplies strong mechanistic evidence that the mapping is correct, while the finite empirical evidence is mixed. A non-significant p-value would only mean that the sample did not reveal a detectable departure; it would not prove randomness. Likewise, a significant p-value flags an unlikely sample under H0 but does not identify the source by itself.",
            styles["Body"],
        ),
        p(
            "Defensible conclusion: the code selects all 12 indices with equal-width intervals and no mapping defect was found. The saved experiments do not establish that every runtime's Math.random stream is uniform. More independent, pre-registered batches are needed to distinguish a rare fluctuation from environment-specific behavior.",
            styles["Callout"],
        ),
        PageBreak(),
    ]

    story += [
        p("6. Limitations and next experiment", styles["Section"]),
        p(
            "The samples were generated in Node.js 23.7.0 rather than by physically clicking in a browser, so they validate the JavaScript selection path and test harness but not a specific browser engine's pseudo-random generator. The confirmatory run has no saved seed because native Math.random is not seedable through the public JavaScript API. The extra seeded run validates equivalence of the two code paths, not the quality of native Math.random. Finally, multiple statistical tests were performed; their p-values should be interpreted as separate diagnostics, not combined after seeing outcomes.",
            styles["Body"],
        ),
        p(
            "A stronger follow-up would pre-register at least 100 independent batches, preserve every result, and compare the fraction of p-values below 0.05 with the nominal false-positive rate. It should also run the same browser automation in at least two engines and record engine versions. This design investigates persistence without cherry-picking.",
            styles["Body"],
        ),
        p("7. AI usage disclosure", styles["Section"]),
        p(
            "OpenAI Codex was used to inspect the starter code, diagnose icon compatibility, separate the implementation into three files, create test harnesses, compute chi-square statistics, and draft this report. Before submission, the author should personally rerun the reproduction commands, open the page and verify all 12 icons, check every numerical claim against the JSON artifacts, and attach an authentic tool-native session export if the assignment requires one. No session transcript is embedded here because a genuine export was not available; a reconstructed transcript would be misleading. External claims about Math.random, chi-square testing, and Font Awesome are supported by the references below, while remote CDN availability and a browser engine's internal generator remain outside this report's independent verification.",
            styles["Body"],
        ),
        p("8. Conclusion", styles["Section"]),
        p(
            "The intermittent missing-image symptom came from three nonexistent or unavailable icon classes, not from array indexing. Pinning the dependency contract and requiring exhaustive render validation makes the prompt substantially safer. The random-index formula is correct under an approximately uniform Math.random source, and the handler harness maps values correctly, but the saved chi-square outcomes are contradictory. The responsible result is therefore a verified code fix plus qualified statistical evidence, not an unsupported statement that randomness has been proven.",
            styles["Body"],
        ),
        p("References", styles["Section"]),
        p("[1] Ecma International, <i>ECMAScript 2025 Language Specification</i>, sec. 21.3.2.28, Math.random. https://tc39.es/ecma262/2025/multipage/numbers-and-dates.html#sec-math.random (accessed 14 Sep. 2026).", styles["Reference"]),
        p("[2] NIST/SEMATECH, <i>e-Handbook of Statistical Methods</i>, sec. 1.3.5.15, Chi-Square Goodness-of-Fit Test. https://www.itl.nist.gov/div898/handbook/eda/section3/eda35f.htm (accessed 14 Sep. 2026).", styles["Reference"]),
        p("[3] SciPy Developers, <i>scipy.stats.chisquare</i>, SciPy v1.17.0 Manual. https://docs.scipy.org/doc/scipy/reference/generated/scipy.stats.chisquare.html (accessed 14 Sep. 2026).", styles["Reference"]),
        p("[4] Fonticons, Inc., <i>Font Awesome Docs: Quick Start</i>. https://docs.fontawesome.com/web/setup/get-started (accessed 14 Sep. 2026).", styles["Reference"]),
        p("[5] cdnjs, <i>Font Awesome 6.4.0 all.min.css</i>. https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css (accessed 14 Sep. 2026).", styles["Reference"]),
    ]

    doc.build(story, onFirstPage=page_decor, onLaterPages=page_decor)
    print(OUTPUT)


if __name__ == "__main__":
    build_pdf()
