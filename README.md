# Cloudbuild Notifier CLI

A command-line tool that simplifies the setup of Cloud Build notifications to Slack.

[![NPM Version](https://img.shields.io/npm/v/cloudbuild-notifier.svg?style=flat)]()

## Requirements

- Node.js (npm) installed on your machine
- Ensure you have set up Application Default Credentials (ADC) in advance. Your Google Cloud account
  must have **Owner** role or have at least the following roles:
  - Browser
  - Cloud Run Admin
  - Pub/Sub Admin
  - Secret Manager Admin
  - Security Admin
  - Service Usage Admin
  - Storage Admin

## Installation

You can install `cloudbuild-notifier` globally using npm:

```bash
npm install -g cloudbuild-notifier
```

Alternatively, you can run it directly using npx:

```bash
npx cloudbuild-notifier [options] [command]
```

## Usage

```bash
Usage: cloudbuild-notifier [options] [command]

A CLI to set up Slack Notifier for Cloud Build result

Options:
  -v, --version      Show the current version
  -h, --help         Display help for command

Commands:
  cleanup [options]  Clean up the notifier
  setup [options]    Set up the notifier
  help [command]     Display help for command
```

## Commands

1. **Setup command**

```bash
Usage: cloudbuild-notifier setup [options]

Set up the notifier

Options:
  -p, --projectId <project_id>     The id of your GCP project
  -wu, --slack-webhook-url <url>   The Slack Incoming Webhook url to post messages
  -ga, --github-account <account>  The Github Account of your repository
  -n, --name <name>                The name of notifier (default: "cloud-build-notifier")
  -r, --region <region>            The region to deploy the notifier to (default: "us-east1")
  --service-account-key <path>     The path to your GCP service account key file
  -img, --notifier-image <image>   The Docker image to use for the notifier (default: "us-east1-docker.pkg.dev/gcb-release/cloud-build-notifiers/slack:latest")
  --non-interactive                Run in non-interactive mode
  -h, --help                       display help for command
```

2. **Cleanup command**

```bash
Usage: cloudbuild-notifier cleanup [options]

Clean up the notifier

Options:
  -p, --projectId <project_id>  The id of your GCP project
  -n, --name <notifier-name>    The name of the notifier
  -r, --region <region>         The region to deploy the notifier to (default: "us-east1")
  --service-account-key <path>  The path to your GCP service account key file
  -h, --help                    display help for command
```

## Notification Template

![Notification template](https://res.cloudinary.com/dqgfiyj5b/image/upload/v1696434110/notification_brtzhl.png)

## Troubleshooting

If you encounter any issues while using cloudbuild-notifier, please contact me via
[this link](https://www.mihi.dev/contact)

## License

This project is licensed under the [ISC License](LICENSE).
