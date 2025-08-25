"use client";

import { $generateHtmlFromNodes } from "@lexical/html";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { saveAs } from "file-saver";
import { useEffect, useMemo, useState } from "react";

import {
  AlignmentType,
  BorderStyle,
  Document as DocxDocument,
  HeadingLevel,
  LevelFormat,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";

type Props = { title?: string };

type Marks = {
  bold?: boolean;
  ital?: boolean;
  underline?: boolean;
  strike?: boolean;
  code?: boolean;
  color?: string; // HEX without '#', e.g. '1F2937'
};

export default function DownloadButtons({ title = "document" }: Props) {
  const [editor] = useLexicalComposerContext();
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState<null | "docx" | "pdf">(null);

  useEffect(() => {
    const unregister = editor.registerRootListener((root) => {
      setReady(!!root);
    });
    return unregister;
  }, [editor]);

  const safeTitle = useMemo(
    () => (title || "document").replace(/[^\w\-]+/g, "_").slice(0, 80),
    [title]
  );

  async function getHTML(): Promise<string> {
    if (!ready) throw new Error("Editor not ready");
    return editor
      .getEditorState()
      .read(() => $generateHtmlFromNodes(editor, null));
  }

  // ---------- helpers ----------

  const extractCssProp = (style: string, prop: string): string | undefined => {
    const re = new RegExp(`${prop}\\s*:\\s*([^;]+)`, "i");
    const m = style.match(re);
    return m ? m[1].trim() : undefined;
  };

  const cssColorToHex = (
    value: string | null | undefined
  ): string | undefined => {
    if (!value) return undefined;
    const v = value.trim().toLowerCase();

    const hexM = v.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
    if (hexM) {
      let hex = hexM[1];
      if (hex.length === 3)
        hex = hex
          .split("")
          .map((c) => c + c)
          .join("");
      return hex.toUpperCase();
    }

    const rgbM = v.match(/^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/i);
    if (rgbM) {
      const [r, g, b] = rgbM
        .slice(1)
        .map((n) => Math.max(0, Math.min(255, Number(n))));
      return [r, g, b]
        .map((n) => n.toString(16).padStart(2, "0"))
        .join("")
        .toUpperCase();
    }

    const rgbaM = v.match(
      /^rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d*\.?\d+)\s*\)$/i
    );
    if (rgbaM) {
      const [r, g, b, aStr] = rgbaM.slice(1);
      const a = Number(aStr);
      if (a === 0) return undefined;
      const [rr, gg, bb] = [r, g, b].map((n) =>
        Math.max(0, Math.min(255, Number(n)))
      );
      return [rr, gg, bb]
        .map((n) => n.toString(16).padStart(2, "0"))
        .join("")
        .toUpperCase();
    }

    const NAMED: Record<string, string> = {
      black: "000000",
      white: "FFFFFF",
      red: "FF0000",
      blue: "0000FF",
      green: "008000",
      gray: "808080",
      grey: "808080",
    };
    if (NAMED[v]) return NAMED[v];
    return undefined;
  };

  const getAlignment = (
    el?: HTMLElement
  ): (typeof AlignmentType)[keyof typeof AlignmentType] | undefined => {
    if (!el) return undefined;
    const style = (el.getAttribute("style") || "")
      .replace(/\s+/g, "")
      .toLowerCase();
    const classes = (el.getAttribute("class") || "").toLowerCase();

    if (style.includes("text-align:center") || classes.includes("text-center"))
      return AlignmentType.CENTER;
    if (style.includes("text-align:right") || classes.includes("text-right"))
      return AlignmentType.RIGHT;
    if (
      style.includes("text-align:justify") ||
      classes.includes("text-justify")
    )
      return AlignmentType.JUSTIFIED;
    if (style.includes("text-align:left") || classes.includes("text-left"))
      return AlignmentType.LEFT;

    const ta = getComputedStyle(el).textAlign;
    const norm = (ta || "").toLowerCase();
    if (norm.includes("center")) return AlignmentType.CENTER;
    if (norm.includes("right")) return AlignmentType.RIGHT;
    if (norm.includes("justify")) return AlignmentType.JUSTIFIED;
    if (norm.includes("left") || norm.includes("start"))
      return AlignmentType.LEFT;
    return undefined;
  };

  // ---------- inline marks + runs with inherited color ----------

  const parseInlineMarks = (el: HTMLElement, base: Marks): Marks => {
    const next: Marks = { ...base };
    const tag = el.tagName;

    if (tag === "B" || tag === "STRONG") next.bold = true;
    if (tag === "I" || tag === "EM") next.ital = true;
    if (tag === "U") next.underline = true;
    if (tag === "S" || tag === "DEL" || tag === "STRIKE") next.strike = true;
    if (tag === "CODE" || tag === "PRE") next.code = true;

    const styleAttr = (el.getAttribute("style") || "").toLowerCase();
    if (styleAttr) {
      const fw = extractCssProp(styleAttr, "font-weight");
      if (fw && (fw.includes("bold") || Number(fw) >= 600)) next.bold = true;

      const fs = extractCssProp(styleAttr, "font-style");
      if (fs && fs.includes("italic")) next.ital = true;

      const td = extractCssProp(styleAttr, "text-decoration");
      if (td) {
        const tdl = td.toLowerCase();
        if (tdl.includes("underline")) next.underline = true;
        if (tdl.includes("line-through") || tdl.includes("strikethrough"))
          next.strike = true;
      }

      const rawColor = extractCssProp(styleAttr, "color");
      const hex = cssColorToHex(rawColor);
      if (hex) next.color = hex;
    }

    return next;
  };

  type RunState = { marks: Marks; defaultColor: string };

  const mkRuns = (node: Node, state: RunState): TextRun[] => {
    const runs: TextRun[] = [];
    const { marks, defaultColor } = state;

    node.childNodes.forEach((child) => {
      if (child.nodeType === Node.TEXT_NODE) {
        const parentEl =
          node.nodeType === Node.ELEMENT_NODE ? (node as HTMLElement) : null;
        const isInPre = parentEl?.tagName === "PRE";
        const raw = child.textContent || "";
        const text = isInPre
          ? raw.replace(/\r\n/g, "\n")
          : raw.replace(/\s+/g, " ");
        if (!text.length) return;

        const runColor = (
          marks.color ||
          defaultColor ||
          "000000"
        ).toUpperCase();

        if (isInPre) {
          text.split("\n").forEach((line, idx) => {
            if (idx > 0) runs.push(new TextRun({ break: 1 }));
            if (!line.length) return;
            runs.push(
              new TextRun({
                text: line,
                bold: marks.bold,
                italics: marks.ital,
                strike: marks.strike,
                underline: marks.underline ? {} : undefined,
                font: marks.code ? { name: "Consolas" } : undefined,
                size: marks.code ? 20 : undefined,
                color: runColor,
              })
            );
          });
        } else {
          runs.push(
            new TextRun({
              text,
              bold: marks.bold,
              italics: marks.ital,
              strike: marks.strike,
              underline: marks.underline ? {} : undefined,
              font: marks.code ? { name: "Consolas" } : undefined,
              size: marks.code ? 20 : undefined,
              color: runColor,
            })
          );
        }
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        const el = child as HTMLElement;

        // 1) merge tag/style marks → may set color
        const nextMarks = parseInlineMarks(el, marks);

        // 2) computed color on this element (handles Tailwind classes)
        const elComputed = cssColorToHex(getComputedStyle(el).color);

        // 3) pass down default: inline color > computed color > current default
        const nextDefaultColor = (
          nextMarks.color ||
          elComputed ||
          defaultColor ||
          "000000"
        ).toUpperCase();

        if (el.tagName === "BR") {
          runs.push(new TextRun({ break: 1 }));
          return;
        }

        if (el.tagName === "A") {
          const linkText = el.textContent || el.getAttribute("href") || "";
          runs.push(
            new TextRun({
              text: linkText,
              underline: {},
              bold: nextMarks.bold,
              italics: nextMarks.ital,
              strike: nextMarks.strike,
              color: nextMarks.color || nextDefaultColor,
            })
          );
          return;
        }

        runs.push(
          ...mkRuns(el, { marks: nextMarks, defaultColor: nextDefaultColor })
        );
      }
    });

    return runs;
  };

  const pushParagraph = (
    output: Paragraph[],
    el: HTMLElement,
    defaultColor: string,
    opts: {
      heading?: (typeof HeadingLevel)[keyof typeof HeadingLevel];
      alignment?: (typeof AlignmentType)[keyof typeof AlignmentType];
      indentLeft?: number;
      numbering?: { reference: string; level: number };
    } = {}
  ) => {
    const elComputed = cssColorToHex(getComputedStyle(el).color);
    const paraDefaultColor = (
      elComputed ||
      defaultColor ||
      "000000"
    ).toUpperCase();
    const children = mkRuns(el, { marks: {}, defaultColor: paraDefaultColor });
    if (!children.length) return;
    const paraAlign = opts.alignment ?? getAlignment(el);
    output.push(
      new Paragraph({
        children,
        heading: opts.heading,
        alignment: paraAlign,
        numbering: opts.numbering,
        indent: opts.indentLeft ? { left: opts.indentLeft } : undefined,
        spacing: { after: 200 },
      })
    );
  };

  // ---------- lists ----------
  const BULLET_REF = "bullet-list";
  const NUMBER_REF = "number-list";

  const processList = (
    out: Paragraph[],
    listEl: HTMLElement,
    defaultColor: string,
    depth = 0
  ) => {
    const isUL = listEl.tagName === "UL";
    const ref = isUL ? BULLET_REF : NUMBER_REF;

    const items = Array.from(listEl.querySelectorAll(":scope > li"));
    items.forEach((li) => {
      const liEl = li as HTMLElement;

      const main = liEl.cloneNode(true) as HTMLElement;
      Array.from(main.querySelectorAll(":scope ul, :scope ol")).forEach(
        (nested) => nested.remove()
      );

      pushParagraph(out, main, defaultColor, {
        numbering: { reference: ref, level: depth },
      });

      const nestedLists = Array.from(
        liEl.querySelectorAll(":scope > ul, :scope > ol")
      );
      nestedLists.forEach((n) =>
        processList(out, n as HTMLElement, defaultColor, depth + 1)
      );
    });
  };

  // ---------- tables ----------
  const buildTable = (
    tableEl: HTMLTableElement,
    defaultColor: string
  ): Table => {
    const rows = Array.from(
      tableEl.querySelectorAll(
        ":scope > thead > tr, :scope > tbody > tr, :scope > tfoot > tr, :scope > tr"
      )
    ) as HTMLTableRowElement[];

    const docxRows = rows.map((tr) => {
      const cells = Array.from(
        tr.querySelectorAll(":scope > th, :scope > td")
      ) as HTMLElement[];

      const docxCells = cells.map((cell) => {
        const paras: Paragraph[] = [];

        let hasBlock = false;
        Array.from(cell.childNodes).forEach((n) => {
          if (n.nodeType === Node.ELEMENT_NODE) {
            const el = n as HTMLElement;
            const tag = el.tagName;
            if (
              tag === "P" ||
              tag === "DIV" ||
              tag === "PRE" ||
              /^H[1-6]$/.test(tag)
            ) {
              hasBlock = true;
              if (/^H[1-6]$/.test(tag)) {
                const level = Number(tag.substring(1)) as 1 | 2 | 3 | 4 | 5 | 6;
                const levelMap: Record<
                  number,
                  (typeof HeadingLevel)[keyof typeof HeadingLevel]
                > = {
                  1: HeadingLevel.HEADING_1,
                  2: HeadingLevel.HEADING_2,
                  3: HeadingLevel.HEADING_3,
                  4: HeadingLevel.HEADING_4,
                  5: HeadingLevel.HEADING_5,
                  6: HeadingLevel.HEADING_6,
                };
                pushParagraph(paras, el, defaultColor, {
                  heading: levelMap[level],
                  alignment: getAlignment(el),
                });
              } else {
                pushParagraph(paras, el, defaultColor, {
                  alignment: getAlignment(el),
                });
              }
            } else if (tag === "UL" || tag === "OL") {
              hasBlock = true;
              processList(paras, el, defaultColor, 0);
            }
          }
        });

        if (!hasBlock) {
          pushParagraph(paras, cell, defaultColor);
        }

        return new TableCell({
          children: paras.length
            ? paras
            : [new Paragraph({ children: [new TextRun("")] })],
        });
      });

      return new TableRow({ children: docxCells });
    });

    return new Table({
      rows: docxRows,
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: {
        top: { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" },
        bottom: { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" },
        left: { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" },
        right: { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" },
        insideHorizontal: {
          style: BorderStyle.SINGLE,
          size: 1,
          color: "DDDDDD",
        },
        insideVertical: { style: BorderStyle.SINGLE, size: 1, color: "DDDDDD" },
      },
    });
  };

  // ---------- HTML -> DOCX blocks with connected DOM for computed styles ----------
  function htmlToDocxBlocks(html: string): (Paragraph | Table)[] {
    const parser = new DOMParser();
    const parsed = parser.parseFromString(html, "text/html");

    // attach to DOM so getComputedStyle works consistently
    const host = document.createElement("div");
    Object.assign(host.style, {
      position: "fixed",
      left: "-99999px",
      top: "0",
      width: "800px",
      pointerEvents: "none",
      opacity: "0",
      zIndex: "-1",
    } as CSSStyleDeclaration);

    const hostRoot = document.createElement("div");
    Array.from(parsed.body.childNodes).forEach((n) => {
      hostRoot.appendChild(document.importNode(n, true));
    });
    host.appendChild(hostRoot);
    document.body.appendChild(host);

    const globalDefault =
      cssColorToHex(getComputedStyle(hostRoot).color) ||
      cssColorToHex(getComputedStyle(document.body).color) ||
      "000000";

    const out: (Paragraph | Table)[] = [];

    const walk = (node: ParentNode) => {
      node.childNodes.forEach((n) => {
        if (n.nodeType !== Node.ELEMENT_NODE) {
          if (n.nodeType === Node.TEXT_NODE) {
            const t = (n.textContent || "").trim();
            if (t) {
              const parentEl =
                n.parentNode && n.parentNode.nodeType === Node.ELEMENT_NODE
                  ? (n.parentNode as HTMLElement)
                  : null;
              const colorHex =
                (parentEl && cssColorToHex(getComputedStyle(parentEl).color)) ||
                globalDefault;

              out.push(
                new Paragraph({
                  children: [
                    new TextRun({ text: t, color: colorHex?.toUpperCase() }),
                  ],
                })
              );
            }
          }
          return;
        }

        const el = n as HTMLElement;
        const tag = el.tagName;

        if (tag === "TABLE") {
          out.push(buildTable(el as HTMLTableElement, globalDefault));
          return;
        }

        if (tag === "UL" || tag === "OL") {
          processList(out as Paragraph[], el, globalDefault, 0);
          return;
        }

        if (/^H[1-6]$/.test(tag)) {
          const level = Number(tag.substring(1)) as 1 | 2 | 3 | 4 | 5 | 6;
          const levelMap: Record<
            number,
            (typeof HeadingLevel)[keyof typeof HeadingLevel]
          > = {
            1: HeadingLevel.HEADING_1,
            2: HeadingLevel.HEADING_2,
            3: HeadingLevel.HEADING_3,
            4: HeadingLevel.HEADING_4,
            5: HeadingLevel.HEADING_5,
            6: HeadingLevel.HEADING_6,
          };
          pushParagraph(out as Paragraph[], el, globalDefault, {
            heading: levelMap[level],
            alignment: getAlignment(el),
          });
          return;
        }

        if (tag === "BLOCKQUOTE") {
          pushParagraph(out as Paragraph[], el, globalDefault, {
            indentLeft: 720,
            alignment: getAlignment(el),
          });
          return;
        }

        if (tag === "P" || tag === "DIV" || tag === "PRE" || tag === "SPAN") {
          pushParagraph(out as Paragraph[], el, globalDefault, {
            alignment: getAlignment(el),
          });
          return;
        }

        // recurse
        walk(el);
      });
    };

    walk(hostRoot);

    if (host.parentNode) host.parentNode.removeChild(host);
    return out;
  }

  // ---------- DOCX download ----------

  async function downloadDocx() {
    if (!ready) return;
    setBusy("docx");
    try {
      const html = await getHTML();
      const blocks = htmlToDocxBlocks(html);
      if (blocks.length === 0) {
        blocks.push(new Paragraph({ children: [new TextRun({ text: "" })] }));
      }

      const doc = new DocxDocument({
        styles: {
          default: {
            document: {
              run: { font: "Calibri", size: 22 },
            },
          },
        },
        numbering: {
          config: [
            {
              reference: "bullet-list",
              levels: [
                {
                  level: 0,
                  format: LevelFormat.BULLET,
                  text: "\u2022",
                  alignment: AlignmentType.LEFT,
                  style: { paragraph: { indent: { left: 720, hanging: 360 } } },
                },
                {
                  level: 1,
                  format: LevelFormat.BULLET,
                  text: "◦",
                  alignment: AlignmentType.LEFT,
                  style: {
                    paragraph: { indent: { left: 1440, hanging: 360 } },
                  },
                },
                {
                  level: 2,
                  format: LevelFormat.BULLET,
                  text: "▪",
                  alignment: AlignmentType.LEFT,
                  style: {
                    paragraph: { indent: { left: 2160, hanging: 360 } },
                  },
                },
              ],
            },
            {
              reference: "number-list",
              levels: [
                {
                  level: 0,
                  format: LevelFormat.DECIMAL,
                  text: "%1.",
                  alignment: AlignmentType.LEFT,
                  style: { paragraph: { indent: { left: 720, hanging: 360 } } },
                },
                {
                  level: 1,
                  format: LevelFormat.DECIMAL,
                  text: "%2.",
                  alignment: AlignmentType.LEFT,
                  style: {
                    paragraph: { indent: { left: 1440, hanging: 360 } },
                  },
                },
                {
                  level: 2,
                  format: LevelFormat.DECIMAL,
                  text: "%3.",
                  alignment: AlignmentType.LEFT,
                  style: {
                    paragraph: { indent: { left: 2160, hanging: 360 } },
                  },
                },
              ],
            },
          ],
        },
        sections: [{ children: blocks }],
      });

      const blob = await Packer.toBlob(doc);
      saveAs(blob, `${safeTitle}.docx`);
    } finally {
      setBusy(null);
    }
  }

  // ---------- PDF download (unchanged) ----------

  async function downloadPdf() {
    if (!ready) return;
    setBusy("pdf");
    try {
      const root = editor.getRootElement();
      if (!root) throw new Error("Editor root not found");

      // fonts
      // @ts-ignore
      if (document.fonts?.ready) {
        // @ts-ignore
        await document.fonts.ready;
      }

      // images CORS warmup
      const imgs = Array.from(
        root.querySelectorAll("img")
      ) as HTMLImageElement[];
      imgs.forEach((img) => {
        if (!img.crossOrigin) img.crossOrigin = "anonymous";
      });
      await Promise.all(
        imgs.map((img) => {
          if (img.complete) return Promise.resolve();
          return new Promise<void>((resolve) => {
            const done = () => resolve();
            img.onload = done;
            img.onerror = done;
          });
        })
      );

      await new Promise((r) => requestAnimationFrame(r));

      const scale = Math.min(2.5, window.devicePixelRatio || 1);
      const { default: html2pdf } = (await import("html2pdf.js")) as any;

      await html2pdf()
        .from(root)
        .set({
          filename: `${safeTitle}.pdf`,
          margin: [24, 24, 24, 24],
          pagebreak: { mode: ["avoid-all", "css", "legacy"] },
          html2canvas: {
            scale,
            useCORS: true,
            allowTaint: true,
            backgroundColor: "#ffffff",
            logging: false,
            windowWidth: Math.max(
              document.documentElement.clientWidth,
              root.scrollWidth
            ),
            windowHeight: Math.max(
              document.documentElement.clientHeight,
              root.scrollHeight
            ),
          },
          jsPDF: { unit: "pt", format: "a4", orientation: "portrait" },
        })
        .save();
    } finally {
      setBusy(null);
    }
  }

  const disabled = !ready || busy !== null;

  return (
    <div className="flex w-full flex-row items-center gap-3">
      <button
        onClick={downloadDocx}
        disabled={disabled}
        className={[
          "inline-flex h-11 w-11 items-center justify-center",
          "rounded-full border border-transparent bg-transparent text-white",
          "hover:opacity-90 disabled:opacity-50",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-blue-500",
          "transition-colors",
        ].join(" ")}
        aria-label="Download as Word document"
      >
        {busy === "docx" ? <Spinner /> : <SvgDocx />}
      </button>

      <button
        onClick={downloadPdf}
        disabled={disabled}
        className={[
          "inline-flex h-11 w-11 items-center justify-center",
          "rounded-full border border-transparent bg-transparent text-white",
          "hover:opacity-90 disabled:opacity-50",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-slate-600",
          "transition-colors",
        ].join(" ")}
        aria-label="Download as PDF"
      >
        {busy === "pdf" ? <Spinner /> : <SvgPdf />}
      </button>
    </div>
  );
}

/* ---------- tiny inline icons/spinner (no extra deps) ---------- */

function Spinner({ className = "" }: { className?: string }) {
  return (
    <svg
      className={"animate-spin h-5 w-5 " + className}
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
        fill="none"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8v4A4 4 0 008 12H4z"
      />
    </svg>
  );
}

function SvgDocx({ className = "" }: { className?: string }) {
  return (
    <svg
      className={"h-5 w-5 " + className}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6zM13 9V3.5L18.5 9H13z" />
      <path d="M7 13h10v2H7zm0 4h7v2H7zm0-8h6v2H7z" />
    </svg>
  );
}

function SvgPdf({ className = "" }: { className?: string }) {
  return (
    <svg
      className={"h-5 w-5 " + className}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M14 2H6a2 2 0 00-2 2v6h2V4h8V2z" />
      <path d="M18 8h-4V4l4 4zM4 10h16v10a2 2 0 01-2 2H6a2 2 0 01-2-2V10z" />
      <path d="M7 14h3a2 2 0 110 4H7v-4zm2 2h1a1 1 0 100-2H9v2zM14 14h3v1h-2v1h2v2h-3v-1h2v-1h-2v-2z" />
    </svg>
  );
}
