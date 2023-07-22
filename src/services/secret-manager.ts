import { v1 } from '@google-cloud/secret-manager'
import logger from './logger'

export default class SecretManagerService {
  constructor(private client: v1.SecretManagerServiceClient) {}

  async createSecret(projectName: string, name: string) {
    try {
      const [secrets] = await this.client.listSecrets({
        parent: projectName,
        filter: `name:${name}`,
      })
      if (secrets.length > 0) {
        logger.info(`Secret ${name} already exists`)
        return secrets[0]
      }
      const [secret] = await this.client.createSecret({
        parent: projectName,
        secretId: name,
        secret: {
          name,
          replication: {
            automatic: {},
          },
        },
      })
      return secret
    } catch (error) {
      logger.error(error)
    }
  }

  async addSecretVersion(name: string, payload: string) {
    try {
      const [version] = await this.client.addSecretVersion({
        parent: name,
        payload: {
          data: Buffer.from(payload, 'utf8'),
        },
      })
      return version
    } catch (error) {
      logger.error(error)
    }
  }

  async accessSecretVersion(name: string, version = 'latest') {
    try {
      const [ver] = await this.client.accessSecretVersion({
        name: `${name}/versions/${version}`,
      })
      return ver.payload?.data?.toString()
    } catch (error) {
      logger.error(error)
    }
  }

  async grantAccess(name: string, members: string[]) {
    try {
      await this.client.setIamPolicy({
        resource: name,
        policy: {
          bindings: [{ members: members, role: 'roles/secretmanager.secretAccessor' }],
        },
      })
      return true
    } catch (error) {
      logger.error(error)
    }
  }
}
