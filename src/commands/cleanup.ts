import { PubSub } from '@google-cloud/pubsub'
import { v2 as RunV2 } from '@google-cloud/run'
import { v1 as SecretManagerV1 } from '@google-cloud/secret-manager'
import { Storage } from '@google-cloud/storage'
import { Command } from 'commander'
import { google } from 'googleapis'
import { CLI_NAME, INVOKER_SA_ID } from '../constants'
import { CloudRunService } from '../services/cloud-run'
import CloudStorageService from '../services/cloud-storage'
import { IAMService } from '../services/iam'
import logger from '../services/logger'
import { PubSubService } from '../services/pubsub'
import SecretManagerService from '../services/secret-manager'

const command = new Command('cleanup')
  .description('Clean up the notifier')
  .requiredOption('-p, --projectId <project_id>', 'The id of your GCP project')
  .requiredOption('-n, --name <notifier-name>', 'The name of the notifier')
  .option('-r, --region <region>', 'The region to deploy the notifier to', 'us-east1')
  .option(
    '--service-account-key <path>',
    'The path to your GCP service account key file',
    process.env.GOOGLE_APPLICATION_CREDENTIALS
  )
  .action(async (options) => {
    // Step 0: Remove the notifier service
    await removeNotifier(options)
    // Step 1: Remove the Pub/Sub topic and subscription
    await removePubSub(options)
    // Step 2: Remove the invoker service account
    await removeInvokerServiceAccount(options)
    // Step 3: Remove the bucket for notifier
    await removeBucketAndInsideObjects(options)
    // Step 4: Remove the secret
    await deleteSecret(options)
    // Step 5: notify success
    logger.info(
      '**NOTE**: We have only removed all objects created by this CLI. You may still have to check your GCP project to disable unused service APIs and revoke unused service accounts and roles.'
    )
    logger.info('** NOTIFIER CLEANUP COMPLETE **')
  })

const removeNotifier = async (options) => {
  try {
    logger.info('Removing notifier service...')
    const { projectId, name, region, serviceAccountKey } = options
    const runService = new CloudRunService(
      new RunV2.ServicesClient({
        projectId,
        keyFilename: serviceAccountKey,
      })
    )
    const service = await runService.getService(`projects/${projectId}/locations/${region}`, name)
    if (!service) {
      logger.error(`Service ${name} not found`)
      return
    }
    if (service?.labels?.creator !== CLI_NAME) {
      logger.error(`Service ${name} was not created by this CLI`)
      return
    }

    await runService.deleteService(`projects/${projectId}/locations/${region}`, name)
    logger.info('Finished removing notifier service')
  } catch (error) {
    logger.error(error)
  }
}

const removePubSub = async (options) => {
  try {
    const { projectId, serviceAccountKey, name } = options
    const pusubService = new PubSubService(
      new PubSub({
        projectId,
        keyFilename: serviceAccountKey,
      })
    )
    logger.info('Removing subscription...')
    await pusubService.deleteSubscription(name + '-subscription')
    logger.info('Finished removing subscription')
    logger.info('Removing topic...')
    await pusubService.deleteTopic('cloud-builds')
    logger.info('Finished removing topic')
  } catch (error) {
    logger.error(error)
  }
}

const removeInvokerServiceAccount = async (options) => {
  try {
    logger.info('Removing invoker service account...')
    const { projectId, serviceAccountKey } = options
    const iamService = new IAMService(google.iam('v1'))
    await iamService.deleteServiceAccount(projectId, INVOKER_SA_ID)
    logger.info('Finished removing invoker service account')
  } catch (error) {
    logger.error(error)
  }
}

const removeBucketAndInsideObjects = async (options) => {
  try {
    logger.info('Removing bucket...')
    const { projectId, serviceAccountKey, name } = options
    const storageService = new CloudStorageService(
      new Storage({
        projectId,
        keyFilename: serviceAccountKey,
      })
    )
    await storageService.deleteBucket(`${projectId}-${name}-config`)
    logger.info('Finished removing bucket')
  } catch (error) {
    logger.error(error)
  }
}

const deleteSecret = async (options) => {
  try {
    logger.info('Removing slack webhook secret...')
    const { projectId, serviceAccountKey, name } = options
    const secretService = new SecretManagerService(
      new SecretManagerV1.SecretManagerServiceClient({
        projectId,
        keyFilename: serviceAccountKey,
      })
    )
    await secretService.deleteSecret(`projects/${projectId}/secrets/${name}-slack-webhook`)
  } catch (error) {
    logger.error(error)
  }
}

export default command
