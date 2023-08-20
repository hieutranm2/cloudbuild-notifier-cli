import type { Bucket, SaveOptions, Storage } from '@google-cloud/storage'
import { type PassThrough } from 'stream'
import logger from './logger'
export default class CloudStorageService {
  constructor(private storage: Storage) {}

  async createBucket(bucketName: string) {
    try {
      const [bucket] = await this.storage.createBucket(bucketName)
      return bucket
    } catch (error) {
      if (error.code === 409) {
        logger.info(`Bucket ${bucketName} already exists`)
        return this.storage.bucket(bucketName)
      }
      logger.error(error)
    }
  }

  async addBucketIamMember(bucketName: string, role: string, members: string[]) {
    try {
      const bucket = this.storage.bucket(bucketName)
      const [policy] = await bucket.iam.getPolicy({
        requestedPolicyVersion: 3,
        userProject: bucket.projectId,
      })
      policy.bindings.push({
        role,
        members,
      })
      await bucket.iam.setPolicy(policy)
    } catch (error) {
      logger.error(error)
    }
  }

  async uploadFile(bucket: Bucket, fileName: string, data: string, options: SaveOptions = {}) {
    try {
      const file = bucket.file(fileName)
      await file.save(data, options)
      return `gs://${bucket.name}/${fileName}`
    } catch (error) {
      logger.error(error)
    }
  }

  async streamFileUpload(bucket: Bucket, fileName: string, passthroughStream: PassThrough) {
    try {
      const file = bucket.file(fileName, {})
      const stream = passthroughStream.pipe(file.createWriteStream())
      await new Promise((resolve, reject) => {
        stream.on('finish', resolve)
        stream.on('error', reject)
      })
      return `gs://${bucket.name}/${fileName}`
    } catch (error) {
      logger.error(error)
    }
  }
}
