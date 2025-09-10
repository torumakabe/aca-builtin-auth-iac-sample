"use client";

import { ReactNode, useEffect, useState } from 'react';
import { MsalProvider } from '@azure/msal-react';
import { PublicClientApplication, LogLevel } from '@azure/msal-browser';

// 認証設定（最小構成）
const msalConfig = {
  auth: {
    clientId: process.env.NEXT_PUBLIC_ENTRA_ID_API_APP_CLIENT_ID || '',
    authority: `https://login.microsoftonline.com/${process.env.NEXT_PUBLIC_ENTRA_ID_TENANT_ID || ''}`,
    redirectUri: typeof window !== 'undefined' ? window.location.origin : undefined,
    postLogoutRedirectUri: typeof window !== 'undefined' ? window.location.origin : undefined,
    navigateToLoginRequestUrl: true,
  },
  cache: {
    cacheLocation: 'localStorage',
    storeAuthStateInCookie: false,
  },
  system: {
    allowRedirectInIframe: true,
    loggerOptions: {
      logLevel: LogLevel.Warning,
      loggerCallback: () => {}
    }
  }
};

// スコープ定義
export const loginRequest = {
  scopes: ['openid', 'profile', 'User.Read']
};

// APIスコープ設定
export const apiScopes = process.env.NEXT_PUBLIC_API_SCOPE
  ? [process.env.NEXT_PUBLIC_API_SCOPE]
  : [];

// MSAL インスタンス作成
export const msalInstance = new PublicClientApplication(msalConfig);

export default function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // ランタイムでの初期化と、初期アカウントの設定のみ行う
    (async () => {
      try {
        await msalInstance.initialize();
        await msalInstance.handleRedirectPromise();

        const active = msalInstance.getActiveAccount();
        const all = msalInstance.getAllAccounts();
        if (!active && all.length > 0) {
          msalInstance.setActiveAccount(all[0]);
        }
      } catch (e) {
        // 初期化失敗時も致命的ではないためログに留める
        console.warn('MSAL init/redirect handling skipped:', e);
      } finally {
        setReady(true);
      }
    })();
  }, []);

  if (!ready) {
    return (
      <div style={{ textAlign: 'center', padding: '20px' }}>
        <p>認証を初期化中...</p>
      </div>
    );
  }

  return <MsalProvider instance={msalInstance}>{children}</MsalProvider>;
}
