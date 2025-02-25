import cs from 'classnames';
import { useAtom } from 'jotai/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  selectedTestsAtom,
  identifierOf,
  type Suite,
  type TestIdentifier,
} from '../suites.js';
import IndeterminateSvg from './indeterminate.svg';
import CheckedSvg from './checked.svg';

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
      <div className="flex">
        <StylizedCheckbox
          id="option"
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
          <span
            className={cs(opened ? 'scale-y-[-1]' : '', 'w-4 inline-block')}
          >
            {'▽'}
          </span>
          {` ${suiteName}`}
        </button>
      </div>
      <div className="ps-6">
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

  return (
    <div className="flex">
      <div>
        <StylizedCheckbox
          id="option"
          state={state}
          onChange={() =>
            selected.includes(identifier)
              ? setSelected(selected.filter((item) => item !== identifier))
              : setSelected([...selected, identifier])
          }
        />
      </div>
      <div className="text-sm ps-2">{testName}</div>
    </div>
  );
}

function StylizedCheckbox(props: {
  id: string;
  state: CheckboxState;
  onChange: () => void;
}) {
  const cRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (cRef.current)
      cRef.current.indeterminate = props.state === 'indeterminate';
  }, [props]);

  return (
    <div className="inline-flex items-center">
      <label className="flex items-center cursor-pointer relative">
        <input
          ref={cRef}
          type="checkbox"
          checked={props.state === 'checked'}
          className="peer h-4 w-4 cursor-pointer transition-all appearance-none rounded shadow hover:shadow-md border border-slate-300 checked:bg-gradient-purple-dark checked:border-gradient-purple indeterminate:bg-gradient-purple-dark indeterminate:border-gradient-purple"
          onChange={props.onChange}
          id="check2"
        />
        <span className="absolute inset-0 text-white opacity-0 peer-checked:opacity-100 flex items-center justify-center">
          <img
            src={CheckedSvg.src}
            alt="checked"
            className="h-4 w-4"
            draggable="false"
          />
        </span>
        <span className="absolute inset-0 text-white opacity-0 peer-indeterminate:opacity-100 flex items-center justify-center">
          <img
            src={IndeterminateSvg.src}
            alt="checked"
            className="h-4 w-4"
            draggable="false"
          />
        </span>
      </label>
    </div>
  );
}
