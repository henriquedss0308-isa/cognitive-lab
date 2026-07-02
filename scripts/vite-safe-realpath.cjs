const { EventEmitter } = require('node:events')
const childProcess = require('node:child_process')

const originalExec = childProcess.exec

childProcess.exec = function patchedExec(command, options, callback) {
  const normalizedCommand = typeof command === 'string' ? command.trim().toLowerCase() : ''

  if (normalizedCommand === 'net use') {
    const cb = typeof options === 'function' ? options : callback
    const child = new EventEmitter()
    child.stdout = new EventEmitter()
    child.stderr = new EventEmitter()
    child.kill = () => true
    child.pid = 0

    process.nextTick(() => {
      const error = new Error('net use unavailable in this environment')
      error.code = 'EPERM'
      cb?.(error, '', '')
      child.emit('exit', 0)
      child.emit('close', 0)
    })

    return child
  }

  return originalExec.apply(this, arguments)
}
