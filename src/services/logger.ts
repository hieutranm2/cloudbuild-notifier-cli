import * as clr from 'colorette'

const logger = {
  log: (message: string) => {
    console.log(clr.green(clr.bold('LOG')), message)
  },
  info: (message: string) => {
    console.info(clr.blue(clr.bold('INFO')), message)
  },
  error: (error: any) => {
    console.error(clr.red(clr.bold('ERROR')), typeof error === 'string' ? error : error.message)
    process.exit(1)
  },
  warn: (message: string) => {
    console.warn(clr.yellow(clr.bold('WARN')), message)
  },
  debug: (message: string) => {
    console.debug(clr.magenta(clr.bold('DEBUG')), message)
  },
}

export default logger
