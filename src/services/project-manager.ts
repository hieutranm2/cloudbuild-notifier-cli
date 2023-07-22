import { protos, v3 } from '@google-cloud/resource-manager'
import logger from './logger'

export default class ProjectManagerService {
  constructor(private client: v3.ProjectsClient) {}

  async getProject(projectId: string) {
    try {
      const [projectInfo] = await this.client.getProject({
        name: `projects/${projectId}`,
      })
      return projectInfo
    } catch (error) {
      logger.error(error)
    }
  }

  async grantRole(projectId: string, bindings: protos.google.iam.v1.IBinding[]) {
    try {
      this.client.setIamPolicy({
        resource: `projects/${projectId}`,
        policy: {
          bindings: bindings,
        },
      })
    } catch (error) {
      logger.error(error)
    }
  }
}
