const template = [
  {
    type: 'section',
    fields: [
      {
        type: 'mrkdwn',
        text: "*Status:*\n{{ '{{.Build.Status}}' | safe }}",
      },
      {
        type: 'mrkdwn',
        text: "*Trigger:*\n{{ '{{.Build.Substitutions.TRIGGER_NAME}}' | safe }}",
      },
    ],
  },
  {
    type: 'section',
    fields: [
      {
        type: 'mrkdwn',
        text: "*Commit:*\n<https://github.com/{{ githubUserName }}/{{ '{{.Build.Substitutions.REPO_NAME}}' | safe }}/commit/{{ '{{.Build.Substitutions.COMMIT_SHA}}' | safe }}|{{ '{{.Build.Substitutions.SHORT_SHA}}' | safe }}>",
      },
      {
        type: 'mrkdwn',
        text: "*Branch:*\n{{ '{{.Build.Substitutions.BRANCH_NAME}}' | safe }}",
      },
    ],
  },
  {
    type: 'context',
    elements: [
      {
        type: 'image',
        image_url: 'https://avatars.githubusercontent.com/in/10529?s=40&v=4',
        alt_text: 'Cloud Build icon',
      },
      {
        type: 'mrkdwn',
        text: "Cloud Build ({{ '{{.Build.ProjectId}}' | safe }}, {{ '{{.Build.Id}}' | safe }})",
      },
    ],
  },
  {
    type: 'actions',
    elements: [
      {
        type: 'button',
        text: {
          type: 'plain_text',
          text: 'View Logs',
          emoji: true,
        },
        action_id: 'view_logs',
        url: "{{ '{{.Build.LogUrl}}' | safe }}",
      },
    ],
  },
]

export default template
