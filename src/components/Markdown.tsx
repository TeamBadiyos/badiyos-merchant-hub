/** Minimal, dependency-free markdown renderer for legal documents. */

function inline(text: string, keyPrefix: string) {
  const nodes: React.ReactNode[] = [];
  const regex = /\*\*(.+?)\*\*|\*(.+?)\*|\[(.+?)\]\((.+?)\)/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let i = 0;
  while ((match = regex.exec(text))) {
    if (match.index > last) nodes.push(text.slice(last, match.index));
    const key = `${keyPrefix}-i${i++}`;
    if (match[1]) nodes.push(<strong key={key}>{match[1]}</strong>);
    else if (match[2]) nodes.push(<em key={key}>{match[2]}</em>);
    else if (match[3])
      nodes.push(
        <a
          key={key}
          href={match[4] ?? "#"}
          target="_blank"
          rel="noreferrer"
          className="font-semibold text-primary underline"
        >
          {match[3]}
        </a>,
      );
    last = match.index + match[0].length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

export function Markdown({ content }: { content: string }) {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const blocks: React.ReactNode[] = [];
  let list: string[] = [];

  const flushList = (key: string) => {
    if (!list.length) return;
    blocks.push(
      <ul key={key} className="ml-5 list-disc space-y-2 text-sm leading-relaxed text-foreground">
        {list.map((item, idx) => (
          <li key={idx}>{inline(item, `${key}-${idx}`)}</li>
        ))}
      </ul>,
    );
    list = [];
  };

  lines.forEach((raw, index) => {
    const line = raw.trim();
    const key = `b${index}`;
    if (!line) {
      flushList(`${key}-l`);
      return;
    }
    const bullet = /^[-*+]\s+(.*)$/.exec(line);
    if (bullet) {
      list.push(bullet[1] ?? "");
      return;
    }
    flushList(`${key}-l`);
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      const level = (heading[1] ?? "#").length;
      const text = inline(heading[2] ?? "", key);
      if (level <= 1)
        blocks.push(
          <h2 key={key} className="mt-6 text-lg font-extrabold text-foreground">
            {text}
          </h2>,
        );
      else if (level === 2)
        blocks.push(
          <h3 key={key} className="mt-5 text-base font-bold text-foreground">
            {text}
          </h3>,
        );
      else
        blocks.push(
          <h4 key={key} className="mt-4 text-sm font-bold text-foreground">
            {text}
          </h4>,
        );
      return;
    }
    const numbered = /^(\d+)[.)]\s+(.*)$/.exec(line);
    if (numbered) {
      blocks.push(
        <p key={key} className="flex gap-2 text-sm leading-relaxed text-foreground">
          <span className="num font-bold text-primary">{numbered[1]}.</span>
          <span>{inline(numbered[2] ?? "", key)}</span>
        </p>,
      );
      return;
    }
    if (/^([-*_])\1{2,}$/.test(line)) {
      blocks.push(<div key={key} className="my-4 h-px bg-border" />);
      return;
    }
    blocks.push(
      <p key={key} className="text-sm leading-relaxed text-foreground">
        {inline(line, key)}
      </p>,
    );
  });
  flushList("tail");

  return <div className="space-y-3">{blocks}</div>;
}