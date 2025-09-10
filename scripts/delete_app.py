"""
Microsoft Graph APIを使用してEntra IDアプリケーション登録を削除するスクリプト。
Azure Developer CLI (azd)が管理する環境ファイルからアプリケーションIDを抽出し、それをオブジェクトIDに変換して削除処理を行う。
"""

import json
import os
import re
import subprocess
from typing import Any

import requests
from azure.identity import DefaultAzureCredential


def get_azd_env_file_path() -> str | None:
    """
    azdコマンドを使用して.envファイルのパスを取得する

    Returns:
        str: デフォルト環境の.envファイルのパス（見つからない場合はNone）
    """
    try:
        # azd env list -o jsonコマンドを実行して環境一覧を取得する
        result = subprocess.run(
            ["azd", "env", "list", "-o", "json"],
            capture_output=True,
            text=True,
            check=True,
        )

        # JSON出力をパースしてデフォルト環境を探す
        env_json = json.loads(result.stdout)

        for entry in env_json:
            if entry.get("IsDefault"):
                env_file_path = entry.get("DotEnvPath")
                if env_file_path:
                    print(f"Retrieved .env file from azd: {env_file_path}")
                    return env_file_path

        print("No default azd environment found.")
        return None

    except subprocess.CalledProcessError as e:
        print(f"Error loading azd environment: {e}")
    except json.JSONDecodeError as e:
        print(f"Error parsing JSON output: {e}")
    except Exception as e:
        print(f"Unexpected error occurred: {e}")

    return None


def find_env_file() -> str | None:
    """
    ディレクトリ検索で.envファイルを探す

    Returns:
        str: 見つかった.envファイルのパス（見つからない場合はNone）
    """
    for root, _, files in os.walk(os.getcwd()):
        if ".env" in files:
            path = os.path.join(root, ".env")
            print(f"Found .env file through file search: {path}")
            return path

    print(".env file not found.")
    return None


def extract_entra_ids(env_file_path: str, target_keys: dict[str, str]) -> dict[str, str]:
    """
    .envファイルから特定のEntra IDアプリケーションIDを抽出する

    Args:
        env_file_path (str): .envファイルのパス
        target_keys (Dict[str, str]): 抽出対象のキーとその表示ラベルのマッピング

    Returns:
        Dict[str, str]: 抽出されたアプリケーションIDの辞書 {アプリケーション表示名: アプリケーションID}
    """
    app_ids = {}

    try:
        with open(env_file_path, encoding="utf-8") as file:
            for line in file:
                line = line.strip()
                if not line or line.startswith("#"):
                    continue

                # キーと値のペアを抽出する
                match = re.match(r"^([A-Z_]+)=[\"\']?([^\"\']+)[\"\']?$", line)
                if match:
                    key, value = match.groups()
                    if key in target_keys:
                        app_ids[target_keys[key]] = value
    except Exception as e:
        print(f"Error reading .env file: {e}")

    return app_ids


def get_access_token() -> str | None:
    """
    DefaultAzureCredentialを使用してMicrosoft Graph APIのアクセストークンを取得する

    Returns:
        str: アクセストークン（認証に失敗した場合はNone）
    """
    try:
        credential = DefaultAzureCredential()
        token = credential.get_token("https://graph.microsoft.com/.default")
        return token.token
    except Exception as e:
        print(f"Authentication error: {e}")
        return None


def make_graph_request(
    method: str, url: str, access_token: str, success_code: int = 200
) -> tuple[bool, Any]:
    """
    Microsoft Graph APIへのリクエストを行う

    Args:
        method (str): HTTPメソッド（'get', 'post', 'delete'など）
        url (str): APIエンドポイントURL
        access_token (str): 認証トークン
        success_code (int): 期待する成功時のHTTPステータスコード

    Returns:
        Tuple[bool, Any]: 成功フラグとレスポンスデータ（または None）のタプル
    """
    if not access_token:
        return False, None

    headers = {
        "Authorization": f"Bearer {access_token}",
        "Content-Type": "application/json",
    }

    try:
        response = requests.request(method=method.lower(), url=url, headers=headers, timeout=30)

        if response.status_code == success_code:
            try:
                return True, response.json() if method.lower() == "get" else None
            except ValueError:
                return True, None
        else:
            print(f"Request failed: {response.status_code} {response.text}")
            return False, None

    except requests.RequestException as e:
        print(f"Request error: {e}")
        return False, None


def get_object_id_from_app_id(app_id: str, access_token: str) -> str | None:
    """
    アプリケーションIDからオブジェクトIDを取得する

    Args:
        app_id (str): アプリケーションID
        access_token (str): アクセストークン

    Returns:
        str: オブジェクトID（見つからない場合はNone）
    """
    url = f"https://graph.microsoft.com/v1.0/applications?$filter=appId eq '{app_id}'"
    success, data = make_graph_request("get", url, access_token)

    if success and data and data.get("value") and len(data["value"]) > 0:
        return data["value"][0]["id"]

    print(f"Application with appId {app_id} not found.")
    return None


def delete_entra_id_app(object_id: str, access_token: str) -> bool:
    """
    Microsoft Graph APIを使用してEntra IDアプリケーション登録を削除する

    Args:
        object_id (str): 削除するアプリケーションのオブジェクトID
        access_token (str): アクセストークン

    Returns:
        bool: 削除が成功した場合はTrue、それ以外はFalse
    """
    url = f"https://graph.microsoft.com/v1.0/applications/{object_id}"
    success, _ = make_graph_request("delete", url, access_token, 204)

    if success:
        print("Application deleted successfully.")

    return success


def permanently_delete_entra_id_app(object_id: str, access_token: str) -> bool:
    """
    削除済みアイテムからEntra IDアプリケーション登録を完全に削除する

    Args:
        object_id (str): 完全に削除するアプリケーションのオブジェクトID
        access_token (str): アクセストークン

    Returns:
        bool: 削除が成功した場合はTrue、それ以外はFalse
    """
    url = f"https://graph.microsoft.com/v1.0/directory/deletedItems/{object_id}"
    success, _ = make_graph_request("delete", url, access_token, 204)

    if success:
        print("Application permanently deleted successfully.")

    return success


def process_application(app_id: str, access_token: str) -> str | None:
    """
    アプリケーションを処理する - オブジェクトIDを取得する

    Args:
        app_id (str): アプリケーションID
        access_token (str): アクセストークン

    Returns:
        Optional[str]: 取得したオブジェクトID（取得できない場合はNone）
    """
    print(f"\nProcessing: Application ID: {app_id}")

    # アプリケーションIDからオブジェクトIDを取得する
    object_id = get_object_id_from_app_id(app_id, access_token)
    if not object_id:
        return None

    print(f"Found object ID: {object_id} for application ID: {app_id}")
    return object_id


def delete_applications(app_object_pairs: dict[str, str], access_token: str) -> None:
    """
    複数のアプリケーションをまとめて削除する

    Args:
        app_object_pairs (Dict[str, str]): アプリケーションIDとオブジェクトIDのペア辞書
        access_token (str): アクセストークン
    """
    if not app_object_pairs:
        print("No valid applications to delete.")
        return

    # 削除するアプリケーションの一覧を表示する
    print("\nThe following Entra ID applications will be deleted:")
    for app_id, object_id in app_object_pairs.items():
        print(f"- Application ID: {app_id}, Object ID: {object_id}")

    # まとめて確認を求める
    user_input = input("\nDeleting these Entra ID Applications, are you want to continue? (y/N) ")

    # 'y'または'Y'が入力された場合のみ削除を実行する
    if user_input.lower() == "y":
        for app_id, object_id in app_object_pairs.items():
            print(f"\nDeleting Entra ID application with ID: {app_id}")
            if delete_entra_id_app(object_id, access_token):
                print(f"Permanently deleting Entra ID application with object ID: {object_id}")
                permanently_delete_entra_id_app(object_id, access_token)
    else:
        print("Deletion cancelled. No applications were deleted.")


def main():
    """
    削除プロセスを調整するメイン関数
    """
    # 抽出対象のキーとその表示ラベル
    target_keys = {
        "ENTRA_ID_API_APP_ID": "API Application",
        "ENTRA_ID_API_CLIENT_APP_ID": "Client Application",
        # 将来的に他のキーが必要になった場合、ここに追加する
    }

    # .envファイルのパスを取得する - 最初にazdを試し、次にファイル検索にフォールバックする
    env_file_path = get_azd_env_file_path() or find_env_file()
    if not env_file_path:
        return

    # .envファイルからアプリケーションIDを抽出する
    app_ids = extract_entra_ids(env_file_path, target_keys)
    if not app_ids:
        print("Target ID(s) not found in .env file.")
        return

    # Graph API用のアクセストークンを取得する
    access_token = get_access_token()
    if not access_token:
        return

    # 各アプリケーションのオブジェクトIDを取得する
    app_object_pairs = {}
    for app_name, app_id in app_ids.items():
        print(f"\nFetching object ID for {app_name} (Application ID: {app_id})")
        object_id = process_application(app_id, access_token)
        if object_id:
            app_object_pairs[app_id] = object_id

    # すべてのアプリケーションをまとめて削除する
    delete_applications(app_object_pairs, access_token)

    print("\nEntra ID Application deletion process completed.")


if __name__ == "__main__":
    main()
