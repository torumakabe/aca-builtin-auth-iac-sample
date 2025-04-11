"use client";

import { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import Head from 'next/head';
import { useMsal } from '@azure/msal-react';
import { InteractionStatus, InteractionRequiredAuthError } from '@azure/msal-browser';
import { apiScopes } from './AuthProvider';

interface Message {
  sender: 'user' | 'bot';
  text: string;
}

// チャットコンポーネント
function ChatComponent() {
  const { instance, accounts } = useMsal();
  const [token, setToken] = useState<string>('');
  const [message, setMessage] = useState('');
  const [chatHistory, setChatHistory] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const chatContainerRef = useRef<HTMLDivElement>(null);

  // トークン取得処理
  useEffect(() => {
    const getToken = async () => {
      if (accounts.length > 0) {
        try {
          // APIスコープがある場合のみトークン取得を試みる
          if (apiScopes.length > 0) {
            const tokenResponse = await instance.acquireTokenSilent({
              scopes: apiScopes,
              account: accounts[0]
            });
            setToken(tokenResponse.accessToken);
            console.log('Token acquired successfully');
          } else {
            // スコープがない場合はログイン状態を示すダミートークンを設定
            setToken('logged-in');
            console.log('No API scope defined, using dummy token for authenticated state');
          }
        } catch (error) {
          console.error('Token acquisition error:', error);

          // InteractionRequiredAuthErrorの場合は再認証を促す
          if (error instanceof InteractionRequiredAuthError) {
            try {
              // リダイレクト認証を開始（トークンは返さず、リダイレクト後に再度このコンポーネントがマウントされる）
              instance.acquireTokenRedirect({
                scopes: apiScopes,
                account: accounts[0]
              });
              // ここには到達しない（リダイレクトが発生するため）
            } catch (redirectError) {
              console.error('Redirect authentication error:', redirectError);
              // エラー発生時もダミートークンで続行
              setToken('logged-in');
            }
          } else {
            // その他のエラーの場合はダミートークンで続行
            setToken('logged-in');
          }
        }
      }
    };

    getToken();
  }, [instance, accounts]);

  const sendMessage = async () => {
    if (!message.trim()) return;

    const newMessage: Message = { sender: 'user', text: message };
    setChatHistory((prev) => [...prev, newMessage]);
    setMessage('');
    setIsLoading(true);

    try {
      const apiUrl = process.env.NEXT_PUBLIC_CHAT_API_URL || '';

      // 認証ヘッダーのみ設定（トレースヘッダーはApplication Insightsが自動的に追加する）
      const headers: Record<string, string> = {
        Authorization: `Bearer ${token}`,
      };

      const res = await axios.post(apiUrl, { prompt: message }, { headers });
      const botMessage: Message = { sender: 'bot', text: res.data.response };
      setChatHistory((prev) => [...prev, botMessage]);
    } catch (error) {
      console.error('Error sending message:', error);
      const errorMessage: Message = { sender: 'bot', text: 'An error occurred while sending the message.' };
      setChatHistory((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [chatHistory]);

  const handleLogout = () => {
    instance.logoutRedirect();
  };

  return (
    <>
      <div className="login-status-container">
        <p className="login-status">ログイン済み: {accounts[0]?.username || accounts[0]?.name}</p>
        <button onClick={handleLogout} className="logout-button">ログアウト</button>
      </div>
      <div ref={chatContainerRef} className="chat-container">
        {chatHistory.map((msg, index) => (
          <div key={index} className={`message ${msg.sender === 'bot' ? 'bot' : 'user'}`}>
            <p className="message-text">{msg.text}</p>
          </div>
        ))}
        {isLoading && <p className="loading">送信中...</p>}
      </div>
      <div className="input-container">
        <input
          type="text"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          className="input"
          placeholder="メッセージを入力してください"
        />
        <button onClick={sendMessage} className="send-button">送信</button>
      </div>
    </>
  );
}

// ログインコンポーネント
function LoginComponent() {
  const { instance } = useMsal();

  const handleLogin = () => {
    instance.loginRedirect();
  };

  return (
    <div className="login-container">
      <p>メッセージを送信するにはログインが必要です。</p>
      <button onClick={handleLogin} className="login-button">ログイン</button>
    </div>
  );
}

export default function Home() {
  const { instance, accounts, inProgress } = useMsal();

  // 認証プロセス中の表示（SsoSilentは除外する）
  if (inProgress !== InteractionStatus.None && inProgress !== InteractionStatus.SsoSilent) {
    return (
      <div className="container">
        <div className="chat-box">
          <h1 className="title">Simple Chat</h1>
          <div className="loading-container">
            <p>認証処理中...しばらくお待ちください</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      <Head>
        <title>Simple Chat</title>
      </Head>
      <div className="chat-box">
        <h1 className="title">Simple Chat</h1>

        {accounts.length > 0 ? (
          <ChatComponent />
        ) : (
          <LoginComponent />
        )}
      </div>
    </div>
  );
}
