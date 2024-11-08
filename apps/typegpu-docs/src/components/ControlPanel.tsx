import cs from 'classnames';
import { useAtom } from 'jotai';
import { codeEditorShownAtom } from '../utils/examples/codeEditorShownAtom';
import { menuShownAtom } from '../utils/examples/menuShownAtom';
import { isGPUSupported } from '../utils/isGPUSupported';
import { Toggle } from './design/Toggle';

export function ControlPanel() {
  const [menuShowing, setMenuShowing] = useAtom(menuShownAtom);
  const [codeEditorShowing, setCodeEditorShowing] =
    useAtom(codeEditorShownAtom);

  return (
    <div
      className={cs(
        isGPUSupported ? '' : 'hidden md:flex',
        'box-border absolute left-50 hidden md:flex flex-col gap-4 p-6 bg-grayscale-0 rounded-xl max-h-[50%] md:max-h-full',
      )}
    >
      <div className="hidden md:flex flex-col gap-4">
        <label className="flex items-center justify-between gap-3 text-sm cursor-pointer">
          <span>Show left menu</span>
          <Toggle
            checked={menuShowing}
            onChange={(e) => setMenuShowing(e.target.checked)}
          />
        </label>
        <label className="flex items-center justify-between gap-3 text-sm cursor-pointer">
          <span>Show code editor</span>
          <Toggle
            checked={codeEditorShowing}
            onChange={(e) => setCodeEditorShowing(e.target.checked)}
          />
        </label>
      </div>
    </div>
  );
}
