// Experiments need no network, including local databases or payment fixtures.
import net from 'node:net';
import tls from 'node:tls';
const denied = () => { throw new Error('Offline matcher experiment forbids network access'); };
net.Socket.prototype.connect = denied;
tls.connect = denied;
globalThis.fetch = denied;
