import { useFrame } from '../hooks/use-frame';
import { Children, cloneElement, isValidElement } from 'react';

export function Pass({ children, schedule }: { children: React.ReactNode; schedule: 'frame' }) {
  useFrame(() => {
    Children.forEach(children, (child) => {
      if (isValidElement(child)) {
        // This is a simplified approach. We'll need a more robust way to execute the render commands.
        // For now, we'll assume the children can be rendered directly.
        // A proper implementation would involve a render context.
      }
    });
  });

  return <>{children}</>;
}
