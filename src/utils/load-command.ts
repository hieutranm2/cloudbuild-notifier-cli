import { Command } from 'commander'

function loadCommand(program: Command, cmd: Command) {
  program.addCommand(cmd)
  return program
}

export default loadCommand
