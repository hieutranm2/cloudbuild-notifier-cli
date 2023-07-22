const template = {
  apiVersion: 'cloud-build-notifiers/v1',
  kind: 'SlackNotifier',
  metadata: {
    name: '{{ name }}',
  },
  spec: {
    notification: {
      filter: 'build.status in [Build.Status.SUCCESS, Build.Status.FAILURE, Build.Status.TIMEOUT]',
      delivery: {
        webhookUrl: {
          secretRef: '{{ secretName }}',
        },
      },
      template: {
        type: 'golang',
        uri: '{{ templateUri }}',
      },
    },
    secrets: [
      {
        name: '{{ secretName }}',
        value: 'projects/{{ projectId }}/secrets/{{ secretName }}/versions/latest',
      },
    ],
  },
}

export default template
