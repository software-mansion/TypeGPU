import { ExampleView } from './components/ExampleView';
import htmlCode from './example/index.html?raw';
import tsCode from './example/index.ts?raw';

const example = {
  key: 'example',
  tsCode: tsCode,
  htmlCode: htmlCode,
  metadata: {
    title: 'Gradient Tiles',
    category: 'simple',
  },
};

function App() {
  return (
    <div className="box-border h-[100dvh] p-4 gap-4 bg-tameplum-50">
      <ExampleView example={example} />
    </div>
  );
}

export default App;
