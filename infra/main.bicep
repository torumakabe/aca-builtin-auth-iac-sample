targetScope = 'subscription'

@minLength(1)
@maxLength(64)
@description('Name of the environment that can be used as part of naming resource convention')
param environmentName string

@minLength(1)
@description('Primary location for all resources')
param location string

@minLength(1)
@description('Location for the static web app')
param staticWebAppLocation string

param apiExists bool
@secure()
param apiDefinition object

@description('Id of the user or app to assign application roles')
param principalId string

@description('Azure OpenAI deployment name')
param azureOpenAiDeploymentName string

@description('Azure OpenAI model name')
param azureOpenAiModelName string

@description('Azure OpenAI model version')
param azureOpenAiModelVersion string

@description('Azure OpenAI API version')
param azureOpenAiApiVersion string

@description('Switch for backend service public network access')
param backendServicePublicNetworkAccess string

// すべてのリソースに適用すべきタグ
//
// 重要: 'azd-service-name'タグはサービスホストリソースに個別に適用する必要がある
// 使用例:
//   tags: union(tags, { 'azd-service-name': <azure.yamlのサービス名> })
var tags = {
  'azd-env-name': environmentName
}

// mainで作成するリソースはリソースグループのみ。他のリソースはresourcesモジュールで、リソースグループスコープで作る。
resource rg 'Microsoft.Resources/resourceGroups@2021-04-01' = {
  name: 'rg-${environmentName}'
  location: location
  tags: tags
}

module resources './resources.bicep' = {
  scope: rg
  name: 'resources'
  params: {
    location: location
    staticWebAppLocation: staticWebAppLocation
    tags: tags
    principalId: principalId
    apiExists: apiExists
    apiDefinition: apiDefinition
    azureOpenAiDeploymentName: azureOpenAiDeploymentName
    azureOpenAiModelName: azureOpenAiModelName
    azureOpenAiModelVersion: azureOpenAiModelVersion
    azureOpenAiApiVersion: azureOpenAiApiVersion
    backendServicePublicNetworkAccess: backendServicePublicNetworkAccess
  }
}

output AZURE_CONTAINER_REGISTRY_ENDPOINT string = resources.outputs.AZURE_CONTAINER_REGISTRY_ENDPOINT
output AZURE_RESOURCE_API_ID string = resources.outputs.AZURE_RESOURCE_API_ID
output AZURE_RESOURCE_STATIC_WEB_APP_ID string = resources.outputs.AZURE_RESOURCE_STATIC_WEB_APP_ID
output AZURE_CONTAINER_APPS_API_FQDN string = resources.outputs.AZURE_CONTAINER_APPS_API_FQDN
output AZURE_OPENAI_ENDPOINT string = resources.outputs.AZURE_OPENAI_ENDPOINT
output AZURE_OPENAI_DEPLOYMENT_NAME string = resources.outputs.AZURE_OPENAI_DEPLOYMENT_NAME
output AZURE_OPENAI_MODEL_NAME string = resources.outputs.AZURE_OPENAI_MODEL_NAME
output AZURE_OPENAI_MODEL_VERSION string = resources.outputs.AZURE_OPENAI_MODEL_VERSION
output AZURE_OPENAI_API_VERSION string = resources.outputs.AZURE_OPENAI_API_VERSION
output ENTRA_ID_API_APP_ID string = resources.outputs.ENTRA_ID_API_APP_ID
output ENTRA_ID_API_CLIENT_APP_ID string = resources.outputs.ENTRA_ID_API_CLIENT_APP_ID
output NEXT_PUBLIC_CHAT_API_URL string = 'https://${resources.outputs.AZURE_CONTAINER_APPS_API_FQDN}/api/chat'
output NEXT_PUBLIC_ENTRA_ID_API_APP_CLIENT_ID string = resources.outputs.ENTRA_ID_API_CLIENT_APP_ID
output NEXT_PUBLIC_ENTRA_ID_TENANT_ID string = tenant().tenantId
output NEXT_PUBLIC_API_SCOPE string = 'api://${resources.outputs.ENTRA_ID_API_APP_ID}/.default'
output APPLICATIONINSIGHTS_CONNECTION_STRING string = resources.outputs.APPLICATIONINSIGHTS_CONNECTION_STRING
output NEXT_PUBLIC_APPLICATIONINSIGHTS_CONNECTION_STRING string = resources.outputs.APPLICATIONINSIGHTS_CONNECTION_STRING
output BACKEND_SERVICE_PUBLIC_NETWORK_ACCESS string = backendServicePublicNetworkAccess
