export function ExamplePreviewLoading({ announce = true }: { announce?: boolean }) {
  return (
    <div
      className="absolute inset-0 z-10 grid place-items-center bg-white/88 backdrop-blur-sm dark:bg-[#171a25]/90"
      role={announce ? 'status' : undefined}
      aria-live={announce ? 'polite' : undefined}
      aria-hidden={announce ? undefined : true}
    >
      <div className="relative grid size-14 place-items-center">
        <span className="absolute inset-0 animate-ping rounded-full bg-accent-600/10 motion-reduce:animate-none" />
        <span className="size-9 animate-spin rounded-full border-[3px] border-accent-600/20 border-t-accent-600 motion-reduce:animate-none dark:border-accent-200/20 dark:border-t-accent-200" />
      </div>
    </div>
  );
}
