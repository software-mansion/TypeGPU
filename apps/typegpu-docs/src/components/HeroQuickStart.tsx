import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';

const options = [
  {
    label: 'CLI',
    text: 'npx typegpu@latest',
  },
  {
    label: 'Skills',
    text: 'npx skills add software-mansion-labs/skills -s typegpu',
  },
  {
    label: 'Prompt',
    text: 'Help me build with TypeGPU, a low-level TypeScript toolkit for working with WebGPU that lets you write shaders in TypeScript. It can be used for 2D/3D graphics, local AI inference with custom kernels, and simulation. Use the official typegpu skill: https://github.com/software-mansion-labs/skills/tree/main/skills/typegpu. Install it with `npx skills add software-mansion-labs/skills -s typegpu`.',
  },
];

export default function HeroQuickStart() {
  const id = useId();
  const [activeTab, setActiveTab] = useState(0);
  const [status, setStatus] = useState('');
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(resetTimer.current), []);

  const selectTab = (index: number) => {
    setActiveTab(index);
    setStatus('');
    clearTimeout(resetTimer.current);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let next = index;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown')
      next = (index + 1) % options.length;
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp')
      next = (index + options.length - 1) % options.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = options.length - 1;
    else return;
    event.preventDefault();
    selectTab(next);
    tabs.current[next]?.focus();
  };

  const copy = async (text: string) => {
    clearTimeout(resetTimer.current);
    try {
      await navigator.clipboard.writeText(text);
      setStatus('Copied to clipboard');
    } catch {
      setStatus('Couldn’t copy. Select the text and copy it manually.');
    }
    resetTimer.current = setTimeout(() => setStatus(''), 4000);
  };

  return (
    <div className="relative block w-full min-w-0 max-w-120 text-sm leading-[inherit]">
      <div className="group/quick-start border border-solid border-current/20 bg-white/90 dark:bg-navy-bg/94">
        <div className="flex items-stretch justify-between border-b border-solid border-current/12">
          <div className="flex gap-0 px-1.5" role="tablist" aria-label="Get started with TypeGPU">
            {options.map((option, index) => (
              <button
                key={option.label}
                ref={(element) => {
                  tabs.current[index] = element;
                }}
                type="button"
                className="cursor-pointer border-0 border-b-2 border-solid border-transparent bg-transparent px-2.5 py-3 text-inherit opacity-60 [font:inherit] aria-selected:border-current aria-selected:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-solid focus-visible:outline-current"
                role="tab"
                id={`${id}-tab-${index}`}
                aria-controls={`${id}-panel-${index}`}
                aria-selected={index === activeTab}
                tabIndex={index === activeTab ? 0 : -1}
                onClick={() => selectTab(index)}
                onKeyDown={(event) => handleKeyDown(event, index)}
              >
                {option.label}
              </button>
            ))}
          </div>
          <a
            className="ml-auto flex shrink-0 items-center gap-2 border-l border-solid border-current/12 p-3 text-sm leading-[inherit] text-inherit no-underline hover:bg-current/6 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-solid focus-visible:outline-current"
            href="/TypeGPU/getting-started"
          >
            Get started <span aria-hidden="true">→</span>
          </a>
        </div>
        {options.map((option, index) => (
          <div
            key={option.label}
            role="tabpanel"
            className="p-4"
            id={`${id}-panel-${index}`}
            aria-labelledby={`${id}-tab-${index}`}
            hidden={index !== activeTab}
            tabIndex={0}
          >
            <div className="relative pr-8">
              <code
                className={`block truncate bg-transparent text-sm leading-[1.6] text-inherit select-text ${option.label === 'Prompt' ? 'font-[inherit]' : ''}`}
                title={option.text}
              >
                {option.text}
              </code>
              <button
                type="button"
                className="absolute -top-1 -right-1 grid size-8 cursor-pointer place-items-center border border-solid border-current/25 bg-transparent text-inherit opacity-0 transition-opacity duration-120 ease-[ease] group-hover/quick-start:opacity-100 group-focus-within/quick-start:opacity-100 hover:bg-current/10 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-solid focus-visible:outline-current motion-reduce:transition-none [@media(hover:none)]:opacity-100"
                aria-label={`Copy ${option.label.toLowerCase()}`}
                onClick={() => void copy(option.text)}
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  aria-hidden="true"
                >
                  <rect x="8" y="8" width="12" height="12" rx="2" />
                  <path d="M16 8V4H4v12h4" />
                </svg>
              </button>
            </div>
          </div>
        ))}
      </div>
      <span
        className="absolute top-[calc(100%+0.35rem)] left-0 text-xs leading-[inherit]"
        role="status"
        aria-live="polite"
      >
        {status}
      </span>
    </div>
  );
}
