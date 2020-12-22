import * as vscode from 'vscode';

import { defaultProvider } from '@aws-sdk/credential-provider-node';
import { STS } from '@aws-sdk/client-sts';
import { SSO } from '@aws-sdk/client-sso';
import { resolve } from 'dns';

function promptForMFAIfRequired(serial: string): Promise<string> {
    return new Promise((resolve, reject) => {
        vscode.window.showInputBox({
            placeHolder: "",
            prompt: "Enter your MFA code.",
            value: "",
            ignoreFocusOut: false
        }).then(function(mfa_token){
            resolve(mfa_token);
        });
    });
}

export function GetAWSCreds(): Thenable<any> {
    return new Promise(async (resolve, reject) => {
        let extensionConfig = vscode.workspace.getConfiguration('awscloudshell');
        let awsregion = extensionConfig.get('region');
        let assumeRole = extensionConfig.get('assumeRole');
        let sso = extensionConfig.get('sso');
        let ssoRegion = extensionConfig.get('ssoRegion');

        if (sso && ssoRegion) {

            const ssoClient = new SSO({ region: ssoRegion.toString() });

            // TODO sso oidc flow with
            // region + start_url + account_id + role_name
            // which will give us the inputs to getRoleCredentials.
            let role_name, account_id, access_token;
            let roleCreds = ssoClient.getRoleCredentials({ roleName: role_name, accountId: account_id, accessToken: access_token});

            resolve({
                'accessKey': (await roleCreds).roleCredentials.accessKeyId,
                'secretKey': (await roleCreds).roleCredentials.secretAccessKey,
                'sessionToken': (await roleCreds).roleCredentials.sessionToken
            });
            return;
        }

        let creds = await defaultProvider({
            profile: extensionConfig.get('profile') || null,
            mfaCodeProvider: promptForMFAIfRequired
        })();

        if (assumeRole) {
            const stsclient = new STS({ credentials: creds });

            const assumedSession = await stsclient.assumeRole({
                RoleArn: assumeRole.toString(),
                RoleSessionName: 'VSCode'
            });
            
            resolve({
                'accessKey': assumedSession.Credentials.AccessKeyId,
                'secretKey': assumedSession.Credentials.SecretAccessKey,
                'sessionToken': assumedSession.Credentials.SessionToken
            });
        } else {
            resolve({
                'accessKey': creds.accessKeyId,
                'secretKey': creds.secretAccessKey,
                'sessionToken': creds.sessionToken
            });
        }
    });
}

export function GetRegion(): string {
    let extensionConfig = vscode.workspace.getConfiguration('awscloudshell');
    return extensionConfig.get('region') || "us-east-1";
}

export function GetProxy(): string | null {
    let extensionConfig = vscode.workspace.getConfiguration('awscloudshell');
    let proxy: string = extensionConfig.get('proxy');

    if (proxy == "")
        return null;

    return proxy;
}

export function ReducePromises(array, fn) {
    var results = [];
    return array.reduce(function(p, item) {
        return p.then(function () {
            return fn(item).then(function (data) {
                results.push(data);
                return results;
            }).catch((y) => {
                console.error(y);
            });
        }).catch((x) => {
            console.error(x);
        });
    }, Promise.resolve());
}
