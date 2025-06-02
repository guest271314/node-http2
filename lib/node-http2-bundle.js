// bun install https://github.com/molnarg/node-http2
// bun build node_modules/http2/lib/http.js --target=node --packages=bundle --outfile=node-http2-bundle.js
import { createRequire } from "node:module";
var __commonJS = (cb, mod) => () => (mod || cb((mod = { exports: {} }).exports, mod), mod.exports);
var __require = /* @__PURE__ */ createRequire(import.meta.url);

// node_modules/http2/lib/protocol/framer.js
var require_framer = __commonJS((exports) => {
  var assert = __require("assert");
  var Transform = __require("stream").Transform;
  exports.Serializer = Serializer;
  exports.Deserializer = Deserializer;
  var logData = Boolean(process.env.HTTP2_LOG_DATA);
  var MAX_PAYLOAD_SIZE = 16384;
  var WINDOW_UPDATE_PAYLOAD_SIZE = 4;
  function Serializer(log) {
    this._log = log.child({ component: "serializer" });
    Transform.call(this, { objectMode: true });
  }
  Serializer.prototype = Object.create(Transform.prototype, { constructor: { value: Serializer } });
  Serializer.prototype._transform = function _transform(frame, encoding, done) {
    this._log.trace({ frame }, "Outgoing frame");
    assert(frame.type in Serializer, "Unknown frame type: " + frame.type);
    var buffers = [];
    Serializer[frame.type](frame, buffers);
    var length = Serializer.commonHeader(frame, buffers);
    assert(length <= MAX_PAYLOAD_SIZE, "Frame too large!");
    for (var i = 0;i < buffers.length; i++) {
      if (logData) {
        this._log.trace({ data: buffers[i] }, "Outgoing data");
      }
      this.push(buffers[i]);
    }
    done();
  };
  function Deserializer(log, role) {
    this._role = role;
    this._log = log.child({ component: "deserializer" });
    Transform.call(this, { objectMode: true });
    this._next(COMMON_HEADER_SIZE);
  }
  Deserializer.prototype = Object.create(Transform.prototype, { constructor: { value: Deserializer } });
  Deserializer.prototype._next = function(size) {
    this._cursor = 0;
    this._buffer = new Buffer(size);
    this._waitingForHeader = !this._waitingForHeader;
    if (this._waitingForHeader) {
      this._frame = {};
    }
  };
  Deserializer.prototype._transform = function _transform(chunk, encoding, done) {
    var cursor = 0;
    if (logData) {
      this._log.trace({ data: chunk }, "Incoming data");
    }
    while (cursor < chunk.length) {
      var toCopy = Math.min(chunk.length - cursor, this._buffer.length - this._cursor);
      chunk.copy(this._buffer, this._cursor, cursor, cursor + toCopy);
      this._cursor += toCopy;
      cursor += toCopy;
      if (this._cursor === this._buffer.length && this._waitingForHeader) {
        var payloadSize = Deserializer.commonHeader(this._buffer, this._frame);
        if (payloadSize <= MAX_PAYLOAD_SIZE) {
          this._next(payloadSize);
        } else {
          this.emit("error", "FRAME_SIZE_ERROR");
          return;
        }
      }
      if (this._cursor === this._buffer.length && !this._waitingForHeader) {
        if (this._frame.type) {
          var error = Deserializer[this._frame.type](this._buffer, this._frame, this._role);
          if (error) {
            this._log.error("Incoming frame parsing error: " + error);
            this.emit("error", error);
          } else {
            this._log.trace({ frame: this._frame }, "Incoming frame");
            this.push(this._frame);
          }
        } else {
          this._log.error("Unknown type incoming frame");
        }
        this._next(COMMON_HEADER_SIZE);
      }
    }
    done();
  };
  var COMMON_HEADER_SIZE = 9;
  var frameTypes = [];
  var frameFlags = {};
  var genericAttributes = ["type", "flags", "stream"];
  var typeSpecificAttributes = {};
  Serializer.commonHeader = function writeCommonHeader(frame, buffers) {
    var headerBuffer = new Buffer(COMMON_HEADER_SIZE);
    var size = 0;
    for (var i = 0;i < buffers.length; i++) {
      size += buffers[i].length;
    }
    headerBuffer.writeUInt8(0, 0);
    headerBuffer.writeUInt16BE(size, 1);
    var typeId = frameTypes.indexOf(frame.type);
    headerBuffer.writeUInt8(typeId, 3);
    var flagByte = 0;
    for (var flag in frame.flags) {
      if (frame.flags.hasOwnProperty(flag)) {
        var position = frameFlags[frame.type].indexOf(flag);
        assert(position !== -1, "Unknown flag for frame type " + frame.type + ": " + flag);
        if (frame.flags[flag]) {
          flagByte |= 1 << position;
        }
      }
    }
    headerBuffer.writeUInt8(flagByte, 4);
    assert(0 <= frame.stream && frame.stream < 2147483647, frame.stream);
    headerBuffer.writeUInt32BE(frame.stream || 0, 5);
    buffers.unshift(headerBuffer);
    return size;
  };
  Deserializer.commonHeader = function readCommonHeader(buffer, frame) {
    if (buffer.length < 9) {
      return "FRAME_SIZE_ERROR";
    }
    var totallyWastedByte = buffer.readUInt8(0);
    var length = buffer.readUInt16BE(1);
    length += totallyWastedByte << 16;
    frame.type = frameTypes[buffer.readUInt8(3)];
    if (!frame.type) {
      return length;
    }
    frame.flags = {};
    var flagByte = buffer.readUInt8(4);
    var definedFlags = frameFlags[frame.type];
    for (var i = 0;i < definedFlags.length; i++) {
      frame.flags[definedFlags[i]] = Boolean(flagByte & 1 << i);
    }
    frame.stream = buffer.readUInt32BE(5) & 2147483647;
    return length;
  };
  frameTypes[0] = "DATA";
  frameFlags.DATA = ["END_STREAM", "RESERVED2", "RESERVED4", "PADDED"];
  typeSpecificAttributes.DATA = ["data"];
  Serializer.DATA = function writeData(frame, buffers) {
    buffers.push(frame.data);
  };
  Deserializer.DATA = function readData(buffer, frame) {
    var dataOffset = 0;
    var paddingLength = 0;
    if (frame.flags.PADDED) {
      if (buffer.length < 1) {
        return "FRAME_SIZE_ERROR";
      }
      paddingLength = buffer.readUInt8(dataOffset) & 255;
      dataOffset = 1;
    }
    if (paddingLength) {
      if (paddingLength >= buffer.length - 1) {
        return "FRAME_SIZE_ERROR";
      }
      frame.data = buffer.slice(dataOffset, -1 * paddingLength);
    } else {
      frame.data = buffer.slice(dataOffset);
    }
  };
  frameTypes[1] = "HEADERS";
  frameFlags.HEADERS = ["END_STREAM", "RESERVED2", "END_HEADERS", "PADDED", "RESERVED5", "PRIORITY"];
  typeSpecificAttributes.HEADERS = ["priorityDependency", "priorityWeight", "exclusiveDependency", "headers", "data"];
  Serializer.HEADERS = function writeHeadersPriority(frame, buffers) {
    if (frame.flags.PRIORITY) {
      var buffer = new Buffer(5);
      assert(0 <= frame.priorityDependency && frame.priorityDependency <= 2147483647, frame.priorityDependency);
      buffer.writeUInt32BE(frame.priorityDependency, 0);
      if (frame.exclusiveDependency) {
        buffer[0] |= 128;
      }
      assert(0 <= frame.priorityWeight && frame.priorityWeight <= 255, frame.priorityWeight);
      buffer.writeUInt8(frame.priorityWeight, 4);
      buffers.push(buffer);
    }
    buffers.push(frame.data);
  };
  Deserializer.HEADERS = function readHeadersPriority(buffer, frame) {
    var minFrameLength = 0;
    if (frame.flags.PADDED) {
      minFrameLength += 1;
    }
    if (frame.flags.PRIORITY) {
      minFrameLength += 5;
    }
    if (buffer.length < minFrameLength) {
      return "FRAME_SIZE_ERROR";
    }
    var dataOffset = 0;
    var paddingLength = 0;
    if (frame.flags.PADDED) {
      paddingLength = buffer.readUInt8(dataOffset) & 255;
      dataOffset = 1;
    }
    if (frame.flags.PRIORITY) {
      var dependencyData = new Buffer(4);
      buffer.copy(dependencyData, 0, dataOffset, dataOffset + 4);
      dataOffset += 4;
      frame.exclusiveDependency = !!(dependencyData[0] & 128);
      dependencyData[0] &= 127;
      frame.priorityDependency = dependencyData.readUInt32BE(0);
      frame.priorityWeight = buffer.readUInt8(dataOffset);
      dataOffset += 1;
    }
    if (paddingLength) {
      if (buffer.length - dataOffset < paddingLength) {
        return "FRAME_SIZE_ERROR";
      }
      frame.data = buffer.slice(dataOffset, -1 * paddingLength);
    } else {
      frame.data = buffer.slice(dataOffset);
    }
  };
  frameTypes[2] = "PRIORITY";
  frameFlags.PRIORITY = [];
  typeSpecificAttributes.PRIORITY = ["priorityDependency", "priorityWeight", "exclusiveDependency"];
  Serializer.PRIORITY = function writePriority(frame, buffers) {
    var buffer = new Buffer(5);
    assert(0 <= frame.priorityDependency && frame.priorityDependency <= 2147483647, frame.priorityDependency);
    buffer.writeUInt32BE(frame.priorityDependency, 0);
    if (frame.exclusiveDependency) {
      buffer[0] |= 128;
    }
    assert(0 <= frame.priorityWeight && frame.priorityWeight <= 255, frame.priorityWeight);
    buffer.writeUInt8(frame.priorityWeight, 4);
    buffers.push(buffer);
  };
  Deserializer.PRIORITY = function readPriority(buffer, frame) {
    if (buffer.length < 5) {
      return "FRAME_SIZE_ERROR";
    }
    var dependencyData = new Buffer(4);
    buffer.copy(dependencyData, 0, 0, 4);
    frame.exclusiveDependency = !!(dependencyData[0] & 128);
    dependencyData[0] &= 127;
    frame.priorityDependency = dependencyData.readUInt32BE(0);
    frame.priorityWeight = buffer.readUInt8(4);
  };
  frameTypes[3] = "RST_STREAM";
  frameFlags.RST_STREAM = [];
  typeSpecificAttributes.RST_STREAM = ["error"];
  Serializer.RST_STREAM = function writeRstStream(frame, buffers) {
    var buffer = new Buffer(4);
    var code = errorCodes.indexOf(frame.error);
    assert(0 <= code && code <= 4294967295, code);
    buffer.writeUInt32BE(code, 0);
    buffers.push(buffer);
  };
  Deserializer.RST_STREAM = function readRstStream(buffer, frame) {
    if (buffer.length < 4) {
      return "FRAME_SIZE_ERROR";
    }
    frame.error = errorCodes[buffer.readUInt32BE(0)];
    if (!frame.error) {
      frame.error = "INTERNAL_ERROR";
    }
  };
  frameTypes[4] = "SETTINGS";
  frameFlags.SETTINGS = ["ACK"];
  typeSpecificAttributes.SETTINGS = ["settings"];
  Serializer.SETTINGS = function writeSettings(frame, buffers) {
    var settings = [], settingsLeft = Object.keys(frame.settings);
    definedSettings.forEach(function(setting, id) {
      if (setting.name in frame.settings) {
        settingsLeft.splice(settingsLeft.indexOf(setting.name), 1);
        var value = frame.settings[setting.name];
        settings.push({ id, value: setting.flag ? Boolean(value) : value });
      }
    });
    assert(settingsLeft.length === 0, "Unknown settings: " + settingsLeft.join(", "));
    var buffer = new Buffer(settings.length * 6);
    for (var i = 0;i < settings.length; i++) {
      buffer.writeUInt16BE(settings[i].id & 65535, i * 6);
      buffer.writeUInt32BE(settings[i].value, i * 6 + 2);
    }
    buffers.push(buffer);
  };
  Deserializer.SETTINGS = function readSettings(buffer, frame, role) {
    frame.settings = {};
    if (frame.flags.ACK && buffer.length != 0) {
      return "FRAME_SIZE_ERROR";
    }
    if (buffer.length % 6 !== 0) {
      return "PROTOCOL_ERROR";
    }
    for (var i = 0;i < buffer.length / 6; i++) {
      var id = buffer.readUInt16BE(i * 6) & 65535;
      var setting = definedSettings[id];
      if (setting) {
        if (role == "CLIENT" && setting.name == "SETTINGS_ENABLE_PUSH") {
          return "SETTINGS frame on client got SETTINGS_ENABLE_PUSH";
        }
        var value = buffer.readUInt32BE(i * 6 + 2);
        frame.settings[setting.name] = setting.flag ? Boolean(value & 1) : value;
      }
    }
  };
  var definedSettings = [];
  definedSettings[1] = { name: "SETTINGS_HEADER_TABLE_SIZE", flag: false };
  definedSettings[2] = { name: "SETTINGS_ENABLE_PUSH", flag: true };
  definedSettings[3] = { name: "SETTINGS_MAX_CONCURRENT_STREAMS", flag: false };
  definedSettings[4] = { name: "SETTINGS_INITIAL_WINDOW_SIZE", flag: false };
  definedSettings[5] = { name: "SETTINGS_MAX_FRAME_SIZE", flag: false };
  frameTypes[5] = "PUSH_PROMISE";
  frameFlags.PUSH_PROMISE = ["RESERVED1", "RESERVED2", "END_PUSH_PROMISE", "PADDED"];
  typeSpecificAttributes.PUSH_PROMISE = ["promised_stream", "headers", "data"];
  Serializer.PUSH_PROMISE = function writePushPromise(frame, buffers) {
    var buffer = new Buffer(4);
    var promised_stream = frame.promised_stream;
    assert(0 <= promised_stream && promised_stream <= 2147483647, promised_stream);
    buffer.writeUInt32BE(promised_stream, 0);
    buffers.push(buffer);
    buffers.push(frame.data);
  };
  Deserializer.PUSH_PROMISE = function readPushPromise(buffer, frame) {
    if (buffer.length < 4) {
      return "FRAME_SIZE_ERROR";
    }
    var dataOffset = 0;
    var paddingLength = 0;
    if (frame.flags.PADDED) {
      if (buffer.length < 5) {
        return "FRAME_SIZE_ERROR";
      }
      paddingLength = buffer.readUInt8(dataOffset) & 255;
      dataOffset = 1;
    }
    frame.promised_stream = buffer.readUInt32BE(dataOffset) & 2147483647;
    dataOffset += 4;
    if (paddingLength) {
      if (buffer.length - dataOffset < paddingLength) {
        return "FRAME_SIZE_ERROR";
      }
      frame.data = buffer.slice(dataOffset, -1 * paddingLength);
    } else {
      frame.data = buffer.slice(dataOffset);
    }
  };
  frameTypes[6] = "PING";
  frameFlags.PING = ["ACK"];
  typeSpecificAttributes.PING = ["data"];
  Serializer.PING = function writePing(frame, buffers) {
    buffers.push(frame.data);
  };
  Deserializer.PING = function readPing(buffer, frame) {
    if (buffer.length !== 8) {
      return "FRAME_SIZE_ERROR";
    }
    frame.data = buffer;
  };
  frameTypes[7] = "GOAWAY";
  frameFlags.GOAWAY = [];
  typeSpecificAttributes.GOAWAY = ["last_stream", "error"];
  Serializer.GOAWAY = function writeGoaway(frame, buffers) {
    var buffer = new Buffer(8);
    var last_stream = frame.last_stream;
    assert(0 <= last_stream && last_stream <= 2147483647, last_stream);
    buffer.writeUInt32BE(last_stream, 0);
    var code = errorCodes.indexOf(frame.error);
    assert(0 <= code && code <= 4294967295, code);
    buffer.writeUInt32BE(code, 4);
    buffers.push(buffer);
  };
  Deserializer.GOAWAY = function readGoaway(buffer, frame) {
    if (buffer.length < 8) {
      return "FRAME_SIZE_ERROR";
    }
    frame.last_stream = buffer.readUInt32BE(0) & 2147483647;
    frame.error = errorCodes[buffer.readUInt32BE(4)];
    if (!frame.error) {
      frame.error = "INTERNAL_ERROR";
    }
    if (buffer.length > 8) {
      frame.debug_data = buffer.slice(8);
    }
  };
  frameTypes[8] = "WINDOW_UPDATE";
  frameFlags.WINDOW_UPDATE = [];
  typeSpecificAttributes.WINDOW_UPDATE = ["window_size"];
  Serializer.WINDOW_UPDATE = function writeWindowUpdate(frame, buffers) {
    var buffer = new Buffer(4);
    var window_size = frame.window_size;
    assert(0 < window_size && window_size <= 2147483647, window_size);
    buffer.writeUInt32BE(window_size, 0);
    buffers.push(buffer);
  };
  Deserializer.WINDOW_UPDATE = function readWindowUpdate(buffer, frame) {
    if (buffer.length !== WINDOW_UPDATE_PAYLOAD_SIZE) {
      return "FRAME_SIZE_ERROR";
    }
    frame.window_size = buffer.readUInt32BE(0) & 2147483647;
    if (frame.window_size === 0) {
      return "PROTOCOL_ERROR";
    }
  };
  frameTypes[9] = "CONTINUATION";
  frameFlags.CONTINUATION = ["RESERVED1", "RESERVED2", "END_HEADERS"];
  typeSpecificAttributes.CONTINUATION = ["headers", "data"];
  Serializer.CONTINUATION = function writeContinuation(frame, buffers) {
    buffers.push(frame.data);
  };
  Deserializer.CONTINUATION = function readContinuation(buffer, frame) {
    frame.data = buffer;
  };
  frameTypes[10] = "ALTSVC";
  frameFlags.ALTSVC = [];
  typeSpecificAttributes.ALTSVC = [
    "maxAge",
    "port",
    "protocolID",
    "host",
    "origin"
  ];
  function istchar(c) {
    return "!#$&'*+-.^_`|~1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz".indexOf(c) > -1;
  }
  function hexencode(s) {
    var t = "";
    for (var i = 0;i < s.length; i++) {
      if (!istchar(s[i])) {
        t += "%";
        t += new Buffer(s[i]).toString("hex");
      } else {
        t += s[i];
      }
    }
    return t;
  }
  Serializer.ALTSVC = function writeAltSvc(frame, buffers) {
    var buffer = new Buffer(2);
    buffer.writeUInt16BE(frame.origin.length, 0);
    buffers.push(buffer);
    buffers.push(new Buffer(frame.origin, "ascii"));
    var fieldValue = hexencode(frame.protocolID) + '="' + frame.host + ":" + frame.port + '"';
    if (frame.maxAge !== 86400) {
      fieldValue += "; ma=" + frame.maxAge;
    }
    buffers.push(new Buffer(fieldValue, "ascii"));
  };
  function stripquotes(s) {
    var start = 0;
    var end = s.length;
    while (start < end && s[start] === '"') {
      start++;
    }
    while (end > start && s[end - 1] === '"') {
      end--;
    }
    if (start >= end) {
      return "";
    }
    return s.substring(start, end);
  }
  function splitNameValue(nvpair) {
    var eq = -1;
    var inQuotes = false;
    for (var i = 0;i < nvpair.length; i++) {
      if (nvpair[i] === '"') {
        inQuotes = !inQuotes;
        continue;
      }
      if (inQuotes) {
        continue;
      }
      if (nvpair[i] === "=") {
        eq = i;
        break;
      }
    }
    if (eq === -1) {
      return { name: nvpair, value: null };
    }
    var name = stripquotes(nvpair.substring(0, eq).trim());
    var value = stripquotes(nvpair.substring(eq + 1).trim());
    return { name, value };
  }
  function splitHeaderParameters(hv) {
    return parseHeaderValue(hv, ";", splitNameValue);
  }
  function parseHeaderValue(hv, separator, callback) {
    var start = 0;
    var inQuotes = false;
    var values = [];
    for (var i = 0;i < hv.length; i++) {
      if (hv[i] === '"') {
        inQuotes = !inQuotes;
        continue;
      }
      if (inQuotes) {
        continue;
      }
      if (hv[i] === separator) {
        var newValue = hv.substring(start, i).trim();
        if (newValue.length > 0) {
          newValue = callback(newValue);
          values.push(newValue);
        }
        start = i + 1;
      }
    }
    var newValue = hv.substring(start).trim();
    if (newValue.length > 0) {
      newValue = callback(newValue);
      values.push(newValue);
    }
    return values;
  }
  function rsplit(s, delim, count) {
    var nsplits = 0;
    var end = s.length;
    var rval = [];
    for (var i = s.length - 1;i >= 0; i--) {
      if (s[i] === delim) {
        var t = s.substring(i + 1, end);
        end = i;
        rval.unshift(t);
        nsplits++;
        if (nsplits === count) {
          break;
        }
      }
    }
    if (end !== 0) {
      rval.unshift(s.substring(0, end));
    }
    return rval;
  }
  function ishex(c) {
    return "0123456789ABCDEFabcdef".indexOf(c) > -1;
  }
  function unescape(s) {
    var i = 0;
    var t = "";
    while (i < s.length) {
      if (s[i] != "%" || !ishex(s[i + 1]) || !ishex(s[i + 2])) {
        t += s[i];
      } else {
        ++i;
        var hexvalue = "";
        if (i < s.length) {
          hexvalue += s[i];
          ++i;
        }
        if (i < s.length) {
          hexvalue += s[i];
        }
        if (hexvalue.length > 0) {
          t += new Buffer(hexvalue, "hex").toString();
        } else {
          t += "%";
        }
      }
      ++i;
    }
    return t;
  }
  Deserializer.ALTSVC = function readAltSvc(buffer, frame) {
    if (buffer.length < 2) {
      return "FRAME_SIZE_ERROR";
    }
    var originLength = buffer.readUInt16BE(0);
    if (buffer.length - 2 < originLength) {
      return "FRAME_SIZE_ERROR";
    }
    frame.origin = buffer.toString("ascii", 2, 2 + originLength);
    var fieldValue = buffer.toString("ascii", 2 + originLength);
    var values = parseHeaderValue(fieldValue, ",", splitHeaderParameters);
    if (values.length > 1) {}
    if (values.length === 0) {
      return;
    }
    var chosenAltSvc = values[0];
    frame.maxAge = 86400;
    for (var i = 0;i < chosenAltSvc.length; i++) {
      if (i === 0) {
        frame.protocolID = unescape(chosenAltSvc[i].name);
        var hostport = rsplit(chosenAltSvc[i].value, ":", 1);
        frame.host = hostport[0];
        frame.port = parseInt(hostport[1], 10);
      } else if (chosenAltSvc[i].name == "ma") {
        frame.maxAge = parseInt(chosenAltSvc[i].value, 10);
      }
    }
  };
  frameTypes[12] = "ORIGIN";
  frameFlags.ORIGIN = [];
  typeSpecificAttributes.ORIGIN = ["originList"];
  Serializer.ORIGIN = function writeOrigin(frame, buffers) {
    for (var i = 0;i < frame.originList.length; i++) {
      var buffer = new Buffer(2);
      buffer.writeUInt16BE(frame.originList[i].length, 0);
      buffers.push(buffer);
      buffers.push(new Buffer(frame.originList[i], "ascii"));
    }
  };
  Deserializer.ORIGIN = function readOrigin(buffer, frame) {};
  var errorCodes = [
    "NO_ERROR",
    "PROTOCOL_ERROR",
    "INTERNAL_ERROR",
    "FLOW_CONTROL_ERROR",
    "SETTINGS_TIMEOUT",
    "STREAM_CLOSED",
    "FRAME_SIZE_ERROR",
    "REFUSED_STREAM",
    "CANCEL",
    "COMPRESSION_ERROR",
    "CONNECT_ERROR",
    "ENHANCE_YOUR_CALM",
    "INADEQUATE_SECURITY",
    "HTTP_1_1_REQUIRED"
  ];
  exports.serializers = {};
  var frameCounter = 0;
  exports.serializers.frame = function(frame) {
    if (!frame) {
      return null;
    }
    if ("id" in frame) {
      return frame.id;
    }
    frame.id = frameCounter;
    frameCounter += 1;
    var logEntry = { id: frame.id };
    genericAttributes.concat(typeSpecificAttributes[frame.type]).forEach(function(name) {
      logEntry[name] = frame[name];
    });
    if (frame.data instanceof Buffer) {
      if (logEntry.data.length > 50) {
        logEntry.data = frame.data.slice(0, 47).toString("hex") + "...";
      } else {
        logEntry.data = frame.data.toString("hex");
      }
      if (!("length" in logEntry)) {
        logEntry.length = frame.data.length;
      }
    }
    if (frame.promised_stream instanceof Object) {
      logEntry.promised_stream = "stream-" + frame.promised_stream.id;
    }
    logEntry.flags = Object.keys(frame.flags || {}).filter(function(name) {
      return frame.flags[name] === true;
    });
    return logEntry;
  };
  exports.serializers.data = function(data) {
    return data.toString("hex");
  };
});

// node_modules/http2/lib/protocol/compressor.js
var require_compressor = __commonJS((exports) => {
  exports.HeaderTable = HeaderTable;
  exports.HuffmanTable = HuffmanTable;
  exports.HeaderSetCompressor = HeaderSetCompressor;
  exports.HeaderSetDecompressor = HeaderSetDecompressor;
  exports.Compressor = Compressor;
  exports.Decompressor = Decompressor;
  var TransformStream = __require("stream").Transform;
  var assert = __require("assert");
  var util = __require("util");
  function HeaderTable(log, limit) {
    var self = HeaderTable.staticTable.map(entryFromPair);
    self._log = log;
    self._limit = limit || DEFAULT_HEADER_TABLE_LIMIT;
    self._staticLength = self.length;
    self._size = 0;
    self._enforceLimit = HeaderTable.prototype._enforceLimit;
    self.add = HeaderTable.prototype.add;
    self.setSizeLimit = HeaderTable.prototype.setSizeLimit;
    return self;
  }
  function entryFromPair(pair) {
    var entry = pair.slice();
    entry._size = size(entry);
    return entry;
  }
  var DEFAULT_HEADER_TABLE_LIMIT = 4096;
  function size(entry) {
    return new Buffer(entry[0] + entry[1], "utf8").length + 32;
  }
  HeaderTable.prototype._enforceLimit = function _enforceLimit(limit) {
    var droppedEntries = [];
    while (this._size > 0 && this._size > limit) {
      var dropped = this.pop();
      this._size -= dropped._size;
      droppedEntries.unshift(dropped);
    }
    return droppedEntries;
  };
  HeaderTable.prototype.add = function(entry) {
    var limit = this._limit - entry._size;
    var droppedEntries = this._enforceLimit(limit);
    if (this._size <= limit) {
      this.splice(this._staticLength, 0, entry);
      this._size += entry._size;
    }
    return droppedEntries;
  };
  HeaderTable.prototype.setSizeLimit = function setSizeLimit(limit) {
    this._limit = limit;
    this._enforceLimit(this._limit);
  };
  HeaderTable.staticTable = [
    [":authority", ""],
    [":method", "GET"],
    [":method", "POST"],
    [":path", "/"],
    [":path", "/index.html"],
    [":scheme", "http"],
    [":scheme", "https"],
    [":status", "200"],
    [":status", "204"],
    [":status", "206"],
    [":status", "304"],
    [":status", "400"],
    [":status", "404"],
    [":status", "500"],
    ["accept-charset", ""],
    ["accept-encoding", "gzip, deflate"],
    ["accept-language", ""],
    ["accept-ranges", ""],
    ["accept", ""],
    ["access-control-allow-origin", ""],
    ["age", ""],
    ["allow", ""],
    ["authorization", ""],
    ["cache-control", ""],
    ["content-disposition", ""],
    ["content-encoding", ""],
    ["content-language", ""],
    ["content-length", ""],
    ["content-location", ""],
    ["content-range", ""],
    ["content-type", ""],
    ["cookie", ""],
    ["date", ""],
    ["etag", ""],
    ["expect", ""],
    ["expires", ""],
    ["from", ""],
    ["host", ""],
    ["if-match", ""],
    ["if-modified-since", ""],
    ["if-none-match", ""],
    ["if-range", ""],
    ["if-unmodified-since", ""],
    ["last-modified", ""],
    ["link", ""],
    ["location", ""],
    ["max-forwards", ""],
    ["proxy-authenticate", ""],
    ["proxy-authorization", ""],
    ["range", ""],
    ["referer", ""],
    ["refresh", ""],
    ["retry-after", ""],
    ["server", ""],
    ["set-cookie", ""],
    ["strict-transport-security", ""],
    ["transfer-encoding", ""],
    ["user-agent", ""],
    ["vary", ""],
    ["via", ""],
    ["www-authenticate", ""]
  ];
  util.inherits(HeaderSetDecompressor, TransformStream);
  function HeaderSetDecompressor(log, table) {
    TransformStream.call(this, { objectMode: true });
    this._log = log.child({ component: "compressor" });
    this._table = table;
    this._chunks = [];
  }
  HeaderSetDecompressor.prototype._transform = function _transform(chunk, encoding, callback) {
    this._chunks.push(chunk);
    callback();
  };
  HeaderSetDecompressor.prototype._execute = function _execute(rep) {
    this._log.trace({ key: rep.name, value: rep.value, index: rep.index }, "Executing header representation");
    var entry, pair;
    if (rep.contextUpdate) {
      this._table.setSizeLimit(rep.newMaxSize);
    } else if (typeof rep.value === "number") {
      var index = rep.value;
      entry = this._table[index];
      pair = entry.slice();
      this.push(pair);
    } else {
      if (typeof rep.name === "number") {
        pair = [this._table[rep.name][0], rep.value];
      } else {
        pair = [rep.name, rep.value];
      }
      if (rep.index) {
        entry = entryFromPair(pair);
        this._table.add(entry);
      }
      this.push(pair);
    }
  };
  HeaderSetDecompressor.prototype._flush = function _flush(callback) {
    var buffer = concat(this._chunks);
    buffer.cursor = 0;
    while (buffer.cursor < buffer.length) {
      this._execute(HeaderSetDecompressor.header(buffer));
    }
    callback();
  };
  util.inherits(HeaderSetCompressor, TransformStream);
  function HeaderSetCompressor(log, table) {
    TransformStream.call(this, { objectMode: true });
    this._log = log.child({ component: "compressor" });
    this._table = table;
    this.push = TransformStream.prototype.push.bind(this);
  }
  HeaderSetCompressor.prototype.send = function send(rep) {
    this._log.trace({ key: rep.name, value: rep.value, index: rep.index }, "Emitting header representation");
    if (!rep.chunks) {
      rep.chunks = HeaderSetCompressor.header(rep);
    }
    rep.chunks.forEach(this.push);
  };
  HeaderSetCompressor.prototype._transform = function _transform(pair, encoding, callback) {
    var name = pair[0].toLowerCase();
    var value = pair[1];
    var entry, rep;
    var nameMatch = -1, fullMatch = -1;
    for (var droppedIndex = 0;droppedIndex < this._table.length; droppedIndex++) {
      entry = this._table[droppedIndex];
      if (entry[0] === name) {
        if (entry[1] === value) {
          fullMatch = droppedIndex;
          break;
        } else if (nameMatch === -1) {
          nameMatch = droppedIndex;
        }
      }
    }
    var mustNeverIndex = name === "cookie" && value.length < 20 || name === "set-cookie" && value.length < 20 || name === "authorization";
    if (fullMatch !== -1 && !mustNeverIndex) {
      this.send({ name: fullMatch, value: fullMatch, index: false });
    } else {
      entry = entryFromPair(pair);
      var indexing = entry._size < this._table._limit / 2 && !mustNeverIndex;
      if (indexing) {
        this._table.add(entry);
      }
      this.send({ name: nameMatch !== -1 ? nameMatch : name, value, index: indexing, mustNeverIndex, contextUpdate: false });
    }
    callback();
  };
  HeaderSetCompressor.prototype._flush = function _flush(callback) {
    callback();
  };
  HeaderSetCompressor.integer = function writeInteger(I, N) {
    var limit = Math.pow(2, N) - 1;
    if (I < limit) {
      return [new Buffer([I])];
    }
    var bytes = [];
    if (N !== 0) {
      bytes.push(limit);
    }
    I -= limit;
    var Q = 1, R;
    while (Q > 0) {
      Q = Math.floor(I / 128);
      R = I % 128;
      if (Q > 0) {
        R += 128;
      }
      bytes.push(R);
      I = Q;
    }
    return [new Buffer(bytes)];
  };
  HeaderSetDecompressor.integer = function readInteger(buffer, N) {
    var limit = Math.pow(2, N) - 1;
    var I = buffer[buffer.cursor] & limit;
    if (N !== 0) {
      buffer.cursor += 1;
    }
    if (I === limit) {
      var M = 0;
      do {
        I += (buffer[buffer.cursor] & 127) << M;
        M += 7;
        buffer.cursor += 1;
      } while (buffer[buffer.cursor - 1] & 128);
    }
    return I;
  };
  function HuffmanTable(table) {
    function createTree(codes, position) {
      if (codes.length === 1) {
        return [table.indexOf(codes[0])];
      } else {
        position = position || 0;
        var zero = [];
        var one = [];
        for (var i = 0;i < codes.length; i++) {
          var string = codes[i];
          if (string[position] === "0") {
            zero.push(string);
          } else {
            one.push(string);
          }
        }
        return [createTree(zero, position + 1), createTree(one, position + 1)];
      }
    }
    this.tree = createTree(table);
    this.codes = table.map(function(bits) {
      return parseInt(bits, 2);
    });
    this.lengths = table.map(function(bits) {
      return bits.length;
    });
  }
  HuffmanTable.prototype.encode = function encode(buffer) {
    var result = [];
    var space = 8;
    function add(data) {
      if (space === 8) {
        result.push(data);
      } else {
        result[result.length - 1] |= data;
      }
    }
    for (var i = 0;i < buffer.length; i++) {
      var byte = buffer[i];
      var code = this.codes[byte];
      var length = this.lengths[byte];
      while (length !== 0) {
        if (space >= length) {
          add(code << space - length);
          code = 0;
          space -= length;
          length = 0;
        } else {
          var shift = length - space;
          var msb = code >> shift;
          add(msb);
          code -= msb << shift;
          length -= space;
          space = 0;
        }
        if (space === 0) {
          space = 8;
        }
      }
    }
    if (space !== 8) {
      add(this.codes[256] >> this.lengths[256] - space);
    }
    return new Buffer(result);
  };
  HuffmanTable.prototype.decode = function decode(buffer) {
    var result = [];
    var subtree = this.tree;
    for (var i = 0;i < buffer.length; i++) {
      var byte = buffer[i];
      for (var j = 0;j < 8; j++) {
        var bit = byte & 128 ? 1 : 0;
        byte = byte << 1;
        subtree = subtree[bit];
        if (subtree.length === 1) {
          result.push(subtree[0]);
          subtree = this.tree;
        }
      }
    }
    return new Buffer(result);
  };
  HuffmanTable.huffmanTable = new HuffmanTable([
    "1111111111000",
    "11111111111111111011000",
    "1111111111111111111111100010",
    "1111111111111111111111100011",
    "1111111111111111111111100100",
    "1111111111111111111111100101",
    "1111111111111111111111100110",
    "1111111111111111111111100111",
    "1111111111111111111111101000",
    "111111111111111111101010",
    "111111111111111111111111111100",
    "1111111111111111111111101001",
    "1111111111111111111111101010",
    "111111111111111111111111111101",
    "1111111111111111111111101011",
    "1111111111111111111111101100",
    "1111111111111111111111101101",
    "1111111111111111111111101110",
    "1111111111111111111111101111",
    "1111111111111111111111110000",
    "1111111111111111111111110001",
    "1111111111111111111111110010",
    "111111111111111111111111111110",
    "1111111111111111111111110011",
    "1111111111111111111111110100",
    "1111111111111111111111110101",
    "1111111111111111111111110110",
    "1111111111111111111111110111",
    "1111111111111111111111111000",
    "1111111111111111111111111001",
    "1111111111111111111111111010",
    "1111111111111111111111111011",
    "010100",
    "1111111000",
    "1111111001",
    "111111111010",
    "1111111111001",
    "010101",
    "11111000",
    "11111111010",
    "1111111010",
    "1111111011",
    "11111001",
    "11111111011",
    "11111010",
    "010110",
    "010111",
    "011000",
    "00000",
    "00001",
    "00010",
    "011001",
    "011010",
    "011011",
    "011100",
    "011101",
    "011110",
    "011111",
    "1011100",
    "11111011",
    "111111111111100",
    "100000",
    "111111111011",
    "1111111100",
    "1111111111010",
    "100001",
    "1011101",
    "1011110",
    "1011111",
    "1100000",
    "1100001",
    "1100010",
    "1100011",
    "1100100",
    "1100101",
    "1100110",
    "1100111",
    "1101000",
    "1101001",
    "1101010",
    "1101011",
    "1101100",
    "1101101",
    "1101110",
    "1101111",
    "1110000",
    "1110001",
    "1110010",
    "11111100",
    "1110011",
    "11111101",
    "1111111111011",
    "1111111111111110000",
    "1111111111100",
    "11111111111100",
    "100010",
    "111111111111101",
    "00011",
    "100011",
    "00100",
    "100100",
    "00101",
    "100101",
    "100110",
    "100111",
    "00110",
    "1110100",
    "1110101",
    "101000",
    "101001",
    "101010",
    "00111",
    "101011",
    "1110110",
    "101100",
    "01000",
    "01001",
    "101101",
    "1110111",
    "1111000",
    "1111001",
    "1111010",
    "1111011",
    "111111111111110",
    "11111111100",
    "11111111111101",
    "1111111111101",
    "1111111111111111111111111100",
    "11111111111111100110",
    "1111111111111111010010",
    "11111111111111100111",
    "11111111111111101000",
    "1111111111111111010011",
    "1111111111111111010100",
    "1111111111111111010101",
    "11111111111111111011001",
    "1111111111111111010110",
    "11111111111111111011010",
    "11111111111111111011011",
    "11111111111111111011100",
    "11111111111111111011101",
    "11111111111111111011110",
    "111111111111111111101011",
    "11111111111111111011111",
    "111111111111111111101100",
    "111111111111111111101101",
    "1111111111111111010111",
    "11111111111111111100000",
    "111111111111111111101110",
    "11111111111111111100001",
    "11111111111111111100010",
    "11111111111111111100011",
    "11111111111111111100100",
    "111111111111111011100",
    "1111111111111111011000",
    "11111111111111111100101",
    "1111111111111111011001",
    "11111111111111111100110",
    "11111111111111111100111",
    "111111111111111111101111",
    "1111111111111111011010",
    "111111111111111011101",
    "11111111111111101001",
    "1111111111111111011011",
    "1111111111111111011100",
    "11111111111111111101000",
    "11111111111111111101001",
    "111111111111111011110",
    "11111111111111111101010",
    "1111111111111111011101",
    "1111111111111111011110",
    "111111111111111111110000",
    "111111111111111011111",
    "1111111111111111011111",
    "11111111111111111101011",
    "11111111111111111101100",
    "111111111111111100000",
    "111111111111111100001",
    "1111111111111111100000",
    "111111111111111100010",
    "11111111111111111101101",
    "1111111111111111100001",
    "11111111111111111101110",
    "11111111111111111101111",
    "11111111111111101010",
    "1111111111111111100010",
    "1111111111111111100011",
    "1111111111111111100100",
    "11111111111111111110000",
    "1111111111111111100101",
    "1111111111111111100110",
    "11111111111111111110001",
    "11111111111111111111100000",
    "11111111111111111111100001",
    "11111111111111101011",
    "1111111111111110001",
    "1111111111111111100111",
    "11111111111111111110010",
    "1111111111111111101000",
    "1111111111111111111101100",
    "11111111111111111111100010",
    "11111111111111111111100011",
    "11111111111111111111100100",
    "111111111111111111111011110",
    "111111111111111111111011111",
    "11111111111111111111100101",
    "111111111111111111110001",
    "1111111111111111111101101",
    "1111111111111110010",
    "111111111111111100011",
    "11111111111111111111100110",
    "111111111111111111111100000",
    "111111111111111111111100001",
    "11111111111111111111100111",
    "111111111111111111111100010",
    "111111111111111111110010",
    "111111111111111100100",
    "111111111111111100101",
    "11111111111111111111101000",
    "11111111111111111111101001",
    "1111111111111111111111111101",
    "111111111111111111111100011",
    "111111111111111111111100100",
    "111111111111111111111100101",
    "11111111111111101100",
    "111111111111111111110011",
    "11111111111111101101",
    "111111111111111100110",
    "1111111111111111101001",
    "111111111111111100111",
    "111111111111111101000",
    "11111111111111111110011",
    "1111111111111111101010",
    "1111111111111111101011",
    "1111111111111111111101110",
    "1111111111111111111101111",
    "111111111111111111110100",
    "111111111111111111110101",
    "11111111111111111111101010",
    "11111111111111111110100",
    "11111111111111111111101011",
    "111111111111111111111100110",
    "11111111111111111111101100",
    "11111111111111111111101101",
    "111111111111111111111100111",
    "111111111111111111111101000",
    "111111111111111111111101001",
    "111111111111111111111101010",
    "111111111111111111111101011",
    "1111111111111111111111111110",
    "111111111111111111111101100",
    "111111111111111111111101101",
    "111111111111111111111101110",
    "111111111111111111111101111",
    "111111111111111111111110000",
    "11111111111111111111101110",
    "111111111111111111111111111111"
  ]);
  HeaderSetCompressor.string = function writeString(str) {
    str = new Buffer(str, "utf8");
    var huffman = HuffmanTable.huffmanTable.encode(str);
    if (huffman.length < str.length) {
      var length = HeaderSetCompressor.integer(huffman.length, 7);
      length[0][0] |= 128;
      return length.concat(huffman);
    } else {
      length = HeaderSetCompressor.integer(str.length, 7);
      return length.concat(str);
    }
  };
  HeaderSetDecompressor.string = function readString(buffer) {
    var huffman = buffer[buffer.cursor] & 128;
    var length = HeaderSetDecompressor.integer(buffer, 7);
    var encoded = buffer.slice(buffer.cursor, buffer.cursor + length);
    buffer.cursor += length;
    return (huffman ? HuffmanTable.huffmanTable.decode(encoded) : encoded).toString("utf8");
  };
  var representations = {
    indexed: { prefix: 7, pattern: 128 },
    literalIncremental: { prefix: 6, pattern: 64 },
    contextUpdate: { prefix: 0, pattern: 32 },
    literalNeverIndexed: { prefix: 4, pattern: 16 },
    literal: { prefix: 4, pattern: 0 }
  };
  HeaderSetCompressor.header = function writeHeader(header) {
    var representation, buffers = [];
    if (header.contextUpdate) {
      representation = representations.contextUpdate;
    } else if (typeof header.value === "number") {
      representation = representations.indexed;
    } else if (header.index) {
      representation = representations.literalIncremental;
    } else if (header.mustNeverIndex) {
      representation = representations.literalNeverIndexed;
    } else {
      representation = representations.literal;
    }
    if (representation === representations.contextUpdate) {
      buffers.push(HeaderSetCompressor.integer(header.newMaxSize, 5));
    } else if (representation === representations.indexed) {
      buffers.push(HeaderSetCompressor.integer(header.value + 1, representation.prefix));
    } else {
      if (typeof header.name === "number") {
        buffers.push(HeaderSetCompressor.integer(header.name + 1, representation.prefix));
      } else {
        buffers.push(HeaderSetCompressor.integer(0, representation.prefix));
        buffers.push(HeaderSetCompressor.string(header.name));
      }
      buffers.push(HeaderSetCompressor.string(header.value));
    }
    buffers[0][0][0] |= representation.pattern;
    return Array.prototype.concat.apply([], buffers);
  };
  HeaderSetDecompressor.header = function readHeader(buffer) {
    var representation, header = {};
    var firstByte = buffer[buffer.cursor];
    if (firstByte & 128) {
      representation = representations.indexed;
    } else if (firstByte & 64) {
      representation = representations.literalIncremental;
    } else if (firstByte & 32) {
      representation = representations.contextUpdate;
    } else if (firstByte & 16) {
      representation = representations.literalNeverIndexed;
    } else {
      representation = representations.literal;
    }
    header.value = header.name = -1;
    header.index = false;
    header.contextUpdate = false;
    header.newMaxSize = 0;
    header.mustNeverIndex = false;
    if (representation === representations.contextUpdate) {
      header.contextUpdate = true;
      header.newMaxSize = HeaderSetDecompressor.integer(buffer, 5);
    } else if (representation === representations.indexed) {
      header.value = header.name = HeaderSetDecompressor.integer(buffer, representation.prefix) - 1;
    } else {
      header.name = HeaderSetDecompressor.integer(buffer, representation.prefix) - 1;
      if (header.name === -1) {
        header.name = HeaderSetDecompressor.string(buffer);
      }
      header.value = HeaderSetDecompressor.string(buffer);
      header.index = representation === representations.literalIncremental;
      header.mustNeverIndex = representation === representations.literalNeverIndexed;
    }
    return header;
  };
  var MAX_HTTP_PAYLOAD_SIZE = 16384;
  util.inherits(Compressor, TransformStream);
  function Compressor(log, type) {
    TransformStream.call(this, { objectMode: true });
    this._log = log.child({ component: "compressor" });
    assert(type === "REQUEST" || type === "RESPONSE");
    this._table = new HeaderTable(this._log);
    this.tableSizeChangePending = false;
    this.lowestTableSizePending = 0;
    this.tableSizeSetting = DEFAULT_HEADER_TABLE_LIMIT;
  }
  Compressor.prototype.setTableSizeLimit = function setTableSizeLimit(size2) {
    this._table.setSizeLimit(size2);
    if (!this.tableSizeChangePending || size2 < this.lowestTableSizePending) {
      this.lowestTableSizePending = size2;
    }
    this.tableSizeSetting = size2;
    this.tableSizeChangePending = true;
  };
  Compressor.prototype.compress = function compress(headers) {
    var compressor = new HeaderSetCompressor(this._log, this._table);
    if (this.tableSizeChangePending) {
      if (this.lowestTableSizePending < this.tableSizeSetting) {
        compressor.send({
          contextUpdate: true,
          newMaxSize: this.lowestTableSizePending,
          name: "",
          value: "",
          index: 0
        });
      }
      compressor.send({
        contextUpdate: true,
        newMaxSize: this.tableSizeSetting,
        name: "",
        value: "",
        index: 0
      });
      this.tableSizeChangePending = false;
    }
    var colonHeaders = [];
    var nonColonHeaders = [];
    for (var name in headers) {
      if (name.trim()[0] === ":") {
        colonHeaders.push(name);
      } else {
        nonColonHeaders.push(name);
      }
    }
    function compressHeader(name2) {
      var value = headers[name2];
      name2 = String(name2).toLowerCase();
      if (name2 == "cookie") {
        if (!(value instanceof Array)) {
          value = [value];
        }
        value = Array.prototype.concat.apply([], value.map(function(cookie) {
          return String(cookie).split(";").map(trim);
        }));
      }
      if (value instanceof Array) {
        for (var i = 0;i < value.length; i++) {
          compressor.write([name2, String(value[i])]);
        }
      } else {
        compressor.write([name2, String(value)]);
      }
    }
    colonHeaders.forEach(compressHeader);
    nonColonHeaders.forEach(compressHeader);
    compressor.end();
    var chunk, chunks = [];
    while (chunk = compressor.read()) {
      chunks.push(chunk);
    }
    return concat(chunks);
  };
  Compressor.prototype._transform = function _transform(frame, encoding, done) {
    if (frame.type === "HEADERS" || frame.type === "PUSH_PROMISE") {
      var buffer = this.compress(frame.headers);
      var adjustment = frame.type === "PUSH_PROMISE" ? 4 : 0;
      var chunks = cut(buffer, MAX_HTTP_PAYLOAD_SIZE - adjustment);
      for (var i = 0;i < chunks.length; i++) {
        var chunkFrame;
        var first = i === 0;
        var last = i === chunks.length - 1;
        if (first) {
          chunkFrame = util._extend({}, frame);
          chunkFrame.flags = util._extend({}, frame.flags);
          chunkFrame.flags["END_" + frame.type] = last;
        } else {
          chunkFrame = {
            type: "CONTINUATION",
            flags: { END_HEADERS: last },
            stream: frame.stream
          };
        }
        chunkFrame.data = chunks[i];
        this.push(chunkFrame);
      }
    } else {
      this.push(frame);
    }
    done();
  };
  util.inherits(Decompressor, TransformStream);
  function Decompressor(log, type) {
    TransformStream.call(this, { objectMode: true });
    this._log = log.child({ component: "compressor" });
    assert(type === "REQUEST" || type === "RESPONSE");
    this._table = new HeaderTable(this._log);
    this._inProgress = false;
    this._base = undefined;
  }
  Decompressor.prototype.setTableSizeLimit = function setTableSizeLimit(size2) {
    this._table.setSizeLimit(size2);
  };
  Decompressor.prototype.decompress = function decompress(block) {
    var decompressor = new HeaderSetDecompressor(this._log, this._table);
    decompressor.end(block);
    var seenNonColonHeader = false;
    var headers = {};
    var pair;
    while (pair = decompressor.read()) {
      var name = pair[0];
      var value = pair[1];
      var isColonHeader = name.trim()[0] === ":";
      if (seenNonColonHeader && isColonHeader) {
        this.emit("error", "PROTOCOL_ERROR");
        return headers;
      }
      seenNonColonHeader = !isColonHeader;
      if (name in headers) {
        if (headers[name] instanceof Array) {
          headers[name].push(value);
        } else {
          headers[name] = [headers[name], value];
        }
      } else {
        headers[name] = value;
      }
    }
    if ("cookie" in headers && headers["cookie"] instanceof Array) {
      headers["cookie"] = headers["cookie"].join("; ");
    }
    return headers;
  };
  Decompressor.prototype._transform = function _transform(frame, encoding, done) {
    if (this._inProgress) {
      if (frame.type !== "CONTINUATION" || frame.stream !== this._base.stream) {
        this._log.error("A series of HEADER frames were not continuous");
        this.emit("error", "PROTOCOL_ERROR");
        return;
      }
      this._frames.push(frame);
    } else if (frame.type === "HEADERS" || frame.type === "PUSH_PROMISE") {
      this._inProgress = true;
      this._base = util._extend({}, frame);
      this._frames = [frame];
    } else {
      this.push(frame);
    }
    if (this._inProgress && (frame.flags.END_HEADERS || frame.flags.END_PUSH_PROMISE)) {
      var buffer = concat(this._frames.map(function(frame2) {
        return frame2.data;
      }));
      try {
        var headers = this.decompress(buffer);
      } catch (error) {
        this._log.error({ err: error }, "Header decompression error");
        this.emit("error", "COMPRESSION_ERROR");
        return;
      }
      this.push(util._extend(this._base, { headers }));
      this._inProgress = false;
    }
    done();
  };
  function concat(buffers) {
    var size2 = 0;
    for (var i = 0;i < buffers.length; i++) {
      size2 += buffers[i].length;
    }
    var concatenated = new Buffer(size2);
    for (var cursor = 0, j = 0;j < buffers.length; cursor += buffers[j].length, j++) {
      buffers[j].copy(concatenated, cursor);
    }
    return concatenated;
  }
  function cut(buffer, size2) {
    var chunks = [];
    var cursor = 0;
    do {
      var chunkSize = Math.min(size2, buffer.length - cursor);
      chunks.push(buffer.slice(cursor, cursor + chunkSize));
      cursor += chunkSize;
    } while (cursor < buffer.length);
    return chunks;
  }
  function trim(string) {
    return string.trim();
  }
});

// node_modules/http2/lib/protocol/flow.js
var require_flow = __commonJS((exports) => {
  var assert = __require("assert");
  var Duplex = __require("stream").Duplex;
  exports.Flow = Flow;
  var INITIAL_WINDOW_SIZE = 65535;
  function Flow(flowControlId) {
    Duplex.call(this, { objectMode: true });
    this._window = this._initialWindow = INITIAL_WINDOW_SIZE;
    this._flowControlId = flowControlId;
    this._queue = [];
    this._ended = false;
    this._received = 0;
  }
  Flow.prototype = Object.create(Duplex.prototype, { constructor: { value: Flow } });
  Flow.prototype._receive = function _receive(frame, callback) {
    throw new Error("The _receive(frame, callback) method has to be overridden by the child class!");
  };
  Flow.prototype._write = function _write(frame, encoding, callback) {
    var sentToUs = this._flowControlId === undefined || frame.stream === this._flowControlId;
    if (sentToUs && (frame.flags.END_STREAM || frame.type === "RST_STREAM")) {
      this._ended = true;
    }
    if (frame.type === "DATA" && frame.data.length > 0) {
      this._receive(frame, function() {
        this._received += frame.data.length;
        if (!this._restoreWindowTimer) {
          this._restoreWindowTimer = setImmediate(this._restoreWindow.bind(this));
        }
        callback();
      }.bind(this));
    } else {
      this._receive(frame, callback);
    }
    if (sentToUs && frame.type === "WINDOW_UPDATE") {
      this._updateWindow(frame);
    }
  };
  Flow.prototype._restoreWindow = function _restoreWindow() {
    delete this._restoreWindowTimer;
    if (!this._ended && this._received > 0) {
      this.push({
        type: "WINDOW_UPDATE",
        flags: {},
        stream: this._flowControlId,
        window_size: this._received
      });
      this._received = 0;
    }
  };
  Flow.prototype._send = function _send() {
    throw new Error("The _send() method has to be overridden by the child class!");
  };
  Flow.prototype._read = function _read() {
    if (this._queue.length === 0) {
      this._send();
    } else if (this._window > 0) {
      this._readableState.sync = true;
      do {
        var moreNeeded = this._push(this._queue[0]);
        if (moreNeeded !== null) {
          this._queue.shift();
        }
      } while (moreNeeded && this._queue.length > 0);
      this._readableState.sync = false;
      assert(!moreNeeded || this._queue.length === 0 || !this._window && this._queue[0].type === "DATA");
    } else {
      this.once("window_update", this._read);
    }
  };
  var MAX_PAYLOAD_SIZE = 4096;
  Flow.prototype.read = function read(limit) {
    if (limit === 0) {
      return Duplex.prototype.read.call(this, 0);
    } else if (limit === -1) {
      limit = 0;
    } else if (limit === undefined || limit > MAX_PAYLOAD_SIZE) {
      limit = MAX_PAYLOAD_SIZE;
    }
    var frame = this._readableState.buffer[0];
    if (!frame && !this._readableState.ended) {
      this._read();
      frame = this._readableState.buffer[0];
    }
    if (frame && frame.type === "DATA") {
      if (limit === 0) {
        return Duplex.prototype.read.call(this, 0);
      } else if (frame.data.length > limit) {
        this._log.trace({ frame, size: frame.data.length, forwardable: limit }, "Splitting out forwardable part of a DATA frame.");
        this.unshift({
          type: "DATA",
          flags: {},
          stream: frame.stream,
          data: frame.data.slice(0, limit)
        });
        frame.data = frame.data.slice(limit);
      }
    }
    return Duplex.prototype.read.call(this);
  };
  Flow.prototype._parentPush = function _parentPush(frame) {
    this._log.trace({ frame }, "Pushing frame into the output queue");
    if (frame && frame.type === "DATA" && this._window !== Infinity) {
      this._log.trace({ window: this._window, by: frame.data.length }, "Decreasing flow control window size.");
      this._window -= frame.data.length;
      assert(this._window >= 0);
    }
    return Duplex.prototype.push.call(this, frame);
  };
  Flow.prototype._push = function _push(frame) {
    var data = frame && frame.type === "DATA" && frame.data;
    var maxFrameLength = this._window < 16384 ? this._window : 16384;
    if (!data || data.length <= maxFrameLength) {
      return this._parentPush(frame);
    } else if (this._window <= 0) {
      return null;
    } else {
      this._log.trace({ frame, size: frame.data.length, forwardable: this._window }, "Splitting out forwardable part of a DATA frame.");
      frame.data = data.slice(maxFrameLength);
      this._parentPush({
        type: "DATA",
        flags: {},
        stream: frame.stream,
        data: data.slice(0, maxFrameLength)
      });
      return null;
    }
  };
  Flow.prototype.push = function push(frame) {
    if (frame === null) {
      this._log.debug("Enqueueing outgoing End Of Stream");
    } else {
      this._log.debug({ frame }, "Enqueueing outgoing frame");
    }
    var moreNeeded = null;
    if (this._queue.length === 0) {
      moreNeeded = this._push(frame);
    }
    if (moreNeeded === null) {
      this._queue.push(frame);
    }
    return moreNeeded;
  };
  Flow.prototype.getLastQueuedFrame = function getLastQueuedFrame() {
    var readableQueue = this._readableState.buffer;
    return this._queue[this._queue.length - 1] || readableQueue[readableQueue.length - 1];
  };
  var WINDOW_SIZE_LIMIT = Math.pow(2, 31) - 1;
  Flow.prototype._increaseWindow = function _increaseWindow(size) {
    if (this._window === Infinity && size !== Infinity) {
      this._log.error("Trying to increase flow control window after flow control was turned off.");
      this.emit("error", "FLOW_CONTROL_ERROR");
    } else {
      this._log.trace({ window: this._window, by: size }, "Increasing flow control window size.");
      this._window += size;
      if (this._window !== Infinity && this._window > WINDOW_SIZE_LIMIT) {
        this._log.error("Flow control window grew too large.");
        this.emit("error", "FLOW_CONTROL_ERROR");
      } else {
        if (size != 0) {
          this.emit("window_update");
        }
      }
    }
  };
  Flow.prototype._updateWindow = function _updateWindow(frame) {
    this._increaseWindow(frame.flags.END_FLOW_CONTROL ? Infinity : frame.window_size);
  };
  Flow.prototype.setInitialWindow = function setInitialWindow(initialWindow) {
    this._increaseWindow(initialWindow - this._initialWindow);
    this._initialWindow = initialWindow;
  };
});

// node_modules/http2/lib/protocol/stream.js
var require_stream = __commonJS((exports) => {
  var assert = __require("assert");
  var Duplex = __require("stream").Duplex;
  exports.Stream = Stream;
  function Stream(log, connection) {
    Duplex.call(this);
    this._log = log.child({ component: "stream", s: this });
    this._initializeManagement();
    this._initializeDataFlow();
    this._initializeState();
    this.connection = connection;
    this.sentEndStream = false;
  }
  Stream.prototype = Object.create(Duplex.prototype, { constructor: { value: Stream } });
  var DEFAULT_PRIORITY = Math.pow(2, 30);
  var MAX_PRIORITY = Math.pow(2, 31) - 1;
  Stream.prototype._initializeManagement = function _initializeManagement() {
    this._resetSent = false;
    this._priority = DEFAULT_PRIORITY;
    this._letPeerPrioritize = true;
  };
  Stream.prototype.promise = function promise(headers) {
    var stream = new Stream(this._log, this.connection);
    stream._priority = Math.min(this._priority + 1, MAX_PRIORITY);
    this._pushUpstream({
      type: "PUSH_PROMISE",
      flags: {},
      stream: this.id,
      promised_stream: stream,
      headers
    });
    return stream;
  };
  Stream.prototype._onPromise = function _onPromise(frame) {
    this.emit("promise", frame.promised_stream, frame.headers);
  };
  Stream.prototype.headers = function headers(headers) {
    this._pushUpstream({
      type: "HEADERS",
      flags: {},
      stream: this.id,
      headers
    });
  };
  Stream.prototype.trailers = function trailers(trailers) {
    this.sentEndStream = true;
    this._pushUpstream({
      type: "HEADERS",
      flags: { END_STREAM: true },
      stream: this.id,
      headers: trailers
    });
  };
  Stream.prototype._onHeaders = function _onHeaders(frame) {
    if (frame.priority !== undefined) {
      this.priority(frame.priority, true);
    }
    this.emit("headers", frame.headers);
  };
  Stream.prototype.priority = function priority(priority, peer) {
    if (peer && this._letPeerPrioritize || !peer) {
      if (!peer) {
        this._letPeerPrioritize = false;
        var lastFrame = this.upstream.getLastQueuedFrame();
        if (lastFrame && (lastFrame.type === "HEADERS" || lastFrame.type === "PRIORITY")) {
          lastFrame.priority = priority;
        } else {
          this._pushUpstream({
            type: "PRIORITY",
            flags: {},
            stream: this.id,
            priority
          });
        }
      }
      this._log.debug({ priority }, "Changing priority");
      this.emit("priority", priority);
      this._priority = priority;
    }
  };
  Stream.prototype._onPriority = function _onPriority(frame) {
    this.priority(frame.priority, true);
  };
  Stream.prototype.reset = function reset(error) {
    if (!this._resetSent) {
      this._resetSent = true;
      this._pushUpstream({
        type: "RST_STREAM",
        flags: {},
        stream: this.id,
        error
      });
    }
  };
  Stream.prototype.altsvc = function altsvc(host, port, protocolID, maxAge, origin) {
    var stream;
    if (origin) {
      stream = 0;
    } else {
      stream = this.id;
    }
    this._pushUpstream({
      type: "ALTSVC",
      flags: {},
      stream,
      host,
      port,
      protocolID,
      origin,
      maxAge
    });
  };
  var Flow = require_flow().Flow;
  Stream.prototype._initializeDataFlow = function _initializeDataFlow() {
    this.id = undefined;
    this._ended = false;
    this.upstream = new Flow;
    this.upstream._log = this._log;
    this.upstream._send = this._send.bind(this);
    this.upstream._receive = this._receive.bind(this);
    this.upstream.write = this._writeUpstream.bind(this);
    this.upstream.on("error", this.emit.bind(this, "error"));
    this.on("finish", this._finishing);
  };
  Stream.prototype._pushUpstream = function _pushUpstream(frame) {
    this.upstream.push(frame);
    this._transition(true, frame);
  };
  Stream.prototype._writeUpstream = function _writeUpstream(frame) {
    this._log.debug({ frame }, "Receiving frame");
    var moreNeeded = Flow.prototype.write.call(this.upstream, frame);
    this._transition(false, frame);
    if (frame.type === "HEADERS") {
      if (this._processedHeaders && !frame.flags["END_STREAM"]) {
        this.emit("error", "PROTOCOL_ERROR");
      }
      this._processedHeaders = true;
      this._onHeaders(frame);
    } else if (frame.type === "PUSH_PROMISE") {
      this._onPromise(frame);
    } else if (frame.type === "PRIORITY") {
      this._onPriority(frame);
    } else if (frame.type === "ALTSVC") {} else if (frame.type === "ORIGIN") {} else if (frame.type !== "DATA" && frame.type !== "WINDOW_UPDATE" && frame.type !== "RST_STREAM") {
      this._log.error({ frame }, "Invalid stream level frame");
      this.emit("error", "PROTOCOL_ERROR");
    }
    return moreNeeded;
  };
  Stream.prototype._receive = function _receive(frame, ready) {
    if (!this._ended && frame.type === "DATA") {
      var moreNeeded = this.push(frame.data);
      if (!moreNeeded) {
        this._receiveMore = ready;
      }
    }
    if (!this._ended && (frame.flags.END_STREAM || frame.type === "RST_STREAM")) {
      this.push(null);
      this._ended = true;
    }
    if (this._receiveMore !== ready) {
      ready();
    }
  };
  Stream.prototype._read = function _read() {
    if (this._receiveMore) {
      var receiveMore = this._receiveMore;
      delete this._receiveMore;
      receiveMore();
    }
  };
  Stream.prototype._write = function _write(buffer, encoding, ready) {
    var moreNeeded = this._pushUpstream({
      type: "DATA",
      flags: {},
      stream: this.id,
      data: buffer
    });
    if (moreNeeded) {
      ready();
    } else {
      this._sendMore = ready;
    }
  };
  Stream.prototype._send = function _send() {
    if (this._sendMore) {
      var sendMore = this._sendMore;
      delete this._sendMore;
      sendMore();
    }
  };
  var emptyBuffer = new Buffer(0);
  Stream.prototype._finishing = function _finishing() {
    var endFrame = {
      type: "DATA",
      flags: { END_STREAM: true },
      stream: this.id,
      data: emptyBuffer
    };
    if (this.sentEndStream) {
      this._log.debug("Already sent END_STREAM, not sending again.");
      return;
    }
    this.sentEndStream = true;
    var lastFrame = this.upstream.getLastQueuedFrame();
    if (lastFrame && (lastFrame.type === "DATA" || lastFrame.type === "HEADERS")) {
      this._log.debug({ frame: lastFrame }, "Marking last frame with END_STREAM flag.");
      lastFrame.flags.END_STREAM = true;
      this._transition(true, endFrame);
    } else {
      this._pushUpstream(endFrame);
    }
  };
  Stream.prototype._initializeState = function _initializeState() {
    this.state = "IDLE";
    this._initiated = undefined;
    this._closedByUs = undefined;
    this._closedWithRst = undefined;
    this._processedHeaders = false;
  };
  Stream.prototype._setState = function transition(state) {
    assert(this.state !== state);
    this._log.debug({ from: this.state, to: state }, "State transition");
    this.state = state;
    this.emit("state", state);
  };
  function activeState(state) {
    return state === "HALF_CLOSED_LOCAL" || state === "HALF_CLOSED_REMOTE" || state === "OPEN";
  }
  Stream.prototype._transition = function transition(sending, frame) {
    var receiving = !sending;
    var connectionError;
    var streamError;
    var DATA = false, HEADERS = false, PRIORITY = false, ALTSVC = false, ORIGIN = false;
    var RST_STREAM = false, PUSH_PROMISE = false, WINDOW_UPDATE = false;
    switch (frame.type) {
      case "DATA":
        DATA = true;
        break;
      case "HEADERS":
        HEADERS = true;
        break;
      case "PRIORITY":
        PRIORITY = true;
        break;
      case "RST_STREAM":
        RST_STREAM = true;
        break;
      case "PUSH_PROMISE":
        PUSH_PROMISE = true;
        break;
      case "WINDOW_UPDATE":
        WINDOW_UPDATE = true;
        break;
      case "ALTSVC":
        ALTSVC = true;
        break;
      case "ORIGIN":
        ORIGIN = true;
        break;
    }
    var previousState = this.state;
    switch (this.state) {
      case "IDLE":
        if (HEADERS) {
          this._setState("OPEN");
          if (frame.flags.END_STREAM) {
            this._setState(sending ? "HALF_CLOSED_LOCAL" : "HALF_CLOSED_REMOTE");
          }
          this._initiated = sending;
        } else if (sending && RST_STREAM) {
          this._setState("CLOSED");
        } else if (PRIORITY) {} else {
          connectionError = "PROTOCOL_ERROR";
        }
        break;
      case "RESERVED_LOCAL":
        if (sending && HEADERS) {
          this._setState("HALF_CLOSED_REMOTE");
        } else if (RST_STREAM) {
          this._setState("CLOSED");
        } else if (PRIORITY) {} else {
          connectionError = "PROTOCOL_ERROR";
        }
        break;
      case "RESERVED_REMOTE":
        if (RST_STREAM) {
          this._setState("CLOSED");
        } else if (receiving && HEADERS) {
          this._setState("HALF_CLOSED_LOCAL");
        } else if (PRIORITY || ORIGIN) {} else {
          connectionError = "PROTOCOL_ERROR";
        }
        break;
      case "OPEN":
        if (frame.flags.END_STREAM) {
          this._setState(sending ? "HALF_CLOSED_LOCAL" : "HALF_CLOSED_REMOTE");
        } else if (RST_STREAM) {
          this._setState("CLOSED");
        } else {}
        break;
      case "HALF_CLOSED_LOCAL":
        if (RST_STREAM || receiving && frame.flags.END_STREAM) {
          this._setState("CLOSED");
        } else if (ORIGIN || ALTSVC || receiving || PRIORITY || sending && WINDOW_UPDATE) {} else {
          connectionError = "PROTOCOL_ERROR";
        }
        break;
      case "HALF_CLOSED_REMOTE":
        if (RST_STREAM || sending && frame.flags.END_STREAM) {
          this._setState("CLOSED");
        } else if (ORIGIN || ALTSVC || sending || PRIORITY || receiving && WINDOW_UPDATE) {} else {
          connectionError = "PROTOCOL_ERROR";
        }
        break;
      case "CLOSED":
        if (PRIORITY || sending && RST_STREAM || receiving && WINDOW_UPDATE || receiving && this._closedByUs && (this._closedWithRst || RST_STREAM || ALTSVC || ORIGIN)) {} else {
          streamError = "STREAM_CLOSED";
        }
        break;
    }
    if (this.state === "CLOSED" && previousState !== "CLOSED") {
      this._closedByUs = sending;
      this._closedWithRst = RST_STREAM;
    }
    if (PUSH_PROMISE && !connectionError && !streamError) {
      assert(frame.promised_stream.state === "IDLE", frame.promised_stream.state);
      frame.promised_stream._setState(sending ? "RESERVED_LOCAL" : "RESERVED_REMOTE");
      frame.promised_stream._initiated = sending;
    }
    if (this._initiated) {
      var change = activeState(this.state) - activeState(previousState);
      if (sending) {
        frame.count_change = change;
      } else {
        frame.count_change(change);
      }
    } else if (sending) {
      frame.count_change = 0;
    }
    if (connectionError || streamError) {
      var info = {
        error: connectionError,
        frame,
        state: this.state,
        closedByUs: this._closedByUs,
        closedWithRst: this._closedWithRst
      };
      if (sending) {
        this._log.error(info, "Sending illegal frame.");
        return this.emit("error", new Error("Sending illegal frame (" + frame.type + ") in " + this.state + " state."));
      } else {
        this._log.error(info, "Received illegal frame.");
        if (connectionError) {
          this.emit("connectionError", connectionError);
        } else {
          this.reset(streamError);
          this.emit("error", streamError);
        }
      }
    }
  };
  exports.serializers = {};
  var nextId = 0;
  exports.serializers.s = function(stream) {
    if (!("_id" in stream)) {
      stream._id = nextId;
      nextId += 1;
    }
    return stream._id;
  };
});

// node_modules/http2/lib/protocol/connection.js
var require_connection = __commonJS((exports) => {
  var assert = __require("assert");
  var Flow = require_flow().Flow;
  exports.Connection = Connection;
  function Connection(log, firstStreamId, settings) {
    Flow.call(this, 0);
    this._log = log.child({ component: "connection" });
    this._initializeStreamManagement(firstStreamId);
    this._initializeLifecycleManagement();
    this._initializeFlowControl();
    this._initializeSettingsManagement(settings);
    this._initializeMultiplexing();
  }
  Connection.prototype = Object.create(Flow.prototype, { constructor: { value: Connection } });
  var Stream = require_stream().Stream;
  Connection.prototype._initializeStreamManagement = function _initializeStreamManagement(firstStreamId) {
    this._streamIds = [];
    this._streamPriorities = [];
    this._nextStreamId = firstStreamId;
    this._lastIncomingStream = 0;
    this._streamIds[0] = { upstream: { write: this._writeControlFrame.bind(this) } };
    this._streamSlotsFree = Infinity;
    this._streamLimit = Infinity;
    this.on("RECEIVING_SETTINGS_MAX_CONCURRENT_STREAMS", this._updateStreamLimit);
  };
  Connection.prototype._writeControlFrame = function _writeControlFrame(frame) {
    if (frame.type === "SETTINGS" || frame.type === "PING" || frame.type === "GOAWAY" || frame.type === "WINDOW_UPDATE" || frame.type === "ALTSVC" || frame.type == "ORIGIN") {
      this._log.debug({ frame }, "Receiving connection level frame");
      this.emit(frame.type, frame);
    } else {
      this._log.error({ frame }, "Invalid connection level frame");
      this.emit("error", "PROTOCOL_ERROR");
    }
  };
  Connection.prototype._updateStreamLimit = function _updateStreamLimit(newStreamLimit) {
    var wakeup = this._streamSlotsFree === 0 && newStreamLimit > this._streamLimit;
    this._streamSlotsFree += newStreamLimit - this._streamLimit;
    this._streamLimit = newStreamLimit;
    if (wakeup) {
      this.emit("wakeup");
    }
  };
  Connection.prototype._changeStreamCount = function _changeStreamCount(change) {
    if (change) {
      this._log.trace({ free: this._streamSlotsFree, change }, "Changing active stream count.");
      var wakeup = this._streamSlotsFree === 0 && change < 0;
      this._streamSlotsFree -= change;
      if (wakeup) {
        this.emit("wakeup");
      }
    }
  };
  Connection.prototype._allocateId = function _allocateId(stream, id) {
    if (id === undefined) {
      id = this._nextStreamId;
      this._nextStreamId += 2;
    } else if (id > this._lastIncomingStream && (id - this._nextStreamId) % 2 !== 0) {
      this._lastIncomingStream = id;
    } else {
      this._log.error({ stream_id: id, lastIncomingStream: this._lastIncomingStream }, "Invalid incoming stream ID.");
      this.emit("error", "PROTOCOL_ERROR");
      return;
    }
    assert(!(id in this._streamIds));
    this._log.trace({ s: stream, stream_id: id }, "Allocating ID for stream.");
    this._streamIds[id] = stream;
    stream.id = id;
    this.emit("new_stream", stream, id);
    stream.on("connectionError", this.emit.bind(this, "error"));
    return id;
  };
  Connection.prototype._allocatePriority = function _allocatePriority(stream) {
    this._log.trace({ s: stream }, "Allocating priority for stream.");
    this._insert(stream, stream._priority);
    stream.on("priority", this._reprioritize.bind(this, stream));
    stream.upstream.on("readable", this.emit.bind(this, "wakeup"));
    this.emit("wakeup");
  };
  Connection.prototype._insert = function _insert(stream, priority) {
    if (priority in this._streamPriorities) {
      this._streamPriorities[priority].push(stream);
    } else {
      this._streamPriorities[priority] = [stream];
    }
  };
  Connection.prototype._reprioritize = function _reprioritize(stream, priority) {
    this._removePrioritisedStream(stream);
    this._insert(stream, priority);
  };
  Connection.prototype._removePrioritisedStream = function _removePrioritisedStream(stream) {
    var bucket = this._streamPriorities[stream._priority];
    var index = bucket.indexOf(stream);
    assert(index !== -1);
    bucket.splice(index, 1);
    if (bucket.length === 0) {
      delete this._streamPriorities[stream._priority];
    }
  };
  Connection.prototype._createIncomingStream = function _createIncomingStream(id) {
    this._log.debug({ stream_id: id }, "New incoming stream.");
    var stream = new Stream(this._log, this);
    this._allocateId(stream, id);
    this._allocatePriority(stream);
    this.emit("stream", stream, id);
    return stream;
  };
  Connection.prototype.createStream = function createStream() {
    this._log.trace("Creating new outbound stream.");
    var stream = new Stream(this._log, this);
    this._allocatePriority(stream);
    stream.on("end", this._removeStream.bind(this, stream));
    return stream;
  };
  Connection.prototype._removeStream = function _removeStream(stream) {
    this._log.trace("Removing outbound stream.");
    delete this._streamIds[stream.id];
    this._removePrioritisedStream(stream);
  };
  Connection.prototype._initializeMultiplexing = function _initializeMultiplexing() {
    this.on("window_update", this.emit.bind(this, "wakeup"));
    this._sendScheduled = false;
    this._firstFrameReceived = false;
  };
  Connection.prototype._send = function _send(immediate) {
    if (this._closed) {
      return;
    }
    if (immediate) {
      this._sendScheduled = false;
    } else {
      if (!this._sendScheduled) {
        this._sendScheduled = true;
        setImmediate(this._send.bind(this, true));
      }
      return;
    }
    this._log.trace("Starting forwarding frames from streams.");
    priority_loop:
      for (var priority in this._streamPriorities) {
        var bucket = this._streamPriorities[priority];
        var nextBucket = [];
        while (bucket.length > 0) {
          for (var index = 0;index < bucket.length; index++) {
            var stream = bucket[index];
            if (!stream || !stream.upstream)
              continue;
            var frame = stream.upstream.read(this._window > 0 ? this._window : -1);
            if (!frame) {
              continue;
            } else if (frame.count_change > this._streamSlotsFree) {
              stream.upstream.unshift(frame);
              continue;
            }
            if (!stream._ended) {
              nextBucket.push(stream);
            } else {
              delete this._streamIds[stream.id];
            }
            if (frame.stream === undefined) {
              frame.stream = stream.id || this._allocateId(stream);
            }
            if (frame.type === "PUSH_PROMISE") {
              this._allocatePriority(frame.promised_stream);
              frame.promised_stream = this._allocateId(frame.promised_stream);
            }
            this._log.trace({ s: stream, frame }, "Forwarding outgoing frame");
            var moreNeeded = this.push(frame);
            this._changeStreamCount(frame.count_change);
            if (!moreNeeded) {
              break priority_loop;
            }
          }
          bucket = nextBucket;
          nextBucket = [];
        }
      }
    if (moreNeeded === undefined) {
      this.once("wakeup", this._send.bind(this));
    }
    this._log.trace({ moreNeeded }, "Stopping forwarding frames from streams.");
  };
  Connection.prototype._receive = function _receive(frame, done) {
    this._log.trace({ frame }, "Forwarding incoming frame");
    if (!this._firstFrameReceived) {
      this._firstFrameReceived = true;
      this._onFirstFrameReceived(frame);
    }
    if ((frame.type == "SETTINGS" || frame.type == "PING" || frame.type == "GOAWAY") && frame.stream != 0) {
      this.close("PROTOCOL_ERROR");
      return;
    } else if ((frame.type == "DATA" || frame.type == "HEADERS" || frame.type == "PRIORITY" || frame.type == "RST_STREAM" || frame.type == "PUSH_PROMISE" || frame.type == "CONTINUATION") && frame.stream == 0) {
      this.close("PROTOCOL_ERROR");
      return;
    }
    var stream = this._streamIds[frame.stream];
    if (!stream) {
      stream = this._createIncomingStream(frame.stream);
    }
    if (frame.type === "PUSH_PROMISE") {
      frame.promised_stream = this._createIncomingStream(frame.promised_stream);
    }
    frame.count_change = this._changeStreamCount.bind(this);
    stream.upstream.write(frame);
    done();
  };
  var defaultSettings = {};
  Connection.prototype._initializeSettingsManagement = function _initializeSettingsManagement(settings) {
    this._settingsAckCallbacks = [];
    this._log.debug({ settings }, "Sending the first SETTINGS frame as part of the connection header.");
    this.set(settings || defaultSettings);
    this.on("SETTINGS", this._receiveSettings);
    this.on("RECEIVING_SETTINGS_MAX_FRAME_SIZE", this._sanityCheckMaxFrameSize);
  };
  Connection.prototype._onFirstFrameReceived = function _onFirstFrameReceived(frame) {
    if (frame.stream === 0 && frame.type === "SETTINGS") {
      this._log.debug("Receiving the first SETTINGS frame as part of the connection header.");
    } else {
      this._log.fatal({ frame }, "Invalid connection header: first frame is not SETTINGS.");
      this.emit("error", "PROTOCOL_ERROR");
    }
  };
  Connection.prototype._receiveSettings = function _receiveSettings(frame) {
    if (frame.flags.ACK) {
      var callback = this._settingsAckCallbacks.shift();
      if (callback) {
        callback();
      }
    } else {
      if (!this._closed) {
        this.push({
          type: "SETTINGS",
          flags: { ACK: true },
          stream: 0,
          settings: {}
        });
      }
      for (var name in frame.settings) {
        this.emit("RECEIVING_" + name, frame.settings[name]);
      }
    }
  };
  Connection.prototype._sanityCheckMaxFrameSize = function _sanityCheckMaxFrameSize(value) {
    if (value < 16384 || value >= 16777216) {
      this._log.fatal("Received invalid value for max frame size: " + value);
      this.emit("error");
    }
  };
  Connection.prototype.set = function set(settings, callback) {
    var self = this;
    this._settingsAckCallbacks.push(function() {
      for (var name2 in settings) {
        self.emit("ACKNOWLEDGED_" + name2, settings[name2]);
      }
      if (callback) {
        callback();
      }
    });
    this.push({
      type: "SETTINGS",
      flags: { ACK: false },
      stream: 0,
      settings
    });
    for (var name in settings) {
      this.emit("SENDING_" + name, settings[name]);
    }
  };
  Connection.prototype._initializeLifecycleManagement = function _initializeLifecycleManagement() {
    this._pings = {};
    this.on("PING", this._receivePing);
    this.on("GOAWAY", this._receiveGoaway);
    this._closed = false;
  };
  Connection.prototype._generatePingId = function _generatePingId() {
    do {
      var id = "";
      for (var i = 0;i < 16; i++) {
        id += Math.floor(Math.random() * 16).toString(16);
      }
    } while (id in this._pings);
    return id;
  };
  Connection.prototype.ping = function ping(callback) {
    var id = this._generatePingId();
    var data = new Buffer(id, "hex");
    this._pings[id] = callback;
    this._log.debug({ data }, "Sending PING.");
    this.push({
      type: "PING",
      flags: {
        ACK: false
      },
      stream: 0,
      data
    });
  };
  Connection.prototype._receivePing = function _receivePing(frame) {
    if (frame.flags.ACK) {
      var id = frame.data.toString("hex");
      if (id in this._pings) {
        this._log.debug({ data: frame.data }, "Receiving answer for a PING.");
        var callback = this._pings[id];
        if (callback) {
          callback();
        }
        delete this._pings[id];
      } else {
        this._log.warn({ data: frame.data }, "Unsolicited PING answer.");
      }
    } else {
      this._log.debug({ data: frame.data }, "Answering PING.");
      this.push({
        type: "PING",
        flags: {
          ACK: true
        },
        stream: 0,
        data: frame.data
      });
    }
  };
  Connection.prototype.originFrame = function originFrame(originList) {
    this._log.debug(originList, "emitting origin frame");
    this.push({
      type: "ORIGIN",
      flags: {},
      stream: 0,
      originList
    });
  };
  Connection.prototype.close = function close(error) {
    if (this._closed) {
      this._log.warn("Trying to close an already closed connection");
      return;
    }
    this._log.debug({ error }, "Closing the connection");
    this.push({
      type: "GOAWAY",
      flags: {},
      stream: 0,
      last_stream: this._lastIncomingStream,
      error: error || "NO_ERROR"
    });
    this.push(null);
    this._closed = true;
  };
  Connection.prototype._receiveGoaway = function _receiveGoaway(frame) {
    this._log.debug({ error: frame.error }, "Other end closed the connection");
    this.push(null);
    this._closed = true;
    if (frame.error !== "NO_ERROR") {
      this.emit("peerError", frame.error);
    }
  };
  Connection.prototype._initializeFlowControl = function _initializeFlowControl() {
    this._initialStreamWindowSize = INITIAL_STREAM_WINDOW_SIZE;
    this.on("new_stream", function(stream) {
      stream.upstream.setInitialWindow(this._initialStreamWindowSize);
    });
    this.on("RECEIVING_SETTINGS_INITIAL_WINDOW_SIZE", this._setInitialStreamWindowSize);
    this._streamIds[0].upstream.setInitialWindow = function noop() {};
  };
  var INITIAL_STREAM_WINDOW_SIZE = 65535;
  Connection.prototype._setInitialStreamWindowSize = function _setInitialStreamWindowSize(size) {
    if (this._initialStreamWindowSize === Infinity && size !== Infinity) {
      this._log.error("Trying to manipulate initial flow control window size after flow control was turned off.");
      this.emit("error", "FLOW_CONTROL_ERROR");
    } else {
      this._log.debug({ size }, "Changing stream initial window size.");
      this._initialStreamWindowSize = size;
      this._streamIds.forEach(function(stream) {
        stream.upstream.setInitialWindow(size);
      });
    }
  };
});

// node_modules/http2/lib/protocol/endpoint.js
var require_endpoint = __commonJS((exports) => {
  var assert = __require("assert");
  var Serializer = require_framer().Serializer;
  var Deserializer = require_framer().Deserializer;
  var Compressor = require_compressor().Compressor;
  var Decompressor = require_compressor().Decompressor;
  var Connection = require_connection().Connection;
  var Duplex = __require("stream").Duplex;
  var Transform = __require("stream").Transform;
  exports.Endpoint = Endpoint;
  function Endpoint(log, role, settings, filters) {
    Duplex.call(this);
    this._log = log.child({ component: "endpoint", e: this });
    assert(role === "CLIENT" || role === "SERVER");
    if (role === "CLIENT") {
      this._writePrelude();
    } else {
      this._readPrelude();
    }
    this._initializeDataFlow(role, settings, filters || {});
    this._initializeManagement();
    this._initializeErrorHandling();
  }
  Endpoint.prototype = Object.create(Duplex.prototype, { constructor: { value: Endpoint } });
  var CLIENT_PRELUDE = new Buffer(`PRI * HTTP/2.0\r
\r
SM\r
\r
`);
  Endpoint.prototype._writePrelude = function _writePrelude() {
    this._log.debug("Sending the client connection header prelude.");
    this.push(CLIENT_PRELUDE);
  };
  Endpoint.prototype._readPrelude = function _readPrelude() {
    var cursor = 0;
    this._write = function _temporalWrite(chunk, encoding, done) {
      var offset = cursor;
      while (cursor < CLIENT_PRELUDE.length && cursor - offset < chunk.length) {
        if (CLIENT_PRELUDE[cursor] !== chunk[cursor - offset]) {
          this._log.fatal({ cursor, offset, chunk }, "Client connection header prelude does not match.");
          this._error("handshake", "PROTOCOL_ERROR");
          return;
        }
        cursor += 1;
      }
      if (cursor === CLIENT_PRELUDE.length) {
        this._log.debug("Successfully received the client connection header prelude.");
        delete this._write;
        chunk = chunk.slice(cursor - offset);
        this._write(chunk, encoding, done);
      }
    };
  };
  function createTransformStream(filter) {
    var transform = new Transform({ objectMode: true });
    var push = transform.push.bind(transform);
    transform._transform = function(frame, encoding, done) {
      filter(frame, push, done);
    };
    return transform;
  }
  function pipeAndFilter(stream1, stream2, filter) {
    if (filter) {
      stream1.pipe(createTransformStream(filter)).pipe(stream2);
    } else {
      stream1.pipe(stream2);
    }
  }
  Endpoint.prototype._initializeDataFlow = function _initializeDataFlow(role, settings, filters) {
    var firstStreamId, compressorRole, decompressorRole;
    if (role === "CLIENT") {
      firstStreamId = 1;
      compressorRole = "REQUEST";
      decompressorRole = "RESPONSE";
    } else {
      firstStreamId = 2;
      compressorRole = "RESPONSE";
      decompressorRole = "REQUEST";
    }
    this._serializer = new Serializer(this._log);
    this._deserializer = new Deserializer(this._log);
    this._compressor = new Compressor(this._log, compressorRole);
    this._decompressor = new Decompressor(this._log, decompressorRole);
    this._connection = new Connection(this._log, firstStreamId, settings);
    pipeAndFilter(this._connection, this._compressor, filters.beforeCompression);
    pipeAndFilter(this._compressor, this._serializer, filters.beforeSerialization);
    pipeAndFilter(this._deserializer, this._decompressor, filters.afterDeserialization);
    pipeAndFilter(this._decompressor, this._connection, filters.afterDecompression);
    this._connection.on("ACKNOWLEDGED_SETTINGS_HEADER_TABLE_SIZE", this._decompressor.setTableSizeLimit.bind(this._decompressor));
    this._connection.on("RECEIVING_SETTINGS_HEADER_TABLE_SIZE", this._compressor.setTableSizeLimit.bind(this._compressor));
  };
  var noread = {};
  Endpoint.prototype._read = function _read() {
    this._readableState.sync = true;
    var moreNeeded = noread, chunk;
    while (moreNeeded && (chunk = this._serializer.read())) {
      moreNeeded = this.push(chunk);
    }
    if (moreNeeded === noread) {
      this._serializer.once("readable", this._read.bind(this));
    }
    this._readableState.sync = false;
  };
  Endpoint.prototype._write = function _write(chunk, encoding, done) {
    this._deserializer.write(chunk, encoding, done);
  };
  Endpoint.prototype._initializeManagement = function _initializeManagement() {
    this._connection.on("stream", this.emit.bind(this, "stream"));
  };
  Endpoint.prototype.createStream = function createStream() {
    return this._connection.createStream();
  };
  Endpoint.prototype._initializeErrorHandling = function _initializeErrorHandling() {
    this._serializer.on("error", this._error.bind(this, "serializer"));
    this._deserializer.on("error", this._error.bind(this, "deserializer"));
    this._compressor.on("error", this._error.bind(this, "compressor"));
    this._decompressor.on("error", this._error.bind(this, "decompressor"));
    this._connection.on("error", this._error.bind(this, "connection"));
    this._connection.on("peerError", this.emit.bind(this, "peerError"));
  };
  Endpoint.prototype._error = function _error(component, error) {
    this._log.fatal({ source: component, message: error }, "Fatal error, closing connection");
    this.close(error);
    setImmediate(this.emit.bind(this, "error", error));
  };
  Endpoint.prototype.close = function close(error) {
    this._connection.close(error);
  };
  exports.serializers = {};
  var nextId = 0;
  exports.serializers.e = function(endpoint) {
    if (!("id" in endpoint)) {
      endpoint.id = nextId;
      nextId += 1;
    }
    return endpoint.id;
  };
});

// node_modules/http2/lib/protocol/index.js
var require_protocol = __commonJS((exports) => {
  exports.VERSION = "h2";
  var endpoint = require_endpoint();
  exports.Endpoint = endpoint.Endpoint;
  exports.serializers = {};
  var framer = require_framer();
  var compressor = require_compressor();
  var flow = require_flow();
  var connection = require_connection();
  var stream = require_stream();
  var stream = require_stream();
  exports.serializers["frame"] = framer.serializers["frame"];
  exports.serializers["data"] = framer.serializers["data"];
  exports.serializers["s"] = stream.serializers["s"];
  exports.serializers["e"] = endpoint.serializers["e"];
});

// node_modules/http2/lib/http.js
var net = __require("net");
var url = __require("url");
var util = __require("util");
var EventEmitter = __require("events").EventEmitter;
var PassThrough = __require("stream").PassThrough;
var Readable = __require("stream").Readable;
var Writable = __require("stream").Writable;
var protocol = require_protocol();
var Endpoint = protocol.Endpoint;
var http = __require("http");
var https = __require("https");
var $STATUS_CODES = http.STATUS_CODES;
var $IncomingMessage = IncomingMessage;
var $OutgoingMessage = OutgoingMessage;
var $protocol = protocol;
var deprecatedHeaders = [
  "connection",
  "host",
  "keep-alive",
  "proxy-connection",
  "transfer-encoding",
  "upgrade"
];
var supportedProtocols = [protocol.VERSION, "http/1.1", "http/1.0"];
var cipherSuites = [
  "ECDHE-RSA-AES128-GCM-SHA256",
  "ECDHE-ECDSA-AES128-GCM-SHA256",
  "ECDHE-RSA-AES256-GCM-SHA384",
  "ECDHE-ECDSA-AES256-GCM-SHA384",
  "DHE-RSA-AES128-GCM-SHA256",
  "DHE-DSS-AES128-GCM-SHA256",
  "ECDHE-RSA-AES128-SHA256",
  "ECDHE-ECDSA-AES128-SHA256",
  "ECDHE-RSA-AES128-SHA",
  "ECDHE-ECDSA-AES128-SHA",
  "ECDHE-RSA-AES256-SHA384",
  "ECDHE-ECDSA-AES256-SHA384",
  "ECDHE-RSA-AES256-SHA",
  "ECDHE-ECDSA-AES256-SHA",
  "DHE-RSA-AES128-SHA256",
  "DHE-RSA-AES128-SHA",
  "DHE-DSS-AES128-SHA256",
  "DHE-RSA-AES256-SHA256",
  "DHE-DSS-AES256-SHA",
  "DHE-RSA-AES256-SHA",
  "kEDH+AESGCM",
  "AES128-GCM-SHA256",
  "AES256-GCM-SHA384",
  "ECDHE-RSA-RC4-SHA",
  "ECDHE-ECDSA-RC4-SHA",
  "AES128",
  "AES256",
  "RC4-SHA",
  "HIGH",
  "!aNULL",
  "!eNULL",
  "!EXPORT",
  "!DES",
  "!3DES",
  "!MD5",
  "!PSK"
].join(":");
function noop() {}
var defaultLogger = {
  fatal: noop,
  error: noop,
  warn: noop,
  info: noop,
  debug: noop,
  trace: noop,
  child: function() {
    return this;
  }
};
var $serializers = protocol.serializers;
function IncomingMessage(stream) {
  PassThrough.call(this);
  stream.pipe(this);
  this.socket = this.stream = stream;
  this._log = stream._log.child({ component: "http" });
  this.httpVersion = "2.0";
  this.httpVersionMajor = 2;
  this.httpVersionMinor = 0;
  this.headers = {};
  this.trailers = undefined;
  this._lastHeadersSeen = undefined;
  stream.once("headers", this._onHeaders.bind(this));
  stream.once("end", this._onEnd.bind(this));
}
IncomingMessage.prototype = Object.create(PassThrough.prototype, { constructor: { value: IncomingMessage } });
IncomingMessage.prototype._onHeaders = function _onHeaders(headers) {
  this._validateHeaders(headers);
  for (var name in headers) {
    if (name[0] !== ":") {
      if (name === "set-cookie" && !Array.isArray(headers[name])) {
        this.headers[name] = [headers[name]];
      } else {
        this.headers[name] = headers[name];
      }
    }
  }
  var self = this;
  this.stream.on("headers", function(headers2) {
    self._lastHeadersSeen = headers2;
  });
};
IncomingMessage.prototype._onEnd = function _onEnd() {
  this.trailers = this._lastHeadersSeen;
};
IncomingMessage.prototype.setTimeout = noop;
IncomingMessage.prototype._checkSpecialHeader = function _checkSpecialHeader(key, value) {
  if (typeof value !== "string" || value.length === 0) {
    this._log.error({ key, value }, "Invalid or missing special header field");
    this.stream.reset("PROTOCOL_ERROR");
  }
  return value;
};
IncomingMessage.prototype._validateHeaders = function _validateHeaders(headers) {
  for (var i = 0;i < deprecatedHeaders.length; i++) {
    var key = deprecatedHeaders[i];
    if (key in headers || key === "te" && headers[key] !== "trailers") {
      this._log.error({ key, value: headers[key] }, "Deprecated header found");
      this.stream.reset("PROTOCOL_ERROR");
      return;
    }
  }
  for (var headerName in headers) {
    if (headerName.length <= 1) {
      this.stream.reset("PROTOCOL_ERROR");
      return;
    }
    if (/[A-Z]/.test(headerName)) {
      this.stream.reset("PROTOCOL_ERROR");
      return;
    }
  }
};
function OutgoingMessage() {
  Writable.call(this);
  this._headers = {};
  this._trailers = undefined;
  this.headersSent = false;
  this.finished = false;
  this.on("finish", this._finish);
}
OutgoingMessage.prototype = Object.create(Writable.prototype, { constructor: { value: OutgoingMessage } });
OutgoingMessage.prototype._write = function _write(chunk, encoding, callback) {
  if (this.stream) {
    this.stream.write(chunk, encoding, callback);
  } else {
    this.once("socket", this._write.bind(this, chunk, encoding, callback));
  }
};
OutgoingMessage.prototype._finish = function _finish() {
  if (this.stream) {
    if (this._trailers) {
      if (this.request) {
        this.request.addTrailers(this._trailers);
      } else {
        this.stream.trailers(this._trailers);
      }
    }
    this.finished = true;
    this.stream.end();
  } else {
    this.once("socket", this._finish.bind(this));
  }
};
OutgoingMessage.prototype.setHeader = function setHeader(name, value) {
  if (this.headersSent) {
    return this.emit("error", new Error("Can't set headers after they are sent."));
  } else {
    name = name.toLowerCase();
    if (deprecatedHeaders.indexOf(name) !== -1) {
      return this.emit("error", new Error("Cannot set deprecated header: " + name));
    }
    this._headers[name] = value;
  }
};
OutgoingMessage.prototype.removeHeader = function removeHeader(name) {
  if (this.headersSent) {
    return this.emit("error", new Error("Can't remove headers after they are sent."));
  } else {
    delete this._headers[name.toLowerCase()];
  }
};
OutgoingMessage.prototype.getHeader = function getHeader(name) {
  return this._headers[name.toLowerCase()];
};
OutgoingMessage.prototype.addTrailers = function addTrailers(trailers) {
  this._trailers = trailers;
};
OutgoingMessage.prototype.setTimeout = noop;
OutgoingMessage.prototype._checkSpecialHeader = IncomingMessage.prototype._checkSpecialHeader;
var $Server = Server;
var $IncomingRequest = IncomingRequest;
var $OutgoingResponse = OutgoingResponse;
var $ServerResponse = OutgoingResponse;
function forwardEvent(event, source, target) {
  function forward() {
    var listeners = target.listeners(event);
    var n = listeners.length;
    if (n === 0 && event === "error") {
      var args = [event];
      args.push.apply(args, arguments);
      target.emit.apply(target, args);
      return;
    }
    for (var i = 0;i < n; ++i) {
      listeners[i].apply(source, arguments);
    }
  }
  source.on(event, forward);
  return forward;
}
function Server(options) {
  options = util._extend({}, options);
  this._log = (options.log || defaultLogger).child({ component: "http" });
  this._settings = options.settings;
  var start = this._start.bind(this);
  var fallback = this._fallback.bind(this);
  if (options.key && options.cert || options.pfx) {
    this._log.info("Creating HTTP/2 server over TLS");
    this._mode = "tls";
    options.ALPNProtocols = supportedProtocols;
    options.NPNProtocols = supportedProtocols;
    options.ciphers = options.ciphers || cipherSuites;
    options.honorCipherOrder = options.honorCipherOrder != false;
    this._server = https.createServer(options);
    this._originalSocketListeners = this._server.listeners("secureConnection");
    this._server.removeAllListeners("secureConnection");
    this._server.on("secureConnection", function(socket) {
      var negotiatedProtocol = socket.alpnProtocol || socket.npnProtocol;
      if (negotiatedProtocol === protocol.VERSION) {
        start(socket);
      } else {
        fallback(socket);
      }
    });
    this._server.on("request", this.emit.bind(this, "request"));
    forwardEvent("error", this._server, this);
    forwardEvent("listening", this._server, this);
  } else if (options.plain) {
    this._log.info("Creating HTTP/2 server over plain TCP");
    this._mode = "plain";
    this._server = net.createServer(start);
  } else {
    this._log.error("Trying to create HTTP/2 server with Upgrade from HTTP/1.1");
    throw new Error("HTTP1.1 -> HTTP2 upgrade is not yet supported. Please provide TLS keys.");
  }
  this._server.on("close", this.emit.bind(this, "close"));
}
Server.prototype = Object.create(EventEmitter.prototype, { constructor: { value: Server } });
Server.prototype._start = function _start(socket) {
  var endpoint = new Endpoint(this._log, "SERVER", this._settings);
  this._log.info({
    e: endpoint,
    client: socket.remoteAddress + ":" + socket.remotePort,
    SNI: socket.servername
  }, "New incoming HTTP/2 connection");
  endpoint.pipe(socket).pipe(endpoint);
  var self = this;
  endpoint.on("stream", function _onStream(stream) {
    var response = new OutgoingResponse(stream);
    var request = new IncomingRequest(stream);
    request.remoteAddress = socket.remoteAddress;
    request.remotePort = socket.remotePort;
    request.connection = request.socket = response.socket = socket;
    request.once("ready", self.emit.bind(self, "request", request, response));
  });
  endpoint.on("error", this.emit.bind(this, "clientError"));
  socket.on("error", this.emit.bind(this, "clientError"));
  this.emit("connection", socket, endpoint);
};
Server.prototype._fallback = function _fallback(socket) {
  var negotiatedProtocol = socket.alpnProtocol || socket.npnProtocol;
  this._log.info({
    client: socket.remoteAddress + ":" + socket.remotePort,
    protocol: negotiatedProtocol,
    SNI: socket.servername
  }, "Falling back to simple HTTPS");
  for (var i = 0;i < this._originalSocketListeners.length; i++) {
    this._originalSocketListeners[i].call(this._server, socket);
  }
  this.emit("connection", socket);
};
Server.prototype.listen = function listen(port, hostname) {
  this._log.info({ on: typeof hostname === "string" ? hostname + ":" + port : port }, "Listening for incoming connections");
  this._server.listen.apply(this._server, arguments);
  return this._server;
};
Server.prototype.close = function close(callback) {
  this._log.info("Closing server");
  this._server.close(callback);
};
Server.prototype.setTimeout = function setTimeout(timeout, callback) {
  if (this._mode === "tls") {
    this._server.setTimeout(timeout, callback);
  }
};
Object.defineProperty(Server.prototype, "timeout", {
  get: function getTimeout() {
    if (this._mode === "tls") {
      return this._server.timeout;
    } else {
      return;
    }
  },
  set: function setTimeout2(timeout) {
    if (this._mode === "tls") {
      this._server.timeout = timeout;
    }
  }
});
Server.prototype.on = function on(event, listener) {
  if (event === "upgrade" || event === "timeout") {
    return this._server.on(event, listener && listener.bind(this));
  } else {
    return EventEmitter.prototype.on.call(this, event, listener);
  }
};
Server.prototype.addContext = function addContext(hostname, credentials) {
  if (this._mode === "tls") {
    this._server.addContext(hostname, credentials);
  }
};
Server.prototype.address = function address() {
  return this._server.address();
};
function createServerRaw(options, requestListener) {
  if (typeof options === "function") {
    requestListener = options;
    options = {};
  }
  if (options.pfx || options.key && options.cert) {
    throw new Error("options.pfx, options.key, and options.cert are nonsensical!");
  }
  options.plain = true;
  var server = new Server(options);
  if (requestListener) {
    server.on("request", requestListener);
  }
  return server;
}
function createServerTLS(options, requestListener) {
  if (typeof options === "function") {
    throw new Error("options are required!");
  }
  if (!options.pfx && !(options.key && options.cert)) {
    throw new Error("options.pfx or options.key and options.cert are required!");
  }
  options.plain = false;
  var server = new Server(options);
  if (requestListener) {
    server.on("request", requestListener);
  }
  return server;
}
var $https = {};
var $createServer = $https.createServer = createServerTLS;
var $request = $https.request = requestTLS;
var $get = $https.get = getTLS;
var $raw = {};
$raw.createServer = createServerRaw;
$raw.request = requestRaw;
$raw.get = getRaw;
function notImplemented() {
  throw new Error("HTTP UPGRADE is not implemented!");
}
var $http = {};
$http.createServer = $http.request = $http.get = notImplemented;
function IncomingRequest(stream) {
  IncomingMessage.call(this, stream);
}
IncomingRequest.prototype = Object.create(IncomingMessage.prototype, { constructor: { value: IncomingRequest } });
IncomingRequest.prototype._onHeaders = function _onHeaders2(headers) {
  this.method = this._checkSpecialHeader(":method", headers[":method"]);
  this.scheme = this._checkSpecialHeader(":scheme", headers[":scheme"]);
  this.host = this._checkSpecialHeader(":authority", headers[":authority"]);
  this.url = this._checkSpecialHeader(":path", headers[":path"]);
  if (!this.method || !this.scheme || !this.host || !this.url) {
    return;
  }
  this.headers.host = this.host;
  IncomingMessage.prototype._onHeaders.call(this, headers);
  this._log.info({
    method: this.method,
    scheme: this.scheme,
    host: this.host,
    path: this.url,
    headers: this.headers
  }, "Incoming request");
  this.emit("ready");
};
function OutgoingResponse(stream) {
  OutgoingMessage.call(this);
  this._log = stream._log.child({ component: "http" });
  this.stream = stream;
  this.statusCode = 200;
  this.sendDate = true;
  this.stream.once("headers", this._onRequestHeaders.bind(this));
}
OutgoingResponse.prototype = Object.create(OutgoingMessage.prototype, { constructor: { value: OutgoingResponse } });
OutgoingResponse.prototype.writeHead = function writeHead(statusCode, reasonPhrase, headers) {
  if (this.headersSent) {
    return;
  }
  if (typeof reasonPhrase === "string") {
    this._log.warn("Reason phrase argument was present but ignored by the writeHead method");
  } else {
    headers = reasonPhrase;
  }
  for (var name in headers) {
    this.setHeader(name, headers[name]);
  }
  headers = this._headers;
  if (this.sendDate && !("date" in this._headers)) {
    headers.date = new Date().toUTCString();
  }
  this._log.info({ status: statusCode, headers: this._headers }, "Sending server response");
  headers[":status"] = this.statusCode = statusCode;
  this.stream.headers(headers);
  this.headersSent = true;
};
OutgoingResponse.prototype._implicitHeaders = function _implicitHeaders() {
  if (!this.headersSent) {
    this.writeHead(this.statusCode);
  }
};
OutgoingResponse.prototype._implicitHeader = function() {
  this._implicitHeaders();
};
OutgoingResponse.prototype.write = function write() {
  this._implicitHeaders();
  return OutgoingMessage.prototype.write.apply(this, arguments);
};
OutgoingResponse.prototype.end = function end() {
  this.finished = true;
  this._implicitHeaders();
  return OutgoingMessage.prototype.end.apply(this, arguments);
};
OutgoingResponse.prototype._onRequestHeaders = function _onRequestHeaders(headers) {
  this._requestHeaders = headers;
};
OutgoingResponse.prototype.push = function push(options) {
  if (typeof options === "string") {
    options = url.parse(options);
  }
  if (!options.path) {
    throw new Error("`path` option is mandatory.");
  }
  var promise = util._extend({
    ":method": (options.method || "GET").toUpperCase(),
    ":scheme": options.protocol && options.protocol.slice(0, -1) || this._requestHeaders[":scheme"],
    ":authority": options.hostname || options.host || this._requestHeaders[":authority"],
    ":path": options.path
  }, options.headers);
  this._log.info({
    method: promise[":method"],
    scheme: promise[":scheme"],
    authority: promise[":authority"],
    path: promise[":path"],
    headers: options.headers
  }, "Promising push stream");
  var pushStream = this.stream.promise(promise);
  return new OutgoingResponse(pushStream);
};
OutgoingResponse.prototype.altsvc = function altsvc(host, port, protocolID, maxAge, origin) {
  if (origin === undefined) {
    origin = "";
  }
  this.stream.altsvc(host, port, protocolID, maxAge, origin);
};
OutgoingResponse.prototype.on = function on2(event, listener) {
  if (this.request && event === "timeout") {
    this.request.on(event, listener && listener.bind(this));
  } else {
    OutgoingMessage.prototype.on.call(this, event, listener);
  }
};
var $ClientRequest = OutgoingRequest;
var $OutgoingRequest = OutgoingRequest;
var $IncomingResponse = IncomingResponse;
var $Agent = Agent;
var $globalAgent = undefined;
function requestRaw(options, callback) {
  if (typeof options === "string") {
    options = url.parse(options);
  }
  options.plain = true;
  if (options.protocol && options.protocol !== "http:") {
    throw new Error("This interface only supports http-schemed URLs");
  }
  if (options.agent && typeof options.agent.request === "function") {
    var agentOptions = util._extend({}, options);
    delete agentOptions.agent;
    return options.agent.request(agentOptions, callback);
  }
  return $globalAgent.request(options, callback);
}
function requestTLS(options, callback) {
  if (typeof options === "string") {
    options = url.parse(options);
  }
  options.plain = false;
  if (options.protocol && options.protocol !== "https:") {
    throw new Error("This interface only supports https-schemed URLs");
  }
  if (options.agent && typeof options.agent.request === "function") {
    var agentOptions = util._extend({}, options);
    delete agentOptions.agent;
    return options.agent.request(agentOptions, callback);
  }
  return $globalAgent.request(options, callback);
}
function getRaw(options, callback) {
  if (typeof options === "string") {
    options = url.parse(options);
  }
  options.plain = true;
  if (options.protocol && options.protocol !== "http:") {
    throw new Error("This interface only supports http-schemed URLs");
  }
  if (options.agent && typeof options.agent.get === "function") {
    var agentOptions = util._extend({}, options);
    delete agentOptions.agent;
    return options.agent.get(agentOptions, callback);
  }
  return $globalAgent.get(options, callback);
}
function getTLS(options, callback) {
  if (typeof options === "string") {
    options = url.parse(options);
  }
  options.plain = false;
  if (options.protocol && options.protocol !== "https:") {
    throw new Error("This interface only supports https-schemed URLs");
  }
  if (options.agent && typeof options.agent.get === "function") {
    var agentOptions = util._extend({}, options);
    delete agentOptions.agent;
    return options.agent.get(agentOptions, callback);
  }
  return $globalAgent.get(options, callback);
}
function Agent(options) {
  EventEmitter.call(this);
  this.setMaxListeners(0);
  options = util._extend({}, options);
  this._settings = options.settings;
  this._log = (options.log || defaultLogger).child({ component: "http" });
  this.endpoints = {};
  options.ALPNProtocols = supportedProtocols;
  options.NPNProtocols = supportedProtocols;
  this._httpsAgent = new https.Agent(options);
  this.sockets = this._httpsAgent.sockets;
  this.requests = this._httpsAgent.requests;
}
Agent.prototype = Object.create(EventEmitter.prototype, { constructor: { value: Agent } });
Agent.prototype.request = function request(options, callback) {
  if (typeof options === "string") {
    options = url.parse(options);
  } else {
    options = util._extend({}, options);
  }
  options.method = (options.method || "GET").toUpperCase();
  options.protocol = options.protocol || "https:";
  options.host = options.hostname || options.host || "localhost";
  options.port = options.port || 443;
  options.path = options.path || "/";
  if (!options.plain && options.protocol === "http:") {
    this._log.error("Trying to negotiate client request with Upgrade from HTTP/1.1");
    this.emit("error", new Error("HTTP1.1 -> HTTP2 upgrade is not yet supported."));
  }
  var request2 = new OutgoingRequest(this._log);
  if (callback) {
    request2.on("response", callback);
  }
  var key = [
    !!options.plain,
    options.host,
    options.port
  ].join(":");
  var self = this;
  if (key in this.endpoints) {
    var endpoint = this.endpoints[key];
    request2._start(endpoint.createStream(), options);
  } else if (options.plain) {
    endpoint = new Endpoint(this._log, "CLIENT", this._settings);
    endpoint.socket = net.connect({
      host: options.host,
      port: options.port,
      localAddress: options.localAddress
    });
    endpoint.socket.on("error", function(error) {
      self._log.error("Socket error: " + error.toString());
      request2.emit("error", error);
    });
    endpoint.on("error", function(error) {
      self._log.error("Connection error: " + error.toString());
      request2.emit("error", error);
    });
    this.endpoints[key] = endpoint;
    endpoint.pipe(endpoint.socket).pipe(endpoint);
    request2._start(endpoint.createStream(), options);
  } else {
    let negotiated2 = function() {
      var endpoint2;
      var negotiatedProtocol = httpsRequest.socket.alpnProtocol || httpsRequest.socket.npnProtocol;
      if (negotiatedProtocol === protocol.VERSION) {
        httpsRequest.socket.emit("agentRemove");
        unbundleSocket(httpsRequest.socket);
        endpoint2 = new Endpoint(self._log, "CLIENT", self._settings);
        endpoint2.socket = httpsRequest.socket;
        endpoint2.pipe(endpoint2.socket).pipe(endpoint2);
      }
      if (started) {
        if (endpoint2) {
          endpoint2.close();
        }
      } else {
        if (endpoint2) {
          self._log.info({ e: endpoint2, server: options.host + ":" + options.port }, "New outgoing HTTP/2 connection");
          self.endpoints[key] = endpoint2;
          self.emit(key, endpoint2);
        } else {
          self.emit(key, undefined);
        }
      }
    };
    var negotiated = negotiated2;
    var started = false;
    var createAgent = hasAgentOptions(options);
    options.ALPNProtocols = supportedProtocols;
    options.NPNProtocols = supportedProtocols;
    options.servername = options.host;
    options.ciphers = options.ciphers || cipherSuites;
    if (createAgent) {
      options.agent = new https.Agent(options);
    } else if (options.agent == null) {
      options.agent = this._httpsAgent;
    }
    var httpsRequest = https.request(options);
    httpsRequest.on("error", function(error) {
      self._log.error("Socket error: " + error.toString());
      self.removeAllListeners(key);
      request2.emit("error", error);
    });
    httpsRequest.on("socket", function(socket) {
      var negotiatedProtocol = socket.alpnProtocol || socket.npnProtocol;
      if (negotiatedProtocol != null) {
        negotiated2();
      } else {
        socket.on("secureConnect", negotiated2);
      }
    });
    this.once(key, function(endpoint2) {
      started = true;
      if (endpoint2) {
        request2._start(endpoint2.createStream(), options);
      } else {
        request2._fallback(httpsRequest);
      }
    });
  }
  return request2;
};
Agent.prototype.get = function get(options, callback) {
  var request2 = this.request(options, callback);
  request2.end();
  return request2;
};
Agent.prototype.destroy = function(error) {
  if (this._httpsAgent) {
    this._httpsAgent.destroy();
  }
  for (var key in this.endpoints) {
    this.endpoints[key].close(error);
  }
};
function unbundleSocket(socket) {
  socket.removeAllListeners("data");
  socket.removeAllListeners("end");
  socket.removeAllListeners("readable");
  socket.removeAllListeners("close");
  socket.removeAllListeners("error");
  socket.unpipe();
  delete socket.ondata;
  delete socket.onend;
}
function hasAgentOptions(options) {
  return options.pfx != null || options.key != null || options.passphrase != null || options.cert != null || options.ca != null || options.ciphers != null || options.rejectUnauthorized != null || options.secureProtocol != null;
}
Object.defineProperty(Agent.prototype, "maxSockets", {
  get: function getMaxSockets() {
    return this._httpsAgent.maxSockets;
  },
  set: function setMaxSockets(value) {
    this._httpsAgent.maxSockets = value;
  }
});
$globalAgent = new Agent;
function OutgoingRequest() {
  OutgoingMessage.call(this);
  this._log = undefined;
  this.stream = undefined;
}
OutgoingRequest.prototype = Object.create(OutgoingMessage.prototype, { constructor: { value: OutgoingRequest } });
OutgoingRequest.prototype._start = function _start2(stream, options) {
  this.stream = stream;
  this.options = options;
  this._log = stream._log.child({ component: "http" });
  for (var key in options.headers) {
    this.setHeader(key, options.headers[key]);
  }
  var headers = this._headers;
  delete headers.host;
  if (options.auth) {
    headers.authorization = "Basic " + new Buffer(options.auth).toString("base64");
  }
  headers[":scheme"] = options.protocol.slice(0, -1);
  headers[":method"] = options.method;
  headers[":authority"] = options.host;
  headers[":path"] = options.path;
  this._log.info({
    scheme: headers[":scheme"],
    method: headers[":method"],
    authority: headers[":authority"],
    path: headers[":path"],
    headers: options.headers || {}
  }, "Sending request");
  this.stream.headers(headers);
  this.headersSent = true;
  this.emit("socket", this.stream);
  var response = new IncomingResponse(this.stream);
  response.req = this;
  response.once("ready", this.emit.bind(this, "response", response));
  this.stream.on("promise", this._onPromise.bind(this));
};
OutgoingRequest.prototype._fallback = function _fallback2(request2) {
  request2.on("response", this.emit.bind(this, "response"));
  this.stream = this.request = request2;
  this.emit("socket", this.socket);
};
OutgoingRequest.prototype.setPriority = function setPriority(priority) {
  if (this.stream) {
    this.stream.priority(priority);
  } else {
    this.once("socket", this.setPriority.bind(this, priority));
  }
};
OutgoingRequest.prototype.on = function on3(event, listener) {
  if (this.request && event === "upgrade") {
    this.request.on(event, listener && listener.bind(this));
  } else {
    OutgoingMessage.prototype.on.call(this, event, listener);
  }
};
OutgoingRequest.prototype.setNoDelay = function setNoDelay(noDelay) {
  if (this.request) {
    this.request.setNoDelay(noDelay);
  } else if (!this.stream) {
    this.on("socket", this.setNoDelay.bind(this, noDelay));
  }
};
OutgoingRequest.prototype.setSocketKeepAlive = function setSocketKeepAlive(enable, initialDelay) {
  if (this.request) {
    this.request.setSocketKeepAlive(enable, initialDelay);
  } else if (!this.stream) {
    this.on("socket", this.setSocketKeepAlive.bind(this, enable, initialDelay));
  }
};
OutgoingRequest.prototype.setTimeout = function setTimeout3(timeout, callback) {
  if (this.request) {
    this.request.setTimeout(timeout, callback);
  } else if (!this.stream) {
    this.on("socket", this.setTimeout.bind(this, timeout, callback));
  }
};
OutgoingRequest.prototype.abort = function abort() {
  if (this.request) {
    this.request.abort();
  } else if (this.stream) {
    this.stream.reset("CANCEL");
  } else {
    this.on("socket", this.abort.bind(this));
  }
};
OutgoingRequest.prototype._onPromise = function _onPromise(stream, headers) {
  this._log.info({ push_stream: stream.id }, "Receiving push promise");
  var promise = new IncomingPromise(stream, headers);
  if (this.listeners("push").length > 0) {
    this.emit("push", promise);
  } else {
    promise.cancel();
  }
};
function IncomingResponse(stream) {
  IncomingMessage.call(this, stream);
}
IncomingResponse.prototype = Object.create(IncomingMessage.prototype, { constructor: { value: IncomingResponse } });
IncomingResponse.prototype._onHeaders = function _onHeaders3(headers) {
  this.statusCode = parseInt(this._checkSpecialHeader(":status", headers[":status"]));
  IncomingMessage.prototype._onHeaders.call(this, headers);
  this._log.info({ status: this.statusCode, headers: this.headers }, "Incoming response");
  this.emit("ready");
};
function IncomingPromise(responseStream, promiseHeaders) {
  var stream = new Readable;
  stream._read = noop;
  stream.push(null);
  stream._log = responseStream._log;
  IncomingRequest.call(this, stream);
  this._onHeaders(promiseHeaders);
  this._responseStream = responseStream;
  var response = new IncomingResponse(this._responseStream);
  response.once("ready", this.emit.bind(this, "response", response));
  this.stream.on("promise", this._onPromise.bind(this));
}
IncomingPromise.prototype = Object.create(IncomingRequest.prototype, { constructor: { value: IncomingPromise } });
IncomingPromise.prototype.cancel = function cancel() {
  this._responseStream.reset("CANCEL");
};
IncomingPromise.prototype.setPriority = function setPriority2(priority) {
  this._responseStream.priority(priority);
};
IncomingPromise.prototype._onPromise = OutgoingRequest.prototype._onPromise;
export {
  $serializers as serializers,
  $request as request,
  $raw as raw,
  $protocol as protocol,
  $https as https,
  $http as http,
  $globalAgent as globalAgent,
  $get as get,
  $createServer as createServer,
  $ServerResponse as ServerResponse,
  $Server as Server,
  $STATUS_CODES as STATUS_CODES,
  $OutgoingResponse as OutgoingResponse,
  $OutgoingRequest as OutgoingRequest,
  $OutgoingMessage as OutgoingMessage,
  $IncomingResponse as IncomingResponse,
  $IncomingRequest as IncomingRequest,
  $IncomingMessage as IncomingMessage,
  $ClientRequest as ClientRequest,
  $Agent as Agent
};
