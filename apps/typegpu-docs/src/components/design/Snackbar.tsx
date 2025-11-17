export function Snackbar(props: { text: string }) {
  const { text } = props;

  return (
    <div
      className="absolute right-8 bottom-8 z-40 box-border flex max-w-[min(28rem,calc(100vw-4rem))] items-center gap-4 rounded-lg bg-red-100 p-4 text-gray-500"
      role="alert"
    >
      <div className="inline-flex h-8 w-8 shrink-0 items-center justify-center text-red-500">
        <svg
          className="h-5 w-5"
          aria-hidden="true"
          xmlns="http://www.w3.org/2000/svg"
          fill="currentColor"
          viewBox="0 0 20 20"
        >
          <path d="M10 .5a9.5 9.5 0 1 0 9.5 9.5A9.51 9.51 0 0 0 10 .5Zm3.707 11.793a1 1 0 1 1-1.414 1.414L10 11.414l-2.293 2.293a1 1 0 0 1-1.414-1.414L8.586 10 6.293 7.707a1 1 0 0 1 1.414-1.414L10 8.586l2.293-2.293a1 1 0 0 1 1.414 1.414L11.414 10l2.293 2.293Z" />
        </svg>
        <span className="sr-only">Error icon</span>
      </div>

      <div className="overflow-auto text-gray-600 text-sm">{text}</div>
    </div>
  );
}
