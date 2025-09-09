"use client";

import { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import Head from 'next/head';
import { useMsal, MsalAuthenticationTemplate } from '@azure/msal-react';
import { InteractionRequiredAuthError, InteractionType } from '@azure/msal-browser';
import { apiScopes, loginRequest } from './AuthProvider';

interface Message {
  sender: 'user' | 'bot';
  text: string;
}

// チャットコンポーネント
function ChatComponent() {
  const { instance, accounts } = useMsal();
  const [message, setMessage] = useState('');
  const [chatHistory, setChatHistory] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const chatContainerRef = useRef<HTMLDivElement>(null);

  // 必要なときだけトークンを取得する
  const getToken = async (): Promise<string | null> => {
    if (apiScopes.length === 0) return null;
    try {
      const tokenResponse = await instance.acquireTokenSilent({
        scopes: apiScopes,
        account: accounts[0]
      });
      return tokenResponse.accessToken;
    } catch (error) {
      if (error instanceof InteractionRequiredAuthError) {
        await instance.acquireTokenRedirect({ scopes: apiScopes });
        return null; // リダイレクトで遷移するためここには戻らない
      }
      console.error('Token acquisition error:', error);
      return null;
    }
  };

  const sendMessage = async () => {
    if (!message.trim()) return;

    const newMessage: Message = { sender: 'user', text: message };
    setChatHistory((prev) => [...prev, newMessage]);
    setMessage('');
    setIsLoading(true);

    try {
      const apiUrl = process.env.NEXT_PUBLIC_CHAT_API_URL || '';

      const accessToken = await getToken();
      // トークンがあるときだけAuthorizationヘッダーを付与
      const headers: Record<string, string> = accessToken
        ? { Authorization: `Bearer ${accessToken}` }
        : {};

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

export default function Home() {
  const request = apiScopes.length > 0 ? { scopes: apiScopes } : loginRequest;

  const Loading = () => (
    <div className="loading-container">
      <p>認証処理中...しばらくお待ちください</p>
    </div>
  );

  const ErrorView = ({ error }: { error?: unknown }) => (
    <div className="loading-container">
      <p>
        認証エラーが発生しました: {error instanceof Error ? error.message : 'Unknown error'}
      </p>
    </div>
  );

  return (
    <div className="container">
      <Head>
        <title>Simple Chat</title>
      </Head>
      <div className="chat-box">
        <h1 className="title">Simple Chat</h1>

        <MsalAuthenticationTemplate
          interactionType={InteractionType.Redirect}
          authenticationRequest={request}
          loadingComponent={Loading}
          errorComponent={ErrorView}
        >
          <ChatComponent />
        </MsalAuthenticationTemplate>
      </div>
    </div>
  );
}
