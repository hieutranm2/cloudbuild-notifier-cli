import { v3 as ResourceManagerV3 } from '@google-cloud/resource-manager'
import { v2 as CloudRunV2 } from '@google-cloud/run'
import { v1 as SecretManagerV1 } from '@google-cloud/secret-manager'
import { v1 as ServiceUsageV1 } from '@google-cloud/service-usage'
import { Storage } from '@google-cloud/storage'
import { Command } from 'commander'
import { iam_v1 } from 'googleapis'
import nunjucks from 'nunjucks'
import yaml from 'yaml'
import CloudStorageService from '../services/cloud-storage'
import logger from '../services/logger'
import ProjectManagerService from '../services/project-manager'
import SecretManagerService from '../services/secret-manager'
import ServiceUsageService from '../services/service-usage'
import notifierConfigTmpl from '../template/notifier-config'
import notifierMessageTmpl from '../template/notifier-message'

type SetupCommandOpts = {
  projectId: string
  slackWebhookUrl: string
  githubUserName: string
  name: string
  region: string
  serviceAccountKey: string
  notiferImage: string
  projectNumber: string
  secretName: string
}

const command = new Command('setup')
  .description('Set up the notifier')
  .requiredOption('-p, --project, --projectId <project_id>', 'The id of your GCP project')
  .requiredOption(
    '-wu, --slack-webhook-url <url>',
    'The Slack Incoming Webhook url to post messages'
  )
  .requiredOption('-gu, --github-user-name <name>', 'The name of the user to use for git')
  .option('-n, --name <name>', 'The name of notifier', 'cloud-build-notifier')
  .option('-r, --region <region>', 'The region to deploy the notifier to', 'us-east1')
  .option(
    '--service-account-key <path>',
    'The path to your GCP service account key file',
    process.env.GOOGLE_APPLICATION_CREDENTIALS
  )
  .option(
    '-img, --notifier-image <image>',
    'The Docker image to use for the notifier',
    'us-east1-docker.pkg.dev/gcb-release/cloud-build-notifiers/slack:latest'
  )
  .action(async (options) => {
    // Step 0: Validate options
    validateOptions(options)
    // Step 1: Serialize command options
    await serializeCommandOptions(options)
    // Step 2: Enable required APIs
    // Service Account must have Service Usage Admin role
    // await enableRequiredApis(options)
    // Step 3: Store Slack webhook url in Secret Manager
    // Service Account must have Secret Manager Admin role
    // await storeSlackWebhookUrl(options)
    // Step 4: Upload notifier config files to Cloud Storage
    const configPath = await uploadNotifierConfig(options)
    // Step 5: Deploy notifier to Cloud Run
    await deployNotifierService(options, configPath!)
    // Step 6: Create Cloud Build trigger to deploy notifier on push to master
  })

const validateOptions = async (opts: any) => {
  logger.info('Validating command options...')
  logger.info('Finished validating command options...')
}

const serializeCommandOptions = async (opts: SetupCommandOpts) => {
  logger.info('Serializing command options...')
  const { projectId, serviceAccountKey } = opts
  const project = await new ProjectManagerService(
    new ResourceManagerV3.ProjectsClient(
      serviceAccountKey
        ? {
            keyFilename: serviceAccountKey,
          }
        : {}
    )
  ).getProject(projectId)
  opts.projectNumber = project?.name?.split('/')[1] as string
  opts.secretName = opts.name + '-slack-webhook'
  logger.info('Finished serializing command options')
}

const enableRequiredApis = async (opts: SetupCommandOpts) => {
  try {
    const { projectId, serviceAccountKey } = opts
    logger.info('Enabling required APIs...')
    let requiredServices = [
      'cloudbuild.googleapis.com',
      'run.googleapis.com',
      'pubsub.googleapis.com',
      'secretmanager.googleapis.com',
      'cloudresourcemanager.googleapis.com',
    ]
    const serviceUsage = new ServiceUsageService(
      new ServiceUsageV1.ServiceUsageClient(
        serviceAccountKey
          ? {
              keyFilename: serviceAccountKey,
            }
          : {}
      )
    )
    const enabledServices = await serviceUsage.listEnabledServices(
      `projects/${projectId}` as string
    )
    if (enabledServices) {
      const enabledServiceNames = enabledServices?.map((s) => s.config?.name)
      requiredServices = requiredServices.filter((s) => !enabledServiceNames?.includes(s))
    }
    if (requiredServices.length > 0) {
      await serviceUsage.enableServices(`projects/${projectId}` as string, requiredServices)
    } else {
      logger.info('All required APIs are already enabled')
    }
    logger.info('Finished enabling required APIs')
  } catch (error) {
    logger.error(error)
  }
}

const storeSlackWebhookUrl = async (opts: SetupCommandOpts) => {
  try {
    const { projectId, projectNumber, slackWebhookUrl, serviceAccountKey, secretName } = opts
    const secretManager = new SecretManagerService(
      new SecretManagerV1.SecretManagerServiceClient(
        serviceAccountKey
          ? {
              keyFilename: serviceAccountKey,
            }
          : {}
      )
    )
    logger.info(`Storing Slack webhook in Secret Manager...`)
    const secret = await secretManager.createSecret(`projects/${projectId}` as string, secretName)
    await secretManager.addSecretVersion(secretName, slackWebhookUrl)
    logger.info(`Finished storing Slack webhook in Secret Manager`)
    logger.info(`Granting Compute Engine default service account access to secret...`)
    await secretManager.grantAccess(secretName, [
      `serviceAccount:${projectNumber}-compute@developer.gserviceaccount.com`,
    ])
    logger.info(`Finished granting Compute Engine default service account access to secret`)
  } catch (error) {
    logger.error(error)
  }
}

const uploadNotifierConfig = async (opts: SetupCommandOpts) => {
  try {
    const { projectId, serviceAccountKey, githubUserName, name, secretName, projectNumber } = opts
    const storageService = new CloudStorageService(
      new Storage(serviceAccountKey ? { keyFilename: serviceAccountKey } : {})
    )
    nunjucks.configure({ autoescape: true })

    // create notifier bucket
    logger.info('Creating notifier bucket...')
    const BUCKET_NAME = `${projectId}-notifiers-config`
    const bucket = await storageService.createBucket(BUCKET_NAME)
    await storageService.addBucketIamMember(bucket!, 'roles/storage.objectViewer', [
      `serviceAccount:${projectNumber}-compute@developer.gserviceaccount.com`,
    ])
    logger.info(`Finished creating notifier bucket ${bucket?.name}`)

    // upload Slack message template
    logger.info('Uploading notification template...')
    const templateFileName = name + '-template.json'
    const renderedTemplate = nunjucks.renderString(JSON.stringify(notifierMessageTmpl, null, 2), {
      githubUserName,
    })
    const templateUri = await storageService.uploadFile(
      bucket!,
      templateFileName,
      renderedTemplate,
      {
        contentType: 'application/json',
      }
    )
    logger.info('Finished uploading notification template')

    // render notifier config yaml
    logger.info('Uploading notifier config...')
    const configFileName = name + '-config.yaml'
    const renderedConfig = nunjucks.renderString(yaml.stringify(notifierConfigTmpl), {
      name,
      secretName,
      projectId,
      templateUri,
    })
    const configUri = await storageService.uploadFile(bucket!, configFileName, renderedConfig, {
      contentType: 'application/x-yaml',
    })
    logger.info('Finished uploading notifier config')
    return configUri
  } catch (error) {
    logger.error(error)
  }
}

const deployNotifierService = async (opts: SetupCommandOpts, configPath: string) => {
  const { projectId, region, serviceAccountKey, notiferImage, name } = opts
  const cloudRunClient = new CloudRunV2.ServicesClient({
    projectId,
    credentials: serviceAccountKey ? JSON.parse(serviceAccountKey) : undefined,
  })
  const [operation] = await cloudRunClient.createService({
    parent: `projects/${projectId}/locations/${region}`,
    serviceId: name,
    service: {
      name,
      template: {
        containers: [
          {
            image: notiferImage,
            env: [
              {
                name: 'CONFIG_PATH',
                value: configPath,
              },
              {
                name: 'PROJECT_ID',
                value: projectId,
              },
            ],
          },
        ],
      },
    },
  })
  const [service] = await operation.promise()
  return service.name
}

const grantPermissions = async (opts: SetupCommandOpts) => {
  const { projectId, serviceAccountKey, projectNumber, name, region } = opts
  const projectManagerService = new ProjectManagerService(
    new ResourceManagerV3.ProjectsClient(
      serviceAccountKey
        ? {
            keyFilename: serviceAccountKey,
          }
        : {}
    )
  )
  await projectManagerService.grantRole(projectId, [
    {
      members: [`serviceAccount:service-${projectNumber}@gcp-sa-pubsub.iam.gserviceaccount.com`],
      role: 'roles/iam.serviceAccountTokenCreator',
    },
  ])
  const iam = new iam_v1.Iam(serviceAccountKey ? { key: serviceAccountKey } : {})
  await iam.projects.serviceAccounts.create({
    name: `projects/${projectId}`,
    requestBody: {
      accountId: `cloud-run-pubsub-invoker`,
      serviceAccount: {
        displayName: `Cloud Run Pub/Sub Invoker`,
      },
    },
  })
  const cloudRunClient = new CloudRunV2.ServicesClient({
    projectId,
    credentials: serviceAccountKey ? JSON.parse(serviceAccountKey) : undefined,
  })
  cloudRunClient.setIamPolicy({
    resource: `projects/${projectId}/locations/${region}/services/${name}`,
    policy: {
      bindings: [
        {
          members: [`serviceAccount:cloud-run-pubsub-invoker@${projectId}.iam.gserviceaccount.com`],
          role: 'roles/run.invoker',
        },
      ],
    },
  })
}

export default command
