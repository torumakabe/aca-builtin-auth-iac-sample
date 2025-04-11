metadata description = 'Creates an Azure Container Apps Auth Config using Microsoft Entra ID as Identity Provider.'

@description('The name of the container apps resource within the current resource group scope')
param containerAppName string

@description('The client ID of the Microsoft Entra ID application - API.')
param apiAppId string

@description('The client ID of the Microsoft Entra ID application - API secret setting name.')
param apiAppSecretSettingName string

@description('The client ID of the Microsoft Entra ID application - API client.')
param apiClientAppId string

@description('Specifies the issuer for the federated identity credentials.')
param issuer string

resource app 'Microsoft.App/containerApps@2023-05-01' existing = {
  name: containerAppName
}

resource auth 'Microsoft.App/containerApps/authConfigs@2024-10-02-preview' = {
  parent: app
  name: 'current'
  properties: {
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
          clientId: apiAppId
          clientSecretSettingName: apiAppSecretSettingName
          openIdIssuer: issuer
        }
        validation: {
          allowedAudiences: [
            'api://${apiAppId}'
          ]
          defaultAuthorizationPolicy: {
            allowedApplications: [
              apiAppId
              apiClientAppId
            ]
          }
        }
      }
    }
  }
}
