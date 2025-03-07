import cs from 'classnames';
import { useAtom } from 'jotai/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  type Suite,
  type TestIdentifier,
  identifierOf,
  selectedTestsAtom,
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
  const state: CheckboxState =
    selectedChildrenCount === totalChildrenCount
      ? 'checked'
      : selectedChildrenCount === 0
        ? 'unchecked'
        : 'indeterminate';

  const [opened, setOpened] = useState(state === 'indeterminate');

  return (
    <div>
      <div className="flex items-center">
        <button
          type="button"
          className="bg-transparent text-base text-white cursor-pointer"
          onClick={() => setOpened(!opened)}
        >
          <span className={cs(opened ? 'scale-y-[-1]' : '', 'inline-block')}>
            ▽
          </span>
        </button>
        <StylizedCheckbox
          state={state}
          onChange={() => {
            const newSelected = selected.filter(
              (item) => !childrenIdentifiers.includes(item),
            );
            if (state !== 'checked') {
              newSelected.push(...childrenIdentifiers);
            }
            setSelected(newSelected);
          }}
        />
        <button
          type="button"
          className="bg-transparent text-base text-white cursor-pointer"
          onClick={() => setOpened(!opened)}
        >
          {suiteName}
        </button>
      </div>
      <div className="ps-12">
        {opened &&
          Object.keys(suite.tests).map((key) => (
            <TestCheckbox suiteName={suiteName} testName={key} key={key} />
          ))}
      </div>
    </div>
  );
}

function TestCheckbox(props: { suiteName: string; testName: string }) {
  const { suiteName, testName } = props;
  const identifier = identifierOf(suiteName, testName);
  const [selected, setSelected] = useAtom(selectedTestsAtom);
  const state = selected.includes(identifier) ? 'checked' : 'unchecked';

  function changeState() {
    selected.includes(identifier)
      ? setSelected(selected.filter((item) => item !== identifier))
      : setSelected([...selected, identifier]);
  }

  return (
    <div className="flex">
      <div>
        <StylizedCheckbox state={state} onChange={changeState} />
      </div>
      <button
        type="button"
        className="bg-transparent text-white cursor-pointer text-sm"
        onClick={changeState}
      >
        {testName}
      </button>
    </div>
  );
}

function StylizedCheckbox(props: {
  state: CheckboxState;
  onChange: () => void;
}) {
  const checkboxRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (checkboxRef.current)
      checkboxRef.current.indeterminate = props.state === 'indeterminate';
  }, [props]);

  return (
    <div className="inline-flex items-center">
      <label className="flex items-center cursor-pointer relative">
        <input
          ref={checkboxRef}
          type="checkbox"
          checked={props.state === 'checked'}
          className="peer h-4 w-4 cursor-pointer transition-all appearance-none rounded shadow hover:shadow-md border border-slate-300 checked:bg-gradient-purple-dark checked:border-gradient-purple indeterminate:bg-gradient-purple-dark indeterminate:border-gradient-purple"
          onChange={props.onChange}
        />
        <span className="absolute inset-0 text-white opacity-0 peer-checked:opacity-100 flex items-center justify-center">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
            className="w-4 h-4"
            viewBox="0 2 100 102"
          >
            <path
              d="M80 20 L40 78 L20 60"
              stroke="white"
              strokeWidth="15"
              fill="none"
            />
          </svg>
        </span>
        <span className="absolute inset-0 text-white opacity-0 peer-indeterminate:opacity-100 flex items-center justify-center">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
            className="w-4 h-4"
            viewBox="0 2 100 102"
          >
            <line
              x1="20"
              y1="50"
              x2="80"
              y2="50"
              stroke="white"
              strokeWidth="15"
              fill="none"
            />
          </svg>
        </span>
      </label>
    </div>
  );
}
