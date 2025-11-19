import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useEffect, useState } from 'react';

const plots = [
  'https://raw.githubusercontent.com/software-mansion-labs/typegpu-benchmarker/main/plots/combined-resolveDuration-full.png',
  'https://raw.githubusercontent.com/software-mansion-labs/typegpu-benchmarker/main/plots/combined-resolveDuration-full-log.png',
  'https://raw.githubusercontent.com/software-mansion-labs/typegpu-benchmarker/main/plots/combined-resolveDuration-latest5.png',
  'https://raw.githubusercontent.com/software-mansion-labs/typegpu-benchmarker/main/plots/combined-resolveDuration-under10k.png',
];

function PlotSlide({ url }: { url: string }) {
  return (
    <div className='flex h-[60vh] max-h-[50vw] w-full flex-shrink-0 justify-center'>
      <img
        className='h-full rounded-2xl object-contain'
        src={`${url}?t=${Date.now()}`} // TODO: proper versioning ;)
        alt={`${new URL(url).pathname.split('/').pop()}`}
      />
    </div>
  );
}

const buttonUtilityClasses =
  '-translate-y-1/2 absolute top-1/2 rounded-full border border-gray-700 bg-gray-800 p-4 text-gray-150 transition-all duration-300 ease-in-out hover:bg-gray-700 hover:text-white active:bg-gray-500 active:text-white z-1';
const chevronUtilityClasses = 'w-4 h-4 sm:w-8 sm:h-8';

export default function PlotGallery() {
  // this is for infinite effect
  const extendedPlots = [plots[plots.length - 1], ...plots, plots[0]];

  const [currentIndex, setCurrentIndex] = useState(1);
  const [isTransitioning, setIsTransitioning] = useState(false);

  const nextSlide = () => {
    if (isTransitioning) return;
    setIsTransitioning(true);
    setCurrentIndex((prev) => prev + 1);
  };

  const prevSlide = () => {
    if (isTransitioning) return;
    setIsTransitioning(true);
    setCurrentIndex((prev) => prev - 1);
  };

  const handleTransitionEnd = () => {
    setIsTransitioning(false);

    if (currentIndex === 0) {
      setCurrentIndex(plots.length);
    } else if (currentIndex === extendedPlots.length - 1) {
      setCurrentIndex(1);
    }
  };

  useEffect(() => {
    // TODO: add touch handling
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'ArrowLeft') prevSlide();
      if (event.key === 'ArrowRight') nextSlide();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  });

  return (
    <div className='relative flex-grow overflow-hidden'>
      <button
        className={`left-4 ${buttonUtilityClasses}`}
        type='button'
        onClick={prevSlide}
      >
        <ChevronLeft className={chevronUtilityClasses} />
      </button>

      <button
        className={`right-4 ${buttonUtilityClasses}`}
        type='button'
        onClick={nextSlide}
      >
        <ChevronRight className={chevronUtilityClasses} />
      </button>

      <div
        className={`flex h-full w-full transition-transform duration-200 ease-in-out ${
          isTransitioning ? '' : 'transition-none' // this is necessary for smooth ending
        }`}
        style={{ transform: `translateX(-${currentIndex * 100}%)` }}
        onTransitionEnd={handleTransitionEnd}
      >
        {extendedPlots.map((url, index) => (
          <PlotSlide key={`${index}-${url}`} url={url} />
        ))}
      </div>
    </div>
  );
}
