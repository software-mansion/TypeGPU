import { type PrimitiveAtom, useAtom, useSetAtom } from 'jotai';
import { useCallback } from 'react';
import { DeleteIcon } from '../../../components/design/DeleteIcon.ts';
import {
  type BenchParameterSet,
  deleteParameterSetAtom,
} from '../parameter-set.ts';

function NpmParameters(props: {
  parameterSetAtom: PrimitiveAtom<BenchParameterSet>;
}) {
  const [parameterSet, setParameterSet] = useAtom(props.parameterSetAtom);

  const version =
    parameterSet.typegpu.type === 'npm' ? parameterSet.typegpu.version : '';

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
        className="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-1 dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white dark:focus:ring-blue-500 dark:focus:border-blue-500"
        value={version}
        onChange={(e) => setVersion(e.target.value)}
        placeholder="0.0.0"
      />
    </>
  );
}

function PrParameters(props: {
  parameterSetAtom: PrimitiveAtom<BenchParameterSet>;
}) {
  const [parameterSet, setParameterSet] = useAtom(props.parameterSetAtom);

  const version =
    parameterSet.typegpu.type === 'pr' ? parameterSet.typegpu.commit : '';

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
        className="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-1 dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white dark:focus:ring-blue-500 dark:focus:border-blue-500"
        value={version}
        onChange={(e) => setCommit(e.target.value)}
        placeholder="b364de3"
      />
    </>
  );
}

export function ParameterSetRow(props: {
  parameterSetAtom: PrimitiveAtom<BenchParameterSet>;
}) {
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
    <div className="w-full flex gap-4 justify-between items-center relative">
      <button
        type="button"
        className="p-0 bg-transparent text-white transition-colors hover:bg-gray-700 rounded-md"
        onClick={() => deleteParameterSet(parameterSet.key)}
      >
        <DeleteIcon />
      </button>
      <select
        className="w-22 bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block p-2.5 dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white dark:focus:ring-blue-500 dark:focus:border-blue-500"
        value={typeValue}
        data-value={typeValue}
        onChange={(event) => setType(event.target.value as 'local' | 'npm')}
      >
        <option value="local">📌 local</option>
        <option value="npm">⬇️ npm</option>
        <option value="pr">🌳 pr</option>
      </select>
      <div className="flex-1 flex justify-start items-center">
        {typeValue === 'local' && <p className="text-sm">typegpu</p>}
        {typeValue === 'npm' && (
          <NpmParameters parameterSetAtom={props.parameterSetAtom} />
        )}
        {typeValue === 'pr' && (
          <PrParameters parameterSetAtom={props.parameterSetAtom} />
        )}
      </div>
    </div>
  );
}
