# Azure Container Apps 組み込み認証 IaCサンプル

Azure Container Apps と Entra ID認証を使用したシンプルなチャットアプリケーションです。このアプリケーションは、フロントエンドとバックエンドAPIの2つのサービスで構成されており、Azure OpenAIを使って応答を生成します。

## 背景

Azure Container AppsやAzure App Serviceには組み込みの認証機能（通称: EasyAuth）があります。ポータルからはAzureとEntra IDをまたがる設定が抽象化されており、容易に有効化できます。しかし、内部で何が行われているかが見えにくく、Infrastructure as Code（IaC）でコードへ落とし込む際に苦労しがちです。

そこで、このリポジトリはAzure Container Appsの組み込み認証をIaCで扱うサンプルを提供します。以下のような特徴があります。

- コードによる理解
  - ドキュメントだけでは理解しにくい設定を、動くコードを見て理解を助ける
- IaCツールはBicepを採用
  - Entra ID アプリケーションの操作にMicrosoft Graph用Bicepを使用（現時点ではプレビュー中のため、情報が少なく貴重）
- IaCによる柔軟なカスタマイズ
  - 組み込み認証むけのアプリケーションにシークレットを使わず、マネージドIDとフェデレーションで認証（シークレット管理やローテーションが不要）
- Azure Developer CLI、VS Codeの活用
  - ツールを組み合わせ、設定の手数をできる限り少なく（BicepではできないEntra IDアプリケーションの削除をフックで実行する、など）

## 構成要素

このアプリケーションは以下のコンポーネントで構成されています：

- **フロントエンド**: Next.js（TypeScript）で実装されたSingle Page Application（SPA）。静的レンダリングし、Azure Static Web Appsでホスティング。
- **バックエンドAPI**: FastAPI（Python）で実装されたAPI。Azure Container Appsでホスティング。
- **認証**: Microsoft Entra IDを使用した認証。
- **LLM**: Azure OpenAIを使用したチャット応答の生成。
- **可観測性向上**: Application Insightsを使用したテレメトリ収集。

### 概要図

```mermaid
graph TD
    User((ユーザー)) --> SWA[Azure Static Web App<br/>フロントエンド<br/>Next.js]
    SWA --> ACAAuth
    SWA --> EntraID
    ACAAuth --> EntraID
    ACA --> OpenAI[Azure OpenAI Service]
    SWA --> AppInsights[Application Insights]
    ACAGroup --> AppInsights
    
    subgraph Azure
        SWA
        
        subgraph ACAGroup[Azure Container Apps]
            ACAAuth[組み込み認証] --> ACA[バックエンドAPI<br/>FastAPI]
        end
        
        OpenAI
        AppInsights
        ACR[Azure Container Registry]
    end
    
    ACR --> ACAGroup
    
    EntraID[Microsoft Entra ID]
```

- ユーザーはフロントエンド（Azure Static Web App）にアクセス
- ユーザーはMicrosoft Entra IDを使用して認証し、フロントエンドページを取得
- ユーザーはフロントエンドページで、チャットのために再度ログイン
- フロントエンドページはチャットメッセージをバックエンドAPIに送信
- 組み込み認証機能はEntra IDを使用してトークンを検証し、認証されたリクエストのみをバックエンドAPIに転送し
- バックエンドAPI（FastAPI）はAzure OpenAIを呼び出してチャット応答を生成
- Application Insightsはフロントエンド、バックエンドAPIからテレメトリを収集
- バックエンドAPIのコンテナイメージはAzure Container Registryで管理

## テスト済み環境

- [Azure CLI](https://docs.microsoft.com/ja-jp/cli/azure/install-azure-cli): 2.71.0
- [Azure Developer CLI (azd)](https://learn.microsoft.com/ja-jp/azure/developer/azure-developer-cli/install-azd): 1.14.0
- [Docker Desktop](https://www.docker.com/products/docker-desktop/): 4.40.0
- [Node.js](https://nodejs.org/): 23.11.0
- [Python](https://www.python.org/): 3.12.10
- [Visual Studio Code](https://code.visualstudio.com/): 1.99.2

## Azureへのデプロイ

### 必要な権限

このアプリケーションをデプロイするには、以下の権限が必要です：

- **サブスクリプションレベルの権限**：
  - 「共同作成者」ロール または
  - 以下のリソースを作成できる十分な権限：
    - Azure Container Registry
    - Azure Container Apps
    - Azure Static Web Apps
    - Azure OpenAI Service
    - Azure Application Insights
    - リソースグループ

- **Microsoft Entra IDの権限**：
  - アプリケーション登録を作成・管理できる権限

このアプリケーションはAzure OpenAIサービスを使用するため、ローカル開発を行う前にまずAzureへのデプロイが必要です。デプロイにはAzure Developer CLI (azd)を使用します。

```bash
# リポジトリをクローン
git clone https://github.com/torumakabe/aca-builtin-auth-iac-sample.git
cd aca-builtin-auth-iac-sample

# Azure CLIでログイン(azdの認証とは別に、DefaultAzureCredentialでCLIの認証情報を使う機能があるため)
az login
az account set --subscription <サブスクリプションID>

# 環境を初期化
azd init

# デプロイ
azd up
```

デプロイ後、以下のリソースが作成されます：

- Azure Container Registry
- Azure Container Apps Environment
- Azure Container App (バックエンドAPI)
- Azure Static Web App (フロントエンド)
- Azure OpenAI Service
- Azure Application Insights
- Entra ID アプリケーション登録 (APIとクライアント)

> **重要**: Azure Developer CLI (azd) には環境ごとに`.env`ファイルを管理する機能があります。当サンプルではazdが管理する`.env`ファイルがAzureへのデプロイだけでなく、ローカル実行やビルド、環境のクリーンアップ時に参照されます。ユーザーが直接`.env`ファイルを操作する必要はありません。

## Azureリソースの削除

使用後は以下のコマンドでリソースを削除できます：

```bash
# リソースを削除
azd down
```

> **重要**: `azd down`コマンドはAzureリソースを削除しますが、Microsoft Entra IDのアプリケーションを削除しません。当サンプルはazdの`predown`フックでスクリプトを呼び出し、削除します。

## ローカルでの開発

> **重要**: ローカル開発を行う前に、上記の「Azureへのデプロイ」セクションの手順に従って、Azureリソースをデプロイしてください。アプリケーションはAzure OpenAIへの接続を必要とします。

### VS Codeでのプロジェクト準備

1. プロジェクトをVS Codeで開きます

2. Pythonインタープリターの選択と仮想環境を作成します
   - VSCodeの左下のステータスバーをクリックするか、`Ctrl+Shift+P (Windows)` `Cmd+Shift+P (macOS)`でコマンドパレットを開き、`Python: Select Interpreter`を選択します
   - 既存のPythonインタープリターが表示されるので適切なバージョン（Python 3.12など）を選択します
   - 仮想環境を新規作成する場合は、コマンドパレットから`Python: Create Environment`を選択します
     - 環境タイプとして`Venv`を選択します
     - プロジェクトのルートディレクトリに`.venv`という名前で仮想環境が作成されます
   - 作成した仮想環境をインタープリターとして選択します

3. 依存パッケージをインストールします
   - pip、npmを適宜実行するか、VS Codeのタスク実行から以下のタスクを実行してください：
     - `install-api-dependencies` (バックエンドAPI)
     - `install-frontend-dependencies` (フロントエンド)

### ローカルでの実行

VS Codeのデバッグ機能を使って、アプリケーションを簡単に実行できます：

- **[API] Python Debugger: FastAPI** - バックエンドAPIを実行する場合
- **[Frontend] Debug Next.js** - フロントエンドを実行する場合

> **補足**: VS Codeのデバッグ構成(launch.json)で、Azure Developer CLIが管理する`.env`ファイルを読み込むよう設定されています。

## 設定

アプリケーションの設定は以下の環境変数で構成されています（これらはazdによって管理されます）：

### バックエンドAPI

- `AZURE_OPENAI_ENDPOINT`: Azure OpenAIのエンドポイント
- `AZURE_OPENAI_DEPLOYMENT_NAME`: Azure OpenAIのデプロイ名
- `AZURE_OPENAI_MODEL_NAME`: 使用するモデル名
- `AZURE_OPENAI_API_VERSION`: Azure OpenAI APIのバージョン
- `APPLICATIONINSIGHTS_CONNECTION_STRING`: Application Insightsの接続文字列

### フロントエンド

- `NEXT_PUBLIC_CHAT_API_URL`: バックエンドAPIのURL
- `NEXT_PUBLIC_ENTRA_ID_API_APP_CLIENT_ID`: Entra IDクライアントアプリのID
- `NEXT_PUBLIC_ENTRA_ID_TENANT_ID`: Entra IDテナントID
- `NEXT_PUBLIC_API_SCOPE`: APIスコープ
- `NEXT_PUBLIC_APPLICATIONINSIGHTS_CONNECTION_STRING`: Application Insightsの接続文字列

## 補足

- バックエンドAPIはAzure OpenAIやAzure Container Registryなどバックエンドサービスにプライベートエンドポイント経由でアクセスしますが、試用しやすさを考慮しパブリックアクセスも許可しています。`BACKEND_SERVICE_PUBLIC_NETWORK_ACCESS`を`Disabled`に変更すると、バックエンドサービスのパブリックアクセスを無効にできます。一方で無効にすると、インターネット経由ではバックエンドAPIのローカル実行やコンテナイメージのデプロイができなくなります。必要に応じてプライベートネットワークを構築し、当サンプルのネットワークをカスタマイズしてください。
- ログイン後、アクセス許可のためにユーザーの同意を要求します。ログアウトすると、再ログイン時に再び要求します。Entra IDでクライアントアプリケーションへ管理者同意すると要求されなくなります。

## ライセンス

このプロジェクトは [LICENSE](/LICENSE) ファイルに定義されたライセンスの下で配布されています。
