import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

const plots = [
  'https://raw.githubusercontent.com/software-mansion-labs/typegpu-benchmarker/main/plots/combined-resolveDuration-full.png',
  'https://raw.githubusercontent.com/software-mansion-labs/typegpu-benchmarker/main/plots/combined-resolveDuration-full-log.png',
  'https://raw.githubusercontent.com/software-mansion-labs/typegpu-benchmarker/main/plots/combined-resolveDuration-latest5.png',
  'https://raw.githubusercontent.com/software-mansion-labs/typegpu-benchmarker/main/plots/combined-resolveDuration-under10k.png',
];
const slideCount = plots.length;
const extendedPlots = [plots[slideCount - 1], ...plots, plots[0]];
const extendedSlideCount = extendedPlots.length;

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
  const [currentIndex, setCurrentIndex] = useState(1);
  const [isTransitioning, setIsTransitioning] = useState(false);

  const nextSlide = useCallback((isTransitioning: boolean) => {
    if (isTransitioning) return;
    setIsTransitioning(true);
    setCurrentIndex((prev) => prev + 1); // to avoid deps
  }, []);

  const prevSlide = useCallback((isTransitioning: boolean) => {
    if (isTransitioning) return;
    setIsTransitioning(true);
    setCurrentIndex((prev) => prev - 1);
  }, []);

  const handleTransitionEnd = useCallback((index: number) => {
    setIsTransitioning(false);
    if (index === 0) {
      setCurrentIndex(slideCount);
    } else if (index === extendedSlideCount - 1) {
      setCurrentIndex(1);
    }
  }, []);

  const goToSlide = useCallback((index: number, isTransitioning: boolean) => {
    if (isTransitioning) return;
    setIsTransitioning(true);
    setCurrentIndex(index + 1);
  }, []);

  const getActualIndex = (): number => {
    if (currentIndex === 0) return slideCount - 1;
    if (currentIndex === extendedSlideCount - 1) return 0;
    return currentIndex - 1;
  };

  useEffect(() => {
    // TODO: add touch handling
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'ArrowLeft') prevSlide(isTransitioning);
      if (event.key === 'ArrowRight') nextSlide(isTransitioning);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [prevSlide, nextSlide, isTransitioning]);

  return (
    <div className='relative flex-grow overflow-hidden'>
      <button
        className={`left-4 ${buttonUtilityClasses}`}
        type='button'
        onClick={() => prevSlide(isTransitioning)}
      >
        <ChevronLeft className={chevronUtilityClasses} />
      </button>

      <button
        className={`right-4 ${buttonUtilityClasses}`}
        type='button'
        onClick={() => nextSlide(isTransitioning)}
      >
        <ChevronRight className={chevronUtilityClasses} />
      </button>

      <div
        className={`flex h-full w-full transition-transform duration-200 ease-in-out ${
          isTransitioning ? '' : 'transition-none' // this is necessary for smooth wrapping
        }`}
        style={{ transform: `translateX(-${currentIndex * 100}%)` }}
        onTransitionEnd={() => handleTransitionEnd(currentIndex)}
      >
        {extendedPlots.map((url, index) => (
          <PlotSlide key={`slide-${index}-${url}`} url={url} />
        ))}
      </div>

      <div className='-translate-x-1/2 absolute bottom-17 left-1/2 flex space-x-3'>
        {plots.map((url, index) => (
          <button
            key={`dot-${index}-${url}`}
            type='button'
            onClick={() => goToSlide(index, isTransitioning)}
            className={`h-4 w-4 rounded-full transition-all duration-200 ease-in-out ${
              index === getActualIndex()
                ? 'scale-125 bg-gray-500'
                : 'bg-gray-800 hover:bg-gray-700'
            }`}
          />
        ))}
      </div>
    </div>
  );
}
