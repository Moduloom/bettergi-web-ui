import {useRef, useState} from 'react';
import {Button, Field, Input, Select, Text} from '../../components/controls';
import {Card, Expander, SettingsActionRow, SettingsList} from '../../components/collections';
import {MessageDialog, Modal, Snackbar, useSnackbar} from '../../components/overlays';
import {FileInput} from '../../components/media';
import {useAppValue} from '../../app/app-state';

type Repository = {id: string; name: string; kind: 'remote' | 'local'; location: string; branch?: string};
const empty: Repository[] = [];
const official: Repository = {id: 'official', name: 'BetterGI 脚本仓库', kind: 'remote',
  location: 'https://cnb.cool/bettergi/bettergi-scripts-list'};
const imported = {id: 'imported', name: '本地已导入资源'};
const nativeOnly = '需要连接本机 BetterGI';
const channels = ['CNB', 'GitHub', '自定义'].map(value => ({value, label: value}));
const officialUrls: Record<string, string> = {
  CNB: official.location, GitHub: 'https://github.com/babalae/bettergi-scripts-list',
};

export function usePlanRepositories() {
  return useAppValue('pulonia/repositories', empty);
}

export function RepositorySelect({value, onChange, repositories, includeImported}: {
  value: string; onChange: (value: string) => void; repositories: readonly Repository[]; includeImported?: boolean;
}) {
  const options = [official, ...repositories, ...(includeImported ? [imported] : [])];
  return <Select label="仓库" value={options.some(item => item.id === value) ? value : official.id}
    options={options.map(item => ({value: item.id, label: item.name}))} onValueChange={onChange}/>;
}

function remoteAddress(value: string) {
  try {
    const url = new URL(value.trim());
    return url.protocol === 'https:' && Boolean(url.hostname) && !url.username && !url.password && !url.search && !url.hash;
  } catch {
    return false;
  }
}

function RemoteRepositoryDialog({open, onChange, onAdd}: {
  open: boolean; onChange: (open: boolean) => void; onAdd: (repository: Repository) => void;
}) {
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [branch, setBranch] = useState('');
  function submit() {
    if (!name.trim() || !remoteAddress(address)) return;
    onAdd({id: crypto.randomUUID(), name: name.trim(), kind: 'remote', location: address.trim(), branch: branch.trim()});
    onChange(false);
  }
  return <Modal title="添加远程仓库" open={open} onChange={onChange} width={500} actions={<>
    <Button onClick={() => onChange(false)}>取消</Button>
    <Button appearance="primary" icon="plus" disabled={!name.trim() || !remoteAddress(address)}
      onClick={submit}>添加远程仓库</Button>
  </>}>
    <div className="bgi-stack">
      <Text variant="caption">添加后可在仓库列表中选择，再点击“同步仓库”获取本机仓库副本。</Text>
      <Field label="仓库名称"><Input aria-label="仓库名称" value={name}
        onChange={event => setName(event.currentTarget.value)}/></Field>
      <Field label="Git 地址"><Input aria-label="Git 地址" value={address} placeholder="https://"
        onChange={event => setAddress(event.currentTarget.value)}/></Field>
      <Field label="分支"><Input aria-label="分支" value={branch} onChange={event => setBranch(event.currentTarget.value)}/></Field>
      {address && !remoteAddress(address) && <Text variant="caption">请输入 HTTPS 仓库地址。</Text>}
    </div>
  </Modal>;
}

function LocalRepositoryDialog({open, onChange, onAdd}: {
  open: boolean; onChange: (open: boolean) => void; onAdd: (repository: Repository) => void;
}) {
  const folder = useRef<HTMLInputElement>(null);
  const [problem, setProblem] = useState('');
  const [checking, setChecking] = useState(false);

  async function choose(files: File[]) {
    setChecking(true);
    setProblem('');
    try {
      const index = files.find(file => /^[^/]+\/repo\.json$/i.test(file.webkitRelativePath));
      const root = index?.webkitRelativePath.split('/')[0];
      if (!index || !root || !files.some(file => file.webkitRelativePath.startsWith(root + '/repo/'))) {
        throw new Error('文件式仓库根目录必须包含 repo.json 和 repo 文件夹。');
      }
      const data: unknown = JSON.parse((await index.text()).replace(/^\uFEFF/, ''));
      if (!data || typeof data !== 'object' || !('indexes' in data) || !Array.isArray(data.indexes)) {
        throw new Error('repo.json 缺少 indexes 资源清单。');
      }
      onAdd({id: crypto.randomUUID(), name: root, kind: 'local', location: root});
      onChange(false);
    } catch (error) {
      setProblem(error instanceof SyntaxError ? 'repo.json 不是有效的 JSON 文件。' : (error as Error).message);
    } finally {
      setChecking(false);
    }
  }

  return <Modal title="添加本地仓库" open={open} onChange={next => {if (!checking) onChange(next);}} width={540}
    actions={<Button disabled={checking} onClick={() => onChange(false)}>取消</Button>}>
    <div className="bgi-stack">
      <Text variant="body">选择一个仓库目录，通过校验后立即添加。</Text>
      <div className="bgi-wrap">
        <Button icon="folder" disabled={checking} onClick={() => folder.current?.click()}>选择目录</Button>
        <Button disabled title={nativeOnly}>选择 ZIP</Button>
        <FileInput inputRef={folder} directory multiple onFiles={files => {void choose(files);}}/>
      </div>
      <Text variant="caption">目录将直接引用原位置。仓库必须包含有效的 repo.json 索引。</Text>
      {problem && <p className="bgi-error-text" role="status">{problem}</p>}
    </div>
  </Modal>;
}

export function RepositoryManagerDialog({open, onChange, repositories, onRepositories, selected, onSelect}: {
  open: boolean; onChange: (open: boolean) => void; repositories: Repository[];
  onRepositories: (update: (value: Repository[]) => Repository[]) => void;
  selected: string; onSelect: (id: string) => void;
}) {
  const repository = repositories.find(item => item.id === selected) ?? official;
  const isOfficial = repository.id === official.id;
  const [child, setChild] = useState<{kind: 'remote' | 'local'; open: boolean; key: number}>();
  const [auth, setAuth] = useState(false);
  const [remove, setRemove] = useState(false);
  const [channel, setChannel] = useAppValue('pulonia/repo-official-channel', 'CNB');
  const [customUrl, setCustomUrl] = useAppValue('pulonia/repo-official-url', '');
  const {notify, snackbar} = useSnackbar();

  function add(item: Repository) {
    onRepositories(previous => [...previous, item]);
    onSelect(item.id);
    notify('已添加 ' + item.name, 'success');
  }

  return <>
    <Modal title="Pulonia 仓库管理" open={open} onChange={onChange} width={560} height={640}
      actions={<Button onClick={() => onChange(false)}>关闭</Button>}>
      <div className="bgi-stack">
        <RepositorySelect value={repository.id} onChange={onSelect} repositories={repositories}/>
        <Card title="仓库操作" action={<div className="bgi-wrap">
          <Button icon="plus" onClick={() => setChild({kind: 'remote', open: true, key: Date.now()})}>添加远程仓库</Button>
          <Button icon="folder" onClick={() => setChild({kind: 'local', open: true, key: Date.now()})}>添加本地仓库</Button>
        </div>}>
          <SettingsActionRow inline label="当前仓库" description={repository.name} action={<>
            <Button appearance="primary" icon="rotate" disabled title={nativeOnly}>
              {repository.kind === 'remote' ? '同步仓库' : '刷新目录'}
            </Button>
            {repository.kind === 'remote' && <Button disabled title={nativeOnly}>重置仓库</Button>}
            {!isOfficial && <Button appearance="danger" icon="trash" onClick={() => setRemove(true)}>移除仓库</Button>}
          </>}/>
        </Card>
        <Card title={isOfficial ? '官方仓库' : repository.kind === 'local' ? '本地仓库' : '第三方远程仓库'}>
          <div className="bgi-stack">
            <Field label="仓库名称"><Input aria-label="仓库名称" readOnly value={repository.name}/></Field>
            {isOfficial && <Field label="更新渠道"><Select label="更新渠道" value={channel}
              options={channels} onValueChange={setChannel}/></Field>}
            {repository.kind === 'remote' && <Field label="仓库地址"><Input aria-label="仓库地址"
              value={isOfficial ? officialUrls[channel] ?? customUrl : repository.location}
              readOnly={!isOfficial || channel !== '自定义'} onChange={event => setCustomUrl(event.currentTarget.value)}/></Field>}
            {!isOfficial && repository.kind === 'remote' && <Field label="拉取分支"><Input readOnly
              aria-label="拉取分支" value={repository.branch ?? ''}/></Field>}
            <SettingsList><SettingsActionRow inline label={repository.kind === 'remote' ? '本机仓库目录' : '目录'}
              description={repository.kind === 'local' ? repository.location : undefined}
              action={<Button icon="folder" disabled title={nativeOnly}>打开目录</Button>}/></SettingsList>
            <Text variant="caption">同步或刷新只改变本机可浏览的仓库内容，不会修改任务计划使用的资源版本。</Text>
          </div>
        </Card>
        {repository.kind === 'remote' && <Expander title="Git 认证（可选）" open={auth} onChange={setAuth} icon={null}>
          <div className="bgi-stack">
            <Field label="用户名称"><Input aria-label="用户名称" disabled/></Field>
            <Field label="访问令牌"><Input aria-label="访问令牌" type="password" disabled/></Field>
            <Button disabled title={nativeOnly}>保存认证</Button>
          </div>
        </Expander>}
      </div>
    </Modal>
    {child?.kind === 'remote' && <RemoteRepositoryDialog key={child.key} open={child.open}
      onChange={value => setChild({...child, open: value})} onAdd={add}/>}
    {child?.kind === 'local' && <LocalRepositoryDialog key={child.key} open={child.open}
      onChange={value => setChild({...child, open: value})} onAdd={add}/>}
    <MessageDialog title="移除仓库" message={'确定移除「' + repository.name + '」的注册？'} tone="warning"
      open={remove} onChange={setRemove} confirm={() => {
        onRepositories(previous => previous.filter(item => item.id !== repository.id));
        onSelect(official.id);
        setRemove(false);
        notify('已移除仓库', 'success');
      }}/>
    <Snackbar {...snackbar}/>
  </>;
}
