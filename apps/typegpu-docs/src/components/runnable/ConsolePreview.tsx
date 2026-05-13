import { useEffect, useRef } from 'react';

type ConsolePreviewProps = {
  output: string;
  placeholder?: string;
};

export function ConsolePreview({ output, placeholder = 'Console output' }: ConsolePreviewProps) {
  const preRef = useRef<HTMLPreElement | null>(null);

  useEffect(() => {
    if (preRef.current) {
      preRef.current.scrollTop = preRef.current.scrollHeight;
    }
  }, [output]);

  return (
    <pre
      aria-label="Console output"
      aria-readonly="true"
      className="m-0 min-w-0 whitespace-pre-wrap break-words font-mono text-xs leading-5 text-[var(--sl-color-text)] focus:outline-none"
      ref={preRef}
      role="textbox"
      tabIndex={0}
    >
      {output || <span className="text-[var(--sl-color-gray-3)]">{placeholder}</span>}
    </pre>
  );
}
