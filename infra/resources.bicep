@description('The location used for all deployed resources')
param location string = resourceGroup().location

@description('The location used for the static web app')
param staticWebAppLocation string

@description('Tags that will be applied to all resources')
param tags object = {}

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

var abbrs = loadJsonContent('./abbreviations.json')
var resourceToken = uniqueString(subscription().id, resourceGroup().id, location)

var issuer = '${environment().authentication.loginEndpoint}${tenant().tenantId}/v2.0'
var apiAppSecretSettingName = 'override-use-mi-fic-assertion-client-id'

module monitoring 'br/public:avm/ptn/azd/monitoring:0.1.1' = {
  name: 'monitoring'
  params: {
    logAnalyticsName: '${abbrs.operationalInsightsWorkspaces}${resourceToken}'
    applicationInsightsName: '${abbrs.insightsComponents}${resourceToken}'
    applicationInsightsDashboardName: '${abbrs.portalDashboards}${resourceToken}'
    location: location
    tags: tags
  }
}

module frontendStaticSite 'br/public:avm/res/web/static-site:0.9.0' = {
  name: 'frontend'
  params: {
    name: '${abbrs.webStaticSites}${resourceToken}'
    location: staticWebAppLocation
    sku: 'Standard'
    tags: union(tags, { 'azd-service-name': 'frontend' })
  }
}

module virtualNetwork 'br/public:avm/res/network/virtual-network:0.6.1' = {
  name: 'vnet'
  params: {
    name: '${abbrs.networkVirtualNetworks}${resourceToken}'
    location: location
    tags: tags
    addressPrefixes: [
      '10.0.0.0/16'
    ]
    subnets: [
      {
        name: '${abbrs.networkVirtualNetworksSubnets}default'
        addressPrefix: '10.0.0.0/24'
      }
      {
        name: '${abbrs.networkVirtualNetworksSubnets}aca'
        addressPrefix: '10.0.1.0/24'
        delegation: 'Microsoft.App/environments'
      }
      {
        name: '${abbrs.networkVirtualNetworksSubnets}pe'
        addressPrefix: '10.0.2.0/24'
      }
    ]
  }
}

module containerRegPrivateDnsZone 'br/public:avm/res/network/private-dns-zone:0.7.0' = {
  name: 'container-reg-private-dnszone'
  params: {
    name: 'privatelink.azurecr.io'
    virtualNetworkLinks: [
      {
        virtualNetworkResourceId: virtualNetwork.outputs.resourceId
      }
    ]
    tags: tags
  }
}

module containerRegistry 'br/public:avm/res/container-registry/registry:0.9.1' = {
  name: 'registry'
  params: {
    name: '${abbrs.containerRegistryRegistries}${resourceToken}'
    location: location
    tags: tags
    publicNetworkAccess: backendServicePublicNetworkAccess
    privateEndpoints: [
      {
        subnetResourceId: '${virtualNetwork.outputs.resourceId}/subnets/${abbrs.networkVirtualNetworksSubnets}pe'
        privateDnsZoneGroup: {
          privateDnsZoneGroupConfigs: [
            {
              privateDnsZoneResourceId: containerRegPrivateDnsZone.outputs.resourceId
            }
          ]
        }
      }
    ]
    exportPolicyStatus: 'enabled'
    roleAssignments: [
      {
        principalId: apiIdentity.outputs.principalId
        principalType: 'ServicePrincipal'
        roleDefinitionIdOrName: subscriptionResourceId(
          'Microsoft.Authorization/roleDefinitions',
          '7f951dda-4ed3-4680-a7ca-43fe172d538d'
        )
      }
    ]
  }
}

module containerAppsEnvironment 'br/public:avm/res/app/managed-environment:0.10.1' = {
  name: 'container-apps-environment'
  params: {
    logAnalyticsWorkspaceResourceId: monitoring.outputs.logAnalyticsWorkspaceResourceId
    appInsightsConnectionString: monitoring.outputs.applicationInsightsConnectionString
    name: '${abbrs.appManagedEnvironments}${resourceToken}'
    location: location
    zoneRedundant: false
    publicNetworkAccess: 'Enabled'
    infrastructureSubnetId: '${virtualNetwork.outputs.resourceId}/subnets/${abbrs.networkVirtualNetworksSubnets}aca'
    workloadProfiles: [
      {
        name: 'Consumption'
        workloadProfileType: 'Consumption'
      }
    ]
    tags: tags
  }
}

module oaiPrivateDnsZone 'br/public:avm/res/network/private-dns-zone:0.7.0' = {
  name: 'openai-private-dnszone'
  params: {
    name: 'privatelink.openai.azure.com'
    virtualNetworkLinks: [
      {
        virtualNetworkResourceId: virtualNetwork.outputs.resourceId
      }
    ]
    tags: tags
  }
}

var oaiCogAccountName = '${abbrs.cognitiveServicesAccounts}${resourceToken}'
module oaiCogAccount 'br/public:avm/res/cognitive-services/account:0.10.2' = {
  name: 'openai-cognitive-account'
  params: {
    tags: tags
    kind: 'OpenAI'
    name: oaiCogAccountName
    deployments: [
      {
        name: azureOpenAiDeploymentName
        model: {
          format: 'OpenAI'
          name: azureOpenAiModelName
          version: azureOpenAiModelVersion
        }
        sku: {
          capacity: 20
          name: 'Standard'
        }
      }
    ]
    location: location
    customSubDomainName: oaiCogAccountName
    publicNetworkAccess: backendServicePublicNetworkAccess
    privateEndpoints: [
      {
        subnetResourceId: '${virtualNetwork.outputs.resourceId}/subnets/${abbrs.networkVirtualNetworksSubnets}pe'
        privateDnsZoneGroup: {
          privateDnsZoneGroupConfigs: [
            {
              privateDnsZoneResourceId: oaiPrivateDnsZone.outputs.resourceId
            }
          ]
        }
      }
    ]
  }
}

resource localUserOpenAIIdentity 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(subscription().id, resourceGroup().id, 'localUser', '5e0bd9bd-7b93-4f28-af87-19fc36ad61bd')
  properties: {
    principalId: principalId
    principalType: 'User'
    roleDefinitionId: resourceId('Microsoft.Authorization/roleDefinitions', '5e0bd9bd-7b93-4f28-af87-19fc36ad61bd')
  }
}

module apiIdentity 'br/public:avm/res/managed-identity/user-assigned-identity:0.4.1' = {
  name: 'apiidentity'
  params: {
    name: '${abbrs.managedIdentityUserAssignedIdentities}api-${resourceToken}'
    location: location
  }
}

module appRegistration './modules/security/appregistration.bicep' = {
  name: 'app-registration'
  params: {
    name: 'Chat API sample application'
    apiAppName: '${resourceToken}-api'
    apiIdentity: apiIdentity.outputs.principalId
    issuer: issuer
    apiClientName: '${resourceToken}-client'
    apiClientRedirectUrl: 'https://${frontendStaticSite.outputs.defaultHostname}'
  }
}

resource apiOpenAIIdentity 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(subscription().id, resourceGroup().id, 'apiidentity', '5e0bd9bd-7b93-4f28-af87-19fc36ad61bd')
  properties: {
    principalId: apiIdentity.outputs.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: resourceId('Microsoft.Authorization/roleDefinitions', '5e0bd9bd-7b93-4f28-af87-19fc36ad61bd')
  }
}

module apiFetchLatestImage './modules/fetch-container-image.bicep' = {
  name: 'api-fetch-image'
  params: {
    exists: apiExists
    name: 'api'
  }
}

var apiAppSettingsArray = filter(array(apiDefinition.settings), i => i.name != '')
var apiSecrets = map(filter(apiAppSettingsArray, i => i.?secret != null), i => {
  name: i.name
  value: i.value
  secretRef: i.?secretRef ?? take(replace(replace(toLower(i.name), '_', '-'), '.', '-'), 32)
})
var apiEnv = map(filter(apiAppSettingsArray, i => i.?secret == null), i => {
  name: i.name
  value: i.value
})

module api 'br/public:avm/res/app/container-app:0.16.0' = {
  name: 'api'
  params: {
    name: 'api'
    ingressTargetPort: 8080
    scaleSettings: {
      minReplicas: 1
      maxReplicas: 10
    }
    secrets: [
      ...map(apiSecrets, secret => {
        identity: null
        keyVaultUrl: null
        name: secret.secretRef
        value: secret.value
      })
      {
        name: apiAppSecretSettingName
        value: apiIdentity.outputs.clientId
      }
    ]
    containers: [
      {
        image: apiFetchLatestImage.outputs.?containers[?0].?image ?? 'mcr.microsoft.com/azuredocs/containerapps-helloworld:latest'
        name: 'main'
        resources: {
          cpu: json('0.25')
          memory: '0.5Gi'
        }
        env: union(
          [
            {
              name: 'APPLICATIONINSIGHTS_CONNECTION_STRING'
              value: monitoring.outputs.applicationInsightsConnectionString
            }
            {
              name: 'OTEL_SERVICE_NAME'
              value: 'API'
            }
            {
              name: 'AZURE_CLIENT_ID'
              value: apiIdentity.outputs.clientId
            }
            {
              name: 'AZURE_OPENAI_ENDPOINT'
              value: oaiCogAccount.outputs.endpoint
            }
            {
              name: 'AZURE_OPENAI_DEPLOYMENT_NAME'
              value: azureOpenAiDeploymentName
            }
            {
              name: 'AZURE_OPENAI_MODEL_NAME'
              value: azureOpenAiModelName
            }
            {
              name: 'AZURE_OPENAI_API_VERSION'
              value: azureOpenAiApiVersion
            }
            {
              name: 'PORT'
              value: '8080'
            }
          ],
          apiEnv,
          map(apiSecrets, secret => {
            name: secret.name
            secretRef: secret.secretRef
          })
        )
      }
    ]
    managedIdentities: {
      systemAssigned: false
      userAssignedResourceIds: [apiIdentity.outputs.resourceId]
    }
    registries: [
      {
        server: containerRegistry.outputs.loginServer
        identity: apiIdentity.outputs.resourceId
      }
    ]
    environmentResourceId: containerAppsEnvironment.outputs.resourceId
    workloadProfileName: 'Consumption'
    location: location
    corsPolicy: {
      allowCredentials: true
      allowedOrigins: [
        'https://${frontendStaticSite.outputs.defaultHostname}'
      ]
      allowedHeaders: [
        '*'
      ]
      allowedMethods: [
        '*'
      ]
    }
    authConfig: {
      platform: {
        enabled: true
      }
      globalValidation: {
        redirectToProvider: 'azureactivedirectory'
        unauthenticatedClientAction: 'Return401'
      }
      identityProviders: {
        azureActiveDirectory: {
          enabled: true
          registration: {
            clientId: appRegistration.outputs.apiAppId
            clientSecretSettingName: apiAppSecretSettingName
            openIdIssuer: issuer
          }
          validation: {
            allowedAudiences: [
              'api://${appRegistration.outputs.apiAppId}'
            ]
            defaultAuthorizationPolicy: {
              allowedApplications: [
                appRegistration.outputs.apiAppId
                appRegistration.outputs.apiClientAppId
              ]
            }
          }
        }
      }
    }
    tags: union(tags, { 'azd-service-name': 'api' })
  }
}

output AZURE_CONTAINER_REGISTRY_ENDPOINT string = containerRegistry.outputs.loginServer
output AZURE_RESOURCE_API_ID string = api.outputs.resourceId
output AZURE_RESOURCE_STATIC_WEB_APP_ID string = frontendStaticSite.outputs.resourceId
output AZURE_OPENAI_ENDPOINT string = oaiCogAccount.outputs.endpoint
output AZURE_OPENAI_DEPLOYMENT_NAME string = azureOpenAiDeploymentName
output AZURE_OPENAI_MODEL_NAME string = azureOpenAiModelName
output AZURE_OPENAI_MODEL_VERSION string = azureOpenAiModelVersion
output AZURE_OPENAI_API_VERSION string = azureOpenAiApiVersion
output AZURE_CONTAINER_APPS_API_FQDN string = api.outputs.fqdn
output ENTRA_ID_API_APP_ID string = appRegistration.outputs.apiAppId
output ENTRA_ID_API_CLIENT_APP_ID string = appRegistration.outputs.apiClientAppId
output APPLICATIONINSIGHTS_CONNECTION_STRING string = monitoring.outputs.applicationInsightsConnectionString
