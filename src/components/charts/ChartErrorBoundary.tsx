"use client";

import { Component, type ReactNode } from "react";

export class ChartErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return <p className="text-sm text-muted-foreground">This chart couldn&apos;t be rendered.</p>;
    }
    return this.props.children;
  }
}
