'use strict';
const { OscUdpDriver } = require('./osc-udp');
const { TcpLineDriver } = require('./tcp-line');
const { MidiTcpDriver } = require('./midi-tcp');

const registry = {
  'osc-udp': OscUdpDriver,
  'tcp-line': TcpLineDriver,
  'midi-tcp': MidiTcpDriver,
};

function createDriver(opts) {
  const Cls = registry[opts.transport.type];
  if (!Cls) throw new Error(`unknown transport type "${opts.transport.type}" (known: ${Object.keys(registry).join(', ')})`);
  return new Cls(opts);
}

module.exports = { createDriver, registry };
