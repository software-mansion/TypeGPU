import wigsillPlums from './assets/wigsill-plums.svg';

export function Home() {
  return (
    <>
      <main className="px-[6vw] min-h-[60vh] flex justify-evenly items-center bg-gradient-to-br from-[#f6f6ff] to-white">
        <aside className="flex-shrink-0 max-w-[60rem]">
          <h1 className="font-outfit py-5 text-[max(3rem,min(3vw,6rem))]">
            Welcome to <strong>wigsill</strong>
          </h1>
          <p className="font-inter text-[max(1rem,min(1vw,2rem))]">
            Supercharge your WebGPU & WGSL with zero-cost abstractions,
            <br />
            type-safe data transfer and dependency injection.
          </p>
        </aside>
        <div className="pl-6 py-4 w-[35rem] hidden xl:block">
          <img src={wigsillPlums} alt="Wigsill Plums" />
        </div>
      </main>
      <section className="px-[8vw] pt-16">
        <a
          href="LINK_TO_DISCORD"
          className="flex max-w-[40rem] bg-indigo-600 text-white"
        >
          <div className="px-8 py-6">
            <h1 className="text-3xl py-1">Under heavy development</h1>
            <h1 className="text-xl py-1">
              Use this website to experiment with wigsill, and shape its future
              by giving us feedback on our <strong>Discord</strong> server.
            </h1>
          </div>
          <div className="flex-shrink-0 self-center px-4">
            <svg
              width="64"
              height="64"
              viewBox="0 0 136 136"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <title>right arrow</title>
              <path
                d="M21 63H16V73H21V63ZM117.536 71.5355C119.488 69.5829 119.488 66.4171 117.536 64.4645L85.7157 32.6447C83.7631 30.692 80.5973 30.692 78.6447 32.6447C76.692 34.5973 76.692 37.7631 78.6447 39.7157L106.929 68L78.6447 96.2843C76.692 98.2369 76.692 101.403 78.6447 103.355C80.5973 105.308 83.7631 105.308 85.7157 103.355L117.536 71.5355ZM21 73L114 73V63L21 63V73Z"
                fill="white"
              />
            </svg>
          </div>
        </a>
      </section>
    </>
  );
}
