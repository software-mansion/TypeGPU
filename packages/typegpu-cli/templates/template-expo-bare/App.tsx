import React from 'react';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { Shader } from './components/Shader.tsx';

export default function App() {
  return (
    <SafeAreaProvider>
      <SafeAreaView
        style={{
          position: 'relative',
          flex: 1,
          backgroundColor: 'rgb(22, 23, 29)',
          justifyContent: 'center',
        }}
      >
        <Shader />
      </SafeAreaView>
    </SafeAreaProvider>
  );
}
