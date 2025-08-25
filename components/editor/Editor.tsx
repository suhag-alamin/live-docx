"use client";

import { CodeHighlightNode, CodeNode } from "@lexical/code";
import { AutoLinkNode, LinkNode } from "@lexical/link";
import { ListItemNode, ListNode } from "@lexical/list";
import { AutoFocusPlugin } from "@lexical/react/LexicalAutoFocusPlugin";
import { CheckListPlugin } from "@lexical/react/LexicalCheckListPlugin";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";
import { ListPlugin } from "@lexical/react/LexicalListPlugin";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import { TabIndentationPlugin } from "@lexical/react/LexicalTabIndentationPlugin";
import { HeadingNode, QuoteNode } from "@lexical/rich-text";
import { TableCellNode, TableNode, TableRowNode } from "@lexical/table";
import { useEffect } from "react";
import Theme from "./plugins/Theme";
import ToolbarPlugin from "./plugins/ToolbarPlugin";

import {
  FloatingComposer,
  FloatingThreads,
  liveblocksConfig,
  LiveblocksPlugin,
  useEditorStatus,
} from "@liveblocks/react-lexical";
import Loader from "../Loader";

import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { useThreads } from "@liveblocks/react/suspense";
import Comments from "../Comments";
import { DeleteModal } from "../DeleteModal";
import DownloadButtons from "../DownloadButtons";
import FloatingToolbarPlugin from "./plugins/FloatingToolbarPlugin";

function Placeholder() {
  return <div className="editor-placeholder">Enter some rich text...</div>;
}

function InitialContentPlugin({ templateId }: { templateId?: string }) {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    if (templateId) {
      try {
        import("@/lib/templates").then(({ getTemplateById }) => {
          const template = getTemplateById(templateId);
          if (template && template.content) {
            const editorState = editor.parseEditorState(template.content);
            editor.setEditorState(editorState);
          }
        });
      } catch (error) {
        console.warn("Failed to load template content:", error);
      }
    }
  }, [editor, templateId]);

  return null;
}

export function Editor({
  roomId,
  currentUserType,
  docTitle,
  templateId,
}: {
  roomId: string;
  currentUserType: "editor" | "viewer";
  docTitle?: string;
  templateId?: string;
}) {
  const status = useEditorStatus();
  const { threads } = useThreads();

  const initialConfig = liveblocksConfig({
    namespace: "Editor",
    nodes: [
      HeadingNode,
      QuoteNode,
      ListNode,
      ListItemNode,
      CodeNode,
      CodeHighlightNode,
      TableNode,
      TableCellNode,
      TableRowNode,
      AutoLinkNode,
      LinkNode,
    ],
    onError: (error: Error) => {
      console.error(error);
      throw error;
    },
    theme: Theme,
    editable: currentUserType === "editor",
  });

  return (
    <LexicalComposer initialConfig={initialConfig}>
      <div className="editor-container size-full">
        <div className="toolbar-wrapper flex min-w-full items-center justify-between">
          <ToolbarPlugin />
          <div className="flex items-center gap-3">
            {currentUserType === "editor" && (
              <DownloadButtons title={docTitle || "document"} />
            )}
            {currentUserType === "editor" && <DeleteModal roomId={roomId} />}
          </div>
        </div>

        <div className="editor-wrapper flex flex-col items-center justify-start">
          {status === "not-loaded" || status === "loading" ? (
            <Loader />
          ) : (
            <div className="editor-inner min-h-[1100px] relative mb-5 h-fit w-full max-w-[800px] shadow-md lg:mb-10">
              <RichTextPlugin
                contentEditable={
                  <ContentEditable className="editor-input h-full" />
                }
                placeholder={<Placeholder />}
                ErrorBoundary={LexicalErrorBoundary}
              />
              {currentUserType === "editor" && <FloatingToolbarPlugin />}
              <HistoryPlugin />
              <AutoFocusPlugin />
              <ListPlugin />
              <CheckListPlugin />
              <TabIndentationPlugin />
              {templateId && <InitialContentPlugin templateId={templateId} />}
            </div>
          )}

          <LiveblocksPlugin>
            <FloatingComposer className="w-[350px]" />
            <FloatingThreads threads={threads} />
            <Comments />
          </LiveblocksPlugin>
        </div>
      </div>
    </LexicalComposer>
  );
}
