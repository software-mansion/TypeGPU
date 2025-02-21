import { useAtom } from 'jotai/react';
import { useEffect, useRef, useState } from 'react';
import {
  selectedTestsAtom,
  testIdentifierOf,
  type Suite,
  type TestIdentifier,
} from './suites.js';

export function TestCheckbox(props: { suiteName: string; testName: string }) {
  const { suiteName, testName } = props;
  const identifier = testIdentifierOf(suiteName, testName);
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

type CheckboxState = 'checked' | 'unchecked' | 'indeterminate';

export function SuiteCheckbox(props: { suiteName: string; suite: Suite }) {
  const [opened, setOpened] = useState(false);
  const { suiteName, suite } = props;
  const [selected, setSelected] = useAtom(selectedTestsAtom);
  const tests = suite().tests;

  const childrenIdentifiers: TestIdentifier[] = [];
  for (const testName in tests) {
    childrenIdentifiers.push(testIdentifierOf(suiteName, testName));
  }

  const selectedChildren = selected.filter((item) =>
    childrenIdentifiers.includes(item),
  ).length;
  const totalChildren = Object.keys(tests).length;
  const status: CheckboxState =
    selectedChildren === totalChildren
      ? 'checked'
      : selectedChildren === 0
        ? 'unchecked'
        : 'indeterminate';

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
        Object.keys(suite().tests).map((key) => (
          <TestCheckbox suiteName={suiteName} testName={key} key={key} />
        ))}
    </div>
  );
}
