/**
 * Copyright (c) Meta
 * MIT License
 */
"use client";

import {
  $isListNode,
  INSERT_ORDERED_LIST_COMMAND,
  INSERT_UNORDERED_LIST_COMMAND,
  REMOVE_LIST_COMMAND,
} from "@lexical/list";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  $createHeadingNode,
  $createQuoteNode,
  $isHeadingNode,
} from "@lexical/rich-text";
import { $patchStyleText, $setBlocksType } from "@lexical/selection";
import { $findMatchingParent, mergeRegister } from "@lexical/utils";
import {
  $createParagraphNode,
  $getSelection,
  $isRangeSelection,
  $isRootOrShadowRoot,
  CAN_REDO_COMMAND,
  CAN_UNDO_COMMAND,
  FORMAT_ELEMENT_COMMAND,
  FORMAT_TEXT_COMMAND,
  REDO_COMMAND,
  SELECTION_CHANGE_COMMAND,
  UNDO_COMMAND,
} from "lexical";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

// Radix Popover for dropdown
import * as Popover from "@radix-ui/react-popover";

const LowPriority = 1;

function Divider() {
  return <div className="divider" />;
}

// 4-in-a-row color palette (feel free to expand)
const SWATCHES = [
  "#000000",
  "#111827",
  "#374151",
  "#6b7280",
  "#ef4444",
  "#f59e0b",
  "#eab308",
  "#22c55e",
  "#06b6d4",
  "#3b82f6",
  "#6366f1",
  "#a855f7",
  "#ec4899",
  "#10b981",
  "#84cc16",
  "#f97316",
];

export default function ToolbarPlugin() {
  const [editor] = useLexicalComposerContext();
  const toolbarRef = useRef<HTMLDivElement | null>(null);

  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [isBold, setIsBold] = useState(false);
  const [isItalic, setIsItalic] = useState(false);
  const [isUnderline, setIsUnderline] = useState(false);
  const [isStrikethrough, setIsStrikethrough] = useState(false);
  const [isList, setIsList] = useState(false);
  const [listType, setListType] = useState<"bullet" | "number" | null>(null);
  const [fontSize, setFontSize] = useState<string>("14px");

  // current selection color (best-effort)
  const [currentColor, setCurrentColor] = useState<string>("#000000");

  const activeBlock = useActiveBlock();

  const $updateToolbar = useCallback(() => {
    const selection = $getSelection();
    if ($isRangeSelection(selection)) {
      setIsBold(selection.hasFormat("bold"));
      setIsItalic(selection.hasFormat("italic"));
      setIsUnderline(selection.hasFormat("underline"));
      setIsStrikethrough(selection.hasFormat("strikethrough"));

      // Check if we're in a list
      const anchorNode = selection.anchor.getNode();
      const element =
        anchorNode.getKey() === "root"
          ? anchorNode
          : $findMatchingParent(anchorNode, (e) => {
              const parent = e.getParent();
              return parent !== null && $isRootOrShadowRoot(parent);
            });

      if (element !== null) {
        const elementKey = element.getKey();
        const elementDOM = editor.getElementByKey(elementKey);
        if (elementDOM !== null) {
          const listNode = $findMatchingParent(anchorNode, (node) =>
            $isListNode(node)
          );
          if (listNode && $isListNode(listNode)) {
            setIsList(true);
            setListType(
              (listNode as any).getListType() === "bullet" ? "bullet" : "number"
            );
          } else {
            setIsList(false);
            setListType(null);
          }
        }
      }

      // try to read color from first styled text node
      try {
        const nodes = selection.getNodes();
        let found: string | null = null;
        for (const n of nodes) {
          // @ts-ignore getStyle exists on TextNode
          if (typeof n.getStyle === "function") {
            // @ts-ignore
            const style: string = n.getStyle();
            if (style) {
              const mHex = style.match(/color:\s*(#[0-9a-f]{3,6})/i);
              const mRgb = style.match(
                /color:\s*rgb\((\d+),\s*(\d+),\s*(\d+)\)/i
              );
              if (mHex) {
                found = mHex[1];
                break;
              }
              if (mRgb) {
                const [r, g, b] = mRgb.slice(1).map(Number);
                const hex =
                  "#" +
                  [r, g, b]
                    .map((v) => v.toString(16).padStart(2, "0"))
                    .join("");
                found = hex;
                break;
              }
            }
          }
        }
        if (found) setCurrentColor(found);
      } catch {
        // ignore
      }
    }
  }, [editor]);

  useEffect(() => {
    return mergeRegister(
      editor.registerUpdateListener(({ editorState }) => {
        editorState.read(() => {
          $updateToolbar();
        });
      }),
      editor.registerCommand(
        SELECTION_CHANGE_COMMAND,
        () => {
          $updateToolbar();
          return false;
        },
        LowPriority
      ),
      editor.registerCommand(
        CAN_UNDO_COMMAND,
        (payload) => {
          setCanUndo(payload);
          return false;
        },
        LowPriority
      ),
      editor.registerCommand(
        CAN_REDO_COMMAND,
        (payload) => {
          setCanRedo(payload);
          return false;
        },
        LowPriority
      )
    );
  }, [editor, $updateToolbar]);

  function toggleBlock(type: "h1" | "h2" | "h3" | "quote") {
    const selection = $getSelection();

    if (activeBlock === type) {
      return $setBlocksType(selection, () => $createParagraphNode());
    }
    if (type === "h1")
      return $setBlocksType(selection, () => $createHeadingNode("h1"));
    if (type === "h2")
      return $setBlocksType(selection, () => $createHeadingNode("h2"));
    if (type === "h3")
      return $setBlocksType(selection, () => $createHeadingNode("h3"));
    if (type === "quote")
      return $setBlocksType(selection, () => $createQuoteNode());
  }

  // ----- Color handlers
  const applyColor = useCallback(
    (hex: string) => {
      setCurrentColor(hex);
      editor.update(() => {
        const selection = $getSelection();
        if ($isRangeSelection(selection)) {
          $patchStyleText(selection, { color: hex });
        }
      });
    },
    [editor]
  );

  const clearColor = useCallback(() => {
    setCurrentColor("#000000");
    editor.update(() => {
      const selection = $getSelection();
      if ($isRangeSelection(selection)) {
        $patchStyleText(selection, { color: "" });
      }
    });
  }, [editor]);

  return (
    <div className="toolbar" ref={toolbarRef}>
      <button
        disabled={!canUndo}
        onClick={() => editor.dispatchCommand(UNDO_COMMAND, undefined)}
        className="toolbar-item spaced"
        aria-label="Undo"
      >
        <i className="format undo" />
      </button>
      <button
        disabled={!canRedo}
        onClick={() => editor.dispatchCommand(REDO_COMMAND, undefined)}
        className="toolbar-item"
        aria-label="Redo"
      >
        <i className="format redo" />
      </button>

      <Divider />

      <button
        onClick={() => editor.update(() => toggleBlock("h1"))}
        data-active={activeBlock === "h1" ? "" : undefined}
        className={
          "toolbar-item spaced " + (activeBlock === "h1" ? "active" : "")
        }
        aria-label="Heading 1"
      >
        <i className="format h1" />
      </button>
      <button
        onClick={() => editor.update(() => toggleBlock("h2"))}
        data-active={activeBlock === "h2" ? "" : undefined}
        className={
          "toolbar-item spaced " + (activeBlock === "h2" ? "active" : "")
        }
        aria-label="Heading 2"
      >
        <i className="format h2" />
      </button>
      <button
        onClick={() => editor.update(() => toggleBlock("quote"))}
        data-active={activeBlock === "quote" ? "" : undefined}
        className={
          "toolbar-item spaced " + (activeBlock === "quote" ? "active" : "")
        }
        aria-label="Quote"
      >
        <i className="format quote" />
      </button>

      <Divider />

      <button
        onClick={() => {
          if (listType === "bullet") {
            editor.dispatchCommand(REMOVE_LIST_COMMAND, undefined);
          } else {
            editor.dispatchCommand(INSERT_UNORDERED_LIST_COMMAND, undefined);
          }
        }}
        className={
          "toolbar-item spaced " + (listType === "bullet" ? "active" : "")
        }
        aria-label="Bullet List"
      >
        <i className="format bullet-list" />
      </button>
      <button
        onClick={() => {
          if (listType === "number") {
            editor.dispatchCommand(REMOVE_LIST_COMMAND, undefined);
          } else {
            editor.dispatchCommand(INSERT_ORDERED_LIST_COMMAND, undefined);
          }
        }}
        className={
          "toolbar-item spaced " + (listType === "number" ? "active" : "")
        }
        aria-label="Numbered List"
      >
        <i className="format numbered-list" />
      </button>

      <Divider />

      <button
        onClick={() => {
          // Simple indentation by adding margin
          editor.update(() => {
            const selection = $getSelection();
            if ($isRangeSelection(selection)) {
              $patchStyleText(selection, { "margin-left": "20px" });
            }
          });
        }}
        className="toolbar-item spaced text-white"
        aria-label="Increase Indent "
        title="Increase Indent"
      >
        <span style={{ fontSize: "14px", fontWeight: "bold" }}>→</span>
      </button>
      <button
        onClick={() => {
          // Simple outdent by removing margin
          editor.update(() => {
            const selection = $getSelection();
            if ($isRangeSelection(selection)) {
              $patchStyleText(selection, { "margin-left": "" });
            }
          });
        }}
        className="toolbar-item spaced text-white"
        aria-label="Decrease Indent"
        title="Decrease Indent"
      >
        <span style={{ fontSize: "14px", fontWeight: "bold" }}>←</span>
      </button>

      <Divider />

      <button
        onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, "bold")}
        className={"toolbar-item spaced " + (isBold ? "active" : "")}
        aria-label="Bold"
      >
        <i className="format bold" />
      </button>
      <button
        onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, "italic")}
        className={"toolbar-item spaced " + (isItalic ? "active" : "")}
        aria-label="Italic"
      >
        <i className="format italic" />
      </button>
      <button
        onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, "underline")}
        className={"toolbar-item spaced " + (isUnderline ? "active" : "")}
        aria-label="Underline"
      >
        <i className="format underline" />
      </button>
      <button
        onClick={() =>
          editor.dispatchCommand(FORMAT_TEXT_COMMAND, "strikethrough")
        }
        className={"toolbar-item spaced " + (isStrikethrough ? "active" : "")}
        aria-label="Strikethrough"
      >
        <i className="format strikethrough" />
      </button>

      <Divider />

      <button
        onClick={() => editor.dispatchCommand(FORMAT_ELEMENT_COMMAND, "left")}
        className="toolbar-item spaced"
        aria-label="Align Left"
      >
        <i className="format left-align" />
      </button>
      <button
        onClick={() => editor.dispatchCommand(FORMAT_ELEMENT_COMMAND, "center")}
        className="toolbar-item spaced"
        aria-label="Align Center"
      >
        <i className="format center-align" />
      </button>
      <button
        onClick={() => editor.dispatchCommand(FORMAT_ELEMENT_COMMAND, "right")}
        className="toolbar-item spaced"
        aria-label="Align Right"
      >
        <i className="format right-align" />
      </button>
      <button
        onClick={() =>
          editor.dispatchCommand(FORMAT_ELEMENT_COMMAND, "justify")
        }
        className="toolbar-item"
        aria-label="Justify"
      >
        <i className="format justify-align" />
      </button>

      <Divider />

      {/* Color dropdown (circle swatches, 4 per row) */}
      <Popover.Root>
        <Popover.Trigger asChild>
          <button
            className="toolbar-item spaced"
            aria-label="Text color"
            title="Text color"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "6px 10px",
              borderRadius: 8,
              // border: '1px solid #e5e7eb',
              background: "transparent",
              cursor: "pointer",
              color: "#e5e7eb",
            }}
          >
            <span
              aria-hidden
              style={{
                width: 16,
                height: 16,
                borderRadius: "9999px",
                border: "1px solid #d1d5db",
                background: currentColor,
                display: "inline-block",
              }}
            />
            <span style={{ fontSize: 12 }}>Color</span>
          </button>
        </Popover.Trigger>

        <Popover.Portal>
          <Popover.Content
            side="bottom"
            align="center"
            sideOffset={8}
            style={{
              background: "#2E3D5B",
              // border: '1px solid #e5e7eb',
              borderRadius: 10,
              boxShadow:
                "0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -2px rgba(0,0,0,0.05)",
              padding: 12,
              width: 220, // fits 4 columns comfortably
            }}
          >
            {/* Grid: 4 columns, circular swatches */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(4, 1fr)",
                gap: 10,
              }}
            >
              {SWATCHES.map((hex) => {
                const active = hex.toLowerCase() === currentColor.toLowerCase();
                return (
                  <button
                    key={hex}
                    onClick={() => applyColor(hex)}
                    title={hex}
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: "9999px",
                      border: active
                        ? "2px solid #111827"
                        : "1px solid #e5e7eb",
                      background: hex,
                      cursor: "pointer",
                    }}
                  />
                );
              })}
              {/* Clear color */}
              <button
                onClick={clearColor}
                title="Clear color"
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: "9999px",
                  border: "1px dashed #9ca3af",
                  background:
                    "repeating-linear-gradient(45deg, #f9fafb, #f9fafb 6px, #f3f4f6 6px, #f3f4f6 12px)",
                  color: "#6b7280",
                  fontSize: 12,
                  display: "grid",
                  placeItems: "center",
                  cursor: "pointer",
                }}
              >
                ×
              </button>
            </div>

            <Popover.Arrow
              width={12}
              height={6}
              style={{ fill: "#ffffff", stroke: "#e5e7eb", strokeWidth: 1 }}
            />
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>

      {/* Font Size Dropdown */}
      <Popover.Root>
        <Popover.Trigger asChild>
          <button
            className="toolbar-item spaced"
            aria-label="Font size"
            title="Font size"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "6px 10px",
              borderRadius: 8,
              background: "transparent",
              cursor: "pointer",
              color: "#e5e7eb",
              minWidth: "60px",
            }}
          >
            <span style={{ fontSize: 12 }}>{fontSize}</span>
            <span style={{ fontSize: 10 }}>▼</span>
          </button>
        </Popover.Trigger>

        <Popover.Portal>
          <Popover.Content
            side="bottom"
            align="center"
            sideOffset={8}
            style={{
              background: "#2E3D5B",
              borderRadius: 10,
              boxShadow:
                "0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -2px rgba(0,0,0,0.05)",
              padding: 8,
              maxHeight: "240px",
              overflowY: "auto",
              minWidth: "120px",
            }}
          >
            {/* Custom Font Size Input */}
            <div style={{ marginBottom: 8, padding: "0 4px" }}>
              <input
                type="text"
                placeholder="Custom size"
                value={fontSize}
                onChange={(e) => {
                  const value = e.target.value;
                  setFontSize(value);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    const value = (e.target as HTMLInputElement).value;
                    if (
                      value &&
                      (value.endsWith("px") ||
                        value.endsWith("em") ||
                        value.endsWith("rem") ||
                        /^\d+$/.test(value))
                    ) {
                      const finalValue = /^\d+$/.test(value)
                        ? value + "px"
                        : value;
                      setFontSize(finalValue);
                      editor.update(() => {
                        const selection = $getSelection();
                        if ($isRangeSelection(selection)) {
                          $patchStyleText(selection, {
                            "font-size": finalValue,
                          });
                        }
                      });
                    }
                  }
                }}
                style={{
                  width: "100%",
                  padding: "6px 8px",
                  border: "1px solid #4B5563",
                  borderRadius: 4,
                  background: "#374151",
                  color: "#ffffff",
                  fontSize: "12px",
                  outline: "none",
                }}
                onFocus={(e) => {
                  e.target.style.borderColor = "#60A5FA";
                }}
                onBlur={(e) => {
                  e.target.style.borderColor = "#4B5563";
                }}
              />
              <div
                style={{
                  fontSize: "10px",
                  color: "#9CA3AF",
                  marginTop: 2,
                  textAlign: "center",
                }}
              >
                Enter size (e.g., 16px, 1.2em)
              </div>
            </div>

            {/* Separator */}
            <div
              style={{
                height: 1,
                background: "#4B5563",
                margin: "8px 0",
              }}
            />

            {/* Preset Sizes */}
            {[
              "10px",
              "12px",
              "14px",
              "16px",
              "18px",
              "20px",
              "24px",
              "28px",
              "32px",
              "36px",
            ].map((size) => (
              <button
                key={size}
                onClick={() => {
                  setFontSize(size);
                  editor.update(() => {
                    const selection = $getSelection();
                    if ($isRangeSelection(selection)) {
                      $patchStyleText(selection, { "font-size": size });
                    }
                  });
                }}
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  padding: "8px 12px",
                  border: "none",
                  background: fontSize === size ? "#374151" : "transparent",
                  color: "#ffffff",
                  cursor: "pointer",
                  borderRadius: 4,
                  fontSize: size,
                }}
                onMouseEnter={(e) => {
                  if (fontSize !== size) {
                    e.currentTarget.style.background = "#4B5563";
                  }
                }}
                onMouseLeave={(e) => {
                  if (fontSize !== size) {
                    e.currentTarget.style.background = "transparent";
                  }
                }}
              >
                {size}
              </button>
            ))}

            <Popover.Arrow width={12} height={6} style={{ fill: "#2E3D5B" }} />
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    </div>
  );
}

function useActiveBlock() {
  const [editor] = useLexicalComposerContext();

  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      return editor.registerUpdateListener(onStoreChange);
    },
    [editor]
  );

  const getSnapshot = useCallback(() => {
    return editor.getEditorState().read(() => {
      const selection = $getSelection();
      if (!$isRangeSelection(selection)) return null;

      const anchor = selection.anchor.getNode();
      let element =
        anchor.getKey() === "root"
          ? anchor
          : $findMatchingParent(anchor, (e) => {
              const parent = e.getParent();
              return parent !== null && $isRootOrShadowRoot(parent);
            });

      if (element === null) {
        element = anchor.getTopLevelElementOrThrow();
      }

      if ($isHeadingNode(element)) {
        return element.getTag();
      }

      return element.getType();
    });
  }, [editor]);

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
