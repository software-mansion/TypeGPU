import { useMemo } from 'react';
import { common, d } from 'typegpu';
import { useConfigureContext, useFrame, useRoot } from '@typegpu/react';

function App() {
  const root = useRoot();
  const renderPipeline = useMemo(
    () =>
      root.createRenderPipeline({
        vertex: common.fullScreenTriangle,
        fragment: ({ uv }) => {
          'use gpu';
          return d.vec4f(0.55, uv, 1);
        },
      }),
    [root],
  );

  const { ref, ctxRef } = useConfigureContext({ autoResize: true, alphaMode: 'premultiplied' });

  useFrame(() => {
    if (!ctxRef.current) return;

    renderPipeline.withColorAttachment({ view: ctxRef.current }).draw(3);
  });

  return (
    <div id="app">
      <section id="center">
        <canvas ref={ref} id="canvas" />
      </section>

      <div className="ticks" />

      <section id="next-steps">
        <div id="typegpu">
          <picture>
            <source srcSet="/typegpu-logo-dark.svg" media="(prefers-color-scheme: dark)" />
            <img className="typegpu-logo" src="/typegpu-logo-light.svg" alt="TypeGPU" />
          </picture>

          <p>Type-safe WebGPU</p>
          <ul>
            <li>
              <a href="https://docs.swmansion.com/TypeGPU" target="_blank" rel="noreferrer">
                <svg className="button-icon" role="presentation" aria-hidden="true">
                  <use href="/icons.svg#documentation-icon" />
                </svg>
                Documentation
              </a>
            </li>
            <li>
              <a
                href="https://github.com/software-mansion/typegpu"
                target="_blank"
                rel="noreferrer"
              >
                <svg className="button-icon" role="presentation" aria-hidden="true">
                  <use href="/icons.svg#github-icon" />
                </svg>
                GitHub
              </a>
            </li>
            <li>
              <a href="https://discord.gg/8jpfgDqPcM" target="_blank" rel="noreferrer">
                <svg className="button-icon" role="presentation" aria-hidden="true">
                  <use href="/icons.svg#discord-icon" />
                </svg>
                Discord
              </a>
            </li>
          </ul>
        </div>
        <div id="react-vite">
          <h2 className="title-with-icon">
            React
            <img className="icon" src="/react.svg" alt="" aria-hidden="true" />+ Vite
            <img className="icon" src="/vite.svg" alt="" aria-hidden="true" />
          </h2>
          <p>Modern frontend tooling</p>
          <ul>
            <li>
              <a href="https://react.dev/" target="_blank" rel="noreferrer">
                <svg className="button-icon" role="presentation" aria-hidden="true">
                  <use href="/icons.svg#react-icon" />
                </svg>
                Explore React
              </a>
            </li>
            <li>
              <a href="https://vite.dev/" target="_blank" rel="noreferrer">
                <svg className="button-icon" role="presentation" aria-hidden="true">
                  <use href="/icons.svg#vite-icon" />
                </svg>
                Explore Vite
              </a>
            </li>
          </ul>
        </div>
      </section>

      <div className="ticks" />
      <section id="spacer" />
    </div>
  );
}

export default App;
