import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { invoke } from '@tauri-apps/api/core';

export default function Markdown({ source }: { source: string }) {
  const [error, setError] = useState('');
  return (
    <div className="markdown-body">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        skipHtml
        components={{
          a: ({ href, children }) =>
            /^https?:\/\//i.test(href || '') ? (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(event) => {
                  event.preventDefault();
                  void invoke('open_external', { url: href }).catch(() =>
                    setError('The link could not be opened in your system browser.'),
                  );
                }}
              >
                {children}
              </a>
            ) : (
              <span>{children}</span>
            ),
          img: ({ alt }) => (
            <span className="muted">
              [Image: {alt || 'Use an evidence attachment to preview images'}]
            </span>
          ),
          input: ({ checked }) => (
            <input
              type="checkbox"
              checked={Boolean(checked)}
              disabled
              aria-label={checked ? 'Completed checklist item' : 'Incomplete checklist item'}
            />
          ),
        }}
      >
        {source}
      </ReactMarkdown>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
    </div>
  );
}

export function MarkdownPreview({ source }: { source: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="markdown-preview">
      <button type="button" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        {open ? 'Hide' : 'Show'} Markdown preview
      </button>
      {open && <Markdown source={source || '*Nothing to preview yet.*'} />}
    </div>
  );
}
