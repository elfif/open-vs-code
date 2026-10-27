import * as vscode from "vscode";

const credentialKey = "openCodeCredential";

export interface StoredCredential {
  readonly serverUrl: string;
  readonly password: string;
}

export class CredentialStore {
  public constructor(private readonly secrets: vscode.SecretStorage) {}

  public async read(): Promise<StoredCredential | undefined> {
    const value = await this.secrets.get(credentialKey);

    if (!value) {
      return undefined;
    }

    try {
      const parsed: unknown = JSON.parse(value);

      if (
        typeof parsed === "object" &&
        parsed !== null &&
        "serverUrl" in parsed &&
        "password" in parsed &&
        typeof parsed.serverUrl === "string" &&
        typeof parsed.password === "string"
      ) {
        return { serverUrl: parsed.serverUrl, password: parsed.password };
      }
    } catch {
      return undefined;
    }

    return undefined;
  }

  public async store(credential: StoredCredential): Promise<void> {
    await this.secrets.store(credentialKey, JSON.stringify(credential));
  }

  public async clear(): Promise<void> {
    await this.secrets.delete(credentialKey);
  }
}
