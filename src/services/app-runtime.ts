import {useCallback, useEffect, useRef, useState} from 'react';

type Connection = {state: 'offline' | 'connecting' | 'online' | 'error'; message: string};
type LogEntry = {id: number; text: string};
const offline: Connection = {state: 'offline', message: '尚未连接本机 BetterGI'};
type NativeCallOptions = {signal?: AbortSignal; timeout?: number} & (
  {body?: unknown; upload?: never} | {upload: Blob; body?: never}
);

export class BetterGIRequestError extends Error {
  constructor(readonly status: number, message: string) {super(message);}
}

export function useBetterGIConnection(hostedOrigin?: string) {
  const [connection, setConnection] = useState<Connection>(offline);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [logStatus, setLogStatus] = useState('');
  const request = useRef<AbortController | null>(null);
  const socket = useRef<WebSocket | null>(null);
  const access = useRef<{address: string; authorization: string; signal: AbortSignal} | null>(null);
  const sequence = useRef(0);

  function release() {
    access.current = null;
    request.current?.abort();
    request.current = null;
    if (socket.current) {
      socket.current.onclose = null;
      socket.current.close();
      socket.current = null;
    }
  }

  const call = useCallback(async <T,>(path: string, options: NativeCallOptions = {}): Promise<T> => {
    const active = access.current;
    if (!active) throw new BetterGIRequestError(0, '尚未连接本机 BetterGI');
    const post = options.body !== undefined || options.upload !== undefined;
    const signals = [active.signal, AbortSignal.timeout(options.timeout ?? (post ? 45000 : 8000))];
    if (options.signal) signals.push(options.signal);
    const response = await fetch(active.address + '/api/v1/' + path, {
      method: post ? 'POST' : 'GET',
      headers: {Authorization: active.authorization, ...(post ? {
        'Content-Type': options.upload ? 'application/octet-stream' : 'application/json',
      } : {})},
      body: options.upload ?? (options.body === undefined ? undefined : JSON.stringify(options.body)),
      signal: AbortSignal.any(signals), cache: 'no-store', redirect: 'error',
    });
    if (!response.ok) {
      const value = await response.json().catch(() => null);
      throw new BetterGIRequestError(response.status, typeof value?.error === 'string' ? value.error :
        response.status === 401 ? '本机访问令牌已失效，请重新连接。' :
          response.status === 413 ? '提交的数据超过本机接口允许的大小。' : '本机接口请求失败。');
    }
    return response.json() as Promise<T>;
  }, []);

  useEffect(() => release, []);

  function disconnect() {
    release();
    setLog([]);
    setLogStatus('');
    setConnection(offline);
  }

  async function connect(port: number, token: string, readLogs: boolean) {
    if ((!hostedOrigin && (!Number.isInteger(port) || port < 1024 || port > 65535)) || !token.trim()) return;
    release();
    setLog([]);
    setLogStatus('');
    setConnection({state: 'connecting', message: '正在连接本机 BetterGI'});
    const controller = new AbortController();
    request.current = controller;
    const timedOut = AbortSignal.timeout(5000);
    const address = hostedOrigin ?? 'http://127.0.0.1:' + port;
    const authorization = 'Bearer ' + token.trim();
    const options: RequestInit = {
      headers: {Authorization: authorization},
      signal: AbortSignal.any([controller.signal, timedOut]),
      redirect: 'error',
      cache: 'no-store',
    };
    try {
      const [health, version] = await Promise.all([
        fetch(address + '/api/v1/health', options),
        fetch(address + '/api/v1/version', options),
      ]);
      if (controller.signal.aborted) return;
      if (health.status === 401 || version.status === 401) {
        setConnection({state: 'error', message: '访问令牌不正确，请从 BetterGI 设置中复制。'});
        return;
      }
      if (!health.ok || !version.ok) throw new Error();
      const [status, details] = await Promise.all([health.json(), version.json()]);
      if (controller.signal.aborted) return;
      if (typeof status.status !== 'string' || typeof details.version !== 'string') throw new Error();
      access.current = {address, authorization, signal: controller.signal};
      setConnection({state: 'online', message: '已连接 BetterGI ' + details.version});
      if (!readLogs) return;
      const stream = new WebSocket(address.replace(/^http/, 'ws') + '/ws/v1/logs');
      socket.current = stream;
      setLogStatus('正在连接实时日志');
      stream.onopen = () => setLogStatus('已订阅实时日志');
      stream.onclose = () => setLogStatus('实时日志已断开');
      stream.onmessage = event => {
        try {
          const item = JSON.parse(event.data);
          const text = item.type === 'log' && typeof item.message === 'string' ?
            '[' + new Date(item.timestampUtc).toLocaleTimeString('zh-CN') + '] ' + item.message :
            item.type === 'dropped' && Number.isInteger(item.count) ? '日志缓冲区跳过了 ' + item.count + ' 条日志' : '';
          if (text) {
            const entry = {id: ++sequence.current, text};
            setLog(previous => [...previous.slice(-249), entry]);
          }
        } catch {
          // Unknown log payloads are ignored.
        }
      };
    } catch {
      if (!controller.signal.aborted) {
        setConnection({state: 'error', message: '连接失败，请检查本机 HTTP API 开关和监听端口。'});
      }
    }
  }

  return {connection, log, logStatus, connect, disconnect, call, hosted: Boolean(hostedOrigin)};
}
