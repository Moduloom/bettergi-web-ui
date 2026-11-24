import {useState} from 'react';
import {Badge, Button, Text} from '../../components/controls';
import {Empty, Expander, List, SettingsRow, Tabs, Toolbar, type Row} from '../../components/collections';
import {LogView} from '../../components/media';
import {SplitView} from '../../components/panels';
import {useAppValue} from '../../app/app-state';

type RunTask = {id: string; title: string; result: string; detail?: string; settings?: Record<string, unknown>};
type Run = {
  id: string; planId: string; title: string; status: string; startedAt?: string; endedAt?: string;
  tasks: RunTask[]; snapshot?: Record<string, unknown>;
};
const tabs = [{value: 'task', label: '任务详情'}, {value: 'run', label: '运行信息'}];

export function PlanHistory({planId, showHeading = false}: {planId?: string; showHeading?: boolean}) {
  const [records] = useAppValue<Run[]>('pulonia/run-history', []);
  const [width, setWidth] = useState(200);
  const [selected, setSelected] = useState('');
  const [selectedTask, setTask] = useState('');
  const [tab, setTab] = useState('task');
  const [snapshot, setSnapshot] = useState(false);
  const runs = records.filter(run => !planId || run.planId === planId);
  const run = runs.find(item => item.id === selected);
  const task = run?.tasks.find(item => item.id === selectedTask);
  const rows: Row[] = runs.map(item => ({
    id: item.id, label: item.title, detail: item.startedAt, status: item.status, icon: 'clock',
  }));

  function choose(id: string) {
    setSelected(id);
    setTask('');
    setTab('task');
    setSnapshot(false);
  }

  return <div className="bgi-stack">
    {showHeading && <>
      <Text variant="title">执行记录</Text>
      <Text variant="body">查看任务计划和一条龙每次执行的结果。各条路线的 CD 在账户页查看。</Text>
    </>}
    <SplitView size={width} onResize={setWidth} embedded={!showHeading}
      start={rows.length ? <List rows={rows} selected={selected} onSelect={choose}/> : <Empty title="暂无执行记录"/>}
      end={run ? <>
        <Toolbar actions={<Badge>{run.status}</Badge>}><Text variant="section">{run.title}</Text></Toolbar>
        {run.tasks.length ? <List rows={run.tasks.map(item => ({
          id: item.id, label: item.title, status: item.result, detail: item.detail,
        }))} selected={selectedTask} onSelect={setTask}/> : <Empty title="还没有任务结果"/>}
        <Tabs options={tabs} label="运行记录详情" value={tab} onChange={setTab}/>
        {tab === 'task' ? task ? <div className="bgi-stack">
          <SettingsRow inline label="结果" description={task.detail ?? task.result}/>
          {task.settings && <Expander title="当次使用的设置" open={snapshot} onChange={setSnapshot}>
            <LogView label="当次使用的设置" code>{JSON.stringify(task.settings, null, 2)}</LogView>
          </Expander>}
        </div> : <Empty title="选择上方的任务查看详情"/> : <>
          <SettingsRow inline label="开始时间" description={run.startedAt ?? '—'}/>
          <SettingsRow inline label="结束时间" description={run.endedAt ?? '—'}/>
          {run.snapshot && <Expander title="完整执行快照（JSON）" open={snapshot} onChange={setSnapshot}>
            <LogView label="执行快照" code>{JSON.stringify(run.snapshot, null, 2)}</LogView>
          </Expander>}
        </>}
        <div className="bgi-actions">
          <Button disabled title="需要本机 BetterGI 的任务执行接口">停止</Button>
          <Button disabled title="需要本机 BetterGI 的任务执行接口">续跑</Button>
          <Button disabled title="需要本机 BetterGI 的任务执行接口">从选中任务开始</Button>
        </div>
      </> : <Empty title="选择左侧的一条记录，查看每个任务的执行结果。"/>}/>
  </div>;
}
