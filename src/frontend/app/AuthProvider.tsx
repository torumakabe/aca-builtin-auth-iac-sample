"use client";

import { ReactNode, useState, useEffect } from 'react';
import { MsalProvider } from '@azure/msal-react';
import {
  PublicClientApplication,
  LogLevel,
  EventType,
  EventMessage,
  AuthenticationResult
} from '@azure/msal-browser';

// 認証設定
const msalConfig = {
  auth: {
    clientId: process.env.NEXT_PUBLIC_ENTRA_ID_API_APP_CLIENT_ID || '',
    authority: `https://login.microsoftonline.com/${process.env.NEXT_PUBLIC_ENTRA_ID_TENANT_ID || ''}`,
    // リダイレクトURIを実行環境のオリジンに動的に設定する
    redirectUri: typeof window !== 'undefined' ? `${window.location.origin}${window.location.pathname}` : '',
    postLogoutRedirectUri: typeof window !== 'undefined' ? window.location.origin : '',
    navigateToLoginRequestUrl: true,
  },
  cache: {
    cacheLocation: 'localStorage',
    storeAuthStateInCookie: false, // サードパーティCookieの制限に対応するためfalseに設定する
  },
  system: {
    allowRedirectInIframe: true, // Next.jsでのiframe内リダイレクトをサポートする
    // ログ出力設定
    loggerOptions: {
      loggerCallback: (level: LogLevel, message: string, containsPii: boolean) => {
        if (!containsPii) {
          switch (level) {
            case LogLevel.Error:
              console.error(message);
              break;
            case LogLevel.Warning:
              console.warn(message);
              break;
            case LogLevel.Info:
              console.info(message);
              break;
            default:
              console.debug(message);
              break;
          }
        }
      },
      logLevel: LogLevel.Verbose, // 詳細なログ出力を有効にする
    }
  }
};

// MSAL インスタンス作成前に設定値を検証する
if (!msalConfig.auth.clientId) {
  console.error('NEXT_PUBLIC_ENTRA_ID_API_APP_CLIENT_ID is not defined');
}

if (!msalConfig.auth.authority.includes('login.microsoftonline.com/')) {
  console.error('NEXT_PUBLIC_ENTRA_ID_TENANT_ID is not defined');
}

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

// ブラウザ環境でのみ初期化とイベントリスナーを設定する
if (typeof window !== 'undefined') {
  // アクティブアカウント変更のイベントリスナーを追加する
  msalInstance.addEventCallback((event: EventMessage) => {
    if (
      event.eventType === EventType.LOGIN_SUCCESS ||
      event.eventType === EventType.ACQUIRE_TOKEN_SUCCESS ||
      event.eventType === EventType.SSO_SILENT_SUCCESS
    ) {
      console.log('Authentication event success:', event.eventType);

      // AuthenticationResultの場合のみaccountにアクセスする
      if (event.payload && 'account' in event.payload) {
        const result = event.payload as AuthenticationResult;
        if (result.account) {
          msalInstance.setActiveAccount(result.account);
          console.log('Active account set:', result.account.username);
        }
      }
    }

    // エラー時のログ出力
    if (
      event.eventType === EventType.LOGIN_FAILURE ||
      event.eventType === EventType.ACQUIRE_TOKEN_FAILURE ||
      event.eventType === EventType.SSO_SILENT_FAILURE
    ) {
      console.error('Authentication event failure:', event.eventType, event.error);
    }
  });
}

export default function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [isAuthenticating, setIsAuthenticating] = useState(false);

  // APIアクセス許可取得処理を行う
  const acquireApiPermissions = async () => {
    try {
      if (!apiScopes.length) {
        console.log('No API scopes defined, skipping API permission acquisition');
        return;
      }

      setIsAuthenticating(true);
      console.log('Requesting API permissions for scopes:', apiScopes);

      // APIスコープに対するアクセストークン取得を試みる
      await msalInstance.acquireTokenRedirect({
        scopes: apiScopes
      });
    } catch (error) {
      console.error('Error acquiring API permissions:', error);
    }
  };

  // MSAL初期化とリダイレクト処理を行う
  useEffect(() => {
    const initializeAuth = async () => {
      try {
        await msalInstance.initialize();
        console.log('MSAL initialized successfully');

        // リダイレクト処理の確実な実行と結果の把握を行う
        try {
          const response = await msalInstance.handleRedirectPromise();
          console.log('Redirect processing complete');

          if (response) {
            console.log('Redirect response received:', response.uniqueId);
            msalInstance.setActiveAccount(response.account);
            setIsAuthenticated(true);

            // リダイレクトが完了していてAPIスコープのトークンがない場合はAPI権限を取得する
            const hasApiScope = response.scopes.some(scope =>
              apiScopes.includes(scope)
            );

            if (hasApiScope) {
              setIsAuthenticating(false);
            } else if (apiScopes.length > 0) {
              // 少し遅延させて認証表示を確実に見せる
              setTimeout(() => {
                acquireApiPermissions();
              }, 1000);
            } else {
              setIsAuthenticating(false);
            }
          } else {
            // アクティブなアカウントがあるかチェックする
            const currentAccounts = msalInstance.getAllAccounts();
            if (currentAccounts.length > 0) {
              msalInstance.setActiveAccount(currentAccounts[0]);
              setIsAuthenticated(true);
              console.log('Active account found and set:', currentAccounts[0].username);

              // すでにログイン済みの場合、APIスコープに対する権限を確認する
              if (apiScopes.length > 0) {
                try {
                  // 既存のトークンをサイレント取得する（権限があれば成功する）
                  await msalInstance.acquireTokenSilent({
                    scopes: apiScopes,
                    account: currentAccounts[0]
                  });
                  setIsAuthenticating(false);
                } catch (error) {
                  acquireApiPermissions();
                }
              } else {
                setIsAuthenticating(false);
              }
            } else {
              setIsAuthenticated(false);
              setIsAuthenticating(false);
              console.log('No active accounts found');
            }
          }
        } catch (error) {
          console.error('Error during redirect handling:', error);
          setIsAuthenticated(false);
          setIsAuthenticating(false);
        }
      } catch (error) {
        console.error('MSAL initialization error:', error);
        setIsAuthenticating(false);
      } finally {
        setIsInitialized(true);
      }
    };

    initializeAuth();
  }, []);

  // 初期化前にはローディング表示する
  if (!isInitialized) {
    return (
      <div style={{ textAlign: 'center', padding: '20px' }}>
        <p>認証を初期化中...</p>
      </div>
    );
  }

  // 認証処理中（API権限取得中）の表示
  if (isAuthenticating) {
    return (
      <div style={{ textAlign: 'center', padding: '20px' }}>
        <p>アプリケーションのアクセス許可を処理中です...</p>
        <p>この後、アクセス許可の確認が表示されることがあります。</p>
        <p>その場合、アクセスを許可してください。</p>
      </div>
    );
  }

  return (
    <MsalProvider instance={msalInstance}>
      {children}
    </MsalProvider>
  );
}
