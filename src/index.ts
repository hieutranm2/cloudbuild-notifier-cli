import * as clr from 'colorette'
import { Command } from 'commander'
import * as cmdList from './commands'
import loadCommand from './utils/load-command'

const pkg = require('../package.json')

const program = new Command()

program
  .version(
    `current version: ${clr.green(pkg.version)}`,
    '-v, --version',
    'show the current version'
  )
  .description('The CLI to set up Slack Notifier for Cloud Build result')
  .allowExcessArguments(false)

// Load all commands to program
Object.values(cmdList).forEach((cmd: any) => {
  loadCommand(program, cmd)
})

export default program
