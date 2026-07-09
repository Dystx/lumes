// Shared utilities for Ember platform docx generation
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  ImageRun, PageBreak, Header, Footer, PageNumber, NumberFormat,
  AlignmentType, HeadingLevel, WidthType, BorderStyle, ShadingType,
  PageOrientation, TabStopType, TabStopPosition, ExternalHyperlink,
  InternalHyperlink, Bookmark, LevelFormat, TableOfContents,
  SectionType, TableLayoutType,
} = require("docx");
const fs = require("fs");

// FG-1 Forest Mint palette — ESG/environmental/sustainability
const P = {
  bg: "0C1F1A",
  primary: "FFFFFF",
  accent: "3DDBB5",
  cover: {
    titleColor: "FFFFFF",
    subtitleColor: "B0B8C0",
    metaColor: "90989F",
    footerColor: "687078",
  },
  table: {
    headerBg: "2A7A65",
    headerText: "FFFFFF",
    accentLine: "2A7A65",
    innerLine: "C5D8D0",
    surface: "EDF5F2",
  },
};

// Body palette (for non-cover content)
const PB = {
  primary: "0C1F1A",      // dark teal — headings
  body: "1A1A1A",         // near-black — body text
  secondary: "606060",    // mid grey — captions
  accent: "2A7A65",       // forest mint — table headers / accents
  surface: "EDF5F2",      // very light mint — table alt rows
  table: {
    headerBg: "2A7A65",
    headerText: "FFFFFF",
    accentLine: "2A7A65",
    innerLine: "C5D8D0",
    surface: "EDF5F2",
  },
};

// Border helpers
const NB = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
const noBorders = { top: NB, bottom: NB, left: NB, right: NB };
const allNoBorders = { top: NB, bottom: NB, left: NB, right: NB,
                       insideHorizontal: NB, insideVertical: NB };

// === Title layout helpers (extracted from design-system.md) ===
function splitTitleLines(title, charsPerLine) {
  if (title.length <= charsPerLine) return [title];
  const breakAfter = new Set([
    ...'，。、；：！？',
    ...'的与和及之在于为',
    ...'-_—–·/',
    ...' \t',
  ]);
  const lines = [];
  let remaining = title;
  while (remaining.length > charsPerLine) {
    let breakAt = -1;
    for (let i = charsPerLine; i >= Math.floor(charsPerLine * 0.6); i--) {
      if (i < remaining.length && breakAfter.has(remaining[i - 1])) {
        breakAt = i;
        break;
      }
    }
    if (breakAt === -1) {
      const limit = Math.min(remaining.length, Math.ceil(charsPerLine * 1.3));
      for (let i = charsPerLine + 1; i < limit; i++) {
        if (breakAfter.has(remaining[i - 1])) {
          breakAt = i;
          break;
        }
      }
    }
    if (breakAt === -1) {
      breakAt = charsPerLine;
      const prevChar = remaining[breakAt - 1];
      const nextChar = remaining[breakAt];
      if (prevChar && nextChar &&
          !breakAfter.has(prevChar) && !breakAfter.has(nextChar) &&
          /[\u4e00-\u9fff]/.test(prevChar) && /[\u4e00-\u9fff]/.test(nextChar)) {
        breakAt = breakAt - 1;
      }
    }
    lines.push(remaining.slice(0, breakAt).trim());
    remaining = remaining.slice(breakAt).trim();
  }
  if (remaining) lines.push(remaining);
  if (lines.length > 1 && lines[lines.length - 1].length <= 2) {
    const last = lines.pop();
    lines[lines.length - 1] += last;
  }
  return lines;
}

function calcTitleLayout(title, maxWidthTwips, preferredPt = 40, minPt = 24) {
  // For English titles, char width ≈ pt × 11 twips (English chars ~55% of CJK)
  const isEnglish = /^[\x00-\x7F\s]+$/.test(title);
  const charWidth = (pt) => isEnglish ? pt * 11 : pt * 20;
  const charsPerLine = (pt) => Math.floor(maxWidthTwips / charWidth(pt));
  let titlePt = preferredPt;
  let lines;
  while (titlePt >= minPt) {
    const cpl = charsPerLine(titlePt);
    if (cpl < 2) { titlePt -= 2; continue; }
    lines = splitTitleLines(title, cpl);
    if (lines.length <= 3) break;
    titlePt -= 2;
  }
  if (!lines || lines.length > 3) {
    const cpl = charsPerLine(minPt);
    lines = splitTitleLines(title, cpl);
    titlePt = minPt;
  }
  return { titlePt, titleLines: lines };
}

function calcCoverSpacing(params) {
  const {
    titleLineCount = 1, titlePt = 36, hasSubtitle = false,
    hasEnglishLabel = false, metaLineCount = 0,
    fixedHeight = 800, pageHeight = 16838,
    marginTop = 0, marginBottom = 0,
  } = params;
  const SAFETY = 1200;
  const usableHeight = pageHeight - marginTop - marginBottom - SAFETY;
  const titleHeight = titleLineCount * (titlePt * 23 + 200);
  const subtitleHeight = hasSubtitle ? (12 * 23 + 600) : 0;
  const englishLabelHeight = hasEnglishLabel ? (9 * 23 + 600) : 0;
  const metaHeight = metaLineCount * (10 * 23 + 100);
  const implicitParaHeight = 3 * 300;
  const contentHeight = titleHeight + subtitleHeight + englishLabelHeight +
                        metaHeight + fixedHeight + implicitParaHeight;
  const remainingSpace = usableHeight - contentHeight;
  const safeRemaining = Math.max(remainingSpace, 400);
  const FOOTER_MIN = 800;
  const rawTop = Math.floor(safeRemaining * 0.45);
  const rawBottom = Math.floor(safeRemaining * 0.45);
  const bottomSpacing = Math.max(rawBottom, FOOTER_MIN);
  const topSpacing = Math.max(rawTop - Math.max(0, FOOTER_MIN - rawBottom), 400);
  const midSpacing = Math.max(safeRemaining - topSpacing - bottomSpacing, 0);
  return { topSpacing, midSpacing, bottomSpacing };
}

// === Cover Recipe R1 (Pure Paragraph Left, dark bg) ===
function buildCoverR1(config) {
  const Pc = config.palette;
  const padL = 1200, padR = 800;
  const availableWidth = 11906 - padL - padR - 300;
  const { titlePt, titleLines } = calcTitleLayout(config.title, availableWidth, 36, 22);
  const titleSize = titlePt * 2;
  const spacing = calcCoverSpacing({
    titleLineCount: titleLines.length, titlePt,
    hasSubtitle: !!config.subtitle, hasEnglishLabel: !!config.englishLabel,
    metaLineCount: (config.metaLines || []).length,
    fixedHeight: 400,
  });
  const accentLeft = { style: BorderStyle.SINGLE, size: 8, color: Pc.accent, space: 12 };
  const children = [];
  children.push(new Paragraph({ spacing: { before: spacing.topSpacing } }));

  if (config.englishLabel) {
    children.push(new Paragraph({
      indent: { left: padL, right: padR }, spacing: { after: 500 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: Pc.accent, space: 8 } },
      children: [new TextRun({ text: config.englishLabel.split("").join("  "),
        size: 18, color: Pc.accent, font: { ascii: "Calibri", eastAsia: "SimHei" }, characterSpacing: 40 })],
    }));
  }

  for (let i = 0; i < titleLines.length; i++) {
    children.push(new Paragraph({
      indent: { left: padL },
      spacing: { after: i < titleLines.length - 1 ? 100 : 300, line: Math.ceil(titlePt * 23), lineRule: "atLeast" },
      children: [new TextRun({ text: titleLines[i], size: titleSize, bold: true,
        color: Pc.titleColor, font: { eastAsia: "SimHei", ascii: "Arial" } })],
    }));
  }

  if (config.subtitle) {
    children.push(new Paragraph({
      indent: { left: padL }, spacing: { after: 800, line: 360, lineRule: "atLeast" },
      children: [new TextRun({ text: config.subtitle, size: 24, color: Pc.subtitleColor,
        font: { eastAsia: "Microsoft YaHei", ascii: "Arial" } })],
    }));
  }

  for (const line of (config.metaLines || [])) {
    children.push(new Paragraph({
      indent: { left: padL + 200 }, spacing: { after: 80 },
      border: { left: accentLeft },
      children: [new TextRun({ text: line, size: 22, color: Pc.metaColor,
        font: { eastAsia: "Microsoft YaHei", ascii: "Arial" } })],
    }));
  }

  children.push(new Paragraph({ spacing: { before: spacing.bottomSpacing } }));

  children.push(new Paragraph({
    indent: { left: padL, right: padR },
    border: { top: { style: BorderStyle.SINGLE, size: 2, color: Pc.accent, space: 8 } },
    spacing: { before: 200 },
    children: [
      new TextRun({ text: config.footerLeft || "", size: 16, color: Pc.footerColor, font: { ascii: "Arial" } }),
      new TextRun({ text: "                                        " }),
      new TextRun({ text: config.footerRight || "", size: 16, color: Pc.footerColor, font: { ascii: "Arial" } }),
    ],
  }));

  return [new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    layout: TableLayoutType.FIXED,
    borders: allNoBorders,
    rows: [new TableRow({
      height: { value: 16838, rule: "exact" },
      children: [new TableCell({
        shading: { type: ShadingType.CLEAR, fill: Pc.bg }, borders: noBorders,
        children,
      })],
    })],
  })];
}

// === Body content helpers ===
function h1(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 480, after: 200, line: 312 },
    children: [new TextRun({ text, bold: true, size: 32, color: PB.primary,
      font: { ascii: "Calibri", eastAsia: "SimHei" } })],
  });
}

function h2(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 360, after: 160, line: 312 },
    children: [new TextRun({ text, bold: true, size: 28, color: PB.primary,
      font: { ascii: "Calibri", eastAsia: "SimHei" } })],
  });
}

function h3(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_3,
    spacing: { before: 240, after: 120, line: 312 },
    children: [new TextRun({ text, bold: true, size: 24, color: PB.primary,
      font: { ascii: "Calibri", eastAsia: "SimHei" } })],
  });
}

function body(text, opts = {}) {
  return new Paragraph({
    alignment: AlignmentType.JUSTIFIED,
    spacing: { after: 120, line: 312 },
    indent: { firstLine: opts.noIndent ? 0 : 280 },
    children: [new TextRun({ text, size: 22, color: PB.body,
      font: { ascii: "Calibri", eastAsia: "Microsoft YaHei" } })],
  });
}

function bodyMixed(runs, opts = {}) {
  return new Paragraph({
    alignment: AlignmentType.JUSTIFIED,
    spacing: { after: 120, line: 312 },
    indent: { firstLine: opts.noIndent ? 0 : 280 },
    children: runs,
  });
}

function bullet(text, level = 0) {
  return new Paragraph({
    bullet: { level },
    spacing: { after: 80, line: 312 },
    children: [new TextRun({ text, size: 22, color: PB.body,
      font: { ascii: "Calibri", eastAsia: "Microsoft YaHei" } })],
  });
}

function numbered(text, ref, level = 0) {
  return new Paragraph({
    numbering: { reference: ref, level },
    spacing: { after: 80, line: 312 },
    children: [new TextRun({ text, size: 22, color: PB.body,
      font: { ascii: "Calibri", eastAsia: "Microsoft YaHei" } })],
  });
}

function code(text) {
  // Render as a single-cell table with monospace font and light grey background
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: { style: BorderStyle.SINGLE, size: 4, color: PB.accent },
      bottom: { style: BorderStyle.SINGLE, size: 4, color: PB.accent },
      left: { style: BorderStyle.NONE },
      right: { style: BorderStyle.NONE },
      insideHorizontal: { style: BorderStyle.NONE },
      insideVertical: { style: BorderStyle.NONE },
    },
    rows: [new TableRow({
      cantSplit: true,
      children: [new TableCell({
        shading: { type: ShadingType.CLEAR, fill: "F4F7F6" },
        margins: { top: 120, bottom: 120, left: 200, right: 200 },
        children: text.split("\n").map(line => new Paragraph({
          spacing: { line: 280, after: 0 },
          children: [new TextRun({ text: line || " ", size: 20,
            font: { ascii: "Consolas", eastAsia: "Consolas" },
            color: "0C1F1A" })],
        })),
      })],
    })],
  });
}

function tableTitle(text) {
  return new Paragraph({
    keepNext: true,
    spacing: { before: 200, after: 80 },
    children: [new TextRun({ text, bold: true, size: 21, color: PB.primary,
      font: { ascii: "Calibri", eastAsia: "SimHei" } })],
  });
}

function tableCaption(text) {
  return new Paragraph({
    spacing: { before: 60, after: 200 },
    alignment: AlignmentType.CENTER,
    children: [new TextRun({ text, italics: true, size: 18, color: PB.secondary,
      font: { ascii: "Calibri" } })],
  });
}

function dataTable(headers, rows, opts = {}) {
  const colCount = headers.length;
  const colWidth = Math.floor(100 / colCount);

  const headerRow = new TableRow({
    tableHeader: true,
    cantSplit: true,
    children: headers.map((text, i) => new TableCell({
      shading: { type: ShadingType.CLEAR, fill: PB.table.headerBg },
      margins: { top: 80, bottom: 80, left: 120, right: 120 },
      width: { size: opts.colWidths ? opts.colWidths[i] : colWidth, type: WidthType.PERCENTAGE },
      children: [new Paragraph({
        spacing: { line: 280 },
        children: [new TextRun({ text, bold: true, size: 20, color: PB.table.headerText,
          font: { ascii: "Calibri", eastAsia: "SimHei" } })],
      })],
    })),
  });

  const dataRows = rows.map((row, rowIdx) => new TableRow({
    cantSplit: true,
    children: row.map((cell, i) => new TableCell({
      shading: rowIdx % 2 === 1 ? { type: ShadingType.CLEAR, fill: PB.table.surface } : undefined,
      margins: { top: 70, bottom: 70, left: 120, right: 120 },
      width: { size: opts.colWidths ? opts.colWidths[i] : colWidth, type: WidthType.PERCENTAGE },
      children: [new Paragraph({
        spacing: { line: 280 },
        children: [new TextRun({ text: String(cell || ""), size: 19, color: PB.body,
          font: { ascii: "Calibri", eastAsia: "Microsoft YaHei" } })],
      })],
    })),
  }));

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    layout: TableLayoutType.FIXED,
    borders: {
      top: { style: BorderStyle.SINGLE, size: 8, color: PB.table.accentLine },
      bottom: { style: BorderStyle.SINGLE, size: 8, color: PB.table.accentLine },
      left: { style: BorderStyle.NONE },
      right: { style: BorderStyle.NONE },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 2, color: PB.table.innerLine },
      insideVertical: { style: BorderStyle.NONE },
    },
    rows: [headerRow, ...dataRows],
  });
}

function spacer(after = 120) {
  return new Paragraph({ spacing: { after }, children: [new TextRun({ text: "" })] });
}

function calloutBox(title, text) {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: { style: BorderStyle.SINGLE, size: 4, color: PB.accent },
      bottom: { style: BorderStyle.SINGLE, size: 4, color: PB.accent },
      left: { style: BorderStyle.SINGLE, size: 24, color: PB.accent },
      right: { style: BorderStyle.NONE },
      insideHorizontal: { style: BorderStyle.NONE },
      insideVertical: { style: BorderStyle.NONE },
    },
    rows: [new TableRow({
      cantSplit: true,
      children: [new TableCell({
        shading: { type: ShadingType.CLEAR, fill: PB.surface },
        margins: { top: 160, bottom: 160, left: 240, right: 240 },
        children: [
          new Paragraph({
            spacing: { after: 80 },
            children: [new TextRun({ text: title, bold: true, size: 22, color: PB.primary,
              font: { ascii: "Calibri", eastAsia: "SimHei" } })],
          }),
          new Paragraph({
            spacing: { line: 312 },
            alignment: AlignmentType.JUSTIFIED,
            children: [new TextRun({ text, size: 20, color: PB.body,
              font: { ascii: "Calibri", eastAsia: "Microsoft YaHei" } })],
          }),
        ],
      })],
    })],
  });
}

// === Standard document factory ===
function buildDocument({ coverConfig, bodyChildren, headerTitle }) {
  const doc = new Document({
    styles: {
      default: {
        document: {
          run: {
            font: { ascii: "Calibri", eastAsia: "Microsoft YaHei" },
            size: 22, color: PB.body,
          },
          paragraph: { spacing: { line: 312 } },
        },
        heading1: {
          run: { font: { ascii: "Calibri", eastAsia: "SimHei" }, size: 32, bold: true, color: PB.primary },
          paragraph: { spacing: { before: 480, after: 200, line: 312 } },
        },
        heading2: {
          run: { font: { ascii: "Calibri", eastAsia: "SimHei" }, size: 28, bold: true, color: PB.primary },
          paragraph: { spacing: { before: 360, after: 160, line: 312 } },
        },
        heading3: {
          run: { font: { ascii: "Calibri", eastAsia: "SimHei" }, size: 24, bold: true, color: PB.primary },
          paragraph: { spacing: { before: 240, after: 120, line: 312 } },
        },
      },
    },
    numbering: {
      config: [],
    },
    sections: [
      // Section 1: Cover (margin 0, no header/footer)
      {
        properties: {
          page: {
            size: { width: 11906, height: 16838, orientation: PageOrientation.PORTRAIT },
            margin: { top: 0, bottom: 0, left: 0, right: 0 },
          },
        },
        children: buildCoverR1({ ...coverConfig, palette: P }),
      },
      // Section 2: Body (standard margins, header + footer with page #)
      {
        properties: {
          type: SectionType.NEXT_PAGE,
          page: {
            size: { width: 11906, height: 16838, orientation: PageOrientation.PORTRAIT },
            margin: { top: 1440, bottom: 1440, left: 1701, right: 1417 },
            pageNumbers: { start: 1, formatType: NumberFormat.DECIMAL },
          },
        },
        headers: {
          default: new Header({
            children: [new Paragraph({
              alignment: AlignmentType.RIGHT,
              children: [new TextRun({ text: headerTitle || "Ember Platform",
                size: 18, color: "808080", font: { ascii: "Calibri" } })],
            })],
          }),
        },
        footers: {
          default: new Footer({
            children: [new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [
                new TextRun({ children: [PageNumber.CURRENT], size: 18, color: "808080" }),
              ],
            })],
          }),
        },
        children: bodyChildren,
      },
    ],
  });

  return doc;
}

module.exports = {
  docx: {
    Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
    ImageRun, PageBreak, Header, Footer, PageNumber, NumberFormat,
    AlignmentType, HeadingLevel, WidthType, BorderStyle, ShadingType,
    PageOrientation, TabStopType, TabStopPosition, ExternalHyperlink,
    InternalHyperlink, Bookmark, LevelFormat, TableOfContents,
    SectionType, TableLayoutType,
  },
  P, PB,
  allNoBorders, noBorders,
  buildCoverR1, calcTitleLayout, calcCoverSpacing,
  h1, h2, h3, body, bodyMixed, bullet, numbered, code,
  tableTitle, tableCaption, dataTable, spacer, calloutBox,
  buildDocument,
};
