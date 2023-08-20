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

  async getActiveProjects() {
    const [projects] = await this.client.searchProjects({
      query: 'state:ACTIVE',
    })
    return projects
  }

  async addIamPolicyBindings(projectId: string, bindings: protos.google.iam.v1.IBinding[]) {
    try {
      const [policy] = await this.client.getIamPolicy({
        resource: `projects/${projectId}`,
        options: {
          requestedPolicyVersion: 3,
        },
      })
      policy.bindings = policy.bindings?.concat(bindings) || bindings
      return this.client.setIamPolicy({
        resource: `projects/${projectId}`,
        policy,
      })
    } catch (error) {
      console.log(error)
      logger.error(error)
    }
  }
}
