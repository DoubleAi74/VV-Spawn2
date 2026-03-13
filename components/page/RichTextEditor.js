'use client';

import { useMemo, useId } from 'react';
import ReactQuill from 'react-quill-new';
import 'react-quill-new/dist/quill.snow.css';

export default function RichTextEditor({
  value,
  onChange,
  placeholder = 'Write your content here...',
  variant = 'dark',
  minHeight = '80px',
  maxHeight = '300px',
}) {
  const editorId = useId().replace(/:/g, '');

  const modules = useMemo(
    () => ({
      toolbar: [[{ header: [1, 2, false] }], ['bold', 'italic', 'underline']],
    }),
    []
  );

  const formats = ['header', 'bold', 'italic', 'underline'];
  const isDark = variant === 'dark';

  return (
    <div
      id={editorId}
      className={`rounded-[3px] overflow-hidden ${
        isDark ? '' : 'border border-neutral-300 bg-white'
      }`}
    >
      <style>{`
        ${
          isDark
            ? `
          #${editorId} .ql-snow {
            border: 1px solid rgb(255 255 255 / 0.1);
            background: rgb(255 255 255 / 0.05);
            border-radius: 3px;
          }
          #${editorId} .ql-toolbar {
            border: none !important;
            border-bottom: 1px solid rgb(255 255 255 / 0.1) !important;
            background: rgb(255 255 255 / 0.03);
            border-radius: 3px 3px 0 0;
            padding: 6px 8px;
            display: flex;
            align-items: center;
            flex-wrap: nowrap;
            gap: 6px;
            overflow-x: auto;
            overflow-y: hidden;
          }
          #${editorId} .ql-toolbar .ql-formats {
            display: flex;
            align-items: center;
            margin-right: 0;
            white-space: nowrap;
            flex-shrink: 0;
          }
          #${editorId} .ql-container {
            border: none !important;
            font-size: 14px;
          }
          #${editorId} .ql-editor {
            color: rgb(255 255 255 / 0.9);
            padding: 12px 16px;
            min-height: ${minHeight};
            max-height: ${maxHeight};
            overflow-y: auto;
          }
          #${editorId} .ql-editor.ql-blank::before {
            color: rgb(255 255 255 / 0.3);
            font-style: normal;
          }
          #${editorId} .ql-toolbar .ql-stroke {
            stroke: rgb(255 255 255 / 0.5);
          }
          #${editorId} .ql-toolbar .ql-fill {
            fill: rgb(255 255 255 / 0.5);
          }
          #${editorId} .ql-toolbar button.ql-active .ql-stroke {
            stroke: rgb(255 255 255 / 1) !important;
          }
          #${editorId} .ql-toolbar button.ql-active .ql-fill {
            fill: rgb(255 255 255 / 1) !important;
          }
          #${editorId} .ql-toolbar button.ql-active {
            background: rgb(255 255 255 / 0.15) !important;
            border-radius: 2px;
          }
          @media (hover: hover) {
            #${editorId} .ql-toolbar button:hover .ql-stroke {
              stroke: rgb(255 255 255 / 0.9);
            }
            #${editorId} .ql-toolbar button:hover .ql-fill {
              fill: rgb(255 255 255 / 0.9);
            }
            #${editorId} .ql-snow.ql-toolbar button:hover {
              background: rgb(255 255 255 / 0.1);
              border-radius: 2px;
            }
            #${editorId} .ql-toolbar .ql-picker-label:hover {
              color: rgb(255 255 255 / 0.9);
              background: rgb(255 255 255 / 0.1);
            }
          }
          #${editorId} .ql-toolbar .ql-picker { color: rgb(255 255 255 / 0.5); }
          #${editorId} .ql-toolbar .ql-picker-label {
            color: rgb(255 255 255 / 0.5);
            border: 1px solid transparent;
            border-radius: 2px;
          }
          #${editorId} .ql-toolbar .ql-picker.ql-expanded .ql-picker-label {
            color: rgb(255 255 255 / 0.9);
            background: rgb(38 38 38);
          }
          #${editorId} .ql-toolbar .ql-picker-options {
            background: rgb(38 38 38);
            border: 1px solid rgb(255 255 255 / 0.15);
            border-radius: 4px;
            box-shadow: 0 4px 12px rgb(0 0 0 / 0.3);
          }
          #${editorId} .ql-toolbar .ql-picker-item { color: rgb(255 255 255 / 0.7); }
        `
            : `
          #${editorId} .ql-snow {
            border: 1px solid rgb(212 212 212);
            border-radius: 3px;
            background: rgb(255 255 255 / 1);
          }
          #${editorId} .ql-toolbar {
            border: none !important;
            border-bottom: 1px solid rgb(229 229 229) !important;
            background: rgb(250 250 250 / 1);
            padding: 6px 8px;
            display: flex;
            align-items: center;
            flex-wrap: nowrap;
            gap: 6px;
            overflow-x: auto;
            overflow-y: hidden;
          }
          #${editorId} .ql-toolbar .ql-formats {
            display: flex;
            align-items: center;
            margin-right: 0;
            white-space: nowrap;
            flex-shrink: 0;
          }
          #${editorId} .ql-container {
            border: none !important;
            font-size: 14px;
          }
          #${editorId} .ql-editor {
            color: rgb(38 38 38);
            padding: 12px 16px;
            min-height: ${minHeight};
            max-height: ${maxHeight};
            overflow-y: auto;
          }
          #${editorId} .ql-editor.ql-blank::before {
            color: rgb(115 115 115);
            font-style: normal;
          }
          @media (hover: none) {
            #${editorId} .ql-toolbar button:hover {
              background: transparent !important;
            }
          }
        `
        }
        #${editorId} .ql-toolbar::-webkit-scrollbar {
          display: none;
        }
        #${editorId} .ql-toolbar {
          scrollbar-width: none;
        }
      `}</style>

      <ReactQuill
        theme="snow"
        value={value}
        onChange={onChange}
        modules={modules}
        formats={formats}
        placeholder={placeholder}
      />
    </div>
  );
}
