import { PubSub } from '@google-cloud/pubsub'
import { v3 as ResourceManagerV3 } from '@google-cloud/resource-manager'
import { v2 as CloudRunV2, protos as RunProtos } from '@google-cloud/run'
import { v1 as SecretManagerV1 } from '@google-cloud/secret-manager'
import { v1 as ServiceUsageV1 } from '@google-cloud/service-usage'
import { Storage } from '@google-cloud/storage'
import { confirm, input, select } from '@inquirer/prompts'
import { Command } from 'commander'
import { google } from 'googleapis'
import nunjucks from 'nunjucks'
import yaml from 'yaml'
import { CloudRunService } from '../services/cloud-run'
import CloudStorageService from '../services/cloud-storage'
import { IAMService } from '../services/iam'
import logger from '../services/logger'
import ProjectManagerService from '../services/project-manager'
import { PubSubService } from '../services/pubsub'
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
  notifierImage: string
  projectNumber: string
  secretName: string
  nonInteractive: boolean
}

const INVOKER_SA_ID = 'cloud-run-pubsub-invoker'

const command = new Command('setup')
  .description('Set up the notifier')
  .option('-p, --projectId <project_id>', 'The id of your GCP project')
  .option('-wu, --slack-webhook-url <url>', 'The Slack Incoming Webhook url to post messages')
  .option('-gu, --github-user-name <name>', 'The name of the user to use for git')
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
  .option('--non-interactive', 'Run in non-interactive mode')
  .action(async (options) => {
    if (options.nonInteractive) {
      // Step 0: Validate command options
      validateOptions(options)
    }
    // Step 1: Serialize command options
    await serializeCommandOptions(options)
    // Step 2: Enable required APIs
    await enableRequiredApis(options)
    // Step 3: Store Slack webhook url in Secret Manager
    await storeSlackWebhookUrl(options)
    // Step 4: Upload notifier config files to Cloud Storage
    const configPath = await uploadNotifierConfig(options)
    // Step 5: Deploy notifier to Cloud Run
    const service = await deployNotifierService(options, configPath!)
    // Step 6: Create service account for Cloud Build and grant permissions
    await grantPermissions(service!, options)
    // Step 7: Create Pub/Sub topic and subscription
    await createPubSub(service!, options)
    // Step 8: Notify setup completion
    logger.info('** NOTIFIER SETUP COMPLETE **')
  })

const validateOptions = async (opts: SetupCommandOpts) => {
  logger.info('Validating command options...')
  const definedOpts = command.options
  const { githubUserName, projectId, slackWebhookUrl } = opts
  if (!projectId) {
    const flags = definedOpts.find((opt) => opt.long === '--project')?.flags
    logger.error(`required option "${flags}" not specified`)
  }

  if (!slackWebhookUrl) {
    const flags = definedOpts.find((opt) => opt.long === '--slack-webhook-url')?.flags
    logger.error(`required option "${flags}" not specified`)
  } else if (!isSlackWebhookUrl(slackWebhookUrl)) {
    logger.error('Slack webhook url is invalid')
  }

  if (!githubUserName) {
    const flags = definedOpts.find((opt) => opt.long === '--github-user-name')?.flags
    logger.error(`required option "${flags}" not specified`)
  }

  if (!githubUserName) {
    const flags = definedOpts.find((opt) => opt.long === '--github-user-name')?.flags
    logger.error(`required option "${flags}" not specified`)
  }

  logger.info('Finished validating command options')
}

const serializeCommandOptions = async (opts: SetupCommandOpts) => {
  const { nonInteractive, serviceAccountKey, name, projectId } = opts
  const projectManager = await new ProjectManagerService(
    new ResourceManagerV3.ProjectsClient({
      projectId,
      keyFilename: serviceAccountKey,
    })
  )
  if (nonInteractive) {
    logger.info('Serializing command options...')
    const project = await projectManager.getProject(opts.projectId)
    opts.projectNumber = project?.name?.split('/')[1] as string
    logger.info('Finished serializing command options')
  } else {
    let selectedProject
    if (!opts.projectId) {
      const projectsList = await projectManager.getActiveProjects()
      const projectChoices = projectsList.map((p) => ({
        value: p,
        name: p.displayName!,
      }))
      selectedProject = await select({
        message: 'Select a GCP project:',
        choices: projectChoices,
      })
      opts.projectId = selectedProject?.projectId as string
    } else {
      selectedProject = await projectManager.getProject(opts.projectId)
    }
    opts.projectNumber = selectedProject?.name?.split('/')[1] as string

    const region = await input({
      message: 'Enter a region to deploy the notifier to:',
      default: opts.region,
    })
    opts.region = region

    const notifierName = await input({
      message: 'Enter a name for the notifier:',
      default: name,
    })
    opts.name = notifierName

    const githubUserName = await input({
      message: 'Enter your GitHub user name/organization name:',
      validate(value) {
        if (!value) {
          return 'Please enter your GitHub user name/organization name'
        }
        return true
      },
    })
    opts.githubUserName = githubUserName

    const slackWebhookUrl = await input({
      message: 'Enter your Slack Incoming Webhook url:',
      validate(value) {
        if (!value) {
          return 'Please enter your Slack Incoming Webhook url'
        }
        // validate slack url
        if (!isSlackWebhookUrl(value)) {
          return 'Invalid Slack Incoming Webhook url'
        }
        return true
      },
    })
    opts.slackWebhookUrl = slackWebhookUrl

    const notifierImage = await input({
      message: 'Enter the Docker image to use for the notifier:',
      default: opts.notifierImage,
    })
    opts.notifierImage = notifierImage

    const isConfirm = await confirm({
      message: 'Are you sure you want to proceed?',
      default: false,
    })
    if (!isConfirm) {
      process.exit(0)
    }
  }
  opts.secretName = opts.name + '-slack-webhook'
}

const isSlackWebhookUrl = (url: string) => {
  const slackWebhookUrlRegex = new RegExp(
    'https://hooks.slack.com/services/T[A-Z0-9]+/B[A-Z0-9]+/[A-Za-z0-9]+'
  )
  return slackWebhookUrlRegex.test(url)
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
      new ServiceUsageV1.ServiceUsageClient({
        projectId,
        keyFilename: serviceAccountKey,
      })
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
      new SecretManagerV1.SecretManagerServiceClient({
        projectId,
        keyFilename: serviceAccountKey,
      })
    )
    logger.info(`Storing Slack webhook in Secret Manager...`)
    const secret = await secretManager.createSecret(`projects/${projectId}` as string, secretName)
    await secretManager.addSecretVersion(secret?.name!, slackWebhookUrl)
    logger.info(`Finished storing Slack webhook in Secret Manager`)
    logger.info(`Granting Compute Engine default service account access to secret...`)
    await secretManager.grantAccess(secret?.name!, [
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
      new Storage({
        projectId,
        keyFilename: serviceAccountKey,
      })
    )
    nunjucks.configure({ autoescape: true })

    // create notifier bucket
    logger.info('Creating notifier bucket...')
    const BUCKET_NAME = `${projectId}-${name}-config`
    const bucket = await storageService.createBucket(BUCKET_NAME)
    await storageService.addBucketIamMember(BUCKET_NAME, 'roles/storage.objectViewer', [
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
  try {
    logger.info('Deploying notifier service...')
    const { projectId, region, serviceAccountKey, notifierImage, name } = opts
    const runService = new CloudRunService(
      new CloudRunV2.ServicesClient({
        projectId,
        keyFile: serviceAccountKey,
      })
    )
    const service = await runService.createOrUpdateServiceWithDocker(
      `projects/${projectId}/locations/${region}`,
      name,
      {
        image: notifierImage,
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
      }
    )
    logger.info('Finished deploying notifier service')
    return service
  } catch (error) {
    console.log(error.metadata.internalRepr)
    logger.error(error)
  }
}

const grantPermissions = async (
  service: RunProtos.google.cloud.run.v2.IService,
  opts: SetupCommandOpts
) => {
  try {
    logger.info('Setting up IAM...')
    const { projectId, serviceAccountKey, projectNumber } = opts
    // Grant Pub/Sub permissions to create authentication tokens in your project:
    const projectManagerService = new ProjectManagerService(
      new ResourceManagerV3.ProjectsClient({
        projectId,
        keyFilename: serviceAccountKey,
      })
    )
    await projectManagerService.addIamPolicyBindings(projectId, [
      {
        members: [`serviceAccount:service-${projectNumber}@gcp-sa-pubsub.iam.gserviceaccount.com`],
        role: 'roles/iam.serviceAccountTokenCreator',
      },
    ])
    // Create a service account to represent your Pub/Sub subscription identity:
    const iamService = new IAMService(google.iam('v1'))
    await iamService.createServiceAccount(projectId, INVOKER_SA_ID, `Cloud Run Pub/Sub Invoker`)
    // Give the invoker service account the Cloud Run Invoker permission:
    const cloudRunClient = new CloudRunV2.ServicesClient({
      projectId,
      keyFile: serviceAccountKey,
    })
    const runService = new CloudRunService(cloudRunClient)
    await runService.addIamPolicyBinding(service.name!, 'roles/run.invoker', [
      `serviceAccount:${INVOKER_SA_ID}@${projectId}.iam.gserviceaccount.com`,
    ])
    logger.info('Finished setting up IAM')
  } catch (error) {
    console.log(error)
    logger.error(error)
  }
}

const createPubSub = async (
  service: RunProtos.google.cloud.run.v2.IService,
  opts: SetupCommandOpts
) => {
  try {
    logger.info('Creating Pub/Sub topic and subscription...')
    const { projectId, serviceAccountKey, name } = opts
    const pubsubService = new PubSubService(
      new PubSub({
        projectId,
        keyFile: serviceAccountKey,
      })
    )
    const topic = await pubsubService.createTopic('cloud-builds')
    const subscriberId = name + '-subscription'
    await pubsubService.createSubscription(topic, subscriberId, {
      pushConfig: {
        pushEndpoint: service.uri!,
        oidcToken: {
          serviceAccountEmail: `${INVOKER_SA_ID}@${projectId}.iam.gserviceaccount.com`,
        },
      },
    })
    logger.info('Finished creating Pub/Sub topic and subscription...')
  } catch (error) {
    logger.error(error)
  }
}

export default command
