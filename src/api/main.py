"""
Azure OpenAIを使用したシンプルなチャットのためのFastAPIアプリケーション。

クラス:
    ChatRequest: チャットリクエストのペイロードを表すPydanticモデル。
    ChatResponse: チャットレスポンスのペイロードを表すPydanticモデル。

関数:
    chat(request: ChatRequest) -> ChatResponse: チャットリクエストを処理し、Azure OpenAIモデルからのレスポンスを返すエンドポイント。
"""

import os
import logging
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from openai import AzureOpenAI
from azure.identity import DefaultAzureCredential, get_bearer_token_provider
from azure.monitor.opentelemetry import configure_azure_monitor
from opentelemetry.instrumentation.httpx import HTTPXClientInstrumentor
from opentelemetry.instrumentation.openai import OpenAIInstrumentor
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor

# ログ設定
LOGGER_NAME = "API"
logger = logging.getLogger(LOGGER_NAME)

# FastAPIアプリケーションのインスタンス作成
app = FastAPI()

# Application Insightsの計装
if os.environ.get("APPLICATIONINSIGHTS_CONNECTION_STRING"):
    configure_azure_monitor(
        logger_name=LOGGER_NAME,
    )
    HTTPXClientInstrumentor().instrument()
    OpenAIInstrumentor().instrument()
    FastAPIInstrumentor().instrument_app(app)

# ミドルウェアの設定
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 必要に応じて特定のオリジンを指定する
    allow_credentials=True,
    allow_methods=["*"],  # 必要に応じて特定のメソッドを指定する
    allow_headers=["*"],  # 必要に応じて特定のヘッダーを指定する
)


# 環境変数取得関数
def get_env_variable(name):
    """
    環境変数を取得する関数。
    指定された環境変数が設定されていない場合、エラーをスローする。

    Args:
        name (str): 環境変数の名前。

    Returns:
        str: 環境変数の値。

    Raises:
        EnvironmentError: 環境変数が設定されていない場合。
    """
    value = os.getenv(name)
    if value is None:
        raise EnvironmentError(f"Environment variable {name} is not set.")
    return value


# 環境変数の取得
ENDPOINT = get_env_variable("AZURE_OPENAI_ENDPOINT")
DEPLOYMENT_NAME = get_env_variable("AZURE_OPENAI_DEPLOYMENT_NAME")
MODEL_NAME = get_env_variable("AZURE_OPENAI_MODEL_NAME")
API_VERSION = get_env_variable("AZURE_OPENAI_API_VERSION")

# Azure OpenAIクライアントの設定
TOKEN_PROVIDER = get_bearer_token_provider(
    DefaultAzureCredential(), "https://cognitiveservices.azure.com/.default"
)

client = AzureOpenAI(
    azure_endpoint=ENDPOINT,
    azure_deployment=DEPLOYMENT_NAME,
    api_version=API_VERSION,
    azure_ad_token_provider=TOKEN_PROVIDER,
)


# Pydanticモデル
class ChatRequest(BaseModel):
    """
    チャットリクエストのペイロードを表すPydanticモデル。

    属性:
        prompt (str): ユーザーからのプロンプト。
    """

    prompt: str


class ChatResponse(BaseModel):
    """
    チャットレスポンスのペイロードを表すPydanticモデル。

    属性:
        response (str): Azure OpenAIモデルからのレスポンス。
    """

    response: str


# エンドポイント
@app.post("/api/chat", response_model=ChatResponse)
async def chat(request: ChatRequest):
    """
    チャットリクエストを処理し、Azure OpenAIモデルからのレスポンスを返すエンドポイント。

    パラメータ:
        request (ChatRequest): チャットリクエストのペイロード。

    戻り値:
        ChatResponse: Azure OpenAIモデルからのレスポンス。
    """
    try:
        response = client.chat.completions.create(
            messages=[
                {
                    "role": "system",
                    "content": "You are a helpful assistant.",
                },
                {
                    "role": "user",
                    "content": request.prompt,
                },
            ],
            max_tokens=4096,
            temperature=1.0,
            top_p=1.0,
            model=MODEL_NAME,
        )
        content = response.choices[0].message.content
        if content is None:
            raise HTTPException(status_code=500, detail="Response content is None")
        return ChatResponse(response=content.strip())
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e
