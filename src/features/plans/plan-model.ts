import type {IconName} from '../../components/controls';

export type PlanKind = 'group' | 'solo' | 'pathing' | 'scripts' | 'recordings' | 'shell' | 'csharp' | 'reference';
export type PlanTask = {
  id: string; label: string; kind: PlanKind; enabled: boolean; repetitions: number;
  children?: PlanTask[]; sourceId?: string; sourcePath?: string;
  parameters?: string; shared?: string; policy?: string; source?: string;
};
export type PlanTrigger = {
  id: string; kind: 'cron' | 'key'; enabled: boolean; expression: string; zone: string; key: string;
  global: boolean; target: string; busy: 'ignore' | 'queue' | 'stop'; catchUp: boolean;
  delayMinutes: number; instances: string[];
};
type OldTrigger = {
  enabled: {time: boolean; key: boolean}; cron: string; zone: string; hotkey: string;
};
export type TaskPlan = {
  id: string; name: string; account: string; rows: PlanTask[]; profile?: string;
  shared?: string; triggers?: PlanTrigger[];
};
export type TaskSource = {id: string; label: string; path?: string; summary?: string};
export type TaskSources = Partial<Record<PlanKind, TaskSource[]>>;

export const planKinds: Record<PlanKind, {label: string; icon: IconName; action: string}> = {
  group: {label: '分组', icon: 'folder', action: '分组…'},
  solo: {label: '独立任务', icon: 'play', action: '独立任务'},
  pathing: {label: '地图追踪', icon: 'globe', action: '地图追踪任务…'},
  scripts: {label: 'JS 脚本', icon: 'fileCode', action: 'JS 脚本任务…'},
  recordings: {label: '录制回放', icon: 'monitor', action: '录制回放任务…'},
  shell: {label: 'Shell', icon: 'code', action: 'Shell 任务…'},
  csharp: {label: '进程内 C#', icon: 'code', action: '进程内 C# 任务…'},
  reference: {label: '引用任务计划', icon: 'layers', action: '引用已有任务计划…'},
};

export function newTask(kind: PlanKind, label: string): PlanTask {
  return {
    id: crypto.randomUUID(), kind, label, enabled: true, repetitions: 1,
    ...(kind === 'group' ? {children: []} : {}),
  };
}

export function newTrigger(kind: PlanTrigger['kind']): PlanTrigger {
  return {
    id: crypto.randomUUID(), kind, enabled: false, expression: '0 4 * * *', zone: 'Asia/Shanghai',
    key: 'F8', global: false, target: '', busy: 'ignore', catchUp: true,
    delayMinutes: 360, instances: ['current'],
  };
}

function readRows(rows: readonly Partial<PlanTask & {detail: string}>[] | undefined): PlanTask[] {
  return (rows ?? []).map(row => {
    const oldKind = row.detail === 'JS 脚本' ? 'scripts' : row.detail === '地图追踪' ? 'pathing' :
      row.detail === '录制回放' ? 'recordings' : 'solo';
    const kind = row.kind && row.kind in planKinds ? row.kind : oldKind;
    return {
      ...row, kind, id: row.id ?? crypto.randomUUID(), label: row.label ?? planKinds[kind].label,
      enabled: row.enabled ?? true, repetitions: Math.max(1, row.repetitions ?? 1),
      ...(kind === 'group' ? {children: readRows(row.children)} : {}),
    };
  });
}

export function normalizePlan(plan: TaskPlan & {trigger?: OldTrigger}): TaskPlan {
  const {trigger, ...base} = plan;
  const triggers = plan.triggers ?? (trigger ? [
    {...newTrigger('cron'), id: plan.id + '-cron', expression: trigger.cron,
      zone: trigger.zone, enabled: trigger.enabled.time},
    {...newTrigger('key'), id: plan.id + '-key', key: trigger.hotkey, enabled: trigger.enabled.key},
  ] : []);
  return {...base, account: plan.account ?? '', rows: readRows(plan.rows), triggers};
}

export function flattenTasks(rows: readonly PlanTask[]): PlanTask[] {
  return rows.flatMap(row => [row, ...flattenTasks(row.children ?? [])]);
}

export function patchTask(rows: readonly PlanTask[], id: string, update: (row: PlanTask) => PlanTask): PlanTask[] {
  return rows.map(row => row.id === id ? update(row) :
    row.children ? {...row, children: patchTask(row.children, id, update)} : row);
}

export function removeTask(rows: readonly PlanTask[], id: string): PlanTask[] {
  return rows.filter(row => row.id !== id).map(row => row.children ?
    {...row, children: removeTask(row.children, id)} : row);
}

export function addTask(rows: readonly PlanTask[], parentId: string, task: PlanTask): PlanTask[] {
  return parentId ? patchTask(rows, parentId, row => ({...row, children: [...(row.children ?? []), task]})) :
    [...rows, task];
}

export function copyTask(row: PlanTask): PlanTask {
  return {...row, id: crypto.randomUUID(), ...(row.children ? {children: row.children.map(copyTask)} : {})};
}

export function copyPlan(plan: TaskPlan, name: string): TaskPlan {
  const rows = plan.rows.map(copyTask);
  const flattened = flattenTasks(rows);
  const newIds = new Map(flattenTasks(plan.rows).map((task, index) => [task.id, flattened[index].id]));
  return {
    ...plan, id: crypto.randomUUID(), name, rows,
    triggers: plan.triggers?.map(trigger => ({
      ...trigger, id: crypto.randomUUID(), enabled: false, target: newIds.get(trigger.target) ?? '',
    })),
  };
}

export function planRows(rows: readonly PlanTask[], enabled = true): {task: PlanTask; enabled: boolean}[] {
  return rows.flatMap(task => {
    const active = enabled && task.enabled;
    return [{task, enabled: active}, ...planRows(task.children ?? [], active)];
  });
}

export function parseSettings(value: string) {
  try {
    const record: unknown = JSON.parse(value || '{}');
    return typeof record === 'object' && record !== null && !Array.isArray(record)
      ? record as Record<string, unknown> : undefined;
  } catch {
    return undefined;
  }
}
