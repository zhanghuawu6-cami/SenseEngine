import { Fragment } from "react";

export function RichText({ value }: { value: string }) {
  const blocks = value.split(/\n{2,}/).filter(Boolean);
  return (
    <div className="rich-text">
      {blocks.map((block, index) => {
        if (block.startsWith("## ")) return <h2 key={index}>{block.slice(3)}</h2>;
        if (block.startsWith("### ")) return <h3 key={index}>{block.slice(4)}</h3>;
        const lines = block.split("\n");
        if (lines.every((line) => line.startsWith("- "))) {
          return <ul key={index}>{lines.map((line) => <li key={line}>{line.slice(2)}</li>)}</ul>;
        }
        return <p key={index}>{lines.map((line, lineIndex) => <Fragment key={lineIndex}>{line}{lineIndex < lines.length - 1 && <br />}</Fragment>)}</p>;
      })}
    </div>
  );
}
