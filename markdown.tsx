import {useEffect, useId, useMemo, useRef, type MouseEvent} from 'react';
import {OverlayScrollArea, prefersReducedMotion} from 'loom-frame/ui';
import DOMPurify from 'dompurify';
import hljs from 'highlight.js/lib/core';
import bash from 'highlight.js/lib/languages/bash';
import csharp from 'highlight.js/lib/languages/csharp';
import javascript from 'highlight.js/lib/languages/javascript';
import json from 'highlight.js/lib/languages/json';
import powershell from 'highlight.js/lib/languages/powershell';
import python from 'highlight.js/lib/languages/python';
import typescript from 'highlight.js/lib/languages/typescript';
import xml from 'highlight.js/lib/languages/xml';
import MarkdownIt from 'markdown-it';
import anchor from 'markdown-it-anchor';
import footnote from 'markdown-it-footnote';
import './markdown.css';

for (const [language, definition] of Object.entries({
  bash, csharp, javascript, json, powershell, python, typescript, xml,
})) {
  hljs.registerLanguage(language, definition);
}

const imagePath = /\.(?:avif|png|jpe?g|gif|webp|svg|ico|bmp)(?:[?#][^\r\n]*)?$/i;
const localFile = /\.[a-z\d]+(?:[?#].*)?$/i;
const directWebUrl = /^https?:\/\//i;
const rasterDataUrl = /^data:image\/(?:png|jpeg|gif|webp|avif);base64,[a-z0-9+/=]+$/i;

function webUrl(value: string, base?: string): string | undefined {
  try {
    const url = new URL(value.replaceAll('\\', '/'), base);
    if (url.protocol === 'http:' || url.protocol === 'https:') return url.href;
  } catch {
    return undefined;
  }
}

const markdown = new MarkdownIt({html: true, linkify: false, typographer: true})
  .use(anchor, {level: [1, 2, 3, 4, 5, 6]})
  .use(footnote);

function imageMarkup(value: string) {
  const path = value.trim();
  if (!imagePath.test(path) || /[\r\n<>]/.test(path)) return;
  const src = markdown.utils.escapeHtml(path.replaceAll('\\', '/'));
  return '<img src="' + src + '" alt="" loading="lazy">';
}

const renderInlineCode = markdown.renderer.rules.code_inline!;
markdown.renderer.rules.code_inline = (tokens, index, options, env, renderer) =>
  imageMarkup(tokens[index].content) ?? renderInlineCode(tokens, index, options, env, renderer);

markdown.renderer.rules.fence = (tokens, index) => {
  const token = tokens[index];
  const language = token.info.trim().split(/\s+/, 1)[0].toLowerCase();
  const text = markdown.utils.escapeHtml(token.content);
  if (!language) {
    const image = imageMarkup(token.content);
    if (image) return '<p>' + image + '</p>\n';
  }
  if (language === 'mermaid') {
    return '<div class="bgi-markdown-diagram" data-bgi-diagram><div class="bgi-diagram-output"></div>' +
      '<pre><code>' + text + '</code></pre></div>\n';
  }
  if (!language || !hljs.getLanguage(language)) return '<pre><code>' + text + '</code></pre>\n';
  try {
    return '<pre><code class="hljs">' +
      hljs.highlight(token.content, {language, ignoreIllegals: true}).value + '</code></pre>\n';
  } catch {
    return '<pre><code>' + text + '</code></pre>\n';
  }
};

markdown.renderer.rules.table_open = () => '<div class="bgi-markdown-table"><table>\n';
markdown.renderer.rules.table_close = () => '</table></div>\n';
markdown.core.ruler.push('bettergi_table_alignment', ({tokens}) => {
  for (const token of tokens) {
    if (token.type !== 'th_open' && token.type !== 'td_open') continue;
    const align = token.attrGet('style')?.match(/^text-align:(left|center|right)$/)?.[1];
    if (align) token.attrSet('align', align);
  }
});

const classNames = /^(?:hljs(?:-[\w-]+)?|footnote[\w-]*|bgi-markdown-(?:table|diagram)|bgi-diagram-output)$/;
const htmlTags = [
  'a', 'b', 'blockquote', 'br', 'caption', 'code', 'del', 'details', 'div', 'em', 'figcaption',
  'figure', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hr', 'i', 'img', 'kbd', 'li', 'mark', 'ol',
  'p', 'pre', 's', 'section', 'small', 'span', 'strong', 'sub', 'summary', 'sup', 'table', 'tbody',
  'td', 'tfoot', 'th', 'thead', 'tr', 'u', 'ul',
];

function renderDocument(source: string, scope: string, baseUrl?: string) {
  const base = baseUrl ? webUrl(baseUrl, window.document.baseURI) : undefined;
  const fragment = DOMPurify.sanitize(markdown.render(source), {
    ALLOWED_TAGS: htmlTags,
    ALLOWED_ATTR: [
      'align', 'alt', 'class', 'colspan', 'data-bgi-diagram', 'height', 'href', 'id', 'loading', 'open',
      'rowspan', 'scope', 'src', 'start', 'tabindex', 'title', 'width',
    ],
    ALLOW_DATA_ATTR: false,
    RETURN_DOM_FRAGMENT: true,
    SANITIZE_NAMED_PROPS: true,
  });

  for (const element of fragment.querySelectorAll('[class]')) {
    element.className = [...element.classList].filter(name => classNames.test(name)).join(' ');
  }
  const targets = new Map<string, string>();
  for (const target of fragment.querySelectorAll<HTMLElement>('[id]')) {
    const original = target.id.replace(/^user-content-/, '');
    target.id = scope + '-' + original;
    if (!targets.has(original)) targets.set(original, target.id);
  }
  for (const link of fragment.querySelectorAll<HTMLAnchorElement>('a[href]')) {
    const href = link.getAttribute('href')!.trim();
    if (href.startsWith('#')) {
      const key = href.slice(1);
      if (targets.has(key)) {
        link.setAttribute('href', '#' + targets.get(key));
      } else {
        link.removeAttribute('href');
        link.className = 'bgi-markdown-text-link';
      }
      continue;
    }
    const external = directWebUrl.test(href) || href.startsWith('//');
    const resolved = external ? webUrl(href, document.baseURI) :
      base && (!localFile.test(href) || imagePath.test(href)) ? webUrl(href, base) : undefined;
    if (resolved) {
      link.href = resolved;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      if (!external) link.classList.add('bgi-markdown-relative-link');
    } else if (!/^(?:mailto|tel):/i.test(href)) {
      link.removeAttribute('href');
      link.className = 'bgi-markdown-text-link';
    }
  }
  for (const img of fragment.querySelectorAll<HTMLImageElement>('img[src]')) {
    const source = img.getAttribute('src')!;
    const resolved = rasterDataUrl.test(source) ? source : webUrl(source, base ?? document.baseURI);
    if (resolved) img.src = resolved; else img.removeAttribute('src');
    img.loading = 'lazy';
    img.decoding = 'async';
  }

  const container = document.createElement('div');
  container.append(fragment);
  return container.innerHTML;
}

let diagramSequence = 0;

export function MarkdownView({source, baseUrl, mode = 'light'}: {
  source: string; baseUrl?: string; mode?: 'light' | 'dark';
}) {
  const article = useRef<HTMLElement>(null);
  const scope = 'bgi-md-' + useId().replace(/[^a-z\d_-]/gi, '');
  const html = useMemo(() => renderDocument(source, scope, baseUrl), [source, scope, baseUrl]);

  useEffect(() => {
    const root = article.current;
    const diagrams = Array.from(root?.querySelectorAll<HTMLElement>('.bgi-markdown-diagram[data-bgi-diagram]') ?? []);
    if (!diagrams.length) return;
    let active = true;

    async function renderDiagrams() {
      const {default: mermaid} = await import('mermaid');
      if (!active) return;
      mermaid.initialize({
        startOnLoad: false, securityLevel: 'strict', htmlLabels: false,
        theme: mode === 'dark' ? 'dark' : 'neutral',
        flowchart: {useMaxWidth: true}, sequence: {useMaxWidth: true},
      });
      for (const diagram of diagrams) {
        if (!active) return;
        const code = diagram.querySelector('pre code')?.textContent;
        const destination = diagram.querySelector('.bgi-diagram-output');
        if (!code || !destination) continue;
        try {
          const {svg} = await mermaid.render(scope + '-diagram-' + ++diagramSequence, code);
          if (!active || !diagram.isConnected) return;
          const image = DOMPurify.sanitize(svg, {
            USE_PROFILES: {svg: true, svgFilters: true},
            FORBID_TAGS: ['a', 'foreignObject', 'style'],
            FORBID_ATTR: ['style'],
            RETURN_DOM_FRAGMENT: true,
          });
          if (!image.querySelector('svg')) continue;
          destination.replaceChildren(image);
          diagram.dataset.rendered = 'true';
        } catch {
          // The original code block stays readable when a diagram cannot be rendered.
        }
      }
    }
    void renderDiagrams().catch(() => {});
    return () => { active = false; };
  }, [html, mode, scope]);

  const viewport = useRef<HTMLDivElement>(null);

  function followAnchor(event: MouseEvent<HTMLElement>) {
    const link = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>('a[href^="#"]') : null;
    const reader = viewport.current;
    if (!link || !reader || !event.currentTarget.contains(link)) return;
    event.preventDefault();
    const target = event.currentTarget.querySelector<HTMLElement>('#' + CSS.escape(link.getAttribute('href')!.slice(1)));
    if (!target) return;
    target.tabIndex = -1;
    target.focus({preventScroll: true});
    const distance = target.getBoundingClientRect().top - reader.getBoundingClientRect().top;
    reader.scrollBy({top: distance - 10, behavior: prefersReducedMotion() ? 'instant' : 'smooth'});
  }

  return <OverlayScrollArea areaClassName="bgi-markdown-scroll" viewportRef={viewport} viewportProps={{tabIndex: 0}}>
    <article className="bgi-markdown" ref={article} aria-label="Markdown 文档"
      onClick={followAnchor} dangerouslySetInnerHTML={{__html: html}}/>
  </OverlayScrollArea>;
}
