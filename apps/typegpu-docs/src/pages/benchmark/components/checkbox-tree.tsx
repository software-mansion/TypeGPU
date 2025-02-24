import { useAtom } from 'jotai/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  selectedTestsAtom,
  identifierOf,
  type Suite,
  type TestIdentifier,
} from '../suites.js';

type CheckboxState = 'checked' | 'unchecked' | 'indeterminate';

export function SuiteCheckbox(props: { suiteName: string; suite: Suite }) {
  const { suiteName, suite } = props;
  const [selected, setSelected] = useAtom(selectedTestsAtom);

  const childrenIdentifiers: TestIdentifier[] = useMemo(
    () =>
      Object.keys(suite.tests).map((testName) =>
        identifierOf(suiteName, testName),
      ),
    [suite, suiteName],
  );

  const selectedChildrenCount = useMemo(
    () => selected.filter((item) => childrenIdentifiers.includes(item)).length,
    [selected, childrenIdentifiers],
  );
  const totalChildrenCount = Object.keys(suite.tests).length;
  const status: CheckboxState =
    selectedChildrenCount === totalChildrenCount
      ? 'checked'
      : selectedChildrenCount === 0
        ? 'unchecked'
        : 'indeterminate';

  const [opened, setOpened] = useState(status === 'indeterminate');

  const cRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (cRef.current) cRef.current.indeterminate = status === 'indeterminate';
  }, [status]);

  return (
    <div>
      <input
        ref={cRef}
        type="checkbox"
        id="option"
        className="indeterminate"
        checked={status === 'checked'}
        onChange={() => {
          const newSelected = selected.filter(
            (item) => !childrenIdentifiers.includes(item),
          );
          if (status !== 'checked') {
            newSelected.push(...childrenIdentifiers);
          }
          setSelected(newSelected);
        }}
      />
      <button
        type="button"
        className="bg-transparent text-base text-white"
        onClick={() => setOpened(!opened)}
      >
        {`${opened ? '▼' : '▶'} ${suiteName}`}
      </button>
      {opened &&
        Object.keys(suite.tests).map((key) => (
          <TestCheckbox suiteName={suiteName} testName={key} key={key} />
        ))}
    </div>
  );
}

function TestCheckbox(props: { suiteName: string; testName: string }) {
  const { suiteName, testName } = props;
  const identifier = identifierOf(suiteName, testName);
  const [selected, setSelected] = useAtom(selectedTestsAtom);

  return (
    <div>
      <input
        type="checkbox"
        id="option"
        className="ml-6 text-sm"
        checked={selected.includes(identifier)}
        onChange={() =>
          selected.includes(identifier)
            ? setSelected(selected.filter((item) => item !== identifier))
            : setSelected([...selected, identifier])
        }
      />
      {testName}
    </div>
  );
}
