import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('App error:', error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="error-boundary">
          <h2>页面加载出错</h2>
          <p>{this.state.error.message}</p>
          <ul>
            <li>确认终端里 <code>npm run dev</code> 正在运行</li>
            <li>若提示端口 3001 被占用，先关掉旧进程再重启</li>
            <li>浏览器强制刷新（Cmd+Shift+R）</li>
          </ul>
          <button type="button" className="btn btn-primary" onClick={() => window.location.reload()}>
            重新加载
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
