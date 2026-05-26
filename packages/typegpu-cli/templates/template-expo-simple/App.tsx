import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { Shader } from './components/Shader.tsx';

export default function App() {
  return (
    <SafeAreaProvider>
      <SafeAreaView
        style={{
          position: 'static',
          flex: 1,
          backgroundColor: 'rgb(239 239 249)',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 30,
        }}
      >
        <Shader />
      </SafeAreaView>
    </SafeAreaProvider>
  );
}
