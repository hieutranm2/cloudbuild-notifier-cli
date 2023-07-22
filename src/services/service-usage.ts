import { v1 } from '@google-cloud/service-usage'
import logger from './logger'

export default class ServiceUsageService {
  constructor(private client: v1.ServiceUsageClient) {}

  async listEnabledServices(projectName: string) {
    try {
      const [services] = await this.client.listServices({
        parent: projectName,
        filter: 'state:ENABLED',
      })
      return services
    } catch (error) {
      logger.error(error)
    }
  }

  async enableServices(projectName: string, serviceIds: string[]) {
    if (!serviceIds.length) {
      logger.error({ message: 'Service Ids is required' })
      return
    }
    try {
      const [response] = await this.client.batchEnableServices({
        parent: projectName,
        serviceIds,
      })
      const [batch] = await response.promise()
      return batch.services
    } catch (error) {
      logger.error(error)
    }
  }
}
