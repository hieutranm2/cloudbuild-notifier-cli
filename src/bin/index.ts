#! /usr/bin/env node
import * as clr from 'colorette'
import figlet from 'figlet'
import { satisfies } from 'semver'
import program from '..'

const pkg = require('../../package.json')
const nodeVersion = process.version

if (!satisfies(nodeVersion, pkg.engines.node)) {
  console.log(
    `Cloud Build Notifier CLI v${pkg.version} is incompatible with Node.js ${nodeVersion} Please upgrade Node.js to version ${pkg.engines.node}`
  )
  process.exit(1)
}

import updateNotifier from 'update-notifier-cjs'
import logger from '../services/logger'
const notifier = updateNotifier({ pkg })

try {
  notifier.notify()
} catch (error) {
  logger.error(error)
}

console.log(clr.blue(figlet.textSync('Build Notifier')))

program.parse(process.argv)
