import ReactMarkdown from 'react-markdown';
import { linkifyArticles } from '../lib/answer';

// Renders an AI answer. Article references (e.g. "Article 21") become buttons that open the official text.
export const Answer = ({ text, onArticle, invert = false }: { text: string; onArticle?: (refKey: string) => void; invert?: boolean }) => (
  <div className={`md ${invert ? 'md-invert' : ''}`}>
    <ReactMarkdown
      components={{
        a: ({ href, children }) =>
          href?.startsWith('#coi-') ? (
            <button type="button" className="article-link" onClick={() => onArticle?.(`coi:${href.slice(5)}`)} title="Read the official text">
              {children}
            </button>
          ) : (
            <a href={href} target="_blank" rel="noreferrer">{children}</a>
          ),
      }}
    >
      {onArticle ? linkifyArticles(text) : text}
    </ReactMarkdown>
  </div>
);
