import {useState} from 'react';
import {Button, Choice, Field, KeyField, NumberField, Select, Switch, Text} from './controls';
import {Card, Empty, Toolbar} from './collections';
import {MessageDialog, Snackbar, useSnackbar} from './overlays';
import {CronEditor, SplitView} from './panels';
import {newTrigger, type PlanTask, type PlanTrigger} from './plan-model';

const zones = [
  {value: 'Asia/Shanghai', label: 'UTC+8｜天空岛/世界树'},
  {value: 'Europe/Berlin', label: 'UTC+1｜欧服'},
  {value: 'America/New_York', label: 'UTC-5｜美服'},
];
const policies = [
  {value: 'ignore', label: '同计划已忙碌：跳过 / 合并（推荐）'},
  {value: 'queue', label: '同计划运行后：再排一次'},
  {value: 'stop', label: '停止当前任务，清理后优先执行'},
];

function targetOptions(rows: readonly PlanTask[], depth = 0): {value: string; label: string}[] {
  return rows.flatMap(task => [{value: task.id, label: '　'.repeat(depth) + task.label},
    ...targetOptions(task.children ?? [], depth + 1)]);
}

function validCron(value: string) {
  const fields = value.trim().split(/\s+/);
  return fields.length === 5 && fields.every(field => /^[\dA-Z*?,/LWH#-]+$/i.test(field));
}

type Confirmation = {title: string; message: string; apply: () => void};

export function PlanTriggers({triggers, rows, onChange}: {
  triggers: readonly PlanTrigger[]; rows: readonly PlanTask[]; onChange: (triggers: PlanTrigger[]) => void;
}) {
  const [draft, setDraft] = useState<PlanTrigger | null>(() => triggers[0] ?? null);
  const [width, setWidth] = useState(178);
  const [confirm, setConfirm] = useState<Confirmation>();
  const {notify, snackbar} = useSnackbar();
  const existing = triggers.find(trigger => trigger.id === draft?.id);
  const targets = [{value: '', label: '整个计划'}, ...targetOptions(rows)];
  const valid = draft && (draft.kind === 'cron' ? validCron(draft.expression) :
    draft.key.trim() && (!draft.global || /^F(?:[1-9]|1\d|2[0-4])$/.test(draft.key) || draft.key.includes(' + ')));

  function edit(fields: Partial<PlanTrigger>) {
    setDraft(previous => previous ? {...previous, ...fields} : null);
  }

  function save(force = false) {
    if (!draft || !valid) return;
    if (!force && draft.busy === 'stop' && existing?.busy !== 'stop') {
      setConfirm({title: '确认忙碌策略', message: '触发器将请求停止当前任务，清理结束后优先执行。', apply: () => save(true)});
      return;
    }
    const saved = {...draft, enabled: existing?.enabled ?? false,
      target: targets.some(target => target.value === draft.target) ? draft.target : ''};
    onChange(existing ? triggers.map(trigger => trigger.id === saved.id ? saved : trigger) : [...triggers, saved]);
    setDraft(saved);
    notify('已保存触发配置', 'success');
  }

  function toggle(trigger: PlanTrigger, enabled: boolean) {
    const apply = () => {
      onChange(triggers.map(value => value.id === trigger.id ? {...value, enabled} : value));
    };
    if (enabled && trigger.busy === 'stop') {
      setConfirm({title: '启用触发器', message: '此触发器会停止正在执行的任务，清理后优先执行。', apply});
    } else apply();
  }

  function remove(trigger: PlanTrigger) {
    setConfirm({title: '删除触发器', message: '确定删除此触发器配置？', apply: () => {
      const next = triggers.filter(value => value.id !== trigger.id);
      onChange(next);
      if (draft?.id === trigger.id) setDraft(next[0] ?? null);
    }});
  }

  return <div className="bgi-stack">
    <div className="bgi-wrap">
      <Button icon="plus" onClick={() => setDraft(newTrigger('cron'))}>新增定时触发</Button>
      <Button icon="plus" onClick={() => setDraft(newTrigger('key'))}>新增快捷键触发</Button>
    </div>
    <Text variant="caption">仅在 BGI 运行时生效。新触发器默认关闭，先保存配置，再使用列表开关启用。</Text>
    <SplitView size={width} onResize={setWidth} embedded
      start={triggers.length ? triggers.map(trigger => {
        const summary = trigger.kind === 'cron' ? trigger.expression : trigger.key;
        return <Card key={trigger.id} title={trigger.kind === 'cron' ? '定时触发' : '快捷键触发'}
          description={summary} selected={draft?.id === trigger.id} onSelect={() => setDraft(trigger)}
          action={<Switch label={summary + ' 启用 / 停用'} checked={trigger.enabled}
            onChange={value => toggle(trigger, value)} showLabel={false}/>}/>;
      }) : <Empty title="暂无触发器"/>}
      end={draft ? <>
        {draft.kind === 'cron' ? <>
          <CronEditor value={draft.expression} onChange={expression => edit({expression})}/>
          <Field label="服务器时区（Cron 按此时区计算）">
            <Select label="服务器时区" value={draft.zone} options={zones} onValueChange={zone => edit({zone})}/>
          </Field>
          <Field label="执行实例">
            <Choice label="主实例" checked={draft.instances.includes('current')}
              onChange={enabled => edit({instances: enabled ? ['current'] : []})} disabled/>
          </Field>
        </> : <Field label="快捷键（点击类型按钮可切换模式）">
          <Toolbar actions={<Button onClick={() => edit({global: !draft.global, key: ''})}>
            {draft.global ? '全局热键' : '键鼠监听'}
          </Button>}><KeyField label="运行快捷键" value={draft.key} onChange={key => edit({key})}/></Toolbar>
        </Field>}
        <Field label="运行范围"><Select label="运行范围" options={targets}
          value={targets.some(target => target.value === draft.target) ? draft.target : ''}
          onValueChange={target => edit({target})}/></Field>
        <Field label="同一计划已忙碌时">
          <Select label="同一计划已忙碌时" value={draft.busy} options={policies}
            onValueChange={busy => edit({busy: busy as PlanTrigger['busy']})}/>
        </Field>
        {draft.kind === 'cron' && <>
          <Field label="允许延迟启动（分钟）"><NumberField label="允许延迟启动（分钟）"
            value={draft.delayMinutes} min={0} max={10080} onChange={delayMinutes => edit({delayMinutes})}/></Field>
          <Choice label="离线 / 睡眠后，只补仍可延迟启动的最近一次" checked={draft.catchUp}
            onChange={catchUp => edit({catchUp})}/>
        </>}
        <div className="bgi-actions">
          <Button appearance="primary" disabled={!valid} onClick={() => save()}>保存配置</Button>
          <Button onClick={() => setDraft(existing ?? null)}>取消</Button>
          {existing && <Button appearance="danger" onClick={() => remove(existing)}>删除</Button>}
        </div>
      </> : <Empty title="选择触发器查看配置，或点击上方按钮新增。"/>}/>
    <MessageDialog title={confirm?.title ?? ''} message={confirm?.message ?? ''}
      open={confirm !== undefined} tone="warning"
      onChange={open => {if (!open) setConfirm(undefined);}} confirm={() => confirm?.apply()}/>
    <Snackbar {...snackbar}/>
  </div>;
}
