import cs from 'classnames';
import { type KeyboardEvent, useEffect, useRef, useState } from 'react';
import { SLIDE_CHANGE_EVENT } from '../plums/events.ts';
import type { ShowcaseProject } from './projects.ts';

/** A project with its image already processed into the banner and thumbnail sizes */
export type CarouselProject = Omit<ShowcaseProject, 'image'> & {
  bannerSrc?: string | undefined;
  bannerSrcSet?: string | undefined;
  thumbnailSrc?: string | undefined;
};

/** How wide the banner is drawn, at most around 550px next to the details */
const BANNER_SIZES = '(min-width: 768px) 550px, 100vw';

const bannerFitClass = (project: CarouselProject) =>
  project.bannerFit === 'contain' ? 'object-contain' : 'object-cover';

interface Props {
  categoryKey: string;
  projects: CarouselProject[];
  intervalMs?: number;
}

function GeneratedCover({ name, compact }: { name: string; compact?: boolean }) {
  return (
    <div className="from-gradient-blue via-gradient-purple relative flex size-full items-center justify-center overflow-hidden bg-gradient-to-tl to-[#f8f7dd]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.35),transparent_60%)]" />
      <span
        className={cs(
          'relative px-2 text-center leading-tight font-bold text-white drop-shadow-sm',
          compact ? 'pb-4 text-4xl' : 'text-4xl md:text-6xl',
        )}
      >
        {/* Thumbnails already carry a name label */}
        {compact ? name.charAt(0) : name}
      </span>
    </div>
  );
}

function ExternalIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function ShowcaseCarousel({ categoryKey, projects, intervalMs = 7000 }: Props) {
  const [activeIndex, setActiveIndex] = useState(0);
  // Kept around, so it can fade out under the new one
  const [previousIndex, setPreviousIndex] = useState<number | null>(null);
  // Hovering or focusing pauses the cycle, and it picks up from the chosen project once that
  // ends. Only a preference for reduced motion stops it.
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [stopped, setStopped] = useState(false);
  const [inView, setInView] = useState(false);

  const rootRef = useRef<HTMLDivElement>(null);
  const thumbRowRef = useRef<HTMLDivElement>(null);
  const thumbRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const autoplay = projects.length > 1 && !stopped;
  const paused = hovered || focused || !inView;
  const active = projects[activeIndex];

  useEffect(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setStopped(true);
    }
  }, []);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const observer = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), {
      threshold: 0.4,
    });
    observer.observe(root);
    return () => observer.disconnect();
  }, []);

  // Keeping the active thumbnail visible in the grid when it scrolls, without scrolling the page
  useEffect(() => {
    const grid = thumbRowRef.current;
    const thumb = thumbRefs.current[activeIndex];
    if (!grid || !thumb) return;
    const top = thumb.offsetTop - (grid.clientHeight - thumb.offsetHeight) / 2;
    grid.scrollTo({ top, behavior: 'smooth' });
  }, [activeIndex]);

  const select = (index: number) => {
    if (index === activeIndex) return;
    setPreviousIndex(activeIndex);
    setActiveIndex(index);
    // Letting the mascots know, so they can react to the new project
    window.dispatchEvent(new CustomEvent(SLIDE_CHANGE_EVENT));
  };

  const nextIndex = (activeIndex + 1) % projects.length;
  const advance = () => select(nextIndex);

  const onThumbKeyDown = (e: KeyboardEvent) => {
    const delta =
      e.key === 'ArrowRight' || e.key === 'ArrowDown'
        ? 1
        : e.key === 'ArrowLeft' || e.key === 'ArrowUp'
          ? -1
          : 0;
    if (delta === 0) return;
    e.preventDefault();
    const next = (activeIndex + delta + projects.length) % projects.length;
    select(next);
    thumbRefs.current[next]?.focus();
  };

  if (!active) return null;

  const panelId = `showcase-${categoryKey}-panel`;

  return (
    <div
      ref={rootRef}
      className="@container flex flex-col gap-4"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      // Only keyboard focus pauses, a clicked thumbnail keeps focus after the pointer leaves
      onFocus={(e) => setFocused(e.target.matches(':focus-visible'))}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setFocused(false);
      }}
    >
      {/* The banner and the details, side by side on large screens */}
      <div
        data-plums-card
        className="dark:bg-off-navy flex flex-col overflow-hidden border border-[#2a0a6629] bg-white md:flex-row dark:border-white/8"
      >
        {/* Banner, all slides are stacked so they can cross-fade. Only the current one, the one
          fading out and the next one (to preload it) have their media loaded. It keeps its
          aspect ratio, unless the details are taller, then it stretches to match them. */}
        <a
          data-plums-banner
          href={active.links[0]?.href}
          target="_blank"
          rel="noreferrer"
          tabIndex={-1}
          aria-hidden="true"
          className="relative block aspect-video shrink-0 overflow-hidden bg-[#0b0d14] md:w-3/5"
        >
          {projects.map((project, i) => {
            const isActive = i === activeIndex;
            const loaded = isActive || i === previousIndex || i === nextIndex;
            return (
              <div
                key={project.key}
                className={cs(
                  'absolute inset-0 transition-opacity duration-700 ease-out',
                  isActive ? 'opacity-100' : 'opacity-0',
                )}
              >
                {!loaded ? null : project.video && isActive ? (
                  <video
                    src={project.video}
                    poster={project.bannerSrc}
                    className={cs('size-full', bannerFitClass(project))}
                    autoPlay
                    muted
                    loop
                    playsInline
                  />
                ) : project.bannerSrc ? (
                  <img
                    src={project.bannerSrc}
                    srcSet={project.bannerSrcSet}
                    sizes={BANNER_SIZES}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    className={cs('size-full', bannerFitClass(project))}
                  />
                ) : (
                  <GeneratedCover name={project.name} />
                )}
              </div>
            );
          })}
        </a>

        {/* All slides share one grid cell, so the card keeps the height of the longest one */}
        <div
          id={panelId}
          role="tabpanel"
          aria-roledescription="slide"
          aria-label={`${activeIndex + 1} of ${projects.length}: ${active.name}`}
          className="grid grow"
        >
          {projects.map((project, i) => {
            const isActive = i === activeIndex;
            const [primaryLink, ...secondaryLinks] = project.links;
            return (
              <div
                key={project.key}
                aria-hidden={!isActive}
                inert={!isActive}
                className={cs(
                  'flex flex-col gap-4 p-6 transition-opacity duration-500 ease-out [grid-area:1/1] lg:p-8',
                  isActive ? 'opacity-100' : 'invisible opacity-0',
                )}
              >
                <div className="flex flex-col gap-1">
                  <h3 className="text-navy-100 dark:text-almost-white m-0 text-2xl leading-tight font-medium lg:text-3xl">
                    {project.name}
                  </h3>
                  <span className="text-navy-80 text-base dark:text-gray-300">
                    by {project.author}
                  </span>
                </div>
                <p className="text-navy-100 dark:text-almost-white m-0 max-w-[48rem] text-base leading-relaxed text-pretty lg:text-lg">
                  {project.description}
                </p>
                {/* The main link as a button, with the rest in a row of their own below it */}
                <div className="mt-auto flex flex-col items-start gap-4 pt-2">
                  {primaryLink && (
                    <a
                      href={primaryLink.href}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-2 bg-gray-950 px-4 py-2.5 text-base font-medium text-white no-underline transition-colors hover:bg-gray-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current dark:bg-white dark:text-gray-950 dark:hover:bg-gray-200"
                    >
                      {primaryLink.label}
                      <ExternalIcon />
                    </a>
                  )}
                  {secondaryLinks.length > 0 && (
                    <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
                      {secondaryLinks.map((link) => (
                        <a
                          key={link.href}
                          href={link.href}
                          target="_blank"
                          rel="noreferrer"
                          className="text-navy-80 hover:text-gray-950 dark:hover:text-white inline-flex items-center gap-1.5 text-base font-medium underline-offset-4 hover:underline dark:text-gray-200"
                        >
                          {link.label}
                          <ExternalIcon />
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Thumbnails */}
      <div
        ref={thumbRowRef}
        role="tablist"
        aria-label="Projects"
        // As many columns as fit at roughly 100 to 120px each, filling the full width, picked
        // by the width of the carousel. Past three rows, the grid scrolls.
        className="relative grid grid-cols-[repeat(var(--cols),minmax(0,1fr))] gap-3 overflow-y-auto [--cols:3] [scrollbar-width:thin] @sm:[--cols:4] @md:[--cols:5] @xl:[--cols:6] @3xl:[--cols:7] @4xl:[--cols:8]"
        style={{
          // Three square cells and the two gaps between them, the cells being a column wide
          maxHeight: 'calc((100cqw - (var(--cols) - 1) * 0.75rem) / var(--cols) * 3 + 1.5rem)',
        }}
      >
        {projects.map((project, i) => {
          const isActive = i === activeIndex;
          return (
            <button
              key={project.key}
              ref={(el) => {
                thumbRefs.current[i] = el;
              }}
              type="button"
              role="tab"
              aria-selected={isActive}
              aria-controls={panelId}
              aria-label={project.name}
              // Long names are cut off in the label, so they're shown whole on hover
              title={project.name}
              tabIndex={isActive ? 0 : -1}
              onClick={() => select(i)}
              onKeyDown={onThumbKeyDown}
              className={cs(
                'group relative aspect-square w-full cursor-pointer overflow-hidden border-0 bg-transparent p-0 transition-opacity',
                'focus-visible:outline-gray-950 dark:focus-visible:outline-white focus-visible:outline-2 focus-visible:-outline-offset-2',
                isActive ? 'opacity-100' : 'opacity-60 hover:opacity-100',
              )}
            >
              {project.thumbnailSrc ? (
                <img
                  src={project.thumbnailSrc}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  className="size-full object-cover transition-transform duration-300 group-hover:scale-105"
                />
              ) : (
                <GeneratedCover name={project.name} compact />
              )}
              <span className="absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/70 to-transparent px-2 pt-4 pb-1.5 text-left text-xs leading-tight font-medium text-white">
                {project.name}
              </span>
              <span
                className={cs(
                  'pointer-events-none absolute inset-0 border-2 transition-colors',
                  isActive ? 'border-gray-950 dark:border-white' : 'border-transparent',
                )}
              />
              {/* Progress of the auto-cycle, finishing it moves on to the next project */}
              {isActive && autoplay && (
                <span
                  key={`${project.key}-${activeIndex}`}
                  className="showcase-progress absolute inset-x-0 top-0 h-1 origin-left bg-gray-950 dark:bg-white"
                  style={{
                    animationDuration: `${intervalMs}ms`,
                    animationPlayState: paused ? 'paused' : 'running',
                  }}
                  onAnimationEnd={advance}
                />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
