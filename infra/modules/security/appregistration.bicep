extension microsoftGraphV1

@description('Specifies the display name for the API application.')
param name string

@description('Specifies the unique name for the API application.')
param apiAppName string

@description('Specifies the api managed id for the API application.')
param apiIdentity string

@description('Specifies the issuer for the federated identity credentials.')
param issuer string

@description('Specifies the display name for the client application')
param apiClientName string

@description('Specifies the redirect url for the client application')
param apiClientRedirectUrl string

var scopeId = guid(resourceGroup().id, apiAppName, 'user_impersonation')
resource apiApp 'Microsoft.Graph/applications@v1.0' = {
  displayName: name
  signInAudience: 'AzureADMyOrg'
  uniqueName: apiAppName
  requiredResourceAccess: [
    // Graph User.Read
    {
      resourceAppId: '00000003-0000-0000-c000-000000000000'
      resourceAccess: [
        {
          id: 'e1fe6dd8-ba31-4d61-89e7-88639da4683d'
          type: 'Scope'
        }
      ]
    }
  ]
  api: {
    knownClientApplications: []
    oauth2PermissionScopes: [
      {
        id: scopeId
        isEnabled: true
        type: 'User'
        value: 'user_impersonation'
        adminConsentDisplayName: 'Allow user impersonation'
        adminConsentDescription: 'Allow user impersonation'
        userConsentDisplayName: 'Allow user impersonation'
        userConsentDescription: 'Allow user impersonation'
      }
    ]
    preAuthorizedApplications: []
    requestedAccessTokenVersion: 2
  }

  resource apiAppFic 'federatedIdentityCredentials@v1.0' = {
    name: '${apiApp.uniqueName}/miAsFic'
    audiences: [
      'api://AzureADTokenExchange'
    ]
    issuer: issuer
    subject: apiIdentity
  }
}

var apiAppResourceUri = 'api://${apiApp.appId}'
resource apiApplicationUpdate 'Microsoft.Graph/applications@v1.0' = {
  uniqueName: apiAppName
  displayName: name
  identifierUris: [
    apiAppResourceUri
  ]
}

resource apiAppSp 'Microsoft.Graph/servicePrincipals@v1.0' = {
  appId: apiApp.appId
}

resource apiClientApp 'Microsoft.Graph/applications@v1.0' = {
  uniqueName: apiClientName
  displayName: 'Client for ${name}'
  spa: {
    redirectUris: [
      apiClientRedirectUrl
      'http://localhost:3000'
    ]
  }
  requiredResourceAccess: [
    // Graph User.Read
    {
      resourceAppId: '00000003-0000-0000-c000-000000000000'
      resourceAccess: [
        {
          id: 'e1fe6dd8-ba31-4d61-89e7-88639da4683d'
          type: 'Scope'
        }
      ]
    }
    {
      resourceAppId: apiApp.appId
      resourceAccess: [
        {
          id: scopeId
          type: 'Scope'
        }
      ]
    }
  ]
}

resource apiClientSp 'Microsoft.Graph/servicePrincipals@v1.0' = {
  appId: apiClientApp.appId
}

output apiAppId string = apiApp.appId
output apiClientAppId string = apiClientApp.appId
