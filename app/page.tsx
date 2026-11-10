'use client'

import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  CircleCheck,
  Cpu,
  Gauge,
  Lightbulb,
  Loader2,
  MessageSquare,
  Network,
  Radio,
  RotateCcw,
  Send,
  Server,
  SlidersHorizontal,
  Terminal,
  Zap,
} from 'lucide-react'

type LogEntry = { time: string; topic: string; message: string; tone: 'green' | 'blue' | 'yellow' }

const initialLogs: LogEntry[] = [
  { time: '14:32:08.412', topic: 'NBIRTH', message: 'Node online · bdSeq: 184 · metrics: 12', tone: 'green' },
  { time: '14:32:07.986', topic: 'DBIRTH', message: 'Device 1 discovered · seq: 42 · metrics: 8', tone: 'green' },
  { time: '14:32:07.551', topic: 'DDEATH', message: 'Device 1 previous session closed cleanly', tone: 'yellow' },
  { time: '14:32:05.208', topic: 'STATE', message: 'MQTT broker connection established', tone: 'blue' },
]

function StatusPill({ label, value, tone = 'green' }: { label: string; value: string; tone?: 'green' | 'yellow' | 'red' }) {
  const colors = {
    green: 'border-emerald-400/25 bg-emerald-400/10 text-emerald-300',
    yellow: 'border-amber-400/25 bg-amber-400/10 text-amber-300',
    red: 'border-red-400/25 bg-red-400/10 text-red-300',
  }
  return (
    <div className={`flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] ${colors[tone]}`}>
      <span className={`size-1.5 rounded-full ${tone === 'green' ? 'bg-emerald-400 shadow-[0_0_8px_#34d399]' : tone === 'yellow' ? 'bg-amber-400' : 'bg-red-400'}`} />
      <span className="text-slate-500">{label}</span>
      {value}
    </div>
  )
}

function MetricCard({ label, value, detail, tone }: { label: string; value: string; detail: string; tone: 'green' | 'red' | 'yellow' | 'blue' }) {
  const colors = { green: 'text-emerald-400', red: 'text-red-400', yellow: 'text-amber-300', blue: 'text-sky-400' }
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/65 px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-[0.15em] text-slate-500">{label}</span>
        <ArrowUpRight className="size-3 text-slate-700" />
      </div>
      <div className={`font-mono text-2xl font-semibold tracking-tight ${colors[tone]}`}>{value}</div>
      <div className="mt-1 text-[11px] text-slate-500">{detail}</div>
    </div>
  )
}

export default function Page() {
  const [digitalOn, setDigitalOn] = useState(true)
  const [pwm, setPwm] = useState(178)
  const [pot, setPot] = useState(687)
  const [pressed, setPressed] = useState(false)
  const [logs, setLogs] = useState(initialLogs)
  const [rebirth, setRebirth] = useState(false)

  const now = () => new Date().toLocaleTimeString('en-GB', { hour12: false }) + '.' + Math.floor(Math.random() * 900 + 100)
  const addLog = (topic: string, message: string, tone: LogEntry['tone'] = 'blue') => setLogs((current) => [{ time: now(), topic, message, tone }, ...current].slice(0, 7))
  const pwmPercent = useMemo(() => Math.round((pwm / 255) * 100), [pwm])
  const potPercent = Math.round((pot / 1023) * 100)

  useEffect(() => {
    const timer = window.setInterval(() => setPot((value) => Math.max(0, Math.min(1023, value + Math.round((Math.random() - 0.5) * 18)))), 3000)
    return () => window.clearInterval(timer)
  }, [])

  return (
    <main className="min-h-screen bg-[#070b11] text-slate-100 selection:bg-emerald-400/30">
      <div className="mx-auto max-w-[1500px] px-4 py-5 sm:px-6 lg:px-8">
        <header className="mb-5 flex flex-col gap-4 border-b border-slate-800/80 pb-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-lg border border-emerald-400/30 bg-emerald-400/10 text-emerald-300 shadow-[0_0_22px_rgba(52,211,153,0.08)]"><Cpu className="size-5" /></div>
            <div>
              <div className="flex items-center gap-2"><h1 className="text-lg font-semibold tracking-tight text-slate-100">SPARKPLUG <span className="text-emerald-400">HOST</span></h1><span className="rounded border border-slate-700 bg-slate-900 px-1.5 py-0.5 font-mono text-[9px] text-slate-500">spBv1.0</span></div>
              <p className="mt-0.5 text-xs text-slate-500">Industrial device control & telemetry console</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2"><StatusPill label="MQTT" value="ONLINE" /><StatusPill label="MODBUS" value="DONE" /><StatusPill label="OPC UA" value="DONE" /><span className="hidden h-5 w-px bg-slate-800 sm:block" /><span className="font-mono text-[11px] text-slate-600">GROUP / PLANTA-01</span></div>
        </header>

        <section className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="Modbus requests" value="1,284" detail="+12.4% from last hour" tone="green" />
          <MetricCard label="CRC errors" value="03" detail="0.2% error rate" tone="red" />
          <MetricCard label="Timeouts" value="07" detail="Last: 14:28:51" tone="yellow" />
          <MetricCard label="Sparkplug rebirths" value="184" detail="bdSeq · stable session" tone="blue" />
        </section>

        <section className="mb-5 grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-xl border border-slate-800 bg-[#0c121b] p-5 shadow-2xl shadow-black/10">
            <div className="mb-5 flex items-start justify-between"><div><div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500"><Zap className="size-3.5 text-sky-400" /> Device 1 / Actuators</div><h2 className="text-xl font-semibold text-slate-100">Output control</h2><p className="mt-1 text-xs text-slate-500">DCMD commands are published over MQTT WebSockets.</p></div><span className="rounded-full border border-sky-400/20 bg-sky-400/10 px-2 py-1 font-mono text-[10px] text-sky-300">CONNECTED</span></div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-lg border border-slate-800 bg-slate-950/45 p-4">
                <div className="mb-6 flex items-start justify-between"><div><p className="font-mono text-sm text-slate-200">Outputs/LEDDigital</p><p className="mt-1 text-[11px] text-slate-500">Boolean · DCMD</p></div><Lightbulb className={`size-5 ${digitalOn ? 'text-emerald-300' : 'text-slate-600'}`} /></div>
                <button type="button" aria-pressed={digitalOn} onClick={() => { setDigitalOn(!digitalOn); addLog('DCMD', `LEDDigital → ${!digitalOn ? 'true' : 'false'}`, 'blue') }} className={`flex w-full items-center justify-between rounded-lg border px-3 py-2.5 transition ${digitalOn ? 'border-emerald-400/30 bg-emerald-400/10' : 'border-slate-700 bg-slate-900'}`}><span className={`text-sm font-semibold ${digitalOn ? 'text-emerald-300' : 'text-slate-400'}`}>{digitalOn ? 'OUTPUT ON' : 'OUTPUT OFF'}</span><span className={`relative h-6 w-11 rounded-full transition ${digitalOn ? 'bg-emerald-400' : 'bg-slate-700'}`}><span className={`absolute top-1 size-4 rounded-full bg-white shadow transition ${digitalOn ? 'left-6' : 'left-1'}`} /></span></button>
                <Button onClick={() => addLog('DCMD', `LEDDigital → ${digitalOn ? 'true' : 'false'}`, 'blue')} variant="outline" className="mt-3 h-8 w-full border-slate-700 bg-transparent text-xs text-slate-300 hover:bg-sky-400/10 hover:text-sky-300"><Send data-icon="inline-start" /> Publish DCMD</Button>
              </div>
              <div className="rounded-lg border border-slate-800 bg-slate-950/45 p-4">
                <div className="mb-5 flex items-start justify-between"><div><p className="font-mono text-sm text-slate-200">Outputs/LEDPWM</p><p className="mt-1 text-[11px] text-slate-500">UInt8 · 0 — 255 · DCMD</p></div><span className="font-mono text-xl font-semibold text-sky-300">{pwm}</span></div>
                <input aria-label="LEDPWM value" type="range" min="0" max="255" value={pwm} onChange={(event) => setPwm(Number(event.target.value))} className="h-1.5 w-full cursor-pointer accent-sky-400" />
                <div className="mt-2 flex justify-between font-mono text-[10px] text-slate-600"><span>0</span><span>{pwmPercent}% intensity</span><span>255</span></div>
                <Button onClick={() => addLog('DCMD', `LEDPWM → ${pwm}`, 'blue')} variant="outline" className="mt-4 h-8 w-full border-slate-700 bg-transparent text-xs text-slate-300 hover:bg-sky-400/10 hover:text-sky-300"><Send data-icon="inline-start" /> Publish DCMD</Button>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-[#0c121b] p-5 shadow-2xl shadow-black/10">
            <div className="mb-5 flex items-start justify-between"><div><div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500"><Activity className="size-3.5 text-emerald-400" /> Device 1 / Sensors</div><h2 className="text-xl font-semibold text-slate-100">Input telemetry</h2><p className="mt-1 text-xs text-slate-500">Last update · 240 ms ago</p></div><Radio className="size-5 text-emerald-400" /></div>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
              <div className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-950/45 p-4"><div><p className="font-mono text-sm text-slate-200">Inputs/PulsadorLocal</p><p className="mt-1 text-[11px] text-slate-500">Boolean · local input</p></div><button type="button" onClick={() => setPressed(!pressed)} className="flex items-center gap-2 rounded-full border border-slate-700 px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400"><span className={`size-2 rounded-full ${pressed ? 'bg-amber-300 shadow-[0_0_10px_#fcd34d]' : 'bg-slate-600'}`} />{pressed ? 'Presionado' : 'Suelto'}</button></div>
              <div className="rounded-lg border border-slate-800 bg-slate-950/45 p-4"><div className="mb-4 flex items-center justify-between"><div><p className="font-mono text-sm text-slate-200">Inputs/Potenciometro</p><p className="mt-1 text-[11px] text-slate-500">Analog · range 0 — 1023</p></div><Gauge className="size-5 text-emerald-400" /></div><div className="flex items-center gap-4"><div className="relative size-16 shrink-0 rounded-full" style={{ background: `conic-gradient(#34d399 ${potPercent}%, #17212f 0)` }}><div className="absolute inset-1.5 flex items-center justify-center rounded-full bg-[#0c121b]"><span className="font-mono text-sm font-semibold text-emerald-300">{pot}</span></div></div><div className="flex-1"><div className="mb-2 flex justify-between font-mono text-[10px] text-slate-500"><span>0</span><span>{potPercent}%</span><span>1023</span></div><div className="h-2 overflow-hidden rounded-full bg-slate-800"><div className="h-full rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,.45)] transition-all" style={{ width: `${potPercent}%` }} /></div></div></div></div>
            </div>
          </div>
        </section>

        <section className="overflow-hidden rounded-xl border border-slate-800 bg-[#080c12] shadow-2xl shadow-black/10">
          <div className="flex flex-col gap-3 border-b border-slate-800 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-center gap-2"><Terminal className="size-4 text-emerald-400" /><h2 className="text-sm font-semibold text-slate-200">Event stream</h2><span className="rounded bg-slate-900 px-1.5 py-0.5 font-mono text-[10px] text-slate-600">LIVE</span></div><div className="flex items-center gap-3"><span className="font-mono text-[10px] text-slate-600">seq: 42 · bdSeq: 184</span><Button disabled={rebirth} onClick={() => { setRebirth(true); addLog('NCMD', 'Rebirth requested · bdSeq incremented', 'yellow'); window.setTimeout(() => setRebirth(false), 1200) }} size="sm" className="bg-sky-500/15 text-sky-300 hover:bg-sky-500/25"><RotateCcw data-icon="inline-start" className={rebirth ? 'animate-spin' : ''} />{rebirth ? 'Sending...' : 'Force rebirth'}</Button></div></div>
          <div className="p-3 font-mono text-xs"><div className="mb-2 hidden grid-cols-[105px_90px_1fr] gap-4 px-2 text-[10px] uppercase tracking-widest text-slate-700 sm:grid"><span>Timestamp</span><span>Type</span><span>Payload</span></div>{logs.map((log, index) => <div key={`${log.time}-${index}`} className="grid gap-1 rounded px-2 py-2.5 transition hover:bg-slate-900/60 sm:grid-cols-[105px_90px_1fr] sm:gap-4"><span className="text-slate-600">{log.time}</span><span className={log.tone === 'green' ? 'text-emerald-400' : log.tone === 'yellow' ? 'text-amber-300' : 'text-sky-400'}>{log.topic}</span><span className="text-slate-400"><span className="text-slate-600">spBv1.0/PLANTA-01/</span>{log.message}</span></div>)}</div>
          <div className="flex items-center gap-2 border-t border-slate-900 bg-black/20 px-5 py-2.5 text-[10px] text-slate-600"><span className="size-1.5 rounded-full bg-emerald-400" /> Listening on wss://broker.factory.local:8083/mqtt <span className="ml-auto hidden sm:inline">QoS 1 · UTF-8 · Sparkplug B</span></div>
        </section>
        <footer className="flex flex-col gap-2 py-5 text-[10px] uppercase tracking-[0.15em] text-slate-700 sm:flex-row sm:items-center sm:justify-between"><span>Host application / plant operations</span><span className="flex items-center gap-2"><Server className="size-3" /> Gateway 01 · <span className="text-emerald-500/70">HEALTHY</span></span></footer>
      </div>
    </main>
  )
}
