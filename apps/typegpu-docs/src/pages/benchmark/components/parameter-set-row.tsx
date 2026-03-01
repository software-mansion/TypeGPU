import { type PrimitiveAtom, useAtom, useSetAtom } from 'jotai';
import { useCallback } from 'react';
import { DeleteIcon } from '../../../components/design/DeleteIcon.tsx';
import { type BenchParameterSet, deleteParameterSetAtom } from '../parameter-set.ts';

function NpmParameters(props: { parameterSetAtom: PrimitiveAtom<BenchParameterSet> }) {
  const [parameterSet, setParameterSet] = useAtom(props.parameterSetAtom);

  const version = parameterSet.typegpu.type === 'npm' ? parameterSet.typegpu.version : '';

  const setVersion = useCallback(
    (version: string) => {
      setParameterSet((prev) => ({
        ...prev,
        typegpu: { ...prev.typegpu, version },
      }));
    },
    [setParameterSet],
  );

  return (
    <>
      <p className="text-sm">typegpu@</p>
      <input
        type="text"
        className="block w-full rounded-lg border border-gray-300 bg-gray-50 p-1 text-gray-900 text-sm focus:border-blue-500 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:placeholder-gray-400 dark:focus:border-blue-500 dark:focus:ring-blue-500"
        value={version}
        onChange={(e) => setVersion(e.target.value)}
        placeholder="0.0.0"
      />
    </>
  );
}

function PrParameters(props: { parameterSetAtom: PrimitiveAtom<BenchParameterSet> }) {
  const [parameterSet, setParameterSet] = useAtom(props.parameterSetAtom);

  const version = parameterSet.typegpu.type === 'pr' ? parameterSet.typegpu.commit : '';

  const setCommit = useCallback(
    (commit: string) => {
      setParameterSet((prev) => ({
        ...prev,
        typegpu: { ...prev.typegpu, commit },
      }));
    },
    [setParameterSet],
  );

  return (
    <>
      <p className="text-sm">typegpu@</p>
      <input
        type="text"
        className="block w-full rounded-lg border border-gray-300 bg-gray-50 p-1 text-gray-900 text-sm focus:border-blue-500 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:placeholder-gray-400 dark:focus:border-blue-500 dark:focus:ring-blue-500"
        value={version}
        onChange={(e) => setCommit(e.target.value)}
        placeholder="b364de3"
      />
    </>
  );
}

export function ParameterSetRow(props: { parameterSetAtom: PrimitiveAtom<BenchParameterSet> }) {
  const [parameterSet, setParameterSet] = useAtom(props.parameterSetAtom);
  const deleteParameterSet = useSetAtom(deleteParameterSetAtom);

  const typeValue = parameterSet.typegpu.type;

  const setType = useCallback(
    (type: 'local' | 'npm' | 'pr') => {
      setParameterSet((prev) => ({
        ...prev,
        typegpu: { type },
      }));
    },
    [setParameterSet],
  );

  return (
    <div className="relative flex w-full items-center justify-between gap-4">
      <button
        type="button"
        className="rounded-md bg-transparent p-0 text-white transition-colors hover:bg-gray-700"
        onClick={() => deleteParameterSet(parameterSet.key)}
      >
        <DeleteIcon />
      </button>
      <select
        className="block w-22 rounded-lg border border-gray-300 bg-gray-50 p-2.5 text-gray-900 text-sm focus:border-blue-500 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:placeholder-gray-400 dark:focus:border-blue-500 dark:focus:ring-blue-500"
        value={typeValue}
        data-value={typeValue}
        onChange={(event) => setType(event.target.value as 'local' | 'npm')}
      >
        <option value="local">📌 local</option>
        <option value="npm">⬇️ npm</option>
        <option value="pr">🌳 pr</option>
      </select>
      <div className="flex flex-1 items-center justify-start">
        {typeValue === 'local' && <p className="text-sm">typegpu</p>}
        {typeValue === 'npm' && <NpmParameters parameterSetAtom={props.parameterSetAtom} />}
        {typeValue === 'pr' && <PrParameters parameterSetAtom={props.parameterSetAtom} />}
      </div>
    </div>
  );
}
