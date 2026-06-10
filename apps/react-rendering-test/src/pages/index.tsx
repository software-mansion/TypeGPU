import { Shader } from '../components/Shader.tsx';

export default function HomePage() {
  return <Shader />;
}

export const getConfig = async () => {
  return {
    render: 'static',
  } as const;
};
