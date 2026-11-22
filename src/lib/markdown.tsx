/**
 * Minimal, safe Markdown → React (no HTML injection: everything becomes React text nodes).
 * Supports: ## / ### headings, paragraphs, - and 1. lists, > blockquote, **bold**, *italic*,
 * [links](https://…) and line breaks. Enough for journal stories and policy pages.
 */
import React from 'react';

function inline(text: string, keyBase: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]+\]\([^)\s]+\))/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const tok = m[0];
    const key = `${keyBase}-${i++}`;
    if (tok.startsWith('**')) out.push(<strong key={key}>{tok.slice(2, -2)}</strong>);
    else if (tok.startsWith('*')) out.push(<em key={key}>{tok.slice(1, -1)}</em>);
    else {
      const lm = tok.match(/^\[([^\]]+)\]\(([^)\s]+)\)$/)!;
      const href = lm[2];
      const safe = /^(https?:|mailto:|tel:|\/|#)/i.test(href) ? href : '#';
      const external = /^https?:/i.test(safe);
      out.push(
        <a key={key} href={safe} className="lnk" {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>
          {lm[1]}
        </a>
      );
    }
    last = m.index + tok.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function Markdown({ source, className }: { source: string; className?: string }) {
  const blocks: React.ReactNode[] = [];
  const lines = source.replace(/\r\n/g, '\n').split('\n');
  let i = 0;
  let k = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
      continue;
    }
    const h = line.match(/^(#{2,3})\s+(.*)$/);
    if (h) {
      const Tag = h[1].length === 2 ? 'h2' : 'h3';
      blocks.push(<Tag key={k++} className="md-h">{inline(h[2], `h${k}`)}</Tag>);
      i++;
      continue;
    }
    if (/^>\s?/.test(line)) {
      const q: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) q.push(lines[i++].replace(/^>\s?/, ''));
      blocks.push(<blockquote key={k++} className="md-quote">{inline(q.join(' '), `q${k}`)}</blockquote>);
      continue;
    }
    if (/^(-|\*|\d+\.)\s+/.test(line)) {
      const ordered = /^\d+\./.test(line);
      const items: string[] = [];
      while (i < lines.length && /^(-|\*|\d+\.)\s+/.test(lines[i])) items.push(lines[i++].replace(/^(-|\*|\d+\.)\s+/, ''));
      const List = ordered ? 'ol' : 'ul';
      blocks.push(
        <List key={k++} className="md-list">
          {items.map((it, j) => (
            <li key={j}>{inline(it, `l${k}-${j}`)}</li>
          ))}
        </List>
      );
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && !/^(#{2,3}\s|>|(-|\*|\d+\.)\s)/.test(lines[i])) para.push(lines[i++]);
    blocks.push(
      <p key={k++}>
        {para.map((p, j) => (
          <React.Fragment key={j}>
            {j > 0 && <br />}
            {inline(p, `p${k}-${j}`)}
          </React.Fragment>
        ))}
      </p>
    );
  }
  return <div className={className ? `md ${className}` : 'md'}>{blocks}</div>;
}
