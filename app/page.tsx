'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import mqtt, { type MqttClient } from 'mqtt'
import { Button } from '@/components/ui/button'
import { Activity, ArrowUpRight, Cpu, Gauge, Lightbulb, Radio, RotateCcw, Send, Server, Terminal, Zap } from 'lucide-react'

type Tone = 'green' | 'blue' | 'yellow' | 'red'
type LogEntry = { time: string; topic: string; message: string; tone: Tone }
type Metrics = { digital: boolean | null; pwm: number | null; pot: number | null; pressed: boolean | null }

const SUBSCRIPTION = 'spBv1.0/UNRaf_PDCI/#'
const HOST_STATE = 'spBv1.0/STATE/HostWeb'
const DCMD_TOPIC = 'spBv1.0/UNRaf_PDCI/DCMD/EdgeNode01/ArduinoEsclavo'
const NCMD_TOPIC = 'spBv1.0/UNRaf_PDCI/NCMD/EdgeNode01'

function statusLabel(status: 'DISCONNECTED' | 'CONNECTING' | 'ONLINE') { return status === 'ONLINE' ? 'CONECTADO' : status === 'CONNECTING' ? 'CONECTANDO' : 'DESCONECTADO' }

function StatusPill({ label, value, tone = 'red' }: { label: string; value: string; tone?: Tone }) {
  const colors = { green: 'border-emerald-400/25 bg-emerald-400/10 text-emerald-300', yellow: 'border-amber-400/25 bg-amber-400/10 text-amber-300', red: 'border-red-400/25 bg-red-400/10 text-red-300', blue: 'border-sky-400/25 bg-sky-400/10 text-sky-300' }
  const dots = { green: 'bg-emerald-400 shadow-[0_0_8px_#34d399]', yellow: 'bg-amber-400', red: 'bg-red-400', blue: 'bg-sky-400' }
  return <div className={`flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] ${colors[tone]}`}><span className={`size-1.5 rounded-full ${dots[tone]}`} /><span className="text-slate-500">{label}</span>{value}</div>
}

function MetricCard({ label, value, detail, tone }: { label: string; value: string; detail: string; tone: Tone }) {
  const colors = { green: 'text-emerald-400', red: 'text-red-400', yellow: 'text-amber-300', blue: 'text-sky-400' }
  return <div className="rounded-lg border border-slate-800 bg-slate-900/65 px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]"><div className="mb-2 flex items-center justify-between gap-2"><span className="text-[10px] font-semibold uppercase tracking-[0.15em] text-slate-500">{label}</span><ArrowUpRight className="size-3 text-slate-700" /></div><div className={`font-mono text-2xl font-semibold tracking-tight ${colors[tone]}`}>{value}</div><div className="mt-1 text-[11px] text-slate-500">{detail}</div></div>
}

function getMetric(payload: unknown, names: string[]): unknown {
  if (!payload || typeof payload !== 'object') return undefined
  const record = payload as Record<string, unknown>
  for (const name of names) if (name in record) return record[name]
  for (const value of Object.values(record)) { const found = getMetric(value, names); if (found !== undefined) return found }
  return undefined
}

export default function Page() {
  const clientRef = useRef<MqttClient | null>(null)
  const [mqttStatus, setMqttStatus] = useState<'DISCONNECTED' | 'CONNECTING' | 'ONLINE'>('DISCONNECTED')
  const [metrics, setMetrics] = useState<Metrics>({ digital: null, pwm: null, pot: null, pressed: null })
  const [pwmDraft, setPwmDraft] = useState(0)
  const [counts, setCounts] = useState({ modbus: 0, crc: 0, timeouts: 0, rebirths: 0 })
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [rebirth, setRebirth] = useState(false)
  const [lastMessage, setLastMessage] = useState<number | null>(null)

  const addLog = (topic: string, message: string, tone: Tone = 'blue') => setLogs((current) => [{ time: new Date().toLocaleTimeString('en-GB', { hour12: false }), topic, message, tone }, ...current].slice(0, 8))
  const publish = (topic: string, payload: object) => { if (!clientRef.current?.connected) { addLog('MQTT', 'Publicación omitida · broker desconectado', 'red'); return false } clientRef.current.publish(topic, JSON.stringify(payload), { qos: 1, retain: topic === HOST_STATE }, (error) => { if (error) addLog('MQTT', `Publicación fallida · ${error.message}`, 'red') }); addLog('PUB', `${topic} · ${JSON.stringify(payload)}`, 'blue'); return true }
  const pwmPercent = metrics.pwm === null ? 0 : Math.round((metrics.pwm / 255) * 100)
  const potPercent = metrics.pot === null ? 0 : Math.round((metrics.pot / 1023) * 100)

  useEffect(() => {
    setMqttStatus('CONNECTING')
    const client = mqtt.connect('wss://broker.hivemq.com:8884/mqtt', { clientId: `sparkplug-host-web-${Math.random().toString(16).slice(2)}`, clean: true, reconnectPeriod: 3000, will: { topic: HOST_STATE, payload: JSON.stringify({ online: false }), qos: 1, retain: true } })
    clientRef.current = client
    client.on('connect', () => { setMqttStatus('ONLINE'); client.subscribe(SUBSCRIPTION, { qos: 1 }); client.publish(HOST_STATE, JSON.stringify({ online: true, timestamp: Date.now() }), { qos: 1, retain: true }); addLog('STATE', 'WebSocket MQTT conectado · suscripción activa', 'green') })
    client.on('message', (topic, buffer) => {
      let payload: unknown
      try { payload = JSON.parse(buffer.toString()) } catch { addLog('RX', `${topic} · payload Sparkplug binario recibido`, 'blue'); return }
      const digital = getMetric(payload, ['Outputs/LEDDigital', 'LEDDigital'])
      const pwm = getMetric(payload, ['Outputs/LEDPWM', 'LEDPWM'])
      const pot = getMetric(payload, ['Inputs/Potenciometro', 'Potenciometro'])
      const pressed = getMetric(payload, ['Inputs/PulsadorLocal', 'PulsadorLocal'])
      setMetrics((current) => ({ digital: typeof digital === 'boolean' ? digital : current.digital, pwm: typeof pwm === 'number' ? pwm : current.pwm, pot: typeof pot === 'number' ? pot : current.pot, pressed: typeof pressed === 'boolean' ? pressed : current.pressed }))
      setLastMessage(Date.now()); setCounts((current) => ({ ...current, modbus: current.modbus + 1 })); addLog('RX', `${topic} · actualización de métrica Sparkplug`, 'green')
    })
    client.on('close', () => { setMqttStatus('DISCONNECTED'); setLastMessage(null); setMetrics({ digital: null, pwm: null, pot: null, pressed: null }); addLog('STATE', 'WebSocket MQTT desconectado', 'red') })
    client.on('error', (error) => addLog('ERROR', error.message, 'red'))
    return () => { client.end(true); clientRef.current = null }
  }, [])

  const live = mqttStatus === 'ONLINE' && lastMessage !== null
  const networkTone = mqttStatus === 'ONLINE' ? 'green' : 'red'
  const display = (value: unknown, fallback = '—') => live && value !== null ? String(value) : fallback

  return <main className="min-h-screen bg-[#070b11] text-slate-100 selection:bg-emerald-400/30"><div className="mx-auto max-w-[1500px] px-4 py-5 sm:px-6 lg:px-8">
    <header className="mb-5 flex flex-col gap-4 border-b border-slate-800/80 pb-5 lg:flex-row lg:items-center lg:justify-between"><div className="flex items-center gap-3"><div className="flex size-10 items-center justify-center rounded-lg border border-emerald-400/30 bg-emerald-400/10 text-emerald-300"><Cpu className="size-5" /></div><div><div className="flex items-center gap-2"><h1 className="text-lg font-semibold tracking-tight text-slate-100">Interfaz</h1><span className="rounded border border-slate-700 bg-slate-900 px-1.5 py-0.5 font-mono text-[9px] text-slate-500">spBv1.0</span></div></div></div><div className="flex flex-wrap items-center gap-2"><StatusPill label="MQTT" value={statusLabel(mqttStatus)} tone={networkTone} /><StatusPill label="MODBUS" value={live ? 'CONECTADO' : 'DESCONECTADO'} tone={live ? 'green' : 'red'} /><StatusPill label="OPC UA" value={live ? 'CONECTADO' : 'DESCONECTADO'} tone={live ? 'green' : 'red'} /></div></header>
    <section className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><MetricCard label="Peticiones Modbus" value={String(counts.modbus)} detail="Tramas Sparkplug en vivo" tone="green" /><MetricCard label="Errores CRC" value={String(counts.crc)} detail="Informado por telemetría" tone="red" /><MetricCard label="Tiempo de espera" value={String(counts.timeouts)} detail="Informado por telemetría" tone="yellow" /><MetricCard label="Rebirths Sparkplug" value={String(counts.rebirths)} detail="Peticiones NCMD enviadas" tone="blue" /></section>
    <section className="mb-5 grid gap-5 xl:grid-cols-[1.1fr_0.9fr]"><div className="rounded-xl border border-slate-800 bg-[#0c121b] p-5"><div className="mb-5 flex items-start justify-between"><div><div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500"><Zap className="size-3.5 text-sky-400" /> DISPOSITIVO 1 / ACTUADORES</div><h2 className="text-xl font-semibold text-slate-100">Control de Salidas</h2><p className="mt-1 text-xs text-slate-500">Los comandos DCMD se publican sobre MQTT WebSockets.</p></div><span className={`rounded-full border px-2 py-1 font-mono text-[10px] ${mqttStatus === 'ONLINE' ? 'border-emerald-400/20 bg-emerald-400/10 text-emerald-300' : 'border-red-400/20 bg-red-400/10 text-red-300'}`}>{statusLabel(mqttStatus)}</span></div><div className="grid gap-4 md:grid-cols-2"><div className="rounded-lg border border-slate-800 bg-slate-950/45 p-4"><div className="mb-6 flex items-start justify-between"><div><p className="font-mono text-sm text-slate-200">Outputs/LEDDigital</p><p className="mt-1 text-[11px] text-slate-500">Booleano · DCMD</p></div><Lightbulb className={`size-5 ${metrics.digital ? 'text-emerald-300' : 'text-slate-600'}`} /></div><div className="mb-3 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm font-semibold text-slate-400">{display(metrics.digital === null ? null : metrics.digital ? 'SALIDA ACTIVA' : 'SALIDA INACTIVA')}</div><Button onClick={() => publish(DCMD_TOPIC, { metric: 'Outputs/LEDDigital', value: !(metrics.digital ?? false) })} variant="outline" className="h-8 w-full border-slate-700 bg-transparent text-xs text-slate-300 hover:bg-sky-400/10 hover:text-sky-300"><Send data-icon="inline-start" /> Publicar DCMD</Button></div><div className="rounded-lg border border-slate-800 bg-slate-950/45 p-4"><div className="mb-5 flex items-start justify-between"><div><p className="font-mono text-sm text-slate-200">Outputs/LEDPWM</p><p className="mt-1 text-[11px] text-slate-500">UInt8 · 0 — 255 · DCMD</p></div><span className="font-mono text-xl font-semibold text-sky-300">{display(metrics.pwm, '0')}</span></div><input aria-label="LEDPWM value" type="range" min="0" max="255" value={pwmDraft} onChange={(event) => setPwmDraft(Number(event.target.value))} disabled={!live} className="h-1.5 w-full cursor-pointer accent-sky-400 disabled:cursor-not-allowed disabled:opacity-40" /><div className="mt-2 flex justify-between font-mono text-[10px] text-slate-600"><span>0</span><span>{live ? `${pwmPercent}% intensity` : 'OFFLINE'}</span><span>255</span></div><Button onClick={() => publish(DCMD_TOPIC, { metric: 'Outputs/LEDPWM', value: metrics.pwm ?? 0 })} variant="outline" className="mt-4 h-8 w-full border-slate-700 bg-transparent text-xs text-slate-300 hover:bg-sky-400/10 hover:text-sky-300"><Send data-icon="inline-start" /> Publicar DCMD</Button></div></div></div>
      <div className="rounded-xl border border-slate-800 bg-[#0c121b] p-5"><div className="mb-5 flex items-start justify-between"><div><div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500"><Activity className="size-3.5 text-emerald-400" /> DISPOSITIVO 1 / SENSORES</div><h2 className="text-xl font-semibold text-slate-100">Telemetría de Entradas</h2><p className="mt-1 text-xs text-slate-500">{live ? `Última actualización · hace ${Math.max(0, Math.floor((Date.now() - (lastMessage ?? Date.now())) / 1000))} s` : 'Esperando tramas Sparkplug B...'}</p></div><Radio className={`size-5 ${live ? 'text-emerald-400' : 'text-red-400'}`} /></div><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1"><div className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-950/45 p-4"><div><p className="font-mono text-sm text-slate-200">Inputs/PulsadorLocal</p><p className="mt-1 text-[11px] text-slate-500">Entrada Digital (Boolean)</p></div><span className="flex items-center gap-2 rounded-full border border-slate-700 px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400"><span className={`size-2 rounded-full ${metrics.pressed ? 'bg-amber-300' : 'bg-slate-600'}`} />{display(metrics.pressed === null ? null : metrics.pressed ? 'Presionado' : 'Suelto', 'OFFLINE')}</span></div><div className="rounded-lg border border-slate-800 bg-slate-950/45 p-4"><div className="mb-4 flex items-center justify-between"><div><p className="font-mono text-sm text-slate-200">Inputs/Potenciometro</p><p className="mt-1 text-[11px] text-slate-500">Entrada Analógica (0 - 1023)</p></div><Gauge className="size-5 text-emerald-400" /></div><div className="flex items-center gap-4"><div className="relative size-16 shrink-0 rounded-full" style={{ background: `conic-gradient(#34d399 ${potPercent}%, #17212f 0)` }}><div className="absolute inset-1.5 flex items-center justify-center rounded-full bg-[#0c121b]"><span className="font-mono text-sm font-semibold text-emerald-300">{display(metrics.pot, '—')}</span></div></div><div className="flex-1"><div className="mb-2 flex justify-between font-mono text-[10px] text-slate-500"><span>0</span><span>{live ? `${potPercent}%` : 'OFFLINE'}</span><span>1023</span></div><div className="h-2 overflow-hidden rounded-full bg-slate-800"><div className="h-full rounded-full bg-emerald-400 transition-all" style={{ width: `${live ? potPercent : 0}%` }} /></div></div></div></div></div></div></section>
    <section className="overflow-hidden rounded-xl border border-slate-800 bg-[#080c12]"><div className="flex flex-col gap-3 border-b border-slate-800 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-center gap-2"><Terminal className="size-4 text-emerald-400" /><h2 className="text-sm font-semibold text-slate-200">Registro de Eventos</h2><span className="rounded bg-slate-900 px-1.5 py-0.5 font-mono text-[10px] text-slate-600">{live ? 'EN VIVO' : 'INACTIVO'}</span></div><Button disabled={rebirth} onClick={() => { if (publish(NCMD_TOPIC, { metric: 'Node Control/Rebirth', value: true })) { setRebirth(true); setCounts((current) => ({ ...current, rebirths: current.rebirths + 1 })); window.setTimeout(() => setRebirth(false), 1200) } }} size="sm" className="bg-sky-500/15 text-sky-300 hover:bg-sky-500/25"><RotateCcw data-icon="inline-start" className={rebirth ? 'animate-spin' : ''} />{rebirth ? 'Enviando...' : 'Reiniciar Nodo (Rebirth)'}</Button></div><div className="p-3 font-mono text-xs">{logs.length === 0 ? <div className="px-2 py-6 text-center text-slate-600">No se recibieron tramas MQTT.</div> : logs.map((log, index) => <div key={`${log.time}-${index}`} className="grid gap-1 rounded px-2 py-2.5 sm:grid-cols-[105px_90px_1fr] sm:gap-4"><span className="text-slate-600">{log.time}</span><span className={log.tone === 'green' ? 'text-emerald-400' : log.tone === 'yellow' ? 'text-amber-300' : log.tone === 'red' ? 'text-red-400' : 'text-sky-400'}>{log.topic}</span><span className="text-slate-400 break-all">{log.message}</span></div>)}</div><div className="flex items-center gap-2 border-t border-slate-900 bg-black/20 px-5 py-2.5 text-[10px] text-slate-600"><span className={`size-1.5 rounded-full ${mqttStatus === 'ONLINE' ? 'bg-emerald-400' : 'bg-red-400'}`} /> wss://broker.hivemq.com:8884/mqtt <span className="ml-auto hidden sm:inline">QoS 1 · Sparkplug B · {SUBSCRIPTION}</span></div></section><footer className="flex flex-col gap-2 py-5 text-[10px] uppercase tracking-[0.15em] text-slate-700 sm:flex-row sm:items-center sm:justify-between"><span>Interfaz</span><span className="flex items-center gap-2"><Server className="size-3" /> MQTT WebSockets · <span className={mqttStatus === 'ONLINE' ? 'text-emerald-500/70' : 'text-red-500/70'}>{statusLabel(mqttStatus)}</span></span></footer>
  </div></main>
}
