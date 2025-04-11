"use client";

import React, { ReactNode } from 'react';
import { AppInsightsContext } from '@microsoft/applicationinsights-react-js';
import { reactPlugin, initializeAppInsights, isInitialized } from './services/applicationInsights';

interface AppInsightsProviderProps {
  connectionString?: string;
  children: ReactNode;
}

// アプリケーションの起動時に一度だけApplication Insightsを初期化する
const initializeOnce = (connectionString?: string) => {
  const aiConnectionString = connectionString || process.env.NEXT_PUBLIC_APPLICATIONINSIGHTS_CONNECTION_STRING;
  if (aiConnectionString) {
    initializeAppInsights(aiConnectionString);
  }
  // オプショナルなので、環境変数がない場合はエラー出力せずにスキップする
};

export const AppInsightsProvider: React.FC<AppInsightsProviderProps> = ({
  connectionString,
  children
}) => {
  // アプリケーションの起動時に一度だけ初期化する（クライアントサイドでのみ実行）
  React.useEffect(() => {
    // サーバーサイドレンダリング中は初期化しない
    if (typeof window !== 'undefined') {
      initializeOnce(connectionString);
    }
  }, [connectionString]);

  return (
    <AppInsightsContext.Provider value={reactPlugin}>
      {children}
    </AppInsightsContext.Provider>
  );
};

// カスタムフックを使用してアプリケーション内からApplicationInsightsにアクセスする
export const useAppInsights = () => {
  const appInsightsPlugin = React.useContext(AppInsightsContext);

  // クライアントサイドでないか、Application Insightsが初期化されていない場合
  if (typeof window === 'undefined' || !isInitialized()) {
    return {
      trackEvent: () => {},
      trackPageView: () => {},
      trackException: () => {},
      trackTrace: () => {},
      trackMetric: () => {},
      trackPageViewPerformance: () => {},
      startTrackPage: () => {},
      stopTrackPage: () => {},
      startTrackEvent: () => {},
      stopTrackEvent: () => {},
      flush: () => {},
      clearAuthenticatedUserContext: () => {},
      setAuthenticatedUserContext: () => {},
      addTelemetryInitializer: () => {},
      updateCfg: () => {}
    };
  }

  return appInsightsPlugin;
};
