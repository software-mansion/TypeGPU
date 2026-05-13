import { useEffect, useState, type ReactNode } from 'react';
import { type BufferIndex, createBindGroupProgram } from './ComputeShadersBindGroupsRuntime.ts';
import {
  RunnablePreviewHeader,
  RunnableSnippet,
  type RunnerHandle,
  WebGpuInitializationError,
} from './runnable/index.ts';

const CANVAS_SIZE = 256;

type BufferOption = {
  colorCss: string;
  label: string;
  name: string;
};

const BUFFER_OPTIONS: readonly BufferOption[] = [
  { colorCss: '#67e8f9', label: 'Buffer A', name: 'Orbit' },
  { colorCss: '#f9a8d4', label: 'Buffer B', name: 'Drift' },
  { colorCss: '#bef264', label: 'Buffer C', name: 'Burst' },
];

export const COMPUTE_SHADER_BIND_GROUPS_SNIPPET = `import tgpu, { d, std } from 'typegpu';

const root = await tgpu.init();

const PARTICLE_COUNT = 96;

const Particle = d.struct({
  position: d.vec2f,
  velocity: d.vec2f,
});
const ParticleArray = d.arrayOf(Particle, PARTICLE_COUNT);

const particleLayout = tgpu.bindGroupLayout({
  particles: { storage: ParticleArray, access: 'mutable' },
});

declare const initialStates: [
  Array<{ position: d.v2f; velocity: d.v2f }>,
  Array<{ position: d.v2f; velocity: d.v2f }>,
  Array<{ position: d.v2f; velocity: d.v2f }>,
];

const particleBuffers = initialStates.map((state) =>
  root.createBuffer(ParticleArray, state).$usage('storage'),
);

const bindGroups = particleBuffers.map((particles) =>
  root.createBindGroup(particleLayout, { particles }),
);

const simulate = root.createGuardedComputePipeline((i) => {
  'use gpu';
  const particle = particleLayout.$.particles[i];
  particleLayout.$.particles[i].position = std.fract(
    particle.position.add(particle.velocity),
  );
});

declare function render(selected: number): void;

export function run(selected: number) {
  const bindGroup = bindGroups[selected]!;

  simulate.with(bindGroup).dispatchThreads(PARTICLE_COUNT);
  render(selected);
}
`;

type BindGroupProgram = Awaited<ReturnType<typeof createBindGroupProgram>>;

async function initBindGroupProgram(canvas: HTMLCanvasElement | null) {
  if (!canvas) {
    throw new Error('The WebGPU canvas is not ready yet.');
  }
  try {
    return await createBindGroupProgram(canvas);
  } catch (error) {
    throw new WebGpuInitializationError(error);
  }
}

type BufferControlsProps = {
  onSelect: (index: BufferIndex) => void;
  runner: RunnerHandle<BindGroupProgram>;
  selected: BufferIndex;
};

function BufferControls({ onSelect, runner, selected }: BufferControlsProps) {
  useEffect(() => {
    if (runner.supported !== true) {
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const program = await runner.getProgram();
        if (!cancelled) {
          program.draw(selected);
        }
      } catch (runError) {
        if (!cancelled) {
          runner.handleError(runError);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selected, runner.supported]);

  return (
    <div className="border-b border-[var(--sl-color-gray-5)] bg-[var(--sl-color-bg)] p-2">
      <div className="grid grid-cols-3 gap-1">
        {BUFFER_OPTIONS.map((option, index) => {
          const isSelected = selected === index;

          return (
            <button
              aria-pressed={isSelected}
              className={`flex min-w-0 items-center justify-center gap-1.5 rounded-sm border px-2 py-1 text-xs font-medium transition-colors ${
                isSelected
                  ? 'border-[var(--sl-color-text-accent)] text-[var(--sl-color-text-accent)]'
                  : 'border-[var(--sl-color-gray-5)] text-[var(--sl-color-text)] hover:text-[var(--sl-color-text-accent)]'
              }`}
              key={option.label}
              onClick={() => onSelect(index as BufferIndex)}
              type="button"
            >
              <span
                aria-hidden="true"
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: option.colorCss }}
              />
              <span className="truncate">{option.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

type Props = {
  children: ReactNode;
};

export default function ComputeShadersBindGroupsExample({ children }: Props) {
  const [selectedBuffer, setSelectedBuffer] = useState<BufferIndex>(0);
  const [stepCounts, setStepCounts] = useState<[number, number, number]>([0, 0, 0]);

  return (
    <RunnableSnippet<BindGroupProgram, void>
      controls={({ runner }) => (
        <BufferControls onSelect={setSelectedBuffer} runner={runner} selected={selectedBuffer} />
      )}
      createProgram={({ canvas }) => initBindGroupProgram(canvas)}
      panelWidth="16rem"
      preview={({ canvas }) => (
        <>
          <RunnablePreviewHeader
            label={BUFFER_OPTIONS[selectedBuffer].name}
            value={`${stepCounts[selectedBuffer]} step${
              stepCounts[selectedBuffer] === 1 ? '' : 's'
            }`}
          />
          {canvas}
        </>
      )}
      run={async ({ computeBindGroups, draw, particleCount, simulate }) => {
        const bindGroup = computeBindGroups[selectedBuffer];
        if (!bindGroup) {
          return;
        }
        simulate.with(bindGroup).dispatchThreads(particleCount);
        draw(selectedBuffer);
        setStepCounts(
          (current) =>
            current.map((count, index) => (index === selectedBuffer ? count + 1 : count)) as [
              number,
              number,
              number,
            ],
        );
      }}
      tall
      withCanvas={{
        ariaLabel: `${BUFFER_OPTIONS[selectedBuffer].label} particle state`,
        size: CANVAS_SIZE,
      }}
    >
      {children}
    </RunnableSnippet>
  );
}
