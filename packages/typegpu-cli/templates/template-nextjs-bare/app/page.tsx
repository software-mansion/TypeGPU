import React from 'react';
import { ClientOnly } from '@typegpu/react';

import Shader from './Shader.tsx';
import typegpuLogoDark from '../public/typegpu-logo-dark.svg';
import typegpuLogoLight from '../public/typegpu-logo-light.svg';
import nextLogo from '../public/next.svg';

export function generateStaticParams() {
  return [{ slug: [''] }];
}

export default function Page() {
  return (
    <div className="mx-auto flex h-svh w-[1126px] max-w-full flex-col border-x border-border">
      <section className="flex grow flex-col place-content-center place-items-center pt-8 pb-8 max-[1024px]:pt-8 max-[1024px]:pb-6">
        <ClientOnly
          fallback={
            <p style={{ backgroundColor: 'red', color: 'white', padding: '1rem' }}>Loading...</p>
          }
        >
          <Shader className="h-[min(55vw,55svh)] w-[min(55vw,55svh)] max-w-full" />
        </ClientOnly>
      </section>

      <div className="ticks" />

      <section className="flex border-t border-border text-left max-[1024px]:flex-col max-[1024px]:text-center">
        {/* TypeGPU */}
        <div className="min-w-0 flex-1 border-r border-border p-8 max-[1024px]:border-r-0 max-[1024px]:border-b max-[1024px]:px-5 max-[1024px]:py-6">
          <picture className="mb-2 flex h-7 items-center max-[1024px]:h-6 max-[1024px]:justify-center">
            <source srcSet={typegpuLogoDark.src} media="(prefers-color-scheme: dark)" />
            <img
              className="h-12 w-auto max-[1024px]:h-8"
              src={typegpuLogoLight.src}
              alt="TypeGPU"
            />
          </picture>

          <p>Type-safe WebGPU</p>

          <ul className="mt-8 flex flex-wrap gap-2 max-[1024px]:mt-5 max-[1024px]:justify-center">
            <li className="max-[1024px]:flex-[1_1_calc(50%-8px)]">
              <a
                className="flex items-center gap-2 rounded-md bg-social px-3 py-1.5 text-base text-text-h transition-shadow hover:shadow-[var(--shadow)] max-[1024px]:w-full max-[1024px]:justify-center"
                href="https://docs.swmansion.com/TypeGPU"
                target="_blank"
                rel="noreferrer"
              >
                <svg
                  className="button-icon h-[18px] w-[18px]"
                  role="presentation"
                  aria-hidden="true"
                >
                  <use href="/icons.svg#documentation-icon" />
                </svg>
                Documentation
              </a>
            </li>
            <li className="max-[1024px]:flex-[1_1_calc(50%-8px)]">
              <a
                className="flex items-center gap-2 rounded-md bg-social px-3 py-1.5 text-base text-text-h transition-shadow hover:shadow-[var(--shadow)] max-[1024px]:w-full max-[1024px]:justify-center"
                href="https://github.com/software-mansion/typegpu"
                target="_blank"
                rel="noreferrer"
              >
                <svg
                  className="button-icon h-[18px] w-[18px]"
                  role="presentation"
                  aria-hidden="true"
                >
                  <use href="/icons.svg#github-icon" />
                </svg>
                GitHub
              </a>
            </li>
            <li className="max-[1024px]:flex-[1_1_calc(50%-8px)]">
              <a
                className="flex items-center gap-2 rounded-md bg-social px-3 py-1.5 text-base text-text-h transition-shadow hover:shadow-[var(--shadow)] max-[1024px]:w-full max-[1024px]:justify-center"
                href="https://discord.gg/8jpfgDqPcM"
                target="_blank"
                rel="noreferrer"
              >
                <svg
                  className="button-icon h-[18px] w-[18px]"
                  role="presentation"
                  aria-hidden="true"
                >
                  <use href="/icons.svg#discord-icon" />
                </svg>
                Discord
              </a>
            </li>
          </ul>
        </div>

        {/* Next.js */}
        <div className="min-w-0 flex-1 p-8 max-[1024px]:px-5 max-[1024px]:py-6">
          <h2 className="mb-2 flex h-7 items-center gap-2 text-2xl font-medium leading-tight tracking-tight text-text-h max-[1024px]:h-6 max-[1024px]:justify-center max-[1024px]:text-xl">
            <picture>
              <img
                className="h-[22px] w-auto dark:invert"
                src={nextLogo.src}
                alt=""
                aria-hidden="true"
              />
            </picture>
          </h2>

          <p>The React framework</p>

          <ul className="mt-8 flex flex-wrap gap-2 max-[1024px]:mt-5 max-[1024px]:justify-center">
            <li className="max-[1024px]:flex-[1_1_calc(50%-8px)]">
              <a
                className="flex items-center gap-2 rounded-md bg-social px-3 py-1.5 text-base text-text-h transition-shadow hover:shadow-[var(--shadow)] max-[1024px]:w-full max-[1024px]:justify-center"
                href="https://nextjs.org"
                target="_blank"
                rel="noreferrer"
              >
                <picture>
                  <img
                    className="h-[18px] w-[18px] object-contain dark:invert"
                    src={nextLogo.src}
                    alt=""
                    aria-hidden="true"
                  />
                </picture>
                Explore Next.js
              </a>
            </li>
          </ul>
        </div>
      </section>

      <div className="ticks" />

      <section className="h-[88px] border-t border-border max-[1024px]:h-12" />
    </div>
  );
}
