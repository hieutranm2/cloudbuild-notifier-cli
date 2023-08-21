import { Auth, iam_v1 } from 'googleapis'

export class IAMService {
  constructor(private client: iam_v1.Iam, private options?: { serviceAccountKey?: string }) {}

  async createServiceAccount(projectId: string, serviceAccountId: string, displayName?: string) {
    const authClient = await this.getAuthClient()
    try {
      await this.client.projects.serviceAccounts.create({
        name: `projects/${projectId}`,
        auth: authClient as any,
        requestBody: {
          accountId: serviceAccountId,
          serviceAccount: {
            displayName,
          },
        },
      })
    } catch (error) {
      const errData = error?.response?.data?.error || {}
      if (errData.status === 'ALREADY_EXISTS') {
        return
      }
      throw error
    }
  }

  async deleteServiceAccount(projectId: string, serviceAccountId: string) {
    const authClient = await this.getAuthClient()
    try {
      await this.client.projects.serviceAccounts.delete({
        name: `projects/${projectId}/serviceAccounts/${serviceAccountId}@${projectId}.iam.gserviceaccount.com`,
        auth: authClient as any,
      })
    } catch (error) {
      const errData = error?.response?.data?.error || {}
      if (errData.status === 'NOT_FOUND') {
        return
      }
      throw error
    }
  }

  async getAuthClient() {
    const auth = new Auth.GoogleAuth({
      scopes: ['https://www.googleapis.com/auth/iam'],
      keyFile: this.options?.serviceAccountKey,
    })
    const client = await auth.getClient()
    return client
  }
}
