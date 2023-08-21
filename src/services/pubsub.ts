import type { CreateSubscriptionOptions, PubSub, Topic } from '@google-cloud/pubsub'

export class PubSubService {
  constructor(private pubsub: PubSub) {}

  async createTopic(topicName: string) {
    const topic = this.pubsub.topic(topicName)
    const [isExisted] = await topic.exists()
    if (isExisted) {
      return topic
    }
    const [newTopic] = await topic.create()
    return newTopic
  }

  async deleteTopic(topicName: string) {
    const topic = this.pubsub.topic(topicName)
    const [isExisted] = await topic.exists()
    if (!isExisted) {
      throw new Error(`Topic ${topicName} does not exist`)
    }
    await topic.delete()
  }

  async createSubscription(
    topic: Topic,
    subscriptionId: string,
    options?: CreateSubscriptionOptions
  ) {
    const subscriber = topic.subscription(subscriptionId)
    const [isExisted] = await subscriber.exists()
    if (isExisted) {
      return subscriber
    }
    const [subscription] = await subscriber.create(options)
    return subscription
  }

  async deleteSubscription(subscriptionId: string) {
    const subscriber = this.pubsub.subscription(subscriptionId)
    const [isExisted] = await subscriber.exists()
    if (!isExisted) {
      throw new Error(`Subscription ${subscriptionId} does not exist`)
    }
    await subscriber.delete()
  }
}
