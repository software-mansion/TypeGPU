import cs from 'classnames';
import { Button } from './design/Button.tsx';
import { ExamplePreviewLoading } from './ExamplePreviewLoading.tsx';
import { BrowseExamplesButton, StackBlitzButton } from './ExampleStaticButtons.tsx';

function SkeletonBlock({ className }: { className?: string }) {
  return (
    <div
      className={cs(
        'animate-pulse bg-gradient-to-r from-tameplum-100/50 to-accent-200/50 motion-reduce:animate-none dark:from-white/5 dark:to-accent-200/5',
        className,
      )}
      aria-hidden="true"
    />
  );
}

export function ExamplePageSkeleton() {
  return (
    <div
      className="mx-auto box-border flex min-h-[38rem] w-full max-w-5xl flex-col gap-4 md:px-8"
      role="status"
      aria-label="Loading example"
    >
      <span className="sr-only">Loading example</span>

      <div className="self-start min-[1025px]:hidden" inert aria-hidden="true">
        <BrowseExamplesButton />
      </div>

      <div className="@container/example-preview flex flex-col gap-4">
        <div className="flex flex-col gap-4 @3xl/example-preview:h-[calc(100cqw_-_19rem)] @3xl/example-preview:flex-row">
          <div className="border-tameplum-100 dark:border-white/10 dark:bg-[#171a25] relative aspect-square w-full flex-1 overflow-hidden border bg-white">
            <ExamplePreviewLoading announce={false} />
          </div>

          <div className="flex w-full shrink-0 flex-col gap-2 @3xl/example-preview:h-full @3xl/example-preview:w-72">
            <div className="border-tameplum-100 dark:border-white/10 dark:bg-[#272b3c] box-border flex max-h-[100cqw] min-h-0 w-full flex-1 flex-col gap-2 border bg-white @3xl/example-preview:max-h-none @3xl/example-preview:shrink-0">
              <div className="flex items-center justify-between gap-3 px-4 pt-4">
                <h2 className="m-0 text-xl font-medium">Control panel</h2>
              </div>
              <div className="relative grid min-h-0 grid-cols-[minmax(0,0.3fr)_minmax(0,0.7fr)] flex-1 content-start items-start gap-3 overflow-auto px-4 pt-1 pb-4">
                <div className="col-span-2 grid" inert aria-hidden="true">
                  <Button>Open fullscreen</Button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="grid gap-4 pt-4 pb-8 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
          <div className="flex min-w-0 flex-col gap-4">
            <SkeletonBlock className="h-9 w-2/3 max-w-80" />
            <div className="flex flex-col gap-2">
              <SkeletonBlock className="h-3 w-full max-w-2xl" />
              <SkeletonBlock className="h-3 w-5/6 max-w-xl" />
            </div>
            <div className="flex gap-2">
              <SkeletonBlock className="h-6 w-20" />
              <SkeletonBlock className="h-6 w-24" />
              <SkeletonBlock className="h-6 w-16" />
            </div>
          </div>
          <div className="flex shrink-0 flex-col gap-2" inert aria-hidden="true">
            <StackBlitzButton />
          </div>
        </div>

        <div className="border-tameplum-100 dark:border-white/10 overflow-hidden border">
          <div className="border-tameplum-100 bg-tameplum-100 dark:border-white/10 dark:bg-[#1b1f2c] flex h-10 items-center gap-4 border-b px-4">
            <SkeletonBlock className="h-3 w-20" />
            <SkeletonBlock className="h-3 w-16" />
            <SkeletonBlock className="h-3 w-24" />
          </div>
          <div className="dark:bg-[#171a25] flex h-[32rem] flex-col gap-3 bg-white px-5 py-6">
            {[
              'w-[72%]',
              'w-[54%]',
              'w-[84%]',
              'w-[63%]',
              'w-[46%]',
              'w-[76%]',
              'w-[58%]',
              'w-[38%]',
            ].map((widthClass) => (
              <SkeletonBlock key={widthClass} className={`h-2.5 max-w-full ${widthClass}`} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
