import type { ServicesClient } from '@google-cloud/run'
import { CLI_NAME } from '../constants'

export class CloudRunService {
  constructor(private client: ServicesClient) {}

  /**
   *
   * @param parent i.e. projects/${projectId}/locations/${region}
   * @param serviceId i.e. my-service
   * @param container i.e. { image: 'gcr.io/my-project/my-image', env: [{ name: 'PORT', value: '8080' }] }
   */
  async createOrUpdateServiceWithDocker(
    parent: string,
    serviceId: string,
    container: { image: string; env: { name: string; value: string }[] }
  ) {
    const [response] = await this.client.updateService({
      allowMissing: true,
      service: {
        name: `${parent}/services/${serviceId}`,
        template: {
          containers: [container],
        },
        labels: {
          creator: CLI_NAME,
        },
      },
    })
    const [service] = await response.promise()
    return service
  }

  async getService(parent: string, serviceId: string) {
    const [service] = await this.client.getService({
      name: `${parent}/services/${serviceId}`,
    })
    return service
  }

  async deleteService(parent: string, serviceId: string) {
    await this.client.deleteService({
      name: `${parent}/services/${serviceId}`,
    })
  }

  async addIamPolicyBinding(serviceId: string, role: string, members: string[]) {
    const [policy] = await this.client.getIamPolicy({
      resource: serviceId,
    })

    policy.bindings?.push({
      members,
      role,
    })

    return this.client.setIamPolicy({
      resource: serviceId,
      policy,
    })
  }
}
