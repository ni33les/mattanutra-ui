import net from "node:net";
const connect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (...args) {
  let options = args[0];
  if (Array.isArray(options)) options = options[0];
  const host = options && typeof options === "object" ? options.host ?? options.hostname ?? "localhost" : args[1] ?? "localhost";
  const port = Number(options && typeof options === "object" ? options.port : options);
  if (!["127.0.0.1", "::1", "localhost"].includes(host) || [80, 443, 3000, 5432].includes(port)) {
    throw new Error("Offline regression suite blocked an external service connection");
  }
  return connect.apply(this, args);
};
