/**
 * Codificador y decodificador de payloads Protobuf según sparkplug_b.proto
 * (Eclipse Tahu v1.0) para la Host Application en el navegador.
 */
import protobuf from 'protobufjs'

const SPARKPLUG_PROTO = `
  syntax = "proto2";
  package org.eclipse.tahu.protobuf;

  enum DataType {
    Unknown   = 0;
    Int8      = 1;
    Int16     = 2;
    Int32     = 3;
    Int64     = 4;
    UInt8     = 5;
    UInt16    = 6;
    UInt32    = 7;
    UInt64    = 8;
    Float     = 9;
    Double    = 10;
    Boolean   = 11;
    String    = 12;
    DateTime  = 13;
    Text      = 14;
  }

  message Payload {
    message Metric {
      optional string name          = 1;
      optional uint64 alias         = 2;
      optional uint64 timestamp     = 3;
      optional uint32 datatype      = 4;
      optional bool   is_historical = 5;
      optional bool   is_transient  = 6;
      optional bool   is_null       = 7;
      oneof value {
        uint32 int_value     = 10;
        uint64 long_value    = 11;
        float  float_value   = 12;
        double double_value  = 13;
        bool   boolean_value = 14;
        string string_value  = 15;
        bytes  bytes_value   = 16;
      }
    }
    optional uint64 timestamp = 1;
    repeated Metric metrics   = 2;
    optional uint64 seq       = 3;
    optional string uuid      = 4;
    optional bytes  body      = 5;
  }
`

const root = protobuf.parse(SPARKPLUG_PROTO).root
const SpbPayload = root.lookupType('org.eclipse.tahu.protobuf.Payload')

export const SpbDataType = {
  Int8: 1,
  Int16: 2,
  Int32: 3,
  Int64: 4,
  UInt8: 5,
  UInt16: 6,
  UInt32: 7,
  UInt64: 8,
  Float: 9,
  Double: 10,
  Boolean: 11,
  String: 12,
  DateTime: 13,
} as const

export type DecodedMetric = {
  name: string
  datatype: number
  timestamp: number
  value: boolean | number | string | null
}

export type DecodedSpbPayload = {
  timestamp: number | null
  seq: number | null
  metrics: DecodedMetric[]
}

export function encodeSpbPayload(
  seq: number,
  metricsList: Array<{ name: string; datatype: number; value: boolean | number | string }>
): Uint8Array {
  const now = Date.now()
  const metrics = metricsList.map((m) => {
    const item: Record<string, unknown> = {
      name: m.name,
      datatype: m.datatype,
      timestamp: now,
    }
    if (m.datatype === SpbDataType.Boolean) {
      item.booleanValue = Boolean(m.value)
    } else if (m.datatype === SpbDataType.String) {
      item.stringValue = String(m.value)
    } else if (m.datatype === SpbDataType.Float) {
      item.floatValue = Number(m.value)
    } else if (m.datatype === SpbDataType.Double) {
      item.doubleValue = Number(m.value)
    } else if (
      m.datatype === SpbDataType.Int64 ||
      m.datatype === SpbDataType.UInt64 ||
      m.datatype === SpbDataType.DateTime
    ) {
      item.longValue = Number(m.value)
    } else {
      item.intValue = Number(m.value) >>> 0
    }
    return item
  })

  const message = SpbPayload.create({
    timestamp: now,
    seq: seq & 0xff,
    metrics,
  })
  return SpbPayload.encode(message).finish()
}

export function decodeSpbPayload(buffer: Uint8Array): DecodedSpbPayload {
  const msg = SpbPayload.decode(buffer)
  const obj = SpbPayload.toObject(msg, { longs: Number, defaults: false }) as {
    timestamp?: number
    seq?: number
    metrics?: Array<Record<string, unknown>>
  }

  const metrics: DecodedMetric[] = (obj.metrics || []).map((m) => {
    let val: boolean | number | string | null = null
    if (!m.isNull) {
      if (m.booleanValue !== undefined) val = Boolean(m.booleanValue)
      else if (m.stringValue !== undefined) val = String(m.stringValue)
      else if (m.floatValue !== undefined) val = Number(m.floatValue)
      else if (m.doubleValue !== undefined) val = Number(m.doubleValue)
      else if (m.longValue !== undefined) val = Number(m.longValue)
      else if (m.intValue !== undefined) val = Number(m.intValue)
    }
    return {
      name: String(m.name || ''),
      datatype: Number(m.datatype || 0),
      timestamp: Number(m.timestamp || obj.timestamp || Date.now()),
      value: val,
    }
  })

  return {
    timestamp: obj.timestamp !== undefined ? Number(obj.timestamp) : null,
    seq: obj.seq !== undefined ? Number(obj.seq) : null,
    metrics,
  }
}
