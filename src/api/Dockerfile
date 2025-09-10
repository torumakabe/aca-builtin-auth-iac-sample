## ステージ1: 依存の固定化にのみ uv を使用
FROM ghcr.io/astral-sh/uv:python3.13-bookworm AS deps

# 作業ディレクトリを設定
WORKDIR /app

## 依存解決のためにプロジェクトメタデータをコピー
COPY pyproject.toml ./

# ランタイム用に固定化された requirements を生成
RUN --mount=type=cache,target=/root/.cache/uv \
    uv pip compile pyproject.toml -o requirements.txt

## ステージ2: uv を含まないランタイムイメージ
FROM python:3.13-slim AS runtime
WORKDIR /app

# Python 依存関係をインストール
COPY --from=deps /app/requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# アプリケーションのソースをコピー
COPY . .

# 非rootユーザーを作成し、権限を設定（参照パターンに準拠）
RUN groupadd -g 10001 app \
    && useradd -r -u 10001 -g app app \
    && mkdir -p /app \
    && chown -R app:app /app

# 環境変数と公開ポート
ENV PORT=8080
EXPOSE 8080

# 権限をドロップ
USER app:app

# FastAPI を起動（最終イメージには uv は含まれない）
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8080", "--timeout-graceful-shutdown", "30"]
