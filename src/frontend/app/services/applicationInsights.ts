import { ReactPlugin } from '@microsoft/applicationinsights-react-js';
import { ApplicationInsights } from '@microsoft/applicationinsights-web';

// ReactPluginの単一インスタンスを作成する
export const reactPlugin = new ReactPlugin();
let appInsightsInstance: ApplicationInsights | null = null;

// Application Insightsが初期化されているかどうかを確認する
export const isInitialized = () => {
  return appInsightsInstance !== null;
};

// Application Insightsクライアントを初期化する関数
export const initializeAppInsights = (connectionString?: string) => {
  // 接続文字列が空または未定義の場合は初期化しない
  if (!connectionString) {
    console.log('Application Insights connection string is not provided, skipping initialization');
    return null;
  }

  // 既に初期化済みの場合は既存のインスタンスを返す
  if (appInsightsInstance) {
    return appInsightsInstance;
  }

  appInsightsInstance = new ApplicationInsights({
    config: {
      connectionString,
      enableAutoRouteTracking: true,
      disableFetchTracking: false,
      enableCorsCorrelation: true, // CORSリクエスト間の相関関係を有効化する
      distributedTracingMode: 2,   // W3C形式のトレースを使用する（推奨形式）
      // Entra ID (Azure AD) のドメインを相関ヘッダーの除外リストに追加する
      correlationHeaderExcludedDomains: [
        'login.microsoftonline.com',
        'login.windows.net',
        '*.login.microsoftonline.com',
        '*.login.windows.net'
      ],
      extensions: [reactPlugin]
    }
  });

  // アプリケーションインサイトを初期化して読み込む
  appInsightsInstance.loadAppInsights();
  appInsightsInstance.trackPageView();

  return appInsightsInstance;
};
