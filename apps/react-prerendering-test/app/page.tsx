import { Root, ClientOnly } from '@typegpu/react';
import Shader from '../components/Shader.tsx';

export default function Page() {
  return (
    <Root>
      <ClientOnly
        fallback={
          <p style={{ backgroundColor: 'red', color: 'white', padding: '1rem' }}>Loading...</p>
        }
      >
        <Shader />
      </ClientOnly>
    </Root>
  );
}
