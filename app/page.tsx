'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import mqtt, { type MqttClient } from 'mqtt'
import { Button } from '@/components/ui/button'
import {
  SpbDataType,
  decodeSpbPayload,
  encodeSpbPayload,
  type DecodedMetric,
} from '@/lib/sparkplug'
import {
  Activity,
  ArrowUpRight,
  Cpu,
  Gauge,
  Lightbulb,
  Radio,
  RotateCcw,
  Send,
  Server,
  Terminal,
  Zap,
} from 'lucide-react'

const BROKER_URL = process.env.NEXT_PUBLIC_MQTT_URL || 'wss://broker.hivemq.com:8884/mqtt'
const GROUP_ID = process.env.NEXT_PUBLIC_SPB_GROUP_ID || 'UNRaf_PDCI'
const EDGE_NODE_ID = process.env.NEXT_PUBLIC_SPB_EDGE_NODE_ID || 'EdgeNode01'
const DEVICE_ID = process.env.NEXT_PUBLIC_SPB_DEVICE_ID || 'ArduinoEsclavo'
const HOST_ID = process.env.NEXT_PUBLIC_SPB_HOST_ID || 'HostWeb'

type LogEntry = {
  time: string
  topic: string
  message: string
  tone: 'green' | 'blue' | 'yellow' | 'red'
}

function StatusPill({
  label,
  value,
  tone = 'green',
}: {
  label: string
  value: string
  tone?: 'green' | 'yellow' | 'red'
}) {
  const colors = {
    green: 'border-emerald-400/25 bg-emerald-400/10 text-emerald-300',
    yellow: 'border-amber-400/25 bg-amber-400/10 text-amber-300',
    red: 'border-red-400/25 bg-red-400/10 text-red-300',
  }
  return (
    <div
      className={`flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] ${colors[tone]}`}
    >
      <span
        className={`size-1.5 rounded-full ${
          tone === 'green'
            ? 'bg-emerald-400 shadow-[0_0_8px_#34d399]'
            : tone === 'yellow'
              ? 'bg-amber-400 shadow-[0_0_8px_#fbbf24]'
              : 'bg-red-400'
        }`}
      />
      <span className="text-slate-500">{label}</span>
      {value}
    </div>
  )
}

function MetricCard({
  label,
  value,
  detail,
  tone,
}: {
  label: string
  value: string
  detail: string
  tone: 'green' | 'red' | 'yellow' | 'blue'
}) {
  const colors = {
    green: 'text-emerald-400',
    red: 'text-red-400',
    yellow: 'text-amber-300',
    blue: 'text-sky-400',
  }
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/65 px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-[0.15em] text-slate-500">
          {label}
        </span>
        <ArrowUpRight className="size-3 text-slate-700" />
      </div>
      <div className={`font-mono text-2xl font-semibold tracking-tight ${colors[tone]}`}>
        {value}
      </div>
      <div className="mt-1 text-[11px] text-slate-500">{detail}</div>
    </div>
  )
}

export default function Page() {
  // Estados de conectividad por capa
  const [mqttConnected, setMqttConnected] = useState(false)
  const [nodeOnline, setNodeOnline] = useState(false)
  const [deviceOnline, setDeviceOnline] = useState(false)
  const [modbusState, setModbusState] = useState<string>('DEVICE NOT REACHED')
  const [opcuaState, setOpcuaState] = useState<string>('ERROR')

  // Contadores de las capas (Tabla 1)
  const [modbusOk, setModbusOk] = useState(0)
  const [crcErrors, setCrcErrors] = useState(0)
  const [timeouts, setTimeouts] = useState(0)
  const [mqttReconnects, setMqttReconnects] = useState(0)
  const [rebirthCount, setRebirthCount] = useState(0)
  const [seq, setSeq] = useState<number | null>(null)
  const [bdSeq, setBdSeq] = useState<number | null>(null)
  const [lastUpdateMs, setLastUpdateMs] = useState<number | null>(null)

  // Variables de E/S del Dispositivo 1 (Arduino Esclavo)
  const [digitalOn, setDigitalOn] = useState(false)
  const [pwm, setPwm] = useState(0)
  const [pot, setPot] = useState(0)
  const [pressed, setPressed] = useState(false)

  // UI & Logs
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [rebirthSending, setRebirthSending] = useState(false)

  const clientRef = useRef<MqttClient | null>(null)
  const expectedSeqRef = useRef<number | null>(null)
  const nodeOnlineRef = useRef(false)
  const deviceOnlineRef = useRef(false)
  const lastRebirthReqRef = useRef(0)

  const nowStr = () => {
    const d = new Date()
    return (
      d.toLocaleTimeString('en-GB', { hour12: false }) +
      '.' +
      String(d.getMilliseconds()).padStart(3, '0')
    )
  }

  const addLog = useCallback(
    (topic: string, message: string, tone: LogEntry['tone'] = 'blue') => {
      setLogs((current) => [{ time: nowStr(), topic, message, tone }, ...current].slice(0, 8))
    },
    []
  )

  const pwmPercent = useMemo(() => Math.round((pwm / 255) * 100), [pwm])
  const potPercent = useMemo(() => Math.round((pot / 1023) * 100), [pot])

  // Envío de NCMD Rebirth en formato Protobuf estricto
  const sendRebirthRequest = useCallback(
    (reason: string) => {
      const client = clientRef.current
      if (!client || !client.connected) return
      const now = Date.now()
      if (now - lastRebirthReqRef.current < 2000) return
      lastRebirthReqRef.current = now

      const ncmdTopic = `spBv1.0/${GROUP_ID}/NCMD/${EDGE_NODE_ID}`
      const payload = encodeSpbPayload(0, [
        { name: 'Node Control/Rebirth', datatype: SpbDataType.Boolean, value: true },
      ])
      client.publish(ncmdTopic, Buffer.from(payload), { qos: 0, retain: false })
      addLog('NCMD', `${EDGE_NODE_ID} · Node Control/Rebirth=true (${reason})`, 'yellow')
    },
    [addLog]
  )

  // Publicación de DCMD en formato Protobuf estricto
  const publishDcmd = useCallback(
    (metricName: string, datatype: number, value: boolean | number) => {
      const client = clientRef.current
      if (!client || !client.connected) return
      const dcmdTopic = `spBv1.0/${GROUP_ID}/DCMD/${EDGE_NODE_ID}/${DEVICE_ID}`
      const payload = encodeSpbPayload(0, [{ name: metricName, datatype, value }])
      client.publish(dcmdTopic, Buffer.from(payload), { qos: 0, retain: false })
      addLog('DCMD', `${DEVICE_ID} · ${metricName} → ${String(value)}`, 'blue')
    },
    [addLog]
  )

  // Aplicación de cada métrica recibida en NBIRTH / NDATA / DBIRTH / DDATA
  const applyMetrics = useCallback((metrics: DecodedMetric[]) => {
    for (const m of metrics) {
      const val = m.value
      if (val === null) continue
      switch (m.name) {
        case 'bdSeq':
          setBdSeq(Number(val))
          break
        case 'Status/MODBUS/Estado':
          setModbusState(String(val))
          break
        case 'Status/MODBUS/OK':
          setModbusOk(Number(val))
          break
        case 'Status/MODBUS/CRC_ERROR':
          setCrcErrors(Number(val))
          break
        case 'Status/MODBUS/TIMEOUT':
          setTimeouts(Number(val))
          break
        case 'Status/OPCUA/Estado':
          setOpcuaState(String(val))
          break
        case 'Status/MQTT/Reconexiones':
          setMqttReconnects(Number(val))
          break
        case 'Status/Sparkplug/Rebirths':
          setRebirthCount(Number(val))
          break
        case 'Inputs/PulsadorLocal':
        case 'Inputs/Pulsador':
          setPressed(Boolean(val))
          break
        case 'Inputs/Potenciometro':
          setPot(Math.max(0, Math.min(1023, Number(val))))
          break
        case 'Outputs/LEDDigital':
        case 'Outputs/LedRojo':
          setDigitalOn(Boolean(val))
          break
        case 'Outputs/LEDPWM':
        case 'Outputs/LedVerde':
          setPwm(Math.max(0, Math.min(255, Number(val))))
          break
      }
    }
  }, [])

  useEffect(() => {
    const stateTopic = `spBv1.0/STATE/${HOST_ID}`
    const clientId = `sparkplug-host-web-${Math.random().toString(16).slice(2, 8)}`

    const client = mqtt.connect(BROKER_URL, {
      clientId,
      clean: true,
      reconnectPeriod: 3000,
      will: {
        topic: stateTopic,
        payload: JSON.stringify({ online: false, timestamp: Date.now() }),
        qos: 1,
        retain: true,
      },
    })
    clientRef.current = client

    client.on('connect', () => {
      setMqttConnected(true)
      client.subscribe(`spBv1.0/${GROUP_ID}/#`, { qos: 0 })
      client.publish(
        stateTopic,
        JSON.stringify({ online: true, timestamp: Date.now() }),
        { qos: 1, retain: true }
      )
      addLog('STATE', 'WebSocket MQTT conectado · suscripción activa', 'green')

      // Si el Edge Node ya estaba corriendo antes de abrir la web, solicitamos Rebirth
      window.setTimeout(() => {
        if (client.connected && !nodeOnlineRef.current) {
          sendRebirthRequest('Sincronización inicial de Host Application')
        }
      }, 1500)
    })

    client.on('close', () => {
      setMqttConnected(false)
      nodeOnlineRef.current = false
      deviceOnlineRef.current = false
      setNodeOnline(false)
      setDeviceOnline(false)
    })

    client.on('error', (err) => {
      addLog('ERROR', `MQTT: ${err.message}`, 'red')
    })

    client.on('message', (topic, payloadBuf) => {
      const parts = topic.split('/')
      if (parts.length < 3) return
      const msgType = parts[2]
      const nodeId = parts[3]
      const devId = parts[4]

      if (msgType === 'STATE') return
      if (nodeId !== EDGE_NODE_ID) return

      let decoded
      try {
        decoded = decodeSpbPayload(new Uint8Array(payloadBuf))
      } catch {
        addLog('ERROR', `${topic} · trama Protobuf inválida`, 'red')
        return
      }

      const msgSeq = decoded.seq
      if (msgSeq !== null) setSeq(msgSeq)
      setLastUpdateMs(Date.now())

      const checkSequence = (typeLabel: string): boolean => {
        if (msgSeq === null || expectedSeqRef.current === null) return true
        if (msgSeq !== expectedSeqRef.current) {
          addLog(
            'SEQ',
            `Salto en ${typeLabel} (esperado ${expectedSeqRef.current}, recibido ${msgSeq})`,
            'yellow'
          )
          sendRebirthRequest(`Salto de seq ${expectedSeqRef.current}→${msgSeq}`)
          expectedSeqRef.current = (msgSeq + 1) % 256
          return false
        }
        expectedSeqRef.current = (expectedSeqRef.current + 1) % 256
        return true
      }

      if (msgType === 'NBIRTH') {
        nodeOnlineRef.current = true
        setNodeOnline(true)
        expectedSeqRef.current = 1
        applyMetrics(decoded.metrics)
        const bd = decoded.metrics.find((m) => m.name === 'bdSeq')?.value ?? '—'
        addLog(
          'NBIRTH',
          `${EDGE_NODE_ID} online · bdSeq: ${bd} · seq: 0 · metrics: ${decoded.metrics.length}`,
          'green'
        )
      } else if (msgType === 'NDEATH') {
        applyMetrics(decoded.metrics)
        nodeOnlineRef.current = false
        deviceOnlineRef.current = false
        expectedSeqRef.current = null
        setNodeOnline(false)
        setDeviceOnline(false)
        setOpcuaState('ERROR')
        setModbusState('DEVICE NOT REACHED')
        const bd = decoded.metrics.find((m) => m.name === 'bdSeq')?.value ?? '—'
        addLog('NDEATH', `${EDGE_NODE_ID} offline (Last Will) · bdSeq: ${bd}`, 'red')
      } else if (msgType === 'DBIRTH' && devId === DEVICE_ID) {
        if (!nodeOnlineRef.current) {
          sendRebirthRequest('DBIRTH sin NBIRTH previo')
          return
        }
        checkSequence('DBIRTH')
        deviceOnlineRef.current = true
        setDeviceOnline(true)
        applyMetrics(decoded.metrics)
        addLog(
          'DBIRTH',
          `${DEVICE_ID} online · seq: ${msgSeq} · metrics: ${decoded.metrics.length}`,
          'green'
        )
      } else if (msgType === 'DDEATH' && devId === DEVICE_ID) {
        checkSequence('DDEATH')
        deviceOnlineRef.current = false
        setDeviceOnline(false)
        addLog('DDEATH', `${DEVICE_ID} fuera de línea · seq: ${msgSeq}`, 'yellow')
      } else if (msgType === 'NDATA') {
        if (!nodeOnlineRef.current) {
          sendRebirthRequest('NDATA sin NBIRTH previo')
          return
        }
        if (!checkSequence('NDATA')) return
        applyMetrics(decoded.metrics)
        const summary = decoded.metrics.map((m) => `${m.name}=${m.value}`).join(' · ')
        addLog('NDATA', `seq: ${msgSeq} · ${summary}`, 'blue')
      } else if (msgType === 'DDATA' && devId === DEVICE_ID) {
        if (!nodeOnlineRef.current || !deviceOnlineRef.current) {
          sendRebirthRequest('DDATA sin BIRTH previo')
          return
        }
        if (!checkSequence('DDATA')) return
        applyMetrics(decoded.metrics)
        const summary = decoded.metrics.map((m) => `${m.name}=${m.value}`).join(' · ')
        addLog('DDATA', `seq: ${msgSeq} · ${summary}`, 'blue')
      }
    })

    return () => {
      try {
        if (client.connected) {
          client.publish(
            stateTopic,
            JSON.stringify({ online: false, timestamp: Date.now() }),
            { qos: 1, retain: true }
          )
        }
        client.end(true)
      } catch {
        // ignore
      }
    }
  }, [addLog, applyMetrics, sendRebirthRequest])

  // Tono y texto de las píldoras superiores según el estado real de cada capa
  const mqttTone = mqttConnected ? 'green' : 'red'
  const mqttLabel = mqttConnected ? 'CONECTADO' : 'DESCONECTADO'

  const modbusTone: 'green' | 'yellow' | 'red' = !nodeOnline
    ? 'red'
    : modbusState === 'DONE'
      ? 'green'
      : modbusState === 'CRC ERROR'
        ? 'yellow'
        : 'red'
  const modbusLabel = !nodeOnline ? 'DESCONECTADO' : modbusState

  const opcuaTone: 'green' | 'red' = nodeOnline && opcuaState === 'DONE' ? 'green' : 'red'
  const opcuaLabel = !nodeOnline ? 'DESCONECTADO' : opcuaState

  const deviceActive = mqttConnected && nodeOnline && deviceOnline && opcuaState === 'DONE'

  return (
    <main className="min-h-screen bg-[#070b11] text-slate-100 selection:bg-emerald-400/30">
      <div className="mx-auto max-w-[1500px] px-4 py-5 sm:px-6 lg:px-8">
        <header className="mb-5 flex flex-col gap-4 border-b border-slate-800/80 pb-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-lg border border-emerald-400/30 bg-emerald-400/10 text-emerald-300 shadow-[0_0_22px_rgba(52,211,153,0.08)]">
              <Cpu className="size-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-semibold tracking-tight text-slate-100">
                  SPARKPLUG <span className="text-emerald-400">HOST</span>
                </h1>
                <span className="rounded border border-slate-700 bg-slate-900 px-1.5 py-0.5 font-mono text-[9px] text-slate-500">
                  spBv1.0
                </span>
              </div>
              <p className="mt-0.5 text-xs text-slate-500">
                Consola industrial de telemetría y control de dispositivos
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill label="MQTT" value={mqttLabel} tone={mqttTone} />
            <StatusPill label="MODBUS" value={modbusLabel} tone={modbusTone} />
            <StatusPill label="OPC UA" value={opcuaLabel} tone={opcuaTone} />
            <span className="hidden h-5 w-px bg-slate-800 sm:block" />
            <span className="font-mono text-[11px] text-slate-500">
              {GROUP_ID} / {EDGE_NODE_ID}
            </span>
          </div>
        </header>

        <section className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            label="Peticiones Modbus"
            value={modbusOk.toLocaleString('es-AR')}
            detail={`Estado: ${modbusLabel}`}
            tone="green"
          />
          <MetricCard
            label="Errores CRC"
            value={String(crcErrors)}
            detail="Status/MODBUS/CRC_ERROR"
            tone="red"
          />
          <MetricCard
            label="Tiempo de espera"
            value={String(timeouts)}
            detail="Status/MODBUS/TIMEOUT"
            tone="yellow"
          />
          <MetricCard
            label="Rebirths Sparkplug"
            value={String(rebirthCount)}
            detail={`bdSeq: ${bdSeq ?? '—'} · Reconexiones MQTT: ${mqttReconnects}`}
            tone="blue"
          />
        </section>

        <section className="mb-5 grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-xl border border-slate-800 bg-[#0c121b] p-5 shadow-2xl shadow-black/10">
            <div className="mb-5 flex items-start justify-between">
              <div>
                <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                  <Zap className="size-3.5 text-sky-400" /> Dispositivo 1 / Actuadores
                </div>
                <h2 className="text-xl font-semibold text-slate-100">Control de Salidas</h2>
                <p className="mt-1 text-xs text-slate-500">
                  Los comandos DCMD (Protobuf) se publican sobre MQTT WebSockets.
                </p>
              </div>
              <span
                className={`rounded-full border px-2 py-1 font-mono text-[10px] ${
                  deviceActive
                    ? 'border-emerald-400/20 bg-emerald-400/10 text-emerald-300'
                    : 'border-red-400/20 bg-red-400/10 text-red-300'
                }`}
              >
                {deviceActive ? 'CONECTADO' : 'OFFLINE'}
              </span>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-lg border border-slate-800 bg-slate-950/45 p-4">
                <div className="mb-6 flex items-start justify-between">
                  <div>
                    <p className="font-mono text-sm text-slate-200">Outputs/LEDDigital</p>
                    <p className="mt-1 text-[11px] text-slate-500">Booleano · DCMD</p>
                  </div>
                  <Lightbulb
                    className={`size-5 ${
                      deviceActive && digitalOn ? 'text-emerald-300' : 'text-slate-600'
                    }`}
                  />
                </div>
                <button
                  type="button"
                  disabled={!deviceActive}
                  aria-pressed={digitalOn}
                  onClick={() => {
                    const nextVal = !digitalOn
                    setDigitalOn(nextVal)
                    publishDcmd('Outputs/LEDDigital', SpbDataType.Boolean, nextVal)
                  }}
                  className={`flex w-full items-center justify-between rounded-lg border px-3 py-2.5 transition disabled:cursor-not-allowed disabled:opacity-50 ${
                    deviceActive && digitalOn
                      ? 'border-emerald-400/30 bg-emerald-400/10'
                      : 'border-slate-700 bg-slate-900'
                  }`}
                >
                  <span
                    className={`text-sm font-semibold ${
                      deviceActive && digitalOn ? 'text-emerald-300' : 'text-slate-400'
                    }`}
                  >
                    {!deviceActive ? '—' : digitalOn ? 'SALIDA ACTIVA' : 'SALIDA INACTIVA'}
                  </span>
                  <span
                    className={`relative h-6 w-11 rounded-full transition ${
                      deviceActive && digitalOn ? 'bg-emerald-400' : 'bg-slate-700'
                    }`}
                  >
                    <span
                      className={`absolute top-1 size-4 rounded-full bg-white shadow transition ${
                        deviceActive && digitalOn ? 'left-6' : 'left-1'
                      }`}
                    />
                  </span>
                </button>
                <Button
                  disabled={!deviceActive}
                  onClick={() =>
                    publishDcmd('Outputs/LEDDigital', SpbDataType.Boolean, !digitalOn)
                  }
                  variant="outline"
                  className="mt-3 h-8 w-full border-slate-700 bg-transparent text-xs text-slate-300 hover:bg-sky-400/10 hover:text-sky-300"
                >
                  <Send data-icon="inline-start" /> Publicar DCMD
                </Button>
              </div>

              <div className="rounded-lg border border-slate-800 bg-slate-950/45 p-4">
                <div className="mb-5 flex items-start justify-between">
                  <div>
                    <p className="font-mono text-sm text-slate-200">Outputs/LEDPWM</p>
                    <p className="mt-1 text-[11px] text-slate-500">UInt16 · 0 — 255 · DCMD</p>
                  </div>
                  <span className="font-mono text-xl font-semibold text-sky-300">{pwm}</span>
                </div>
                <input
                  aria-label="LEDPWM value"
                  type="range"
                  min="0"
                  max="255"
                  disabled={!deviceActive}
                  value={pwm}
                  onChange={(event) => setPwm(Number(event.target.value))}
                  className="h-1.5 w-full cursor-pointer accent-sky-400 disabled:cursor-not-allowed disabled:opacity-40"
                />
                <div className="mt-2 flex justify-between font-mono text-[10px] text-slate-600">
                  <span>0</span>
                  <span>{deviceActive ? `${pwmPercent}% intensidad` : 'OFFLINE'}</span>
                  <span>255</span>
                </div>
                <Button
                  disabled={!deviceActive}
                  onClick={() => publishDcmd('Outputs/LEDPWM', SpbDataType.UInt16, pwm)}
                  variant="outline"
                  className="mt-4 h-8 w-full border-slate-700 bg-transparent text-xs text-slate-300 hover:bg-sky-400/10 hover:text-sky-300"
                >
                  <Send data-icon="inline-start" /> Publicar DCMD
                </Button>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-[#0c121b] p-5 shadow-2xl shadow-black/10">
            <div className="mb-5 flex items-start justify-between">
              <div>
                <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                  <Activity className="size-3.5 text-emerald-400" /> Dispositivo 1 / Sensores
                </div>
                <h2 className="text-xl font-semibold text-slate-100">Telemetría de Entradas</h2>
                <p className="mt-1 text-xs text-slate-500">
                  {deviceActive && lastUpdateMs
                    ? `Última trama · ${new Date(lastUpdateMs).toLocaleTimeString('es-AR', { hour12: false })}`
                    : 'Esperando tramas Sparkplug B...'}
                </p>
              </div>
              <Radio
                className={`size-5 ${deviceActive ? 'text-emerald-400' : 'text-red-400'}`}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
              <div className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-950/45 p-4">
                <div>
                  <p className="font-mono text-sm text-slate-200">Inputs/PulsadorLocal</p>
                  <p className="mt-1 text-[11px] text-slate-500">Entrada Digital (Boolean)</p>
                </div>
                <span className="flex items-center gap-2 rounded-full border border-slate-700 px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  <span
                    className={`size-2 rounded-full ${
                      !deviceActive
                        ? 'bg-slate-600'
                        : pressed
                          ? 'bg-amber-300 shadow-[0_0_10px_#fcd34d]'
                          : 'bg-emerald-400'
                    }`}
                  />
                  {!deviceActive ? 'OFFLINE' : pressed ? 'Presionado' : 'Suelto'}
                </span>
              </div>

              <div className="rounded-lg border border-slate-800 bg-slate-950/45 p-4">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <p className="font-mono text-sm text-slate-200">Inputs/Potenciometro</p>
                    <p className="mt-1 text-[11px] text-slate-500">
                      Entrada Analógica (0 - 1023)
                    </p>
                  </div>
                  <Gauge className="size-5 text-emerald-400" />
                </div>
                <div className="flex items-center gap-4">
                  <div
                    className="relative size-16 shrink-0 rounded-full"
                    style={{
                      background: `conic-gradient(#34d399 ${
                        deviceActive ? potPercent : 0
                      }%, #17212f 0)`,
                    }}
                  >
                    <div className="absolute inset-1.5 flex items-center justify-center rounded-full bg-[#0c121b]">
                      <span className="font-mono text-sm font-semibold text-emerald-300">
                        {deviceActive ? pot : '—'}
                      </span>
                    </div>
                  </div>
                  <div className="flex-1">
                    <div className="mb-2 flex justify-between font-mono text-[10px] text-slate-500">
                      <span>0</span>
                      <span>{deviceActive ? `${potPercent}%` : 'OFFLINE'}</span>
                      <span>1023</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-slate-800">
                      <div
                        className="h-full rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,.45)] transition-all"
                        style={{ width: `${deviceActive ? potPercent : 0}%` }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="overflow-hidden rounded-xl border border-slate-800 bg-[#080c12] shadow-2xl shadow-black/10">
          <div className="flex flex-col gap-3 border-b border-slate-800 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <Terminal className="size-4 text-emerald-400" />
              <h2 className="text-sm font-semibold text-slate-200">Registro de Eventos</h2>
              <span
                className={`rounded px-1.5 py-0.5 font-mono text-[10px] ${
                  nodeOnline
                    ? 'bg-emerald-500/15 text-emerald-300'
                    : 'bg-slate-900 text-slate-600'
                }`}
              >
                {nodeOnline ? 'EN VIVO' : 'INACTIVO'}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <span className="font-mono text-[10px] text-slate-500">
                seq: {seq ?? '—'} · bdSeq: {bdSeq ?? '—'}
              </span>
              <Button
                disabled={!mqttConnected || rebirthSending}
                onClick={() => {
                  setRebirthSending(true)
                  lastRebirthReqRef.current = 0
                  sendRebirthRequest('Solicitado por el usuario')
                  window.setTimeout(() => setRebirthSending(false), 900)
                }}
                size="sm"
                className="bg-sky-500/15 text-sky-300 hover:bg-sky-500/25"
              >
                <RotateCcw
                  data-icon="inline-start"
                  className={rebirthSending ? 'animate-spin' : ''}
                />
                {rebirthSending ? 'Enviando...' : 'Reiniciar Nodo (Rebirth)'}
              </Button>
            </div>
          </div>

          <div className="p-3 font-mono text-xs">
            <div className="mb-2 hidden grid-cols-[105px_90px_1fr] gap-4 px-2 text-[10px] uppercase tracking-widest text-slate-700 sm:grid">
              <span>Timestamp</span>
              <span>Tipo</span>
              <span>Payload</span>
            </div>
            {logs.length === 0 ? (
              <div className="px-2 py-3 text-slate-600">
                Conectando al broker MQTT y esperando tramas Sparkplug B...
              </div>
            ) : (
              logs.map((log, index) => (
                <div
                  key={`${log.time}-${index}`}
                  className="grid gap-1 rounded px-2 py-2.5 transition hover:bg-slate-900/60 sm:grid-cols-[105px_90px_1fr] sm:gap-4"
                >
                  <span className="text-slate-600">{log.time}</span>
                  <span
                    className={
                      log.tone === 'green'
                        ? 'text-emerald-400'
                        : log.tone === 'yellow'
                          ? 'text-amber-300'
                          : log.tone === 'red'
                            ? 'text-red-400'
                            : 'text-sky-400'
                    }
                  >
                    {log.topic}
                  </span>
                  <span className="text-slate-400 break-all">
                    <span className="text-slate-600">spBv1.0/{GROUP_ID}/</span>
                    {log.message}
                  </span>
                </div>
              ))
            )}
          </div>

          <div className="flex items-center gap-2 border-t border-slate-900 bg-black/20 px-5 py-2.5 text-[10px] text-slate-600">
            <span
              className={`size-1.5 rounded-full ${
                mqttConnected ? 'bg-emerald-400' : 'bg-red-400'
              }`}
            />
            {BROKER_URL}
            <span className="ml-auto hidden sm:inline">
              QoS 1 · Protobuf · Sparkplug B · spBv1.0/{GROUP_ID}/#
            </span>
          </div>
        </section>

        <footer className="flex flex-col gap-2 py-5 text-[10px] uppercase tracking-[0.15em] text-slate-700 sm:flex-row sm:items-center sm:justify-between">
          <span>Interfaz Host Application / UNRaf PdCI</span>
          <span className="flex items-center gap-2">
            <Server className="size-3" /> MQTT WebSockets ·{' '}
            <span className={mqttConnected ? 'text-emerald-500/70' : 'text-red-500/70'}>
              {mqttLabel}
            </span>
          </span>
        </footer>
      </div>
    </main>
  )
}
