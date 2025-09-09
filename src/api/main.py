"""
Azure OpenAIを使用したシンプルなチャットのためのFastAPIアプリケーション。

クラス:
    ChatRequest: チャットリクエストのペイロードを表すPydanticモデル。
    ChatResponse: チャットレスポンスのペイロードを表すPydanticモデル。

関数:
    chat(request: ChatRequest) -> ChatResponse: チャットリクエストを処理し、Azure OpenAIモデルからのレスポンスを返すエンドポイント。
"""

import logging
import os
import warnings

from azure.identity import DefaultAzureCredential, get_bearer_token_provider
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from openai import AzureOpenAI
from pydantic import BaseModel

# azure.monitor の import 前に pkg_resources の非推奨警告を抑制
warnings.filterwarnings(
    "ignore",
    category=UserWarning,
    message=r"pkg_resources is deprecated as an API.*",
)

import importlib

from azure.monitor.opentelemetry import configure_azure_monitor

# 不要なエラー/ノイズを避けるため Azure Monitor の自動インストルメント探索を無効化
try:
    _am_cfg = importlib.import_module("azure.monitor.opentelemetry._configure")
    if hasattr(_am_cfg, "_setup_instrumentations"):
        _am_cfg._setup_instrumentations = lambda *_args, **_kwargs: None  # type: ignore
except Exception:
    pass

from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
from opentelemetry.instrumentation.httpx import HTTPXClientInstrumentor
from opentelemetry.instrumentation.openai import OpenAIInstrumentor

# ログ設定
LOGGER_NAME = "API"
logger = logging.getLogger(LOGGER_NAME)

# FastAPIアプリケーションのインスタンス作成
app = FastAPI()


# Application Insightsの計装（有効な接続文字列のみ）
def _sanitize_appinsights_conn_string() -> str | None:
    cs = os.environ.get("APPLICATIONINSIGHTS_CONNECTION_STRING")
    if not cs:
        return None
    s = cs.strip()
    if (s.startswith('"') and s.endswith('"')) or (s.startswith("'") and s.endswith("'")):
        s = s[1:-1].strip()
    # 変更があれば環境変数に書き戻す
    if s != cs:
        os.environ["APPLICATIONINSIGHTS_CONNECTION_STRING"] = s
    return s


_appinsights_cs = _sanitize_appinsights_conn_string()
# 未使用でノイズとなる自動インストルメントを既定で無効化（環境変数で上書き可能）
if "OTEL_PYTHON_DISABLED_INSTRUMENTATIONS" not in os.environ:
    os.environ["OTEL_PYTHON_DISABLED_INSTRUMENTATIONS"] = (
        "django,flask,psycopg2,requests,urllib,urllib3"
    )

if _appinsights_cs:
    try:
        configure_azure_monitor(
            logger_name=LOGGER_NAME,
        )
        HTTPXClientInstrumentor().instrument()
        OpenAIInstrumentor().instrument()
        FastAPIInstrumentor().instrument_app(app)
        logger.info("Azure Monitor instrumentation enabled.")
    except Exception as e:
        logger.warning("Azure Monitor instrumentation disabled: %s", e)
else:
    logger.info("Azure Monitor not configured: missing or invalid connection string.")

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
        raise OSError(f"Environment variable {name} is not set.")
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
