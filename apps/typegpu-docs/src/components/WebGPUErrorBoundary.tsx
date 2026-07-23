import * as React from 'react';

export interface WebGPUErrorBoundaryProps {
  children: React.ReactNode;
}

export class WebGPUErrorBoundary extends React.Component<
  WebGPUErrorBoundaryProps,
  { hasError: boolean }
> {
  constructor(props: WebGPUErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(_error: unknown) {
    // Update state so the next render will show the fallback UI.
    return { hasError: true };
  }

  componentDidCatch(error: unknown, _info: unknown) {
    console.log(error);
  }

  render() {
    if (this.state.hasError) {
      // Fallback
      return <></>;
    }

    return this.props.children;
  }
}
